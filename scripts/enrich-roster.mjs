/**
 * Merge the public legacy roster fields (mentor phone, serials, venue) into
 * public/data/students.json.
 *
 *   node scripts/enrich-roster.mjs
 *   node scripts/enrich-roster.mjs --legacy ../gndec/public/data/student-roster-index.json
 *
 * If the legacy file is not available, the script leaves students.json
 * untouched and exits 0 so a clean checkout or CI run does not fail.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { mergeLegacyRoster, countRosterFields } from "./lib/roster.mjs";

const root = path.resolve(import.meta.dirname, "..");
const target = path.join(root, "public", "data", "students.json");

const args = process.argv.slice(2);
const legacyIndex = args.indexOf("--legacy");
const legacyCandidates = legacyIndex >= 0 && args[legacyIndex + 1]
  ? [path.resolve(args[legacyIndex + 1])]
  : [
      path.join(root, "..", "gndec", "public", "data", "student-roster-index.json"),
      path.join(root, "..", "gndec", "public", "data", "students.json"),
    ];

async function readJson(file) {
  const text = await fs.readFile(file, "utf8");
  return JSON.parse(text);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

const current = await readJson(target);

let legacyFile = null;
for (const candidate of legacyCandidates) {
  if (await exists(candidate)) {
    legacyFile = candidate;
    break;
  }
}

if (!legacyFile) {
  console.log("Legacy roster not found. students.json already contains the published fields; nothing to merge.");
  console.log(`Current roster: ${JSON.stringify(countRosterFields(current))}`);
  process.exit(0);
}

const legacy = await readJson(legacyFile);
const merged = mergeLegacyRoster(current, legacy);
merged.generatedAt = new Date().toISOString();

await fs.writeFile(target, `${JSON.stringify(merged, null, 2)}\n`);
console.log(`Merged ${merged.roster.legacyMatched} legacy records from ${path.relative(root, legacyFile)}.`);
console.log(`Roster now: ${JSON.stringify(countRosterFields(merged))}`);
