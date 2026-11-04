/**
 * Parse the public GNDEC ERP notice board.
 *
 * The board is a plain server-rendered list. Each entry is:
 *
 *   <div>
 *     <p> author <!--email-->Month DD, YYYY </p>
 *     <p class="font-weight-bolder"><img …> <a href="noticeboard/slug">Title</a></p>
 *     <hr>
 *   </div>
 *
 * Only dated, linked entries are accepted. Commented-out sample markup and
 * author/profile fragments elsewhere on the page are ignored.
 */
import { decodeEntities, hashString, stripTags } from "./fet.mjs";

export const ERP_NOTICE_URL = "https://erp.gndec.ac.in/notice";
export const NOTICE_SOURCE = "GNDEC ERP Notice Board";

const MONTHS = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

const ENTRY_RE =
  /<p>\s*([^<>]{1,80}?)\s*(?:<!--[\s\S]*?-->)?\s*([A-Z][a-z]+ \d{1,2}, \d{4})\s*<\/p>\s*<p\b[^>]*>\s*<img\b[^>]*>\s*<a\b[^>]*href="(noticeboard\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

const EXAM_RE = /\b(exam(?:ination)?s?|date\s*sheet|datesheet|result|makeup|re-?appear|viva|evaluation)\b/i;
const EVENT_RE = /\b(workshop|conference|seminar|webinar|fest|sports|trial|hackathon|competition|lecture series|fdp|stc|orientation)\b/i;
const ADMIN_RE =
  /\b(notices?|reminders?|fees?|id\s*card|scholarship|readmission|admission|registration|documents?|detention|struck|pending|upload|verification|counsel|migration|bonafide|hostel|refund|withdrawal|seat)/i;

export function classifyNotice(title = "") {
  if (EXAM_RE.test(title)) return "exam";
  if (EVENT_RE.test(title)) return "event";
  if (ADMIN_RE.test(title)) return "admin";
  return "general";
}

export function noticeDateKey(raw = "") {
  const match = String(raw)
    .trim()
    .match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return null;
  const day = String(Number(match[2])).padStart(2, "0");
  const key = `${match[3]}-${month}-${day}`;
  const parsed = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return key;
}

export function displayDateFor(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function parseErpNotices(html = "") {
  const notices = [];
  const seen = new Set();
  let match;
  ENTRY_RE.lastIndex = 0;
  while ((match = ENTRY_RE.exec(String(html)))) {
    const [, author, rawDate, href, rawTitle] = match;
    const title = stripTags(rawTitle);
    const date = noticeDateKey(rawDate);
    if (!title || !date) continue;

    const url = new URL(href, ERP_NOTICE_URL).href;
    if (seen.has(url)) continue;
    seen.add(url);

    notices.push({
      id: `gndec-erp-notice-board-${hashString(url)}${hashString(`${date}|${title}`)}`,
      title,
      date,
      displayDate: displayDateFor(date),
      url,
      author: decodeEntities(author).trim(),
      source: NOTICE_SOURCE,
      kind: classifyNotice(title),
    });
  }
  return notices.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

/**
 * Keep every notice already published, add unseen ERP entries by URL, and
 * return the newest first. Existing records keep their original IDs.
 */
export function mergeNotices(existing = [], incoming = [], { limit = 100 } = {}) {
  const byUrl = new Map();
  for (const notice of existing) {
    if (notice?.url) byUrl.set(notice.url, notice);
  }
  let added = 0;
  for (const notice of incoming) {
    if (!notice?.url || byUrl.has(notice.url)) continue;
    byUrl.set(notice.url, notice);
    added += 1;
  }
  const notices = [...byUrl.values()]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(a.title || "").localeCompare(String(b.title || "")))
    .slice(0, limit);
  return { notices, added };
}
