import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const BASE_URL = "https://genstone.zendesk.com/api/v2";
const ROOT_DIR = new URL("..", import.meta.url).pathname;
const OUTPUT_DIR = join(ROOT_DIR, "raw", "zendesk");
const TICKET_DIR = join(OUTPUT_DIR, "tickets");
const STATE_FILE = join(OUTPUT_DIR, "export-state.json");
const INDEX_FILE = join(OUTPUT_DIR, "ticket-index.json");
const FIELD_FILE = join(OUTPUT_DIR, "ticket-fields.json");
const START_TIME = 1;
const COMMENT_CONCURRENCY = readCommentConcurrency();
const COMMENT_LOG_INTERVAL = 250;
const COMMENT_STATE_INTERVAL = 100;
const COMMENT_INDEX_INTERVAL = 1000;

const email = requireEnvironment("ZENDESK_GENSTONE_API_EMAIL");
const token = requireEnvironment("ZENDESK_GESNTONE_API_TOKEN");
const authorization = Buffer.from(`${email}/token:${token}`).toString("base64");

mkdirSync(TICKET_DIR, { recursive: true });

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readCommentConcurrency() {
  const value = Number(process.env.ZENDESK_COMMENT_CONCURRENCY ?? 6);

  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error(
      "ZENDESK_COMMENT_CONCURRENCY must be an integer from 1 through 10",
    );
  }

  return value;
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  const temporaryFile = `${filePath}.tmp`;
  writeFileSync(temporaryFile, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporaryFile, filePath);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function zendeskFetch(url, attempt = 1) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json",
    },
  });

  if (response.ok) {
    return response.json();
  }

  const transientStatuses = new Set([429, 502, 503, 504]);
  if (transientStatuses.has(response.status) && attempt <= 8) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const exponentialDelay = Math.min(60, 2 ** attempt);
    const delaySeconds = Number.isFinite(retryAfter)
      ? Math.max(1, retryAfter)
      : exponentialDelay;
    const delay = delaySeconds * 1000;
    console.log(
      `Zendesk returned ${response.status}; retrying in ${delaySeconds} seconds`,
    );
    await wait(delay);
    return zendeskFetch(url, attempt + 1);
  }

  const text = await response.text();
  const safeMessage = text.slice(0, 500).replaceAll(/\s+/g, " ");
  throw new Error(`Zendesk request failed (${response.status}): ${safeMessage}`);
}

function normalizeTicket(ticket) {
  return {
    id: ticket.id,
    url: ticket.url ?? null,
    external_id: ticket.external_id ?? null,
    created_at: ticket.created_at ?? null,
    updated_at: ticket.updated_at ?? null,
    generated_timestamp: ticket.generated_timestamp ?? null,
    status: ticket.status ?? null,
    type: ticket.type ?? null,
    priority: ticket.priority ?? null,
    subject: ticket.subject ?? null,
    raw_subject: ticket.raw_subject ?? null,
    description: ticket.description ?? null,
    via: ticket.via ?? null,
    requester_id: ticket.requester_id ?? null,
    submitter_id: ticket.submitter_id ?? null,
    assignee_id: ticket.assignee_id ?? null,
    group_id: ticket.group_id ?? null,
    organization_id: ticket.organization_id ?? null,
    brand_id: ticket.brand_id ?? null,
    ticket_form_id: ticket.ticket_form_id ?? null,
    recipient: ticket.recipient ?? null,
    tags: Array.isArray(ticket.tags) ? ticket.tags : [],
    custom_fields: Array.isArray(ticket.custom_fields)
      ? ticket.custom_fields
      : [],
    collaborator_ids: Array.isArray(ticket.collaborator_ids)
      ? ticket.collaborator_ids
      : [],
    follower_ids: Array.isArray(ticket.follower_ids)
      ? ticket.follower_ids
      : [],
    email_cc_ids: Array.isArray(ticket.email_cc_ids)
      ? ticket.email_cc_ids
      : [],
    problem_id: ticket.problem_id ?? null,
    has_incidents: ticket.has_incidents ?? false,
    due_at: ticket.due_at ?? null,
    satisfaction_rating: ticket.satisfaction_rating ?? null,
  };
}

