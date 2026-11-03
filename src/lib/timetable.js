import { DAYS, dayIndexFor, minToTime, norm, personKey, timeToMin, uniqueBy } from './utils.js';

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

export const MENTORING_SUBJECT_RE = /MENTORING\s+CLASS|PROFESSIONAL\s+DEVELOPMENT/i;

export const isMentoringLecture = (lecture) => MENTORING_SUBJECT_RE.test(String(lecture?.subject || ''));

/** The section a subgroup belongs to (ECB1 → ECB, ECBM1 → ECB). */
export const baseSectionFor = (timetable, entry) => {
  if (!entry) return null;
  if (entry.kind !== 'subgroup') return entry;
  if (entry.parentId) {
    const parent = findSection(timetable, entry.parentId);
    if (parent) return parent;
  }
  return (
    (timetable?.sections || []).find(
      (section) =>
        section.year === entry.year &&
        String(section.branch) === String(entry.branch) &&
        String(section.group || '') === String(entry.group || ''),
    ) || null
  );
};

export const cohortsForSection = (timetable, section) => {
  const base = baseSectionFor(timetable, section);
  if (!base) return [];
  return subgroupList(timetable)
    .filter(
      (group) =>
        !group.mentoringGroup &&
        group.id !== base.id &&
        baseSectionFor(timetable, group)?.id === base.id,
    )
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
};

export const mentoringGroupsForSection = (timetable, section) => {
  const base = baseSectionFor(timetable, section);
  if (!base) return [];
  return subgroupList(timetable)
    .filter((group) => group.mentoringGroup && (group.parentId === base.id || baseSectionFor(timetable, group)?.id === base.id))
    .sort((a, b) => String(a.mentoringGroup).localeCompare(String(b.mentoringGroup), undefined, { numeric: true }));
};

