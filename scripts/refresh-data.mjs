/**
 * Refresh the published timetable and room data from the official APPSC
 * timetable index.
 *
 *   node scripts/refresh-data.mjs            # refresh when a newer release exists
 *   node scripts/refresh-data.mjs --force    # rebuild even if the version matches
 *   node scripts/refresh-data.mjs --check    # exit 2 when a newer release exists
 *
 * The old Compass project discovered new FET exports on a four-hour Worker
 * cron. This script is the static-site equivalent: a scheduled GitHub Action
 * runs it, and the normal build/deploy workflow publishes any changed JSON.
 */
import { fetchText, hashString, mergeSources } from "./lib/fet.mjs";
import { buildTimetableData } from "./lib/timetable-build.mjs";
import { readData, writeData, publishRoomTimetable } from "./lib/store.mjs";

const INDEX_URL = "https://appsc.gndec.ac.in/time_tables";
const KINDS = ["groups", "subgroups", "teachers", "rooms", "subjects", "years"];

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const force = args.includes("--force");

const MONTHS = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

function parseRelease(link) {
  const decoded = decodeURIComponent(link);
  const folder = decoded.match(/(\d{4})-(\d{2})\//);
  let year = folder?.[1];
  let month = folder?.[2];
  let day;

  const numeric = decoded.match(/(?:^|\/)(\d{1,2})[_\s-](\d{1,2})[_\s-](\d{4})(?:\D|$)/);
  if (numeric) {
    day = numeric[1];
    month = numeric[2];
    year = numeric[3];
  } else {
    const named = decoded.match(/(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+(\d{4})/i);
    if (named) {
      day = named[1];
      month = MONTHS[named[2].toUpperCase()];
      year = named[3];
    }
  }

  if (!year || !month) return null;
  const dd = String(Number(day || 1)).padStart(2, "0");
  const mm = String(Number(month)).padStart(2, "0");
  return {
    version: `${dd}-${mm}-${year}`,
    versionKey: `${year}-${mm}-${dd}`,
    url: new URL(link, INDEX_URL).href,
  };
}

function discoverReleases(indexHtml) {
  const releases = Object.fromEntries(KINDS.map((kind) => [kind, null]));
  const pattern = /href="([^"]+_(groups|subgroups|teachers|rooms|subjects|years)_days_horizontal(?:_0)?\.html)"/gi;
  let match;
  while ((match = pattern.exec(indexHtml))) {
    const kind = match[2].toLowerCase();
    const release = parseRelease(match[1]);
    if (!release) continue;
    const current = releases[kind];
    if (!current || release.versionKey > current.versionKey) releases[kind] = release;
  }
  return releases;
}

function currentVersionKey(source) {
  if (!source) return "";
  if (source.versionKey) return source.versionKey;
  const match = String(source.version || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : String(source.version || "");
}

function nextCheck(iso) {
  return new Date(new Date(iso).getTime() + 4 * 60 * 60 * 1000).toISOString();
}

const generatedAt = new Date().toISOString();
const indexHtml = await fetchText(INDEX_URL);
const releases = discoverReleases(indexHtml);
const latestTimetable = releases.groups;
const latestRooms = releases.rooms;

if (!latestTimetable || !latestRooms || !releases.subgroups) {
  throw new Error("The official timetable index did not contain a complete FET release.");
}

const currentTimetable = await readData("timetable", { source: {} });
const currentRooms = await readData("room-timetable", { source: {} });
const timetableIsNewer = latestTimetable.versionKey > currentVersionKey(currentTimetable.source);
const roomsIsNewer = latestRooms.versionKey > currentVersionKey(currentRooms.source);
const isNewer = timetableIsNewer || roomsIsNewer;

console.log(`Official index: ${latestTimetable.version}`);
console.log(`Published timetable: ${currentTimetable.source?.version || "none"}`);
console.log(`Published room data: ${currentRooms.source?.version || "none"}`);

if (checkOnly) {
  console.log(isNewer ? "A newer official release is available." : "Published data is current.");
  process.exitCode = isNewer ? 2 : 0;
} else if (!isNewer && !force) {
  const existingSources = await readData("sources", { sources: [] });
  const next = nextCheck(generatedAt);
  const sources = {
    ...existingSources,
    refresh: {
      ...(existingSources.refresh || {}),
      mode: "scheduled",
      intervalHours: 4,
      lastCheckedAt: generatedAt,
      nextCheckAt: next,
    },
  };
  const status = await readData("status", { schemaVersion: 1 });
  await writeData("sources", sources);
  await writeData("status", {
    ...status,
    lastCheckedAt: generatedAt,
    refresh: sources.refresh,
  });
  console.log("Published data is already current. Updated the last-checked timestamp.");
} else {
  const [sectionHtml, subgroupHtml, roomsHtml] = await Promise.all([
    fetchText(latestTimetable.url),
    fetchText(releases.subgroups.url),
    fetchText(latestRooms.url),
  ]);

  const timetableSource = {
    label: `Official FET timetable export — ${latestTimetable.version}`,
    url: latestTimetable.url,
    index: INDEX_URL,
    version: latestTimetable.version,
    versionKey: latestTimetable.versionKey,
    contentHash: hashString(sectionHtml),
  };

  const timetable = buildTimetableData({
    sectionHtml,
    subgroupHtml,
    source: timetableSource,
    generatedAt,
  });
  await writeData("timetable", timetable);

  const existingSources = await readData("sources", { sources: [] });
  const sourceUpdates = [
    {
      label: "Section-wise timetable (FET)",
      url: latestTimetable.url,
      kind: "timetable",
      fetchedAt: generatedAt,
      contentHash: hashString(sectionHtml),
    },
    {
      label: "Sub-section-wise timetable (FET)",
      url: releases.subgroups.url,
      kind: "timetable",
      fetchedAt: generatedAt,
      contentHash: hashString(subgroupHtml),
    },
  ];
  for (const kind of ["teachers", "subjects", "years"]) {
    if (!releases[kind]) continue;
    sourceUpdates.push({
      label: `${kind[0].toUpperCase()}${kind.slice(1)} timetable (FET)`,
      url: releases[kind].url,
      kind: "timetable",
      fetchedAt: generatedAt,
    });
  }
  const sourcesWithTimetable = mergeSources(existingSources, sourceUpdates, generatedAt);

  const result = await publishRoomTimetable({
    html: roomsHtml,
    url: latestRooms.url,
    indexUrl: INDEX_URL,
    version: latestRooms.version,
    generatedAt,
    timetable,
    existingRooms: await readData("rooms", { rooms: [] }),
    existingSources: sourcesWithTimetable,
  });

  console.log(`Built ${timetable.sections.length} sections and ${timetable.subgroups.length} sub-groups.`);
  console.log(`Parsed ${result.parsed.rooms.length} official rooms and ${result.status.counts.occupiedSlots} occupied slots.`);
  console.log(
    `Years published: ${result.coverage.yearsPublished.join(", ") || "none"}${
      result.coverage.yearsMissing.length ? `; missing: ${result.coverage.yearsMissing.join(", ")}` : ""
    }.`,
  );
  console.log("Published timetable.json, room-timetable.json, rooms.json, sources.json and status.json.");
}
