/**
 * Refresh the public GNDEC ERP notice feed.
 *
 *   node scripts/refresh-notices.mjs            # add any unseen notices
 *   node scripts/refresh-notices.mjs --check    # exit 2 when something is new
 *
 * The college's ERP notice board is the dated public stream used by the
 * notice page. Homepage feature links, holidays and exam tables live in the
 * same JSON file but are maintained separately; this script only replaces the
 * `notices` array and preserves everything else.
 */
import { fetchText } from "./lib/fet.mjs";
import { ERP_NOTICE_URL, mergeNotices, parseErpNotices } from "./lib/notices-build.mjs";
import { readData, writeData } from "./lib/store.mjs";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");

const generatedAt = new Date().toISOString();
const html = await fetchText(ERP_NOTICE_URL);
const parsed = parseErpNotices(html);

if (!parsed.length) {
  throw new Error("The GNDEC ERP notice board did not contain any dated notice entries.");
}

const existing = await readData("notices", { notices: [], holidays: [], exams: [] });
const { notices, added } = mergeNotices(existing.notices, parsed);

console.log(`ERP notices on the page: ${parsed.length}`);
console.log(`Latest published notice: ${parsed[0].date} · ${parsed[0].title}`);
console.log(`New notices: ${added}`);

if (checkOnly) {
  process.exitCode = added > 0 ? 2 : 0;
} else if (added > 0) {
  await writeData("notices", {
    ...existing,
    generatedAt,
    notices,
  });
  console.log(`Published ${notices.length} notices to public/data/notices.json.`);
} else {
  console.log("No new notices. public/data/notices.json is unchanged.");
}