const subsectionTokens = (lecture) =>
  String(lecture?.subsection || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

/** Section lectures that apply to one lab/sub-section, or to everyone when no cohort is chosen. */
export const sectionLecturesForCohort = (section, cohortId = '') => {
  const lectures = section?.lectures || [];
  if (!cohortId) return lectures;
  const target = String(cohortId).toUpperCase();
  return lectures.filter((lecture) => {
    const tokens = subsectionTokens(lecture);
    return !tokens.length || tokens.includes(target);
  });
};

/**
 * Base section timetable + the selected lab/sub-section + the selected
 * mentoring group. Mentoring groups are overlays in the official FET export:
 * their tables repeat shared lectures and add the mentoring class. Only the
 * extra entries are merged, exactly like the legacy Compass overlay.
 */
export const combinedLectures = (timetable, sectionId, options = {}, profile = {}) => {
  const entry = findSection(timetable, sectionId);
  const base = baseSectionFor(timetable, entry) || entry;
  if (!base) return [];
  const requestedCohort =
    options.cohort || (entry?.kind === 'subgroup' && !entry.mentoringGroup ? entry.id : '');
  const cohortId = String(requestedCohort || '').toUpperCase();
  const mentoringId = options.mentoring === true
    ? entry?.mentoringGroup
      ? entry.id
      : ''
    : options.mentoring || '';
  const mentoringEntry = mentoringId ? findSection(timetable, mentoringId) : null;

  const decorated = (lecture, extra = {}) => ({
    ...lecture,
    sectionId: base.id,
    sectionLabel: base.label,
    branch: base.branch,
    year: base.year,
    ...extra,
  });

  const baseLectures = sectionLecturesForCohort(base, cohortId).map((lecture) => decorated(lecture));
  if (!mentoringEntry || baseSectionFor(timetable, mentoringEntry)?.id !== base.id) return baseLectures;

  const profileGroup = String(profile.academicGroup || '').toUpperCase();
  const appliesToProfile = profileGroup && profileGroup === mentoringEntry.id.toUpperCase();
  const seen = new Set(baseLectures.map((lecture) => `${lecture.day}|${lecture.start}|${lecture.end}|${lecture.subject}`));
  const overlay = [];
  for (const lecture of mentoringEntry.lectures || []) {
    const key = `${lecture.day}|${lecture.start}|${lecture.end}|${lecture.subject}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let item = decorated(lecture, { mentoringGroup: mentoringEntry.mentoringGroup, fromMentoringGroup: true });
    if (isMentoringLecture(item) && appliesToProfile) {
      const mentor = String(profile.mentor || '').trim();
      const venue = String(profile.mentorVenue || '').trim();
      if (!item.teacher && mentor) item = { ...item, teacher: mentor, teachers: [mentor] };
      if (!item.room && venue) item = { ...item, room: venue };
    }
    overlay.push(item);
  }
  return [...baseLectures, ...overlay].sort(
    (a, b) => a.day - b.day || a.period - b.period || timeToMin(a.start) - timeToMin(b.start),
  );
};

const groupTokens = (timetable) =>
  new Set(
    [
      ...(timetable?.sections || []).map((entry) => entry.id),
      ...subgroupList(timetable).map((entry) => entry.id),
    ]
      .filter(Boolean)
      .map((value) => String(value).toUpperCase()),
  );

/** FET puts a group code in the room column for some mentoring slots. */
const looksLikeGroupCode = (value, timetable, extra = []) => {
  const token = String(value || '').trim().toUpperCase();
  if (!token) return false;
  if (extra.some((item) => String(item || '').toUpperCase() === token)) return true;
  return groupTokens(timetable).has(token);
};

const lectureSlotKey = (lecture) => `${lecture.day}|${lecture.period}`;

/**
 * The section, lab sub-section and mentoring group that belong to a saved
 * profile. This mirrors the legacy Compass overlay: the section timetable is
 * the base, the student's lab batch filters practicals, and the academic
 * group (for example ECBM1) supplies the mentoring class.
 */
export const personalizationContext = (timetable, profile = {}) => {
  const entry =
    findSection(timetable, profile.sectionId) ||
    findSection(timetable, profile.subsection) ||
    findSection(timetable, profile.section);
  const base = baseSectionFor(timetable, entry) || entry || null;
  if (!base) return null;

  const subsection = String(profile.subsection || '').toUpperCase();
  const subsectionEntry = subsection ? findSection(timetable, subsection) : null;
  const cohortId =
    subsectionEntry && baseSectionFor(timetable, subsectionEntry)?.id === base.id
      ? subsectionEntry.id.toUpperCase()
      : entry?.kind === 'subgroup' && !entry.mentoringGroup && baseSectionFor(timetable, entry)?.id === base.id
        ? entry.id.toUpperCase()
        : '';

  const requestedGroup = String(profile.academicGroup || '').toUpperCase();
  const groupEntry = requestedGroup ? findSection(timetable, requestedGroup) : null;
  const mentoringEntry =
    groupEntry?.mentoringGroup && baseSectionFor(timetable, groupEntry)?.id === base.id ? groupEntry : null;
  const academicGroup = mentoringEntry?.id?.toUpperCase() || requestedGroup || '';

  return {
    base,
    cohortId,
    academicGroup,
    mentoringEntry,
    mentoringGroupLabel: mentoringEntry?.mentoringGroup || '',
  };
};

/**
 * A section object with the profile's lab batch and mentoring group applied.
 * Every mentoring lecture that belongs to the profile gets the mentor and
 * venue from the roster when the official export leaves them blank (the same
 * fill the legacy Compass overlay performed).
 */
export const personalizeSection = (timetable, profile = {}) => {
  const context = personalizationContext(timetable, profile);
  if (!context) return null;
  const { base, cohortId, academicGroup, mentoringEntry, mentoringGroupLabel } = context;
  const mentor = String(profile.mentor || '').trim();
  const mentorVenue = String(profile.mentorVenue || profile.venue || '').trim();

  const appliesToProfile = (lecture) => {
    const tokens = subsectionTokens(lecture);
    if (!tokens.length) return true;
    if (isMentoringLecture(lecture)) {
      if (academicGroup) {
        if (tokens.includes(academicGroup)) return true;
        // A mentoring slot tagged with a different mentoring group belongs
        // to someone else; leave it out so the student sees their own slot.
        return !tokens.some((token) => token.startsWith(`${base.id}M`));
      }
      if (cohortId) return tokens.includes(cohortId);
      return true;
    }
    if (!cohortId) return true;
    return tokens.includes(cohortId);
  };

  const decorate = (lecture, extra = {}) => {
    let item = {
      ...lecture,
      sectionId: base.id,
      sectionLabel: base.label,
      branch: base.branch,
      year: base.year,
      ...extra,
    };
    if (isMentoringLecture(item)) {
      const tokens = subsectionTokens(item);
      const belongsToProfile =
        !tokens.length ||
        (academicGroup && tokens.includes(academicGroup)) ||
        (cohortId && tokens.includes(cohortId));
      if (belongsToProfile) {
        item = { ...item, mentoring: true };
        if (academicGroup) item.mentoringGroup = academicGroup;
        if (mentoringGroupLabel) item.mentoringGroupLabel = mentoringGroupLabel;
        if (looksLikeGroupCode(item.room, timetable, [cohortId, academicGroup])) item.room = '';
        if (!item.teacher && mentor) item = { ...item, teacher: mentor, teachers: [mentor] };
        if (!item.room && mentorVenue) item = { ...item, room: mentorVenue };
      }
    }
    return item;
  };

  const lectures = (base.lectures || []).filter(appliesToProfile).map((lecture) => decorate(lecture));

  if (mentoringEntry) {
    const bySlot = new Map(lectures.map((lecture) => [lectureSlotKey(lecture), lecture]));
    for (const lecture of mentoringEntry.lectures || []) {
      const existing = bySlot.get(lectureSlotKey(lecture));
      if (existing) {
        // The mentoring subgroup repeats the shared section lectures. Keep
        // the section copy but enrich a matching mentoring slot.
        if (isMentoringLecture(existing) && isMentoringLecture(lecture)) {
          const enriched = decorate({ ...existing, ...lecture, id: existing.id }, {
            mentoringGroup: academicGroup,
            mentoringGroupLabel,
            fromMentoringGroup: true,
          });
          bySlot.set(lectureSlotKey(lecture), enriched);
        }
        continue;
      }
      const overlay = decorate(lecture, {
        mentoringGroup: academicGroup,
        mentoringGroupLabel,
        fromMentoringGroup: true,
      });
      if (isMentoringLecture(overlay) && looksLikeGroupCode(overlay.room, timetable, [cohortId, academicGroup])) {
        overlay.room = '';
        if (mentorVenue) overlay.room = mentorVenue;
      }
      bySlot.set(lectureSlotKey(lecture), overlay);
    }
    lectures.splice(0, lectures.length, ...bySlot.values());
  }

  lectures.sort((a, b) => a.day - b.day || a.period - b.period || timeToMin(a.start) - timeToMin(b.start));

  return {
    ...base,
    id: base.id,
    label: base.label,
    lectures,
    personalized: true,
    cohortId,
    academicGroup,
    mentoringGroup: mentoringGroupLabel,
    mentor,
    mentorVenue,
    mentoringEntryId: mentoringEntry?.id || '',
  };
};

/** All mentoring classes the official export publishes for a section, deduped. */
export const mentoringClassesForSection = (timetable, section) => {
  const base = baseSectionFor(timetable, section);
  if (!base) return [];
  const lectures = [...(base.lectures || [])];
  for (const group of mentoringGroupsForSection(timetable, base)) lectures.push(...(group.lectures || []));
  const seen = new Set();
  const result = [];
  for (const lecture of lectures) {
    if (!isMentoringLecture(lecture)) continue;
    const key = `${lecture.day}-${lecture.period}-${norm(lecture.subject)}-${lecture.room}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ ...lecture, sectionId: base.id, sectionLabel: base.label });
  }
  return result.sort((a, b) => a.day - b.day || a.period - b.period);
};

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

