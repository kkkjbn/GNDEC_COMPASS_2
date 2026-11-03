/**
 * Shared publish helpers for the official data refresh.
 *
 * Keeping the merge rules here means the manual build script and the
 * scheduled refresh write exactly the same room, source and status records.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { hashString, mergeSources, parseRoomTimetableHtml } from "./fet.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA = join(ROOT, "public", "data");

export async function readData(name, fallback) {
  const file = join(DATA, `${name}.json`);
  if (!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file, "utf8"));
}

export async function writeData(name, value) {
  const file = join(DATA, `${name}.json`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const norm = (value = "") => String(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

function versionKey(version = "") {
  const match = String(version).match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return String(version);
}

function ordinalYear(year) {
  if (year === 1) return "1st-year";
  if (year === 2) return "2nd-year";
  if (year === 3) return "3rd-year";
  if (year === 4) return "4th-year";
  return `${year}-year`;
}

export function buildCoverage(timetable, parsedRoomCount) {
  const sections = Array.isArray(timetable?.sections) ? timetable.sections : [];
  const yearsPublished = [...new Set(sections.map((section) => section.year).filter((year) => Number.isInteger(year)))].sort();
  const yearsMissing = [1, 2, 3, 4].filter((year) => !yearsPublished.includes(year));
  return {
    yearsPublished,
    yearsMissing,
    groupsPublished: sections.filter((section) => section.kind !== "subgroup").length,
    roomsChecked: parsedRoomCount,
    note: yearsMissing.length
      ? `The official FET export covers ${yearsPublished.map(ordinalYear).join(", ")} groups. It does not publish ${yearsMissing
          .map(ordinalYear)
          .join(", ")} groups, so those rooms cannot be confirmed from this export.`
      : "The official FET export covers all four years.",
    checked: "Every published section, sub-section, lab, workshop and seminar hall in the room timetable.",
  };
}

export function publishRoomTimetableData({
  html,
  url,
  indexUrl,
  version,
  generatedAt,
  timetable,
  existingRooms,
  existingSources,
}) {
  const parsed = parseRoomTimetableHtml(html);
  const existingByCode = new Map((existingRooms.rooms || []).map((room) => [norm(room.code), room]));

  const officialRooms = parsed.rooms.map((room) => {
    const previous = existingByCode.get(norm(room.code)) || {};
    return {
      ...room,
      id: previous.id || room.id,
      image: previous.image || "",
      placeId: room.placeId || previous.placeId || "",
      block: room.block || previous.block || "",
      floor: room.floor || previous.floor || "",
      floorNo: room.floorNo ?? previous.floorNo ?? null,
      source: room.source,
      verifiedBy: "Official FET room timetable",
    };
  });

  const officialCodes = new Set(officialRooms.map((room) => norm(room.code)));
  const retainedRooms = (existingRooms.rooms || [])
    .filter((room) => !officialCodes.has(norm(room.code)))
    .filter((room) => !/CENTRAL\s*LIBRARY/i.test(room.code))
    .map((room) => ({ ...room, verifiedBy: room.verifiedBy || "Earlier published record" }));

  const libraryPrevious =
    (existingRooms.rooms || []).find((room) => /CENTRAL\s*LIBRARY|^LIBRARY$/i.test(room.code)) || {};
  const centralLibrary = {
    id: libraryPrevious.id || "centrallibrary",
    code: "CENTRAL LIBRARY",
    label: "Central Library",
    block: "Central Library",
    placeId: "library",
    floor: "Ground floor",
    floorNo: 0,
    image: libraryPrevious.image || "",
    kind: "study-space",
    kindLabel: "Open study space",
    openStudySpace: true,
    source: "Official GNDEC library page",
    verifiedBy: "Library hours from the official GNDEC library page",
    note: "Open study space. It is not a scheduled classroom, so it is always shown as available during library hours.",
  };

  const rooms = [...officialRooms, ...retainedRooms, centralLibrary].sort((a, b) =>
    String(a.code).localeCompare(String(b.code), undefined, { numeric: true }),
  );

  const coverage = buildCoverage(timetable, parsed.rooms.length);
  const occupiedSlots = parsed.rooms.reduce((sum, room) => sum + room.occupancy.length, 0);

  const roomTimetable = {
    schemaVersion: 1,
    generatedAt,
    source: {
      label: `Official FET room timetable — ${version}`,
      url,
      index: indexUrl,
      version,
      versionKey: versionKey(version),
      contentHash: hashString(html),
    },
    days: { 0: "Monday", 1: "Tuesday", 2: "Wednesday", 3: "Thursday", 4: "Friday" },
    periods: parsed.periods,
    coverage,
    count: parsed.rooms.length,
    rooms: parsed.rooms.map((room) => ({
      id: room.id,
      code: room.code,
      label: room.label,
      block: room.block,
      placeId: room.placeId,
      floor: room.floor,
      floorNo: room.floorNo,
      kind: room.kind,
      kindLabel: room.kindLabel,
      occupancy: room.occupancy,
    })),
  };

  const roomsFile = {
    ...existingRooms,
    generatedAt,
    count: rooms.length,
    note: "Room codes and occupancy come from the official FET room timetable. Block, floor and department labels are inferred from published code patterns; verify on site.",
    rooms,
  };

  const sources = mergeSources(
    existingSources,
    [
      {
        label: "Room timetable (FET)",
        url,
        kind: "timetable",
        fetchedAt: generatedAt,
        contentHash: roomTimetable.source.contentHash,
      },
      {
        label: "Timetable index (APPSC)",
        url: indexUrl,
        kind: "index",
        fetchedAt: generatedAt,
      },
      {
        label: "Central Library hours",
        url: "https://gndec.ac.in/library/",
        kind: "campus",
        fetchedAt: generatedAt,
      },
    ],
    generatedAt,
  );

  const sections = Array.isArray(timetable?.sections) ? timetable.sections : [];
  const status = {
    schemaVersion: 1,
    generatedAt,
    lastCheckedAt: generatedAt,
    sourceVersion: version,
    sourceVersionKey: versionKey(version),
    refresh: sources.refresh,
    counts: {
      rooms: parsed.rooms.length,
      roomsPublished: rooms.length,
      occupiedSlots,
      sections: sections.filter((section) => section.kind !== "subgroup").length,
      yearsPublished: coverage.yearsPublished,
      yearsMissing: coverage.yearsMissing,
    },
  };

  return { parsed, coverage, roomTimetable, roomsFile, sources, status };
}

export async function publishRoomTimetable(options) {
  const result = publishRoomTimetableData(options);
  await writeData("room-timetable", result.roomTimetable);
  await writeData("rooms", result.roomsFile);
  await writeData("sources", result.sources);
  await writeData("status", result.status);
  return result;
}
