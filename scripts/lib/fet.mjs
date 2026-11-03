/**
 * Small, dependency-light helpers for reading the official FET HTML exports.
 *
 * The college publishes six FET views (groups, subgroups, teachers, rooms,
 * subjects, years) as static HTML. This module keeps the parsing rules in one
 * place so the browser data and the scheduled refresh use the same logic.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 GNDEC-Compass/2.0";

export async function fetchText(url, { retries = 2, timeout = 45000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*" },
        signal: controller.signal,
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
  bull: "•",
  deg: "°",
  copy: "©",
};

export function decodeEntities(input = "") {
  return String(input)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

export function stripTags(input = "") {
  return decodeEntities(String(input).replace(/<[^>]*>/g, " "))
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
}

export function textLines(html = "") {
  return decodeEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function slugify(input = "") {
  return String(input)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function hashString(input = "") {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function titleCaseName(raw = "") {
  const particles = new Set(["of", "and", "da", "de", "ka", "ku"]);
  return String(raw)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      if (index > 0 && particles.has(word)) return word;
      if (/^[a-z]\.?$/.test(word)) return word.toUpperCase();
      if (/^[a-z](\.[a-z])+\.?$/.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ")
    .replace(/\bDr\b/g, "Dr.")
    .replace(/\bEr\b/g, "Er.")
    .replace(/\bMs\b/g, "Ms.")
    .replace(/\bMr\b/g, "Mr.")
    .replace(/\bMrs\b/g, "Mrs.")
    .replace(/\bProf\b/g, "Prof.");
}

/** Extract the outermost <table>…</table> blocks (cells may contain nested tables). */
export function outerTables(html) {
  const tables = [];
  const openRe = /<table\b[^>]*>/gi;
  let match;
  while ((match = openRe.exec(html))) {
    const start = match.index;
    const openTagEnd = openRe.lastIndex;
    let depth = 1;
    const tagRe = /<\/?table\b[^>]*>/gi;
    tagRe.lastIndex = openTagEnd;
    let tag;
    while ((tag = tagRe.exec(html))) {
      if (/^<table/i.test(tag[0])) depth += 1;
      else depth -= 1;
      if (depth === 0) {
        tables.push(html.slice(start, tagRe.lastIndex));
        break;
      }
    }
    if (depth !== 0) break;
    openRe.lastIndex = tagRe.lastIndex;
  }
  return tables;
}

