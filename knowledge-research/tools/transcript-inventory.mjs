import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const TRANSCRIPT_DIR =
  "/Users/adeola/gensteel-ai-customer-agent/output/transcripts/genstone/main";
const ROOT_DIR = new URL("..", import.meta.url).pathname;
const OUTPUT_FILE = join(
  ROOT_DIR,
  "raw",
  "transcripts",
  "transcript-inventory.json",
);

function getMetadata(text, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^- ${escapedLabel}: (.+)$`, "m"));
  return match?.[1] ?? null;
}

function loadPreviousReviews() {
  if (!existsSync(OUTPUT_FILE)) {
    return new Map();
  }

  const records = JSON.parse(readFileSync(OUTPUT_FILE, "utf8"));

  return new Map(
    records.map((record) => [record.callId, record]),
  );
}

function buildInventory() {
  const previousReviews = loadPreviousReviews();
  const fileNames = readdirSync(TRANSCRIPT_DIR)
    .filter((fileName) => fileName.endsWith(".md"))
    .sort();

  return fileNames.map((fileName, index) => {
    const filePath = join(TRANSCRIPT_DIR, fileName);
    const text = readFileSync(filePath, "utf8");

    const sha256 = createHash("sha256").update(text).digest("hex");
    const previousRecord = previousReviews.get(basename(fileName, ".md"));
    const reviewStatus = previousRecord?.sha256 === sha256
      ? previousRecord.reviewStatus
      : "pending";

    return {
      index: index + 1,
      callId: basename(fileName, ".md"),
      filePath,
      date: getMetadata(text, "Date"),
      durationMinutes: getMetadata(text, "Duration minutes"),
      characters: text.length,
      lines: text.split("\n").length,
      sha256,
      reviewStatus,
    };
  });
}

function printBatch(inventory, batchNumber, batchSize) {
  const startIndex = (batchNumber - 1) * batchSize;
  const batch = inventory.slice(startIndex, startIndex + batchSize);

  if (batch.length === 0) {
    throw new Error(`Batch ${batchNumber} is outside the transcript inventory`);
  }

  for (const record of batch) {
    const text = readFileSync(record.filePath, "utf8");
    console.log(`\n===== TRANSCRIPT ${record.index} OF ${inventory.length} =====`);
    console.log(`===== FILE ${record.callId}.md =====\n`);
    console.log(text);
  }
}

const inventory = buildInventory();
const batchFlagIndex = process.argv.indexOf("--batch");

if (batchFlagIndex >= 0) {
  const batchNumber = Number(process.argv[batchFlagIndex + 1]);
  const sizeFlagIndex = process.argv.indexOf("--size");
  const batchSize = sizeFlagIndex >= 0 ? Number(process.argv[sizeFlagIndex + 1]) : 20;

  if (!Number.isInteger(batchNumber) || batchNumber < 1) {
    throw new Error("--batch must be a positive integer");
  }
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("--size must be a positive integer");
  }

  printBatch(inventory, batchNumber, batchSize);
} else {
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(inventory, null, 2)}\n`);
  console.log(`Inventoried ${inventory.length} Markdown transcripts`);
  console.log(`Wrote ${OUTPUT_FILE}`);
}
