import {
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const BASE_URL = "https://genstone.zendesk.com/api/v2/help_center";
const ROOT_DIR = new URL("..", import.meta.url).pathname;
const RAW_FILE = join(ROOT_DIR, "raw", "zendesk", "help-center-articles.json");
const DOCUMENT_FILE = join(ROOT_DIR, "zendesk-help-center-articles.md");

const email = requireEnvironment("ZENDESK_GENSTONE_API_EMAIL");
const token = requireEnvironment("ZENDESK_GESNTONE_API_TOKEN");
const authorization = Buffer.from(`${email}/token:${token}`).toString("base64");

function requireEnvironment(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function writeText(filePath, text) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryFile = `${filePath}.tmp`;
  writeFileSync(temporaryFile, text);
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
    const delaySeconds = Number.isFinite(retryAfter)
      ? Math.max(1, retryAfter)
      : Math.min(60, 2 ** attempt);

    console.log(
      `Zendesk returned ${response.status}; retrying in ${delaySeconds} seconds`,
    );
    await wait(delaySeconds * 1000);
    return zendeskFetch(url, attempt + 1);
  }

  const message = (await response.text()).slice(0, 500).replaceAll(/\s+/g, " ");
  throw new Error(`Zendesk request failed (${response.status}): ${message}`);
}

async function fetchCollection({ endpoint, key, include = null }) {
  const records = [];
  let pageNumber = 0;
  const initialUrl = new URL(`${BASE_URL}/${endpoint}.json`);
  initialUrl.searchParams.set("page[size]", "100");

  if (include) {
    initialUrl.searchParams.set("include", include);
  }

  let url = initialUrl.toString();

  while (url) {
    const page = await zendeskFetch(url);
    const pageRecords = Array.isArray(page[key]) ? page[key] : [];
    records.push(...pageRecords);
    pageNumber += 1;

    console.log(
      `${key} page ${pageNumber}: ${pageRecords.length} records; ${records.length} total`,
    );

    if (page.meta?.has_more) {
      url = page.links?.next;

      if (!url) {
        throw new Error(`${key} pagination returned no next-page URL`);
      }

      continue;
    }

    url = page.next_page ?? null;
  }

  return records;
}

function decodeHtml(value) {
  const entities = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    laquo: "«",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    mdash: "—",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    raquo: "»",
    rdquo: "”",
    rsquo: "’",
  };

  return value.replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const normalized = entity.toLowerCase();

    if (normalized.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    }

    if (normalized.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    }

    return entities[normalized] ?? match;
  });
}

function stripTags(value) {
  return decodeHtml(value.replaceAll(/<[^>]*>/g, "")).trim();
}

function htmlToMarkdown(html) {
  if (!html?.trim()) {
    return "_No body content._";
  }

  let markdown = html;
  markdown = markdown.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  markdown = markdown.replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  markdown = markdown.replaceAll(/<!--[\s\S]*?-->/g, "");
  markdown = markdown.replaceAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_match, body) => {
    return `\n\n\`\`\`\n${stripTags(body)}\n\`\`\`\n\n`;
  });
  markdown = markdown.replaceAll(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_match, body) => {
    return `\`${stripTags(body).replaceAll("`", "\\`")}\``;
  });
  markdown = markdown.replaceAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, url, label) => {
    const text = stripTags(label) || url;
    return `[${text}](${decodeHtml(url)})`;
  });
  markdown = markdown.replaceAll(/<img\b[^>]*>/gi, (tag) => {
    const source = tag.match(/src=["']([^"']+)["']/i)?.[1];
    const alternative = tag.match(/alt=["']([^"']*)["']/i)?.[1] ?? "image";
    return source ? `![${decodeHtml(alternative)}](${decodeHtml(source)})` : "";
  });
  markdown = markdown.replaceAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_match, body) => {
    return `\n\n#### ${stripTags(body)}\n\n`;
  });
  markdown = markdown.replaceAll(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
  markdown = markdown.replaceAll(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
  markdown = markdown.replaceAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_match, body) => {
    return `\n- ${stripTags(body)}`;
  });
  markdown = markdown.replaceAll(/<br\s*\/?\s*>/gi, "\n");
  markdown = markdown.replaceAll(/<\/(p|div|section|article|blockquote|ul|ol|table|tr)>/gi, "\n\n");
  markdown = markdown.replaceAll(/<(p|div|section|article|blockquote|ul|ol|table|tbody|thead|tr|td|th)\b[^>]*>/gi, "");
  markdown = markdown.replaceAll(/<[^>]*>/g, "");
  markdown = decodeHtml(markdown);
  markdown = markdown.replaceAll(/[ \t]+\n/g, "\n");
  markdown = markdown.replaceAll(/\n[ \t]+/g, "\n");
  markdown = markdown.replaceAll(/\n{3,}/g, "\n\n");

  return markdown.trim() || "_No body content._";
}

function escapeHeading(value) {
  return String(value ?? "Untitled").replaceAll(/\s+/g, " ").trim();
}

function visibilityLabel(article) {
  const segmentIds = article.user_segment_ids ?? [];
  const isRestricted = article.user_segment_id !== null || segmentIds.length > 0;
  return isRestricted ? "Restricted" : "Public";
}

function articleTranslations(article) {
  if (Array.isArray(article.translations) && article.translations.length > 0) {
    return article.translations;
  }

  return [article];
}

