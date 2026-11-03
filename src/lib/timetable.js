import { DAYS, dayIndexFor, norm, personKey, timeToMin, uniqueBy } from './utils.js';

export const subgroupList = (timetable) =>
  Array.isArray(timetable?.subgroups) ? timetable.subgroups : Object.values(timetable?.subgroups || {});

export const timetableEntries = (timetable) => [
  ...(timetable?.sections || []),
  ...subgroupList(timetable),
];

export const findSection = (timetable, id) => {
  if (!timetable || !id) return null;
  const value = String(id).toUpperCase();
  return (
    (timetable.sections || []).find((section) => section.id.toUpperCase() === value) ||
    subgroupList(timetable).find((section) => section.id.toUpperCase() === value) ||
    null
  );
};

export const studentSectionCandidates = (student) => {
  if (!student) return [];
  const values = [student.subsection, student.section].filter(Boolean);
  for (const value of [student.section]) {
    if (value) values.push(`D2${value}`, `D3${value}`);
  }
  return [...new Set(values.map((value) => String(value).toUpperCase()))];
};

export const sectionForStudent = (timetable, student) => {
  for (const candidate of studentSectionCandidates(student)) {
    const section = findSection(timetable, candidate);
    if (section) return section;
  }
  return null;
};

export const isSubgroup = (section) => section?.kind === 'subgroup';

export const lecturesOn = (section, day) => {
  if (!section) return [];
  return (section.lectures || [])
    .filter((lecture) => lecture.day === day)
    .sort((a, b) => a.period - b.period || timeToMin(a.start) - timeToMin(b.start));
};

export const periodForMinutes = (timetable, minutes) => {
  const periods = timetable?.periods || [];
  for (let index = 0; index < periods.length; index += 1) {
    const start = timeToMin(periods[index]);
    const end = index + 1 < periods.length ? timeToMin(periods[index + 1]) : start + 60;
    if (minutes >= start && minutes < end) return index;
  }
  return -1;
};

export const findCurrentAndNext = (section, now = new Date(), timetable = null) => {
  if (!section) return { current: null, next: null, day: -1 };
  const day = dayIndexFor(now);
  if (day < 0) return { current: null, next: null, day };
  const minutes = now.getHours() * 60 + now.getMinutes();
  const lectures = lecturesOn(section, day);
  let current = null;
  let next = null;
  for (const lecture of lectures) {
    const start = timeToMin(lecture.start);
    const end = timeToMin(lecture.end);
    if (minutes >= start && minutes < end) current = lecture;
    if (start > minutes && !next) next = lecture;
  }
  return { current, next, day, lectures };
};

export const nextClassTodayOrLater = (section, now = new Date()) => {
  if (!section) return null;
  const today = dayIndexFor(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (today >= 0) {
    const todayNext = lecturesOn(section, today).find((lecture) => timeToMin(lecture.start) > minutes);
    if (todayNext) return { lecture: todayNext, day: today, date: now, isToday: true };
  }
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const day = dayIndexFor(date);
    if (day < 0) continue;
    const lecture = lecturesOn(section, day)[0];
    if (lecture) return { lecture, day, date, isToday: false };
  }
  return null;
};

export const freePeriods = (section, day) => {
  const occupied = new Set(lecturesOn(section, day).map((lecture) => lecture.period));
  return [0, 1, 2, 3, 4, 5, 6, 7].filter((period) => !occupied.has(period));
};

