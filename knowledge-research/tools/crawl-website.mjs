import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { basename, join } from "node:path";

const SITE_URL = "https://genstone.com";
const ROOT_DIR = new URL("..", import.meta.url).pathname;
const RAW_DIR = join(ROOT_DIR, "raw", "website");
const SITEMAP_DIR = join(RAW_DIR, "sitemaps");
const PAGE_DIR = join(RAW_DIR, "pages");
const MAX_CONCURRENCY = 6;
const SHOULD_REFRESH = process.argv.includes("--refresh");
const HTTP_METADATA_MARKER = "__CODEX_HTTP_METADATA__";

const INCLUDED_SITEMAPS = new Set([
  "post-sitemap.xml",
  "page-sitemap.xml",
  "howto-sitemap.xml",
  "faq-sitemap.xml",
  "product-sitemap.xml",
]);

const EXCLUSION_REASONS = {
  "project-sitemap.xml": "Customer project gallery entry",
  "project-sitemap2.xml": "Customer project gallery entry",
  "review-sitemap.xml": "Customer review entry",
  "coordinator-sitemap.xml": "Staff profile",
  "category-sitemap.xml": "Duplicate archive page",
  "post_tag-sitemap.xml": "Duplicate tag archive",
  "product_family-sitemap.xml": "Duplicate product archive",
  "project_category-sitemap.xml": "Duplicate project archive",
  "upgrade_area-sitemap.xml": "Duplicate project archive",
  "review_type-sitemap.xml": "Duplicate review archive",
  "howto_category-sitemap.xml": "Duplicate how-to archive",
  "language-sitemap.xml": "Duplicate taxonomy archive",
  "style-sitemap.xml": "Duplicate taxonomy archive",
  "prod_color-sitemap.xml": "Duplicate product archive",
  "product_cat-sitemap.xml": "Duplicate product archive",
  "product_tag-sitemap.xml": "Duplicate product archive",
  "author-sitemap.xml": "Author archive",
};

mkdirSync(SITEMAP_DIR, { recursive: true });
mkdirSync(PAGE_DIR, { recursive: true });

function decodeHtml(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    laquo: "«",
    ldquo: "“",
    lsquo: "‘",
    lt: "<",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    raquo: "»",
    rdquo: "”",
    reg: "®",
    rsquo: "’",
    trade: "™",
  };

  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (entity, name) => namedEntities[name] ?? entity);
}

function extractTag(html, pattern) {
  const match = html.match(pattern);
  return match ? decodeHtml(match[1].trim()) : "";
}

function htmlToText(html) {
  return decodeHtml(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(address|article|aside|blockquote|div|figcaption|figure|h[1-6]|li|p|section|table|tr)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function resolveUrl(href, pageUrl) {
  if (!href || href.startsWith("#")) {
    return null;
  }

  if (/^(javascript|mailto|tel):/i.test(href)) {
    return null;
  }

  try {
    return new URL(decodeHtml(href), pageUrl).href;
  } catch {
    return null;
  }
}

function extractLinks(html, pageUrl) {
  const links = [];
  const seenUrls = new Set();

  for (const match of html.matchAll(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const url = resolveUrl(match[1], pageUrl);
    if (!url || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    links.push({ url, text: htmlToText(match[2]) });
  }

  return links;
}

function extractEmbeds(html, pageUrl) {
  const embeds = [];

  for (const match of html.matchAll(
    /<(iframe|embed)\b[^>]*src=["']([^"']+)["'][^>]*>/gi,
  )) {
    const url = resolveUrl(match[2], pageUrl);
    if (url) {
      embeds.push({ type: match[1].toLowerCase(), url });
    }
  }

  for (const match of html.matchAll(/\bdata-id=["']([^"']+)["']/gi)) {
    embeds.push({ type: "data-id", value: match[1] });
  }

  return embeds;
}

function extractPage(url, sitemap, html) {
  const mainMatch = html.match(/<main\b[^>]*>[\s\S]*?<\/main>/i);
  const heroStart = html.search(/<section\b[^>]*id=["']panel-hero["']/i);
  const footerStart = html.search(/<footer\b[^>]*id=["']footer["']/i);

  let contentHtml = html;
  if (mainMatch) {
    contentHtml = mainMatch[0];
  } else if (heroStart >= 0 && footerStart > heroStart) {
    contentHtml = html.slice(heroStart, footerStart);
  }

  return {
    url,
    sitemap,
    title: extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description: extractTag(
      html,
      /<meta\s+name=["']description["']\s+content=["']([^"']*)["'][^>]*>/i,
    ),
    canonicalUrl: extractTag(
      html,
      /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/i,
    ),
    text: htmlToText(contentHtml),
    links: extractLinks(contentHtml, url),
    embeds: extractEmbeds(contentHtml, url),
  };
}

function getLocations(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    decodeHtml(match[1].trim()),
  );
}

function pageFileName(url) {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return `${hash}.json`;
}

function fetchWithCurl(url) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl", [
      "-fsSL",
      "--retry",
      "3",
      "--retry-delay",
      "1",
      "--max-time",
      "60",
      "--write-out",
      `\n${HTTP_METADATA_MARKER}%{http_code}\t%{url_effective}`,
      url,
    ]);

    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`curl failed for ${url}: ${Buffer.concat(stderr)}`));
        return;
      }

      const output = Buffer.concat(stdout).toString("utf8");
      const metadataIndex = output.lastIndexOf(`\n${HTTP_METADATA_MARKER}`);

      if (metadataIndex < 0) {
        reject(new Error(`curl returned no HTTP metadata for ${url}`));
        return;
      }

      const body = output.slice(0, metadataIndex);
      const metadata = output
        .slice(metadataIndex + HTTP_METADATA_MARKER.length + 1)
        .trim();
      const [httpCode, effectiveUrl] = metadata.split("\t");

      resolve({ body, httpCode: Number(httpCode), effectiveUrl });
    });
  });
}