/** Split a row's HTML into its top-level <td> cells, preserving rowspan/colspan. */
export function topLevelCells(rowHtml) {
  const cells = [];
  const tdRe = /<td\b([^>]*)>/gi;
  let match;
  while ((match = tdRe.exec(rowHtml))) {
    const attrs = match[1] || "";
    const contentStart = tdRe.lastIndex;
    let depth = 1;
    const tagRe = /<\/?td\b[^>]*>/gi;
    tagRe.lastIndex = contentStart;
    let tag;
    while ((tag = tagRe.exec(rowHtml))) {
      if (/^<td/i.test(tag[0])) depth += 1;
      else depth -= 1;
      if (depth === 0) {
        cells.push({
          attrs,
          html: rowHtml.slice(contentStart, tag.index),
          rowspan: Number((attrs.match(/rowspan="?(\d+)/i) || [])[1] || 1),
          colspan: Number((attrs.match(/colspan="?(\d+)/i) || [])[1] || 1),
        });
        break;
      }
    }
    if (depth !== 0) break;
    tdRe.lastIndex = tagRe.lastIndex;
  }
  return cells;
}

function addHour(time) {
  const match = String(time).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]) + 1;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

/**
 * Build the visual grid for one FET table, carrying rowspan cells forward so
 * weekday columns stay aligned. Returns headers, times and cells with metadata.
 */
function tableGrid(tableHtml) {
  const headMatch = tableHtml.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
  const days = headMatch
    ? [...headMatch[1].matchAll(/<th[^>]*xAxis[^>]*>([\s\S]*?)<\/th>/gi)].map((match) =>
        decodeEntities(match[1].replace(/<[^>]*>/g, "")).trim(),
      )
    : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  const bodyMatch = tableHtml.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  const body = (bodyMatch ? bodyMatch[1] : tableHtml).replace(
    /<tr\b[^>]*class="[^"]*foot[^"]*"[^>]*>[\s\S]*?<\/tr>/gi,
    "",
  );
  const timeChunks = body.split(/(?=<th[^>]*class="yAxis"[^>]*>)/i).slice(1);

  const grid = [];
  const times = [];
  const carry = new Map();

  for (const chunk of timeChunks) {
    const timeMatch = chunk.match(/<th[^>]*class="yAxis"[^>]*>([\s\S]*?)<\/th>/i);
    if (!timeMatch) continue;
    const time = decodeEntities(timeMatch[1].replace(/<[^>]*>/g, "")).trim();
    times.push(time);

    const rowHtml = chunk.slice(timeMatch.index + timeMatch[0].length);
    const cells = topLevelCells(rowHtml);
    const row = [];
    let column = 0;
    let cursor = 0;

    while (
      cursor < cells.length ||
      [...carry.entries()].some(([index, value]) => index >= column && value.remaining > 0)
    ) {
      const carried = carry.get(column);
      if (carried && carried.remaining > 0) {
        row[column] = { ...carried.cell, carried: true };
        carried.remaining -= 1;
        if (carried.remaining === 0) carry.delete(column);
        column += 1;
        continue;
      }
      if (cursor >= cells.length) break;
      const cell = cells[cursor];
      cursor += 1;
      row[column] = { html: cell.html, rowspan: cell.rowspan, colspan: cell.colspan };
      if (cell.rowspan > 1) carry.set(column, { cell: row[column], remaining: cell.rowspan - 1 });
      column += cell.colspan;
    }
    grid.push(row);
  }

  return { days, times, grid };
}

const GROUP_TOKEN =
  /^(?:[A-Z]{2,6}\d{0,2}[A-Z]?|[A-Z]\d[A-Z]{2,6})(\s*,\s*(?:[A-Z]{2,6}\d{0,2}[A-Z]?|[A-Z]\d[A-Z]{2,6}))*[.\-]*$/;

const VENUE_HINT =
  /\b(LAB|HALL|WORKSHOP|WORKSHOPS|SEMINAR|GROUND|BLOCK|STUDIO|LIBRARY|AUDITORIUM|CANTEEN|ROOM)\b|^[A-Z]-?\d{2,4}$|^[A-Z]\d{2,4}$/i;

function parseDetailed(html) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html))) {
    const cells = [];
    const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    let td;
    while ((td = tdRe.exec(tr[1]))) cells.push(textLines(td[1]).join(" "));
    if (cells.length) rows.push(cells);
  }
  if (!rows.length) return [];
  const columns = Math.max(...rows.map((row) => row.length));
  const out = [];
  for (let column = 0; column < columns; column += 1) {
    const get = (rowIndex) => (rows[rowIndex] && rows[rowIndex][column]) || "";
    const lecture = {
      subsection: get(0),
      subject: get(1),
      teacher: get(2),
      room: get(3),
    };
    if (lecture.subject && lecture.subject !== "---") out.push(lecture);
  }
  return out;
}

export function parseSlot(html) {
  if (/class="detailed"/i.test(html)) return parseDetailed(html);
  const lines = textLines(html).filter((line) => line !== "---" && line !== "-");
  if (!lines.length) return [];

  // FET puts the owning group(s) first in shared cells, for example
  // "ECBM1, ECBM2" followed by the subject. The old parser only dropped that
  // line when three lines were present, which turned a shared mentoring class
  // into a subject called "ECBM1, ECBM2". Always treat a leading group list as
  // metadata, not as the subject.
  let cohorts = [];
  if (GROUP_TOKEN.test(lines[0])) {
    cohorts = lines.shift().split(/\s*,\s*/).map((value) => value.trim()).filter(Boolean);
  }

  if (lines.length === 1) return [{ subject: lines[0], teacher: "", room: "", cohorts }];
  if (lines.length === 2) {
    if (VENUE_HINT.test(lines[1]) && !VENUE_HINT.test(lines[0])) {
      return [{ subject: lines[0], teacher: "", room: lines[1], cohorts }];
    }
    return [{ subject: lines[0], teacher: lines[1], room: "", cohorts }];
  }

  const subject = lines[0];
  let teacher = lines[1];
  let room = lines.slice(2).join(" ");

  if (!room && VENUE_HINT.test(teacher)) {
    room = teacher;
    teacher = "";
  }

  return [{ subject, teacher, room, cohorts }];
}

const PREFIXES = [
  ["PROF", "Prof."],
  ["DR", "Dr."],
  ["ER", "Er."],
  ["MS", "Ms."],
  ["MRS", "Mrs."],
  ["MR", "Mr."],
  ["SH", "Sh."],
  ["SMT", "Smt."],
];

export function cleanTeacherName(raw = "") {
  return String(raw)
    .replace(/\((?:CE|CS|CSE|EC|ECE|EE|IT|ME|RAI|MBA|MCA|AS|HUM|PHY|CHEM|MATH|CP|M&PE|ARCH|BBA|BCOM|BVOC)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitTeachers(raw = "") {
  return cleanTeacherName(raw)
    .split(/\s*,\s*|\s+and\s+/i)
    .map((name) => name.trim())
    .filter((name) => name.length > 2 && !/^-+$/.test(name));
}

export function parseGroupMeta(id = "") {
  const clean = id.replace(/\s*Automatic Subgroup\s*/i, "").trim();
  const upper = clean.toUpperCase();

  const meta = {
    id: clean,
    year: null,
    semester: null,
    branch: "Other",
    branchName: "Other",
    program: "B.Tech",
    group: "",
  };

  if (/^D([123])/.test(upper)) {
    meta.year = Number(upper[1]);
    const rest = upper.slice(2);
    const branchMap = [
      ["CE", "CE", "Civil Engineering"],
      ["CS", "CS", "Computer Science & Engineering"],
      ["IT", "IT", "Information Technology"],
      ["EE", "EE", "Electrical Engineering"],
      ["EC", "EC", "Electronics & Communication"],
      ["ME", "ME", "Mechanical Engineering"],
      ["RAI", "RAI", "Robotics & AI"],
      ["BCOM", "BCOM", "B.Com"],
    ];
    for (const [code, short, name] of branchMap) {
      if (rest.startsWith(code)) {
        meta.branch = short;
        meta.branchName = name;
        meta.group = rest.slice(code.length).replace(/[^A-Z]/g, "");
        break;
      }
    }
  } else if (/^BARCH/.test(upper)) {
    meta.year = 1;
    meta.branch = "ARCH";
    meta.branchName = "Architecture";
    meta.program = "B.Arch";
  } else if (/^BVOC/.test(upper)) {
    meta.year = 1;
    meta.branch = "BVOC";
    meta.branchName = "B.Voc";
    meta.program = "B.Voc";
  } else if (/^BCA/.test(upper)) {
    meta.year = 1;
    meta.branch = "BCA";
    meta.branchName = "Computer Applications";
    meta.program = "BCA";
    meta.group = upper.slice(3).replace(/[^A-Z]/g, "");
  } else if (/^MCA/.test(upper)) {
    meta.year = 1;
    meta.branch = "MCA";
    meta.branchName = "Computer Applications";
    meta.program = "MCA";
  } else if (/^BCOM/.test(upper)) {
    meta.branch = "BCOM";
    meta.branchName = "B.Com";
    meta.program = "B.Com";
    const n = Number((upper.match(/\d+/) || [])[0] || 1);
    meta.year = n === 1 ? 1 : Math.ceil(n / 2);
    meta.group = String(n);
  } else if (/^BBA/.test(upper)) {
    meta.year = 1;
    meta.branch = "BBA";
    meta.branchName = "Business Administration";
    meta.program = "BBA";
  } else {
    const map = [
      ["ME", "ME", "Mechanical Engineering"],
      ["CE", "CE", "Civil Engineering"],
      ["EE", "EE", "Electrical Engineering"],
      ["EC", "EC", "Electronics & Communication"],
      ["RAI", "RAI", "Robotics & AI"],
      ["CS", "CS", "Computer Science & Engineering"],
      ["IT", "IT", "Information Technology"],
    ];
    for (const [code, short, name] of map) {
      if (upper.startsWith(code)) {
        meta.branch = short;
        meta.branchName = name;
        meta.year = 1;
        meta.group = upper.slice(code.length).replace(/[^A-Z]/g, "");
        break;
      }
    }
  }

  if (meta.year && !meta.semester) meta.semester = meta.year * 2 - 1;
  if (meta.branch === "BCOM" && /^BCOM3/.test(upper)) meta.semester = 3;

  // FET sub-group files also carry mentoring groups such as ECBM1 (EC B,
  // mentoring group M1) and, when published, D2ECBM1. Keep the parent section
  // so the app can show them as an overlay on the section timetable.
  const mentoring = upper.match(/^(.+?)M(\d+)$/);
  if (mentoring && /^(?:D[123])?[A-Z]{2,4}[A-F]$/.test(mentoring[1])) {
    meta.mentoringGroup = `M${mentoring[2]}`;
    meta.parentId = mentoring[1];
    meta.group = meta.group.replace(/M$/, "");
  }

  meta.label = sectionLabel(meta);
  return meta;
}

const ORDINALS = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };

export function sectionLabel(meta) {
  if (meta.mentoringGroup) {
    if (meta.program === "B.Tech") {
      const group = meta.group ? ` · Group ${meta.group}` : "";
      return `${ORDINALS[meta.year] || ""} Year · ${meta.branch}${group} · Mentoring ${meta.mentoringGroup}`;
    }
    return `${meta.program} · Mentoring ${meta.mentoringGroup}`;
  }
  if (meta.program === "B.Tech") {
    const group = meta.group ? ` · Group ${meta.group}` : "";
    return `${ORDINALS[meta.year] || ""} Year · ${meta.branch}${group}`;
  }
  if (meta.branch === "BCOM") return `B.Com · Sem ${meta.semester}`;
  const group = meta.group ? ` · Section ${meta.group}` : "";
  return `${meta.program}${group}`;
}

export function parseTimetableHtml(html, { kind = "section" } = {}) {
  const tables = outerTables(html);
  const groups = [];
  let periods = [];

  for (const table of tables) {
    const nameMatch = table.match(/<span class="name">([\s\S]*?)<\/span>/i);
    if (!nameMatch) continue;
    const id = decodeEntities(nameMatch[1].replace(/<[^>]*>/g, "")).trim();
    if (!id) continue;

    const { days, times, grid } = tableGrid(table);

    if (!periods.length) periods = times;
    const entries = [];
    for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
      for (let column = 0; column < days.length; column += 1) {
        const cell = grid[rowIndex] && grid[rowIndex][column];
        if (!cell) continue;
        for (const slot of parseSlot(cell.html)) {
          entries.push({
            day: column,
            period: rowIndex,
            start: times[rowIndex] || "",
            end: times[rowIndex + 1] || addHour(times[rowIndex] || ""),
            subject: slot.subject.trim(),
            teacher: slot.teacher.trim(),
            room: slot.room.replace(/\s+/g, " ").trim(),
            ...(slot.subsection ? { subsection: slot.subsection.trim() } : {}),
            ...(slot.cohorts?.length ? { cohorts: slot.cohorts } : {}),
          });
        }
      }
    }

    groups.push({ id, ...parseGroupMeta(id), kind, days, entries });
  }

  return { periods, days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], groups };
}

/* ------------------------------------------------------------------ */
/* Room timetable                                                      */
/* ------------------------------------------------------------------ */

const ROOM_ORDINALS = { 0: "Ground floor", 1: "First floor", 2: "Second floor", 3: "Third floor", 4: "Fourth floor" };

function roomFloor(name) {
  const upper = name.toUpperCase().replace(/\s+/g, " ");
  const f = upper.match(/^F\s*-?\s*(\d)/);
  if (f) return Number(f[1]);
  const s = upper.match(/^S\s*-?\s*(\d)/);
  if (s) return Number(s[1]);
  if (/^G\s*-?\s*\d/.test(upper)) return 0;
  if (/^A\d/.test(upper)) return 0;
  return null;
}

function roomCategory(name) {
  const upper = name.toUpperCase().replace(/\s+/g, " ").trim();

  if (/^F\s*-?\s*\d/.test(upper)) {
    return { block: "F-Block", placeId: "f-block", kind: "classroom", kindLabel: "Classroom" };
  }
  if (/^S\s*-?\s*\d/.test(upper)) {
    return { block: "S-Block", placeId: "s-block", kind: "classroom", kindLabel: "Classroom" };
  }
  if (/^G\s*-?\s*\d/.test(upper)) {
    return { block: "G-Block", placeId: "g-block", kind: "classroom", kindLabel: "Classroom" };
  }
  if (/^A\d/.test(upper)) {
    return { block: "Automobile Block", placeId: "automobile-block", kind: "classroom", kindLabel: "Room" };
  }
  if (/SEMINAR|TNP/.test(upper)) {
    return {
      block: "Seminar Halls",
      placeId: /SEMINAR HALL BA/.test(upper) ? "business-admin" : "admin-block",
      kind: "seminar",
      kindLabel: "Seminar hall",
    };
  }
  if (/WORKSHOP|W\/S/.test(upper)) {
    return { block: "Workshops", placeId: "workshops", kind: "workshop", kindLabel: "Workshop" };
  }
  if (/LIBRARY/.test(upper)) {
    return { block: "Central Library", placeId: "library", kind: "study-space", kindLabel: "Open study space" };
  }

  if (/IT DEPT|OS1|PL1|WD LAB|HPC LAB|DBMS LAB IT/.test(upper)) {
    return { block: "IT Department Labs", placeId: "it-dept", kind: "lab", kindLabel: "Laboratory" };
  }
  if (/CSE DEPT|SL-|SL I|SL-II|SL-III|SL-IV|R LAB|OS LAB|PL LAB|DBMS LAB/.test(upper)) {
    return { block: "CSE Department Labs", placeId: "cse-dept", kind: "lab", kindLabel: "Laboratory" };
  }
  if (/MBA/.test(upper)) {
    return { block: "Business Administration Labs", placeId: "business-admin", kind: "lab", kindLabel: "Computational lab" };
  }
  if (/COMP LAB EC|S & R|PS LAB|ID LAB|TI\/L|COMM\/L|MWR\/L|HW LAB/.test(upper)) {
    return { block: "EC Department Labs", placeId: "ec-dept", kind: "lab", kindLabel: "Laboratory" };
  }
  if (/COMP LAB EE|BEE LAB|PE LAB/.test(upper)) {
    return { block: "EE Department Labs", placeId: "ee-dept", kind: "lab", kindLabel: "Laboratory" };
  }
  if (/COMP LAB CE|GEOTECH|SURVEY/.test(upper)) {
    return { block: "Civil Department Labs", placeId: "ce-dept", kind: "lab", kindLabel: "Laboratory" };
  }
  if (/HT LAB|HE LAB|DOMS|IAR|CGL|ME DEPT/.test(upper)) {
    return { block: "Mechanical Department Labs", placeId: "me-dept", kind: "lab", kindLabel: "Laboratory" };
  }
  if (/ENG LAB|PHY LAB|CHEM LAB|MEASUREMENT LAB|ADVANCE MEASUREMENT/.test(upper)) {
    return { block: "Applied Science Labs", placeId: "applied-science", kind: "lab", kindLabel: "Laboratory" };
  }

  return { block: "Other Labs & Rooms", placeId: "", kind: "lab", kindLabel: "Laboratory" };
}

export function roomMeta(name) {
  const code = String(name).replace(/\s+/g, " ").trim();
  const category = roomCategory(code);
  const floorNo = roomFloor(code);
  return {
    id: slugify(code) || code.toLowerCase(),
    code,
    label: code,
    block: category.block,
    placeId: category.placeId,
    floor: floorNo === null ? "" : ROOM_ORDINALS[floorNo] || `Floor ${floorNo}`,
    floorNo,
    kind: category.kind,
    kindLabel: /COMP LAB/i.test(code) ? "Computational lab" : category.kindLabel,
    source: "Official FET room timetable",
  };
}

function splitGroups(line = "") {
  return String(line)
    .split(/\s*,\s*/)
    .map((value) => value.replace(/[.\-]+$/, "").trim())
    .filter(Boolean);
}

/**
 * Parse the official room timetable. Unlike a section table, each cell lists
 * the section/sub-group first, then the teacher(s), then the subject.
 */
export function parseRoomTimetableHtml(html) {
  const tables = outerTables(html);
  const rooms = [];
  let periods = [];

  for (const table of tables) {
    const nameMatch = table.match(/<span class="name">([\s\S]*?)<\/span>/i);
    if (!nameMatch) continue;
    const code = decodeEntities(nameMatch[1].replace(/<[^>]*>/g, "")).trim();
    if (!code) continue;

    const { days, times, grid } = tableGrid(table);
    if (!periods.length) periods = times;

    const occupancy = [];
    for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
      for (let column = 0; column < days.length; column += 1) {
        const cell = grid[rowIndex] && grid[rowIndex][column];
        if (!cell || cell.carried) continue;
        const lines = textLines(cell.html).filter(
          (line) => line !== "---" && line !== "-" && !/Timetable generated/i.test(line),
        );
        if (!lines.length) continue;

        let groups = [];
        let teachers = [];
        let subject = "";
        let subsection = "";
        if (lines.length >= 3) {
          groups = splitGroups(lines[0]);
          teachers = splitTeachers(lines[1]);
          subject = lines.slice(2).join(" ");
        } else if (lines.length === 2) {
          if (GROUP_TOKEN.test(lines[0])) {
            groups = splitGroups(lines[0]);
            subject = lines[1];
          } else {
            teachers = splitTeachers(lines[0]);
            subject = lines[1];
          }
        } else {
          subject = lines[0];
        }

        const groupLine = lines[0] || "";
        const subsectionMatch = groupLine.match(/\b([A-Z]{2,6}\d{1,2})\b/);
        if (subsectionMatch && groups.length === 1 && groups[0] === subsectionMatch[1]) subsection = subsectionMatch[1];

        const span = Math.min(cell.rowspan || 1, grid.length - rowIndex);
        const colspan = Math.min(cell.colspan || 1, days.length - column);
        for (let dayOffset = 0; dayOffset < colspan; dayOffset += 1) {
          for (let step = 0; step < span; step += 1) {
            const period = rowIndex + step;
            occupancy.push({
              day: column + dayOffset,
              period,
              start: times[period] || "",
              end: times[period + 1] || addHour(times[period] || ""),
              span,
              groups,
              teachers,
              subject: subject.replace(/\s+/g, " ").trim(),
              ...(subsection ? { subsection } : {}),
            });
          }
        }
      }
    }

    rooms.push({ ...roomMeta(code), occupancy });
  }

  const unique = new Map();
  for (const room of rooms) {
    if (!unique.has(room.code)) unique.set(room.code, room);
  }

  return { periods, days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], rooms: [...unique.values()] };
}

export function mergeSources(existing, updates, generatedAt) {
  const sources = Array.isArray(existing?.sources) ? [...existing.sources] : [];
  for (const update of updates) {
    const index = sources.findIndex((source) => source.url === update.url || source.label === update.label);
    if (index >= 0) sources[index] = { ...sources[index], ...update };
    else sources.push(update);
  }
  const nextCheck = new Date(new Date(generatedAt).getTime() + 4 * 60 * 60 * 1000).toISOString();
  return {
    ...(existing || {}),
    generatedAt,
    refresh: {
      mode: "scheduled",
      intervalHours: 4,
      note: "A scheduled GitHub Action re-reads the official APPSC timetable index and rebuilds the published JSON. The browser does not poll the college site.",
      lastCheckedAt: generatedAt,
      nextCheckAt: nextCheck,
    },
    sources,
  };
}
