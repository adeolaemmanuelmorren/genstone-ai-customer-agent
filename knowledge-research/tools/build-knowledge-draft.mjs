import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT_DIR = new URL("..", import.meta.url).pathname;
const TOPIC_DIR = join(ROOT_DIR, "topics");

const TOPIC_FILES = [
  "products-and-terminology.md",
  "installation-and-care.md",
  "purchasing-samples-and-visualizer.md",
  "orders-shipping-returns-and-warranty.md",
];

function readTopic(fileName) {
  const text = readFileSync(join(TOPIC_DIR, fileName), "utf8").trim();
  const lines = text.split("\n");

  if (lines[0]?.startsWith("# ")) {
    lines.shift();
  }

  while (lines[0] === "") {
    lines.shift();
  }

  if (lines[0]?.startsWith("> Draft pending")) {
    lines.shift();
  }

  while (lines[0] === "") {
    lines.shift();
  }

  return lines.join("\n").trim();
}

const sections = TOPIC_FILES.map((fileName) => readTopic(fileName));
const draft = [
  "# GenStone Knowledge Draft",
  "",
  "> **Draft pending business-owner approval.** Do not treat this document as an approved production knowledge base. Conflicts remain documented in `conflicts-and-open-questions.md`.",
  "",
  "> Source status: GenStone website and call-transcript reviews are complete. Zendesk tickets have not yet been merged.",
  "",
  ...sections.flatMap((section) => [section, ""]),
].join("\n");

writeFileSync(join(ROOT_DIR, "genstone-knowledge-draft.md"), draft);
console.log(`Built draft from ${TOPIC_FILES.length} topic documents`);
