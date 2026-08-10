import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT_DIR = new URL("..", import.meta.url).pathname;
const RAW_DIR = join(ROOT_DIR, "raw", "website");

const UTILITY_PAGE_REASONS = new Map([
  ["/agent-dashboard", "Internal or account utility page"],
  ["/call-confirmation", "Form confirmation page"],
  ["/communication-preferences", "Communication preference utility page"],
  ["/dashboard", "Account login page"],
  ["/insights", "Duplicate article archive"],
  ["/inspiration-gallery", "Customer project gallery"],
  ["/reviews", "Customer review collection"],
  ["/share-my-genstone-story", "Customer review submission page"],
  ["/share-my-genstone-story/review-received", "Form confirmation page"],
  ["/team", "Staff directory"],
]);

const LINKED_DOCUMENTS = [
  {
    url: "https://on.genstone.com/genstone_warranty",
    localFile: "raw/website/documents/genstone-warranty.pdf",
    title: "GenStone 25 Year Warranty",
    status: "reviewed_relevant",
  },
  {
    url: "https://genstone.com/wp-content/uploads/2020/11/GenStone-Products-Use-and-Care.pdf",
    localFile: "raw/website/documents/genstone-use-and-care.pdf",
    title: "GenStone Products Use and Care",
    status: "reviewed_relevant",
  },
  {
    url: "https://genstone.com/wp-content/uploads/2021/07/GenStone-Post-Purchase-Guide.pdf",
    localFile: "raw/website/documents/genstone-post-purchase-guide.pdf",
    title: "GenStone Post Purchase Guide",
    status: "reviewed_relevant",
  },
  {
    url: "https://genstone.com/wp-content/uploads/2019/06/GenStone-Warranty-Claim.pdf",
    localFile: "raw/website/documents/warranty-claim-form.pdf",
    title: "Warranty Claim Form",
    status: "reviewed_operational_form",
  },
];

function readJson(fileName) {
  return JSON.parse(readFileSync(join(RAW_DIR, fileName), "utf8"));
}

function pageExclusionReason(page) {
  const pathname = new URL(page.url).pathname.replace(/\/$/, "") || "/";
  const utilityReason = UTILITY_PAGE_REASONS.get(pathname);

  if (utilityReason) {
    return utilityReason;
  }

  if (pathname.startsWith("/insights/project-spotlights/")) {
    return "Customer-specific project spotlight";
  }

  if (pathname.endsWith("/arctic-smoke-projects-gallery")) {
    return "Customer-specific project gallery";
  }

  if (pathname.startsWith("/insights/state-spotlights/")) {
    return "General marketing content without unique caller-facing facts";
  }

  if (pathname.startsWith("/insights/diy-project-ideas/")) {
    return "General project-inspiration marketing content";
  }

  return null;
}

function classifyPages(pages) {
  const seenUrls = new Set();

  return pages.map((page) => {
    const baseRecord = {
      url: page.url,
      sitemap: page.sitemap,
      title: page.title ?? "",
      httpCode: page.httpCode ?? null,
      effectiveUrl: page.effectiveUrl ?? null,
      textLength: page.text?.length ?? 0,
      localFile: page.file ?? null,
    };

    if (seenUrls.has(page.url)) {
      return {
        ...baseRecord,
        status: "duplicate_sitemap_entry",
        reason: "The same canonical URL appears more than once in the sitemap set",
      };
    }
    seenUrls.add(page.url);

    if (page.reviewStatus === "fetch-failed") {
      return {
        ...baseRecord,
        status: "unavailable",
        reason: page.error,
      };
    }

    if (page.effectiveUrl && page.effectiveUrl !== page.url) {
      return {
        ...baseRecord,
        status: "reviewed_redirect_duplicate",
        reason: `Redirects to ${page.effectiveUrl}`,
      };
    }

    const exclusionReason = pageExclusionReason(page);
    if (exclusionReason) {
      return {
        ...baseRecord,
        status: "reviewed_excluded",
        reason: exclusionReason,
      };
    }

    if (page.url === "https://genstone.com/terms-and-conditions") {
      return {
        ...baseRecord,
        status: "reviewed_no_static_content",
        reason: "Policy content is loaded by a third-party embed and is absent from the static page",
      };
    }

    return {
      ...baseRecord,
      status: "reviewed_relevant",
      reason: "Caller-facing source retained for knowledge synthesis",
    };
  });
}