/** Legacy GNDEC goes home live at 5pm, and the day view looks ahead. */
export const COLLEGE_DAY_END_MINUTES = 17 * 60;

/**
 * First scheduled study day after `now` (tomorrow onward) that has at least
 * one class for this section. Sunday is skipped because dayIndexFor is -1.
 */
export const nextStudyDay = (section, now = new Date(), includeToday = false) => {
  for (let offset = includeToday ? 0 : 1; offset <= 14; offset += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    const day = dayIndexFor(date);
    if (day < 0) continue;
    if (lecturesOn(section, day).length) return { day, date, offset };
  }
  return null;
};

/**
 * The Now / Next / Then agenda used by Today.
 *
 * Matches the old Compass behaviour: during the college day it only looks
 * inside today; after 5pm (or on a weekend) it moves to the next study day
 * and shows that day's first two classes.
 */
export const nowNextThen = (section, now = new Date()) => {
  if (!section) return { mode: 'empty', current: null, next: null, then: null, day: -1, nextDay: null };
  const day = dayIndexFor(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const todayLectures = day >= 0 ? lecturesOn(section, day) : [];
  const current = todayLectures.find((lecture) => timeToMin(lecture.start) <= minutes && timeToMin(lecture.end) > minutes) || null;
  const upcoming = todayLectures.filter((lecture) => timeToMin(lecture.start) > minutes);
  const afterCollegeHours = minutes >= COLLEGE_DAY_END_MINUTES;

  if (current) {
    return { mode: 'now', current, next: upcoming[0] || null, then: upcoming[1] || null, day, nextDay: null };
  }

  if (day >= 0 && !afterCollegeHours && upcoming.length) {
    return { mode: 'today', current: null, next: upcoming[0], then: upcoming[1] || null, day, nextDay: null };
  }

  const upcomingDay = nextStudyDay(section, now);
  const nextDayLectures = upcomingDay ? lecturesOn(section, upcomingDay.day) : [];
  return {
    mode: day < 0 ? 'weekend' : afterCollegeHours ? 'after-hours' : 'finished',
    current: null,
    next: nextDayLectures[0] || null,
    then: nextDayLectures[1] || null,
    day,
    nextDay: upcomingDay,
  };
};

export const freePeriods = (section, day, timetable = null) => {
  const periods = timetable?.periods || [];
  const lectures = lecturesOn(section, day);
  if (!periods.length) {
    const occupied = new Set(lectures.map((lecture) => lecture.period));
    return [0, 1, 2, 3, 4, 5, 6, 7].filter((period) => !occupied.has(period));
  }
  return periods
    .map((start, index) => {
      const startMin = timeToMin(start);
      const endMin = index + 1 < periods.length ? timeToMin(periods[index + 1]) : startMin + 60;
      const busy = lectures.some((lecture) => timeToMin(lecture.start) < endMin && timeToMin(lecture.end) > startMin);
      return busy ? null : index;
    })
    .filter((period) => period !== null);
};

/**
 * Free slots between the published bells. A period counts as free only when
 * no official class overlaps it, so a double-period lab does not create a
 * false "free" slot halfway through.
 */
export const freeSlotsOn = (section, day, timetable) => {
  const periods = timetable?.periods || [];
  if (!periods.length) return [];
  const lectures = lecturesOn(section, day);
  return periods
    .map((start, index) => {
      const startMin = timeToMin(start);
      const endMin = index + 1 < periods.length ? timeToMin(periods[index + 1]) : startMin + 60;
      const busy = lectures.some((lecture) => timeToMin(lecture.start) < endMin && timeToMin(lecture.end) > startMin);
      if (busy) return null;
      return {
        id: `free-${day}-${index}`,
        day,
        period: index,
        start,
        end: minToTime(endMin),
        free: true,
      };
    })
    .filter(Boolean);
};

/** Classes and the free/breather slots between them, in clock order. */
export const dayPlanOn = (section, day, timetable) => {
  const lectures = lecturesOn(section, day).map((lecture) => ({ ...lecture, free: false }));
  return [...lectures, ...freeSlotsOn(section, day, timetable)].sort(
    (a, b) => timeToMin(a.start) - timeToMin(b.start) || Number(a.free) - Number(b.free),
  );
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
  for (const section of timetableEntries(timetable)) {
    for (const lecture of section.lectures || []) {
      if (norm(lecture.room).replace(/\s+/g, '') === target) {
        lectures.push({ ...lecture, sectionId: section.id, sectionLabel: section.label, branch: section.branch, year: section.year });
      }
    }
  }
  return dedupeLectures(lectures).sort((a, b) => a.day - b.day || a.period - b.period);
};

const normalizeRoom = (value) => norm(value).replace(/\s+/g, '').toUpperCase();

export const roomKindLabel = (room) => {
  if (!room) return 'Room';
  if (room.openStudySpace || room.kind === 'study-space') return 'Open study space';
  if (/COMP\s*LAB/i.test(room.code || '')) return 'Computational lab';
  return (
    room.kindLabel ||
    {
      classroom: 'Classroom',
      lab: 'Laboratory',
      workshop: 'Workshop',
      seminar: 'Seminar hall',
      facility: 'Room',
      office: 'Office',
    }[room.kind] ||
    'Room'
  );
};

/**
 * Occupancy for one day/period.
 *
 * The official room timetable is authoritative because it includes labs,
 * workshops, seminar halls and parallel sub-group practicals that a section
 * schedule alone can miss. If the room timetable is unavailable (for example
 * an old cached copy), fall back to the published section/sub-group lectures.
 */
export const occupiedRooms = (data, day, period) => {
  const occupied = new Map();
  const add = (roomCode, entry) => {
    const key = normalizeRoom(roomCode);
    if (!key) return;
    const current = occupied.get(key) || [];
    current.push(entry);
    occupied.set(key, current);
  };

  const roomTimetable = data?.roomTimetable || data;
  if (Array.isArray(roomTimetable?.rooms) && roomTimetable.rooms.some((room) => Array.isArray(room.occupancy))) {
    for (const room of roomTimetable.rooms) {
      for (const entry of room.occupancy || []) {
        if (entry.day !== day || entry.period !== period) continue;
        add(room.code, {
          ...entry,
          room: room.code,
          sectionId: (entry.groups || []).join(', '),
          sectionLabel: (entry.groups || []).join(', '),
        });
      }
    }
    return occupied;
  }

  const timetable = data?.timetable || data;
  for (const section of timetableEntries(timetable)) {
    for (const lecture of section.lectures || []) {
      if (lecture.day !== day || lecture.period !== period || !lecture.room) continue;
      add(lecture.room, { ...lecture, sectionId: section.id, sectionLabel: section.label });
    }
  }
  return occupied;
};

const ROOM_KINDS = new Set(['classroom', 'lab', 'workshop', 'seminar', 'facility', 'study-space']);

export const freeClassrooms = (data, day, period) => {
  const occupied = occupiedRooms(data, day, period);
  const rooms = data?.rooms?.rooms || [];
  return rooms
    .filter((room) => ROOM_KINDS.has(room.kind) || room.openStudySpace)
    .filter((room) => room.openStudySpace || !occupied.has(normalizeRoom(room.code)))
    .map((room) => {
      const busy = occupied.get(normalizeRoom(room.code)) || [];
      return {
        ...room,
        free: !busy.length || Boolean(room.openStudySpace),
        alwaysFree: Boolean(room.openStudySpace),
        occupiedBy: busy,
        roomKind: roomKindLabel(room),
      };
    })
    .sort((a, b) => {
      if (a.openStudySpace !== b.openStudySpace) return a.openStudySpace ? -1 : 1;
      return (
        String(a.block || '').localeCompare(String(b.block || '')) ||
        String(a.code).localeCompare(String(b.code), undefined, { numeric: true })
      );
    });
};

export const roomBlocks = (data) => {
  const counts = new Map();
  for (const room of data?.rooms?.rooms || []) {
    if (!ROOM_KINDS.has(room.kind) && !room.openStudySpace) continue;
    const key = room.block || 'Other rooms & labs';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => {
      if (a[0] === 'F-Block') return -1;
      if (b[0] === 'F-Block') return 1;
      if (a[0] === 'S-Block') return -1;
      if (b[0] === 'S-Block') return 1;
      if (a[0] === 'G-Block') return -1;
      if (b[0] === 'G-Block') return 1;
      return a[0].localeCompare(b[0]);
    })
    .map(([label, count]) => ({ value: label, label, count }));
};

/** Weekly room schedule from the official room timetable, with a section fallback. */
export const roomScheduleFromData = (data, roomCode) => {
  const target = normalizeRoom(roomCode);
  const room = (data?.roomTimetable?.rooms || []).find(
    (item) => normalizeRoom(item.code) === target || normalizeRoom(item.id) === target,
  );
  if (room?.occupancy?.length) {
    const seen = new Set();
    const lectures = [];
    for (const entry of room.occupancy) {
      const key = `${entry.day}-${entry.period}-${norm(entry.subject)}-${(entry.groups || []).join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lectures.push({
        id: `${room.code}-${entry.day}-${entry.period}-${lectures.length}`,
        day: entry.day,
        period: entry.period,
        start: entry.start,
        end: entry.end,
        subject: entry.subject,
        teacher: (entry.teachers || []).join(', '),
        teachers: entry.teachers || [],
        room: room.code,
        sectionId: (entry.groups || []).join(', '),
        sectionLabel: (entry.groups || []).join(', '),
        subsection: entry.subsection || '',
      });
    }
    return lectures.sort((a, b) => a.day - b.day || a.period - b.period);
  }
  return roomSchedule(data?.timetable, roomCode);
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