export const teacherKey = (name) => {
  const key = personKey(name);
  return key
    .replace(/\b(sir|madam|maam|mam)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

export const sameTeacher = (a, b) => {
  const keyA = teacherKey(a);
  const keyB = teacherKey(b);
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;
  const tokensA = keyA.split(' ');
  const tokensB = keyB.split(' ');
  const surnameA = tokensA[tokensA.length - 1];
  const surnameB = tokensB[tokensB.length - 1];
  if (surnameA !== surnameB) return false;
  return tokensA[0]?.[0] === tokensB[0]?.[0] || tokensA.some((token) => tokensB.includes(token));
};

const dedupeLectures = (entries) =>
  uniqueBy(
    entries,
    (lecture) => `${lecture.day}-${lecture.period}-${lecture.subject}-${lecture.room}-${lecture.sectionId}`,
  );

export const teacherSchedule = (timetable, teacherName) => {
  const target = teacherName;
  const lectures = [];
  for (const section of timetable?.sections || []) {
    for (const lecture of section.lectures || []) {
      const names = lecture.teachers?.length ? lecture.teachers : lecture.teacher ? [lecture.teacher] : [];
      if (names.some((name) => sameTeacher(name, target))) {
        lectures.push({ ...lecture, sectionId: section.id, sectionLabel: section.label, branch: section.branch, year: section.year });
      }
    }
  }
  return dedupeLectures(lectures).sort((a, b) => a.day - b.day || a.period - b.period);
};

export const roomSchedule = (timetable, roomCode) => {
  const target = norm(roomCode).replace(/\s+/g, '');
  const lectures = [];
  for (const section of timetable?.sections || []) {
    for (const lecture of section.lectures || []) {
      if (norm(lecture.room).replace(/\s+/g, '') === target) {
        lectures.push({ ...lecture, sectionId: section.id, sectionLabel: section.label, branch: section.branch, year: section.year });
      }
    }
  }
  return dedupeLectures(lectures).sort((a, b) => a.day - b.day || a.period - b.period);
};

export const occupiedRooms = (timetable, day, period) => {
  const occupied = new Map();
  for (const section of timetable?.sections || []) {
    for (const lecture of section.lectures || []) {
      if (lecture.day !== day || lecture.period !== period || !lecture.room) continue;
      const key = norm(lecture.room).replace(/\s+/g, '').toUpperCase();
      const current = occupied.get(key) || [];
      current.push({ ...lecture, sectionId: section.id, sectionLabel: section.label });
      occupied.set(key, current);
    }
  }
  return occupied;
};

export const freeClassrooms = (timetable, rooms, day, period) => {
  const occupied = occupiedRooms(timetable, day, period);
  return (rooms || [])
    .filter((room) => room.kind === 'classroom' || room.kind === 'lab')
    .filter((room) => {
      const key = norm(room.id).replace(/\s+/g, '').toUpperCase();
      return !occupied.has(key);
    })
    .map((room) => ({ ...room, free: true }));
};

export const compareSections = (timetable, firstId, secondId, day) => {
  const first = findSection(timetable, firstId);
  const second = findSection(timetable, secondId);
  const left = lecturesOn(first, day);
  const right = lecturesOn(second, day);
  const max = Math.max(left.length, right.length);
  const rows = Array.from({ length: max }, (_, index) => ({
    left: left[index] || null,
    right: right[index] || null,
    same: left[index] && right[index] && left[index].subject === right[index].subject,
  }));
  return { first, second, left, right, rows, leftFree: 8 - left.length, rightFree: 8 - right.length };
};

export const lectureSignature = (lecture) =>
  `${lecture.day}-${lecture.period}-${norm(lecture.subject)}-${norm(lecture.room)}`;

export const sectionGroups = (timetable) => {
  const groups = new Map();
  for (const section of timetable?.sections || []) {
    const key = `${section.program}|${section.year}|${section.semester}`;
    const entry = groups.get(key) || {
      key,
      program: section.program,
      year: section.year,
      semester: section.semester,
      sections: [],
    };
    entry.sections.push(section);
    groups.set(key, entry);
  }
  return [...groups.values()];
};

export const sectionCoverage = (section) => {
  const totalSlots = 6 * 8;
  const filled = (section?.lectures || []).length;
  return { filled, totalSlots, percent: Math.round((filled / totalSlots) * 100) };
};

export const dayLabel = (day) => DAYS[day] || 'Sunday';

export const todayOrNextWorkingDay = (now = new Date()) => {
  const today = dayIndexFor(now);
  if (today >= 0) return { day: today, offset: 0, label: DAYS[today] };
  return { day: 0, offset: 1, label: DAYS[0] };
};

export const subjectsFromLectures = (lectures) =>
  [...new Set((lectures || []).map((lecture) => lecture.subject).filter(Boolean))].sort();
