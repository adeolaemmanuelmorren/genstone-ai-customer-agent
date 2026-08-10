import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const BASE_URL = "https://genstone.zendesk.com/api/v2";
const ROOT_DIR = new URL("..", import.meta.url).pathname;
const OUTPUT_DIR = join(ROOT_DIR, "raw", "zendesk");
const TICKET_DIR = join(OUTPUT_DIR, "tickets");
const EXPORT_STATE_FILE = join(OUTPUT_DIR, "export-state.json");
const EVENT_STATE_FILE = join(OUTPUT_DIR, "comment-event-state.json");
const INDEX_FILE = join(OUTPUT_DIR, "ticket-index.json");
const ORPHAN_FILE = join(OUTPUT_DIR, "orphan-comment-events.json");
const START_TIME = 1;
const REQUEST_INTERVAL_MS = 6_100;

const email = requireEnvironment("ZENDESK_GENSTONE_API_EMAIL");
const token = requireEnvironment("ZENDESK_GESNTONE_API_TOKEN");
const authorization = Buffer.from(`${email}/token:${token}`).toString("base64");

let lastRequestStartedAt = 0;

function requireEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
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

async function waitForRequestSlot() {
  const elapsed = Date.now() - lastRequestStartedAt;
  const remaining = REQUEST_INTERVAL_MS - elapsed;

  if (remaining > 0) {
    await wait(remaining);
  }

  lastRequestStartedAt = Date.now();
}

async function zendeskFetch(url, attempt = 1) {
  await waitForRequestSlot();

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

    console.log(
      `Zendesk returned ${response.status}; retrying in ${delaySeconds} seconds`,
    );
    await wait(delaySeconds * 1000);
    return zendeskFetch(url, attempt + 1);
  }

  const text = await response.text();
  const safeMessage = text.slice(0, 500).replaceAll(/\s+/g, " ");
  throw new Error(`Zendesk request failed (${response.status}): ${safeMessage}`);
}