function countBy(records, field) {
  const counts = new Map();
  for (const record of records) {
    const key = record[field];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) =>
    String(left[0]).localeCompare(String(right[0])),
  );
}

function escapeCell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .trim();
}

function buildSourcesReviewed(inventory, ledger) {
  const sitemapCounts = countBy(inventory, "sitemap");
  const excludedInventory = inventory.filter(
    (record) => record.reviewStatus === "excluded",
  );
  const excludedCounts = countBy(excludedInventory, "exclusionReason");
  const statusCounts = countBy(ledger, "status");

  const lines = [
    "# Sources Reviewed",
    "",
    "> Draft research record. The website and call-transcript phases are complete; Zendesk will be added next in source order.",
    "",
    "## GenStone Website",
    "",
    "- Sitemap index: https://genstone.com/sitemap_index.xml",
    `- Sitemap URLs inventoried: ${inventory.length}`,
    `- Candidate page records reviewed: ${ledger.length}`,
    `- Linked official documents reviewed: ${LINKED_DOCUMENTS.length}`,
    "- Full URL inventory: `raw/website/sitemap-inventory.json`",
    "- Normalized page records: `raw/website/website-page-manifest.json`",
    "- Review ledger: `raw/website/website-review-ledger.json`",
    "",
    "### Sitemap Inventory",
    "",
    "| Sitemap | URLs |",
    "| --- | ---: |",
    ...sitemapCounts.map(([sitemap, count]) => `| ${escapeCell(sitemap)} | ${count} |`),
    "",
    "### Review Dispositions",
    "",
    "| Status | Pages |",
    "| --- | ---: |",
    ...statusCounts.map(([status, count]) => `| ${escapeCell(status)} | ${count} |`),
    "",
    "### Sitemap-Level Exclusions",
    "",
    "| Reason | URLs |",
    "| --- | ---: |",
    ...excludedCounts.map(([reason, count]) => `| ${escapeCell(reason)} | ${count} |`),
    "",
    "The sitemap-level exclusions above are preserved URL-by-URL in `raw/website/excluded-urls.json`.",
    "",
    "### Candidate Pages",
    "",
    "| URL | Sitemap | Status | Reason |",
    "| --- | --- | --- | --- |",
    ...ledger.map(
      (record) =>
        `| ${escapeCell(record.url)} | ${escapeCell(record.sitemap)} | ${escapeCell(record.status)} | ${escapeCell(record.reason)} |`,
    ),
    "",
    "### Linked Official Documents",
    "",
    "| URL | Title | Status | Local source |",
    "| --- | --- | --- | --- |",
    ...LINKED_DOCUMENTS.map(
      (document) =>
        `| ${escapeCell(document.url)} | ${escapeCell(document.title)} | ${escapeCell(document.status)} | \`${escapeCell(document.localFile)}\` |`,
    ),
    "",
    "## Call Transcripts",
    "",
    "- Markdown transcripts inventoried: **428**",
    "- Review result: **428 of 428 read completely and individually**",
    "- Call dates represented: **March 16, 2026 through June 15, 2026**",
    "- Total recorded duration: **1,415 minutes (23.6 hours)**",
    "- Inventory and hashes: `raw/transcripts/transcript-inventory.json`",
    "- Deidentified findings: `raw/transcripts/transcript-findings.md`",
    "",
    "## Zendesk Tickets",
    "",
    "Pending export and review. The prerequisite transcript review is complete.",
    "",
  ];

  return lines.join("\n");
}

const inventory = readJson("sitemap-inventory.json");
const pages = readJson("website-page-manifest.json");
const ledger = classifyPages(pages);

writeFileSync(
  join(RAW_DIR, "website-review-ledger.json"),
  `${JSON.stringify(ledger, null, 2)}\n`,
);
writeFileSync(
  join(ROOT_DIR, "sources-reviewed.md"),
  buildSourcesReviewed(inventory, ledger),
);

console.log(`Wrote ${ledger.length} website review records`);
for (const [status, count] of countBy(ledger, "status")) {
  console.log(`${status}: ${count}`);
}
