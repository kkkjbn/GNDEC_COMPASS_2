/**
 * The public first-year roster in the legacy Compass project carries a few
 * fields that the newer roster export does not: mentor phone, serial numbers
 * and the mentoring venue. They are public fields that the college roster
 * already published, so we merge them by CRN instead of dropping them.
 *
 * The merge is idempotent: running it again with the same legacy file keeps
 * the output byte-for-byte stable (apart from the generated timestamp).
 */
const LEGACY_FIELDS = [
  "serialNo",
  "currentSerialNo",
  "newSerialNo",
  "oldSerialNos",
  "mentorPhone",
  "venue",
  "rosterVersion",
  "rosterRevision",
  "rosterSchemaVersion",
];

const clean = (value) => (typeof value === "string" ? value.trim() : value);

const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim() !== "";
};

export function mergeLegacyRoster(current, legacy) {
  const legacyRecords = Array.isArray(legacy?.records) ? legacy.records : [];
  const legacyByCrn = new Map(
    legacyRecords
      .filter((record) => record?.crn)
      .map((record) => [String(record.crn).trim(), record]),
  );

  let matched = 0;
  let phones = 0;
  const records = (current?.records || []).map((student) => {
    const previous = legacyByCrn.get(String(student.crn || "").trim());
    if (!previous) return student;
    matched += 1;
    const merged = { ...student };
    for (const field of LEGACY_FIELDS) {
      const value = clean(previous[field]);
      if (hasValue(value)) merged[field] = value;
    }
    // The legacy roster called the mentoring room both `venue` and
    // `mentorVenue`; keep whichever value is present so the UI can use either.
    if (!hasValue(merged.mentorVenue) && hasValue(merged.venue)) {
      merged.mentorVenue = merged.venue;
    }
    if (hasValue(merged.mentorPhone)) phones += 1;
    return merged;
  });

  return {
    ...current,
    records,
    count: records.length,
    roster: {
      ...(current?.roster || {}),
      legacyMatched: matched,
      mentorPhones: phones,
      mergedFields: LEGACY_FIELDS,
    },
  };
}

export function countRosterFields(students) {
  const records = students?.records || [];
  return {
    records: records.length,
    mentorPhone: records.filter((student) => hasValue(student.mentorPhone)).length,
    serialNo: records.filter((student) => hasValue(student.serialNo)).length,
    academicGroup: records.filter((student) => hasValue(student.academicGroup)).length,
  };
}