function normalizeComment(comment) {
  return {
    id: comment.id,
    type: comment.type ?? comment.event_type ?? "Comment",
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

function getCommentEvents(ticketEvent) {
  const childEvents = Array.isArray(ticketEvent.child_events)
    ? ticketEvent.child_events
    : [];

  return childEvents.filter((event) => {
    return event.type === "Comment" || event.event_type === "Comment";
  });
}

function ticketPath(ticketId) {
  return join(TICKET_DIR, `${ticketId}.json`);
}

function mergeComments(existingComments, newComments) {
  const commentsById = new Map();

  for (const comment of existingComments) {
    commentsById.set(String(comment.id), comment);
  }

  for (const comment of newComments) {
    const normalized = normalizeComment(comment);
    const existing = commentsById.get(String(normalized.id));

    commentsById.set(String(normalized.id), {
      ...normalized,
      ...existing,
      metadata: existing?.metadata ?? normalized.metadata,
    });
  }

  return [...commentsById.values()].sort((left, right) => {
    const timeComparison = String(left.created_at).localeCompare(
      String(right.created_at),
    );

    if (timeComparison !== 0) {
      return timeComparison;
    }

    return Number(left.id) - Number(right.id);
  });
}

function mergeEventPage(ticketEvents, orphanEvents) {
  const commentsByTicket = new Map();

  for (const ticketEvent of ticketEvents) {
    const comments = getCommentEvents(ticketEvent);

    if (comments.length === 0) {
      continue;
    }

    const ticketId = ticketEvent.ticket_id;
    const existing = commentsByTicket.get(String(ticketId)) ?? [];
    commentsByTicket.set(String(ticketId), [...existing, ...comments]);
  }

  let commentsOnPage = 0;

  for (const [ticketId, comments] of commentsByTicket) {
    commentsOnPage += comments.length;
    const filePath = ticketPath(ticketId);
    const record = readJson(filePath, null);

    if (!record) {
      orphanEvents.push({ ticket_id: Number(ticketId), comments });
      continue;
    }

    record.comments = mergeComments(record.comments ?? [], comments);
    record.comments_export_complete = false;
    record.comments_exported_at = null;
    writeJson(filePath, record);
  }

  return commentsOnPage;
}

async function exportCommentEvents() {
  const state = readJson(EVENT_STATE_FILE, {
    started_at: new Date().toISOString(),
    pages: 0,
    ticket_events_seen: 0,
    comment_events_seen: 0,
    next_page: null,
    end_time: null,
    end_of_stream: false,
    updated_at: null,
  });
  const orphanEvents = readJson(ORPHAN_FILE, []);

  if (state.end_of_stream) {
    return state;
  }

  let url = state.next_page;

  if (!url) {
    const initialUrl = new URL(`${BASE_URL}/incremental/ticket_events`);
    initialUrl.searchParams.set("start_time", String(START_TIME));
    initialUrl.searchParams.set("include", "comment_events");
    initialUrl.searchParams.set("support_type_scope", "all");
    url = initialUrl.toString();
  }

  while (true) {
    const page = await zendeskFetch(url);
    const ticketEvents = Array.isArray(page.ticket_events)
      ? page.ticket_events
      : [];
    const commentsOnPage = mergeEventPage(ticketEvents, orphanEvents);

    state.pages += 1;
    state.ticket_events_seen += ticketEvents.length;
    state.comment_events_seen += commentsOnPage;
    state.next_page = page.next_page ?? null;
    state.end_time = page.end_time ?? null;
    state.end_of_stream = page.end_of_stream === true;
    state.updated_at = new Date().toISOString();

    writeJson(EVENT_STATE_FILE, state);
    writeJson(ORPHAN_FILE, orphanEvents);

    console.log(
      `Comment-event page ${state.pages}: ${ticketEvents.length} ticket events, ${commentsOnPage} comment events`,
    );

    if (state.end_of_stream) {
      return state;
    }

    if (!state.next_page) {
      throw new Error(
        "Comment-event export did not reach end_of_stream and returned no next page",
      );
    }

    url = state.next_page;
  }
}

function finalizeComments(eventState) {
  const exportState = readJson(EXPORT_STATE_FILE, null);
  const index = readJson(INDEX_FILE, []);

  if (!exportState?.ticket_end_of_stream) {
    throw new Error("Ticket export must reach end_of_stream before finalization");
  }

  if (!eventState.end_of_stream) {
    throw new Error("Comment-event export must reach end_of_stream before finalization");
  }

  let commentsTotal = 0;
  let completedTickets = 0;

  for (const ticket of index) {
    const filePath = ticketPath(ticket.id);
    const record = readJson(filePath, null);

    if (!record) {
      throw new Error(`Missing normalized ticket record for ${ticket.id}`);
    }

    record.comments_export_complete = true;
    record.comments_exported_at = new Date().toISOString();
    ticket.comment_count = record.comments.length;
    commentsTotal += record.comments.length;
    completedTickets += 1;
    writeJson(filePath, record);

    if (completedTickets % 10_000 === 0) {
      console.log(
        `Finalized comments for ${completedTickets}/${index.length} tickets`,
      );
    }
  }

  exportState.comments_export_complete = completedTickets === index.length;
  exportState.comments_tickets_complete = completedTickets;
  exportState.comments_total = commentsTotal;
  exportState.comment_event_pages = eventState.pages;
  exportState.comment_events_seen = eventState.comment_events_seen;
  exportState.updated_at = new Date().toISOString();

  writeJson(INDEX_FILE, index);
  writeJson(EXPORT_STATE_FILE, exportState);

  console.log(
    `Zendesk comment export complete: ${completedTickets} tickets, ${commentsTotal} unique comments`,
  );
}

const eventState = await exportCommentEvents();
finalizeComments(eventState);