function normalizeComment(comment) {
  return {
    id: comment.id,
    type: comment.type ?? null,
    body: comment.body ?? null,
    public: comment.public ?? null,
    author_id: comment.author_id ?? null,
    created_at: comment.created_at ?? null,
    via: comment.via ?? null,
    metadata: comment.metadata ?? null,
    attachment_count: Array.isArray(comment.attachments)
      ? comment.attachments.length
      : 0,
  };
}

function ticketPath(ticketId) {
  return join(TICKET_DIR, `${ticketId}.json`);
}

function upsertTicket(ticket) {
  const filePath = ticketPath(ticket.id);
  const existing = readJson(filePath, null);
  const normalized = normalizeTicket(ticket);

  writeJson(filePath, {
    ticket: normalized,
    comments: existing?.comments ?? [],
    comments_export_complete: existing?.comments_export_complete ?? false,
    comments_exported_at: existing?.comments_exported_at ?? null,
  });

  return normalized;
}

async function exportTicketFields() {
  if (existsSync(FIELD_FILE)) {
    return;
  }

  const fields = [];
  let url = `${BASE_URL}/ticket_fields.json?page[size]=100`;

  while (url) {
    const page = await zendeskFetch(url);
    fields.push(...(page.ticket_fields ?? []));
    url = page.meta?.has_more ? page.links?.next : null;
  }

  writeJson(FIELD_FILE, fields);
  console.log(`Exported ${fields.length} ticket-field definitions`);
}

async function exportTickets(state, index) {
  if (state.ticket_export_complete) {
    return;
  }

  let cursor = state.ticket_cursor ?? null;
  let pageNumber = state.ticket_pages ?? 0;

  while (true) {
    const url = new URL(`${BASE_URL}/incremental/tickets/cursor.json`);
    url.searchParams.set("per_page", "1000");

    if (cursor) {
      url.searchParams.set("cursor", cursor);
    } else {
      url.searchParams.set("start_time", String(START_TIME));
    }

    const page = await zendeskFetch(url);
    const tickets = Array.isArray(page.tickets) ? page.tickets : [];

    for (const ticket of tickets) {
      const normalized = upsertTicket(ticket);
      index[String(normalized.id)] = {
        id: normalized.id,
        created_at: normalized.created_at,
        updated_at: normalized.updated_at,
        status: normalized.status,
        type: normalized.type,
        priority: normalized.priority,
        subject: normalized.subject,
        comment_count: index[String(normalized.id)]?.comment_count ?? null,
        review_status: index[String(normalized.id)]?.review_status ?? "pending",
      };
    }

    pageNumber += 1;
    cursor = page.after_cursor ?? null;
    state.ticket_cursor = cursor;
    state.ticket_pages = pageNumber;
    state.ticket_count = Object.keys(index).length;
    state.ticket_export_complete = page.end_of_stream === true;
    state.ticket_end_of_stream = page.end_of_stream === true;
    state.updated_at = new Date().toISOString();

    writeJson(INDEX_FILE, Object.values(index).sort((a, b) => a.id - b.id));
    writeJson(STATE_FILE, state);
    console.log(
      `Ticket page ${pageNumber}: ${tickets.length} records; ${state.ticket_count} unique tickets`,
    );

    if (state.ticket_export_complete) {
      break;
    }

    if (!cursor) {
      throw new Error("Ticket export did not reach end_of_stream and returned no cursor");
    }
  }
}