async function mapWithConcurrency(items, worker) {
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  }

  const workerCount = Math.min(MAX_CONCURRENCY, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));
}

async function loadSitemaps() {
  const indexUrl = `${SITE_URL}/sitemap_index.xml`;
  const indexResponse = await fetchWithCurl(indexUrl);
  const indexXml = indexResponse.body;
  writeFileSync(join(SITEMAP_DIR, "sitemap_index.xml"), indexXml);

  const sitemapUrls = getLocations(indexXml);
  const sitemaps = [];

  await mapWithConcurrency(sitemapUrls, async (sitemapUrl) => {
    const response = await fetchWithCurl(sitemapUrl);
    const xml = response.body;
    const name = basename(new URL(sitemapUrl).pathname);
    writeFileSync(join(SITEMAP_DIR, name), xml);
    sitemaps.push({ name, url: sitemapUrl, urls: getLocations(xml) });
  });

  return sitemaps.sort((left, right) => left.name.localeCompare(right.name));
}

function buildInventory(sitemaps) {
  return sitemaps.flatMap((sitemap) =>
    sitemap.urls.map((url) => {
      const included = INCLUDED_SITEMAPS.has(sitemap.name);

      return {
        url,
        sitemap: sitemap.name,
        reviewStatus: included ? "queued" : "excluded",
        exclusionReason: included
          ? null
          : EXCLUSION_REASONS[sitemap.name] ?? "Unsupported archive type",
      };
    }),
  );
}

async function crawlPages(reviewQueue) {
  const manifest = [];
  let completed = 0;

  await mapWithConcurrency(reviewQueue, async (entry) => {
    const fileName = pageFileName(entry.url);
    const filePath = join(PAGE_DIR, fileName);

    if (existsSync(filePath) && !SHOULD_REFRESH) {
      const page = JSON.parse(readFileSync(filePath, "utf8"));
      manifest.push({ ...page, ...entry, file: `pages/${fileName}` });
      return;
    }

    try {
      const response = await fetchWithCurl(entry.url);
      const page = {
        ...extractPage(entry.url, entry.sitemap, response.body),
        httpCode: response.httpCode,
        effectiveUrl: response.effectiveUrl,
      };
      writeFileSync(filePath, `${JSON.stringify(page, null, 2)}\n`);
      manifest.push({ ...page, ...entry, file: `pages/${fileName}` });
    } catch (error) {
      manifest.push({
        ...entry,
        reviewStatus: "fetch-failed",
        error: error.message,
      });
    }

    completed += 1;
    if (completed % 25 === 0 || completed === reviewQueue.length) {
      console.log(`Fetched ${completed}/${reviewQueue.length} pages`);
    }
  });

  return manifest.sort((left, right) => left.url.localeCompare(right.url));
}

const sitemaps = await loadSitemaps();
const inventory = buildInventory(sitemaps);
const reviewQueue = inventory.filter((entry) => entry.reviewStatus === "queued");
const excludedUrls = inventory.filter((entry) => entry.reviewStatus === "excluded");

writeFileSync(
  join(RAW_DIR, "sitemap-inventory.json"),
  `${JSON.stringify(inventory, null, 2)}\n`,
);
writeFileSync(
  join(RAW_DIR, "review-queue.json"),
  `${JSON.stringify(reviewQueue, null, 2)}\n`,
);
writeFileSync(
  join(RAW_DIR, "excluded-urls.json"),
  `${JSON.stringify(excludedUrls, null, 2)}\n`,
);

console.log(`Inventoried ${inventory.length} sitemap URLs`);
console.log(`Queued ${reviewQueue.length} pages for content review`);
console.log(`Excluded ${excludedUrls.length} archive or customer-content URLs`);

const manifest = await crawlPages(reviewQueue);
writeFileSync(
  join(RAW_DIR, "website-page-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

const failedCount = manifest.filter(
  (entry) => entry.reviewStatus === "fetch-failed",
).length;

console.log(`Created ${manifest.length} normalized page records`);
console.log(`Fetch failures: ${failedCount}`);
