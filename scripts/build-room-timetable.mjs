/**
 * Build public/data/room-timetable.json and refresh public/data/rooms.json
 * from the official FET room timetable.
 *
 *   node scripts/build-room-timetable.mjs
 *   node scripts/build-room-timetable.mjs --file path\to\rooms.html
 *
 * The room timetable is the authoritative source for "which room is busy at
 * this period". A section timetable alone misses labs, workshops, seminar
 * halls and parallel sub-group practicals.
 */
import { readFile } from "node:fs/promises";

import { fetchText } from "./lib/fet.mjs";
import { readData, publishRoomTimetable } from "./lib/store.mjs";

const DEFAULT_URL =
  "https://appsc.gndec.ac.in/sites/default/files/2026-09/17_09_2026_rooms_days_horizontal.html";
const INDEX_URL = "https://appsc.gndec.ac.in/time_tables";
const VERSION = "17-09-2026";

const args = process.argv.slice(2);
const fileArg = args.indexOf("--file");
const localFile = fileArg >= 0 ? args[fileArg + 1] : "";

const html = localFile ? await readFile(localFile, "utf8") : await fetchText(DEFAULT_URL);
const timetable = await readData("timetable", { sections: [] });
const existingRooms = await readData("rooms", { rooms: [] });
const existingSources = await readData("sources", { sources: [] });
const generatedAt = new Date().toISOString();

const result = await publishRoomTimetable({
  html,
  url: DEFAULT_URL,
  indexUrl: INDEX_URL,
  version: VERSION,
  generatedAt,
  timetable,
  existingRooms,
  existingSources,
});

console.log(`Parsed ${result.parsed.rooms.length} official rooms (${result.status.counts.occupiedSlots} occupied slots).`);
console.log(`Published ${result.roomsFile.count} rooms including Central Library.`);
console.log(
  `Years published: ${result.coverage.yearsPublished.join(", ") || "none"}${
    result.coverage.yearsMissing.length ? `; missing: ${result.coverage.yearsMissing.join(", ")}` : ""
  }.`,
);
console.log("Wrote room-timetable.json, rooms.json, sources.json and status.json.");
