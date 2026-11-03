import {
  cleanTeacherName,
  parseTimetableHtml,
  splitTeachers,
  titleCaseName,
} from "./fet.mjs";

const normalizeTeacher = (name) =>
  titleCaseName(cleanTeacherName(name))
    .replace(/\b(Dr|Er|Ms|Mrs|Mr|Prof|Sh|Smt)\.{2,}/gi, "$1.")
    .replace(/\(\s*ta\s*\)/gi, "(TA)")
    .replace(/\s+/g, " ")
    .trim();

function hydrate(group, kind) {
  return {
    id: group.id,
    year: group.year,
    semester: group.semester,
    branch: group.branch,
    branchName: group.branchName,
    program: group.program,
    group: group.group,
    ...(group.mentoringGroup ? { mentoringGroup: group.mentoringGroup, parentId: group.parentId } : {}),
    label: group.label,
    kind,
    lectures: group.entries.map((entry, index) => {
      const teachers = splitTeachers(entry.teacher).map(normalizeTeacher);
      return {
        id: `${group.id}-${entry.day}-${entry.period}-${index}`,
        day: entry.day,
        period: entry.period,
        start: entry.start,
        end: entry.end,
        subject: entry.subject.replace(/\s+/g, " ").trim(),
        teacher: teachers.join(", "),
        teachers,
        room: entry.room || "",
        ...(entry.subsection && kind === "section" ? { subsection: entry.subsection } : {}),
      };
    }),
  };
}

/**
 * Turn the official groups and subgroups FET HTML into the app's timetable
 * schema. This mirrors the schema already published in public/data.
 */
export function buildTimetableData({ sectionHtml, subgroupHtml, source, generatedAt }) {
  const sectionsParsed = parseTimetableHtml(sectionHtml, { kind: "section" });
  const subgroupsParsed = parseTimetableHtml(subgroupHtml, { kind: "subgroup" });

  return {
    schemaVersion: 2,
    generatedAt,
    source,
    days: {
      0: "Monday",
      1: "Tuesday",
      2: "Wednesday",
      3: "Thursday",
      4: "Friday",
      5: "Saturday",
    },
    periods: sectionsParsed.periods,
    sections: sectionsParsed.groups.map((group) => hydrate(group, "section")),
    subgroups: subgroupsParsed.groups.map((group) => hydrate(group, "subgroup")),
  };
}