function buildDocument({ articles, categories, sections, exportedAt }) {
  const categoriesById = new Map(categories.map((entry) => [String(entry.id), entry]));
  const sectionsById = new Map(sections.map((entry) => [String(entry.id), entry]));
  const articlesBySection = new Map();

  for (const article of articles) {
    const sectionId = String(article.section_id ?? "unassigned");
    const sectionArticles = articlesBySection.get(sectionId) ?? [];
    sectionArticles.push(article);
    articlesBySection.set(sectionId, sectionArticles);
  }

  const draftCount = articles.filter((article) => article.draft).length;
  const restrictedCount = articles.filter(
    (article) => visibilityLabel(article) === "Restricted",
  ).length;
  const translationCount = articles.reduce(
    (total, article) => total + articleTranslations(article).length,
    0,
  );
  const lines = [
    "# GenStone Zendesk Help Center Articles",
    "",
    "> Separate source export. Article status and visibility reflect the authenticated Zendesk response at export time. Draft or restricted material is not automatically approved for Knowledge Base V1.",
    "",
    `- Exported: ${exportedAt}`,
    `- Categories: ${categories.length}`,
    `- Sections: ${sections.length}`,
    `- Article records: ${articles.length}`,
    `- Article translations represented: ${translationCount}`,
    `- Draft article records: ${draftCount}`,
    `- Restricted article records: ${restrictedCount}`,
    "",
  ];

  const orderedSections = [...sections].sort((left, right) => {
    const leftCategory = categoriesById.get(String(left.category_id));
    const rightCategory = categoriesById.get(String(right.category_id));
    return (
      (leftCategory?.position ?? 0) - (rightCategory?.position ?? 0) ||
      (left.position ?? 0) - (right.position ?? 0) ||
      String(left.name).localeCompare(String(right.name))
    );
  });
  let currentCategoryId = null;

  for (const section of orderedSections) {
    const category = categoriesById.get(String(section.category_id));
    const categoryId = String(category?.id ?? "unassigned");

    if (categoryId !== currentCategoryId) {
      currentCategoryId = categoryId;
      lines.push(`## ${escapeHeading(category?.name ?? "Unassigned Category")}`, "");

      if (category?.description?.trim()) {
        lines.push(htmlToMarkdown(category.description), "");
      }
    }

    lines.push(`### ${escapeHeading(section.name)}`, "");

    if (section.description?.trim()) {
      lines.push(htmlToMarkdown(section.description), "");
    }

    const sectionArticles = articlesBySection.get(String(section.id)) ?? [];
    sectionArticles.sort((left, right) => {
      return (
        (left.position ?? 0) - (right.position ?? 0) ||
        String(left.title).localeCompare(String(right.title))
      );
    });

    for (const article of sectionArticles) {
      for (const translation of articleTranslations(article)) {
        const title = translation.title ?? article.title ?? `Article ${article.id}`;
        const locale = translation.locale ?? article.locale ?? article.source_locale;
        const body = translation.body ?? article.body;
        const status = translation.draft ?? article.draft ? "Draft" : "Published";
        const url = translation.html_url ?? article.html_url;

        lines.push(`#### ${escapeHeading(title)}`, "");
        lines.push(
          `- Article ID: ${article.id}`,
          `- Status: ${status}`,
          `- Visibility: ${visibilityLabel(article)}`,
          `- Locale: ${locale ?? "Unknown"}`,
          `- Updated: ${translation.updated_at ?? article.updated_at ?? "Unknown"}`,
        );

        if (article.label_names?.length) {
          lines.push(`- Labels: ${article.label_names.join(", ")}`);
        }

        if (url) {
          lines.push(`- Zendesk URL: ${url}`);
        }

        lines.push("", htmlToMarkdown(body), "");
      }
    }
  }

  const knownSectionIds = new Set(sections.map((section) => String(section.id)));
  const unassignedArticles = articles.filter(
    (article) => !knownSectionIds.has(String(article.section_id)),
  );

  if (unassignedArticles.length > 0) {
    lines.push("## Unassigned Articles", "");

    for (const article of unassignedArticles) {
      lines.push(`### ${escapeHeading(article.title ?? `Article ${article.id}`)}`, "");
      lines.push(`- Article ID: ${article.id}`, "", htmlToMarkdown(article.body), "");
    }
  }

  return `${lines.join("\n").replaceAll(/\n{3,}/g, "\n\n").trim()}\n`;
}

const [categories, sections, articles] = await Promise.all([
  fetchCollection({
    endpoint: "categories",
    key: "categories",
    include: "translations",
  }),
  fetchCollection({
    endpoint: "sections",
    key: "sections",
    include: "categories,translations",
  }),
  fetchCollection({
    endpoint: "articles",
    key: "articles",
    include: "sections,categories,translations",
  }),
]);

const exportedAt = new Date().toISOString();
const rawExport = {
  exported_at: exportedAt,
  source: `${BASE_URL}/articles.json`,
  categories,
  sections,
  articles,
};

writeText(RAW_FILE, `${JSON.stringify(rawExport, null, 2)}\n`);
writeText(
  DOCUMENT_FILE,
  buildDocument({ articles, categories, sections, exportedAt }),
);

console.log(`Wrote ${DOCUMENT_FILE}`);
console.log(`Wrote raw backup ${RAW_FILE}`);