async function exportCommentsForTicket(ticketId) {
  const comments = [];
  let url = `${BASE_URL}/tickets/${encodeURIComponent(ticketId)}/comments.json?page[size]=100&sort=created_at`;

  while (url) {
    const page = await zendeskFetch(url);
    const pageComments = Array.isArray(page.comments) ? page.comments : [];
    comments.push(...pageComments.map(normalizeComment));

    if (page.meta?.has_more) {
      url = page.links?.next;
      if (!url) {
        throw new Error(`Comment pagination for ticket ${ticketId} has no next link`);
      }
      continue;
    }

    url = null;
  }

  const filePath = ticketPath(ticketId);
  const record = readJson(filePath, null);
  if (!record) {
    throw new Error(`Missing normalized ticket record for ${ticketId}`);
  }

  record.comments = comments;
  record.comments_export_complete = true;
  record.comments_exported_at = new Date().toISOString();
  writeJson(filePath, record);

  return comments.length;
}

async function exportComments(state, index) {
  const tickets = Object.values(index).sort((a, b) => a.id - b.id);
  const pendingTickets = [];
  let completed = 0;
  let commentsTotal = 0;

  for (const ticket of tickets) {
    const filePath = ticketPath(ticket.id);
    const record = readJson(filePath, null);

    if (record?.comments_export_complete) {
      ticket.comment_count = record.comments.length;
      completed += 1;
      commentsTotal += record.comments.length;
      continue;
    }

    pendingTickets.push(ticket);
  }

  function checkpoint({ includeIndex = false } = {}) {
    state.comments_tickets_complete = completed;
    state.comments_total = commentsTotal;
    state.updated_at = new Date().toISOString();

    writeJson(STATE_FILE, state);

    if (includeIndex) {
      writeJson(INDEX_FILE, tickets);
    }
  }

  checkpoint({ includeIndex: true });

  if (pendingTickets.length === 0) {
    state.comments_export_complete = true;
    checkpoint({ includeIndex: true });
    return;
  }

  console.log(
    `Exporting comments for ${pendingTickets.length} remaining tickets with ${COMMENT_CONCURRENCY} workers`,
  );

  let nextTicketIndex = 0;
  let firstError = null;

  async function runWorker() {
    while (nextTicketIndex < pendingTickets.length && !firstError) {
      const ticket = pendingTickets[nextTicketIndex];
      nextTicketIndex += 1;

      try {
        const commentCount = await exportCommentsForTicket(ticket.id);
        ticket.comment_count = commentCount;
        completed += 1;
        commentsTotal += commentCount;
      } catch (error) {
        firstError = error;
        return;
      }

      if (completed % COMMENT_STATE_INTERVAL === 0) {
        checkpoint();
      }

      if (completed % COMMENT_INDEX_INTERVAL === 0) {
        checkpoint({ includeIndex: true });
      }

      if (completed % COMMENT_LOG_INTERVAL === 0) {
        console.log(
          `Comments complete for ${completed}/${tickets.length} tickets; ${commentsTotal} comments`,
        );
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(COMMENT_CONCURRENCY, pendingTickets.length) },
    () => runWorker(),
  );
  await Promise.all(workers);

  checkpoint({ includeIndex: true });

  if (firstError) {
    throw firstError;
  }

  state.comments_export_complete = completed === tickets.length;
  checkpoint({ includeIndex: true });

  console.log(
    `Comments complete for ${completed}/${tickets.length} tickets; ${commentsTotal} comments`,
  );
}

const state = readJson(STATE_FILE, {
  started_at: new Date().toISOString(),
  ticket_cursor: null,
  ticket_pages: 0,
  ticket_count: 0,
  ticket_export_complete: false,
  ticket_end_of_stream: false,
  comments_tickets_complete: 0,
  comments_total: 0,
  comments_export_complete: false,
});

const indexRows = readJson(INDEX_FILE, []);
const index = Object.fromEntries(indexRows.map((ticket) => [String(ticket.id), ticket]));

await exportTicketFields();
await exportTickets(state, index);
await exportComments(state, index);

console.log(
  `Zendesk export complete: ${state.ticket_count} tickets, ${state.comments_total} comments`,
);
