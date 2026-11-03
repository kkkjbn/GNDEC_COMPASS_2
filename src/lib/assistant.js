import {
  DAYS,
  branchShort,
  dateKey,
  dayIndexFor,
  formatClock,
  norm,
  personKey,
  personTokens,
  photoPath,
  searchScore,
  timeToMin,
  yearLabel,
} from './utils.js';
import { findRoute, placePhoto, walkMinutes } from './campus.js';
import {
  baseSectionFor,
  findSection,
  findCurrentAndNext,
  freeClassrooms,
  freeSlotsOn,
  lecturesOn,
  nextClassTodayOrLater,
  personalizeSection,
  roomSchedule,
  sectionForStudent,
  teacherSchedule,
  timetableEntries,
  todayOrNextWorkingDay,
} from './timetable.js';

const HINGLISH = {
  kahan: 'where',
  kaha: 'where',
  kidhar: 'where',
  kithe: 'where',
  kithay: 'where',
  kya: 'what',
  kaun: 'who',
  kon: 'who',
  kisne: 'who',
  kab: 'when',
  kad: 'when',
  kado: 'when',
  kitne: 'how many',
  kitni: 'how many',
  kinne: 'how many',
  mujhe: 'me',
  mera: 'my',
  meri: 'my',
  main: 'my',
  mai: 'my',
  batao: 'tell',
  bta: 'tell',
  bolo: 'tell',
  daso: 'tell',
  chutti: 'holiday',
  chhutti: 'holiday',
  chhutiyan: 'holidays',
  kamra: 'room',
  kaksha: 'class',
  adhyapak: 'teacher',
  samay: 'time',
  waqt: 'time',
  aaj: 'today',
  ajj: 'today',
  kal: 'tomorrow',
  kl: 'tomorrow',
  parso: 'day after tomorrow',
  abhi: 'now',
  khali: 'free',
  raasta: 'route',
  rasta: 'route',
  raste: 'route',
  disha: 'direction',
  kitna: 'how much',
  padhai: 'study',
  namaste: 'hello',
  sat: 'sat',
  shri: 'sri',
  akal: 'akal',
  granthalaya: 'library',
  dakhila: 'admission',
  fees: 'fees',
  fis: 'fees',
  wazifa: 'scholarship',
  imtihan: 'exam',
  pariksha: 'exam',
  result: 'result',
  attendance: 'attendance',
  canteen: 'canteen',
  khana: 'food',
  bus: 'bus',
  chuttiya: 'holidays',
  holidays: 'holidays',
  'kis branch': 'which branch',
  'kaunsa': 'which',
  'kaunsi': 'which',
  'kaise': 'how',
  'kese': 'how',
  'kaise pahunchu': 'how to reach',
  'pahunchu': 'reach',
  'pahunchne': 'reach',
  'jana': 'go',
  'jaana': 'go',
  'hai': 'is',
  'hain': 'are',
  'ka': 'of',
  'ki': 'of',
  'ke': 'of',
  'me': 'in',
  'mein': 'in',
  'par': 'on',
  'se': 'from',
  'tak': 'to',
  'aur': 'and',
  'ya': 'or',
};

const ORDINAL_WORDS = {
  first: 1,
  '1st': 1,
  second: 2,
  '2nd': 2,
  third: 3,
  '3rd': 3,
  fourth: 4,
  '4th': 4,
};

/**
 * Common first-year course abbreviations used by students and by the legacy
 * Compass project. The timetable spells these subjects out, so the assistant
 * expands the short form instead of failing to match.
 */
const COURSE_GLOSSARY = [
  {
    short: 'EDG',
    title: 'Engineering Drawing and Graphics',
    aliases: ['edg', 'engineering drawing', 'engineering graphics', 'engg drawing', 'eng drawing', 'drawing and graphics'],
    subjectWords: ['engg drawing and graphics', 'engineering drawing', 'engineering graphics'],
  },
  {
    short: 'PPS',
    title: 'Programming for Problem Solving',
    aliases: ['pps', 'programming for problem solving', 'problem solving'],
    subjectWords: ['programming for problem solving'],
  },
];

const BRANCH_WORDS = {
  ece: 'EC',
  ec: 'EC',
  electronics: 'EC',
  'electronics and communication': 'EC',
  cse: 'CS',
  cs: 'CS',
  'computer science': 'CS',
  computer: 'CS',
  computers: 'CS',
  software: 'CS',
  it: 'IT',
  'information technology': 'IT',
  me: 'ME',
  mechanical: 'ME',
  ce: 'CE',
  civil: 'CE',
  ee: 'EE',
  electrical: 'EE',
  rai: 'RAI',
  robotics: 'RAI',
  ai: 'RAI',
  'artificial intelligence': 'RAI',
  bca: 'BCA',
  mca: 'MCA',
  bcom: 'BCOM',
  'b com': 'BCOM',
  commerce: 'BCOM',
  bba: 'BBA',
  arch: 'ARCH',
  architecture: 'ARCH',
  barch: 'ARCH',
  bvoc: 'BVOC',
};

const CREATOR_PATTERNS = [
  'who made',
  'who created',
  'who built',
  'creator',
  'developer',
  'made this',
  'made compass',
  'team codestorm',
  'your team',
];

const STOP_WORDS = new Set(
  `a an the is are was were be been being do does did doing have has had having i me my we our you your he she it they them this that these those what which who whom whose when where why how of in on at to from for with without about into over under again further then once here there all any both each few more most other some such no nor not only own same so than too very can will just should now please tell show give find get open see want need know ask about near latest current today tomorrow week timetable class classes schedule period period room rooms teacher teachers faculty student students subject subjects exam exams paper papers question questions previous year years notes syllabus notice notices holiday holidays college campus map route reach distance free which branch section mentor count how many much number total list all full details detail info information study library canteen hostel bus fee fees result attendance admission contact phone email address where is the of and or in at on for to from with by me my our your his her their its`.split(
    /\s+/,
  ),
);

const cache = new WeakMap();

function getIndexes(data) {
  if (!data) return null;
  if (cache.has(data)) return cache.get(data);
  const students = data.students?.records || [];
  const faculty = data.faculty?.records || [];
  const sections = timetableEntries(data.timetable);
  const places = data.campus?.places || [];
  const rooms = data.rooms?.rooms || [];
  const papers = data.papers?.papers || [];
  const syllabus = data.syllabus?.documents || [];
  const notices = data.notices?.notices || [];
  const holidays = data.notices?.holidays || [];
  const allTeachers = new Map();
  for (const section of data.timetable?.sections || []) {
    for (const lecture of section.lectures || []) {
      for (const name of lecture.teachers?.length ? lecture.teachers : lecture.teacher ? [lecture.teacher] : []) {
        const key = personKey(name);
        if (!allTeachers.has(key)) allTeachers.set(key, name);
      }
    }
  }
  const index = { students, faculty, sections, places, rooms, papers, syllabus, notices, holidays, allTeachers };
  cache.set(data, index);
  return index;
}

export function normalizeQuestion(raw = '') {
  let value = norm(raw);
  if (!value) return '';
  value = value
    .split(' ')
    .map((word) => HINGLISH[word] || word)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Keep arithmetic readable while translating common spoken forms.
  value = value
    .replace(/\bplus\b/g, '+')
    .replace(/\bminus\b/g, '-')
    .replace(/\bmultiplied by\b/g, '*')
    .replace(/\btimes\b/g, '*')
    .replace(/\bdivided by\b/g, '/')
    .replace(/\binto\b/g, '*');
  return value;
}

const hasAny = (text, phrases) => phrases.some((phrase) => text.includes(phrase));
const wordSet = (text) => new Set(text.split(' ').filter(Boolean));

function extractYear(nq) {
  for (const [word, year] of Object.entries(ORDINAL_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(nq)) return year;
  }
  const match = nq.match(/\b(?:year|yr|semester|sem)\s*([1-8])\b/);
  return match ? Number(match[1]) : null;
}

function extractSemester(nq) {
  const match = nq.match(/\b(?:semester|sem)\s*([1-8])\b/);
  return match ? Number(match[1]) : null;
}

function extractBranch(nq) {
  const ordered = Object.keys(BRANCH_WORDS).sort((a, b) => b.length - a.length);
  for (const word of ordered) {
    if (new RegExp(`(?:^|\\s)${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(nq)) {
      return BRANCH_WORDS[word];
    }
  }
  return null;
}

function extractGroupToken(nq) {
  const tokens = nq.split(/\s+/).filter(Boolean);
  for (let index = 0; index < tokens.length; index += 1) {
    const direct = tokens[index].match(/^([a-f])([1-3])?$/);
    if (direct) return { group: direct[1].toUpperCase(), subsection: direct[2] || null };
    if (/^(?:section|sec|group|grp)$/.test(tokens[index]) && tokens[index + 1]) {
      const next = tokens[index + 1].match(/^([a-f])([1-3])?$/);
      if (next) return { group: next[1].toUpperCase(), subsection: next[2] || null };
    }
  }
  return null;
}

function directSection(nq, sections) {
  const tokens = nq.split(/\s+/).filter(Boolean).map((token) => token.replace(/[^a-z0-9]/g, '')).filter(Boolean);
  const groupInfo = extractGroupToken(nq);
  const sectionsOnly = sections.filter((entry) => entry.kind === 'section');
  const exactMatches = sections.filter((entry) => tokens.includes(entry.id.toLowerCase()));
  const exact = exactMatches.find((entry) => entry.kind === 'section') || exactMatches[0] || null;

  // A section code followed by its own group/subsection token: ECB B1 → ECB1.
  if (exact && groupInfo && exact.group && exact.group === groupInfo.group) {
    if (groupInfo.subsection) {
      const subgroup = sections.find(
        (entry) => entry.kind === 'subgroup' && entry.id.toLowerCase() === `${exact.id}${groupInfo.subsection}`.toLowerCase(),
      );
      if (subgroup) return subgroup;
    }
    return exact;
  }

  const branch = extractBranch(nq);
  const year = extractYear(nq);

  // Branch + group is stronger than a bare section code: CSE D → CSD, not CSE.
  if (branch && groupInfo) {
    const candidates = sectionsOnly.filter(
      (entry) => entry.branch === branch && entry.group === groupInfo.group && (!year || entry.year === year),
    );
    if (candidates.length) {
      const base = candidates.find((entry) => entry.year === 1) || candidates[0];
      if (groupInfo.subsection) {
        const subgroup = sections.find(
          (entry) =>
            entry.kind === 'subgroup' &&
            entry.branch === branch &&
            entry.group === groupInfo.group &&
            (!year || entry.year === year) &&
            entry.id.toLowerCase() === `${base.id}${groupInfo.subsection}`.toLowerCase(),
        );
        if (subgroup) return subgroup;
      }
      return base;
    }
  }

  if (exact) return exact;

  // Year + branch without a group: "2nd year CS timetable" → first matching group.
  if (branch && year) {
    const candidates = sectionsOnly.filter((entry) => entry.branch === branch && entry.year === year);
    if (candidates.length) return candidates[0];
  }
  return null;
}

function resolveSection(nq, data, profile, memory, student) {
  const indexes = getIndexes(data);
  if (student) {
    const section = sectionForStudent(data.timetable, student);
    if (section) return section;
  }
  const direct = directSection(nq, indexes.sections) || (nq.match(/\b(d[23][a-z]{2}[a-f]?)\b/) ? findSection(data.timetable, nq.match(/\b(d[23][a-z]{2}[a-f]?)\b/)[1]) : null);
  if (direct) return direct;
  if (memory?.lastSectionId && /\b(there|that|same|it|uska|uski|wo)\b/.test(nq)) {
    const found = findSection(data.timetable, memory.lastSectionId);
    if (found) return found;
  }
  if (profile?.sectionId) {
    return findSection(data.timetable, profile.sectionId);
  }
  return null;
}

function findStudents(nq, data) {
  const { students } = getIndexes(data);
  const crnMatch = nq.match(/\b\d{7}\b/);
  if (crnMatch) {
    const found = students.find((student) => student.crn === crnMatch[0]);
    if (found) return { matches: [found], exact: true, mode: 'crn' };
  }
  const fullMatches = students.filter((student) => nq.includes(personKey(student.name)));
  if (fullMatches.length) return { matches: fullMatches, exact: true, mode: 'name' };
  const tokens = nq.split(' ').filter((token) => token.length > 2 && !STOP_WORDS.has(token) && !BRANCH_WORDS[token]);
  if (!tokens.length) return { matches: [], exact: false, mode: 'none' };
  const tokenMatches = students.filter((student) => {
    const keys = personTokens(student.name);
    if (!keys.length) return false;
    return tokens.every((token) => keys.some((key) => key === token || key.startsWith(token) || (token.length > 4 && key.includes(token))));
  });
  if (tokenMatches.length) return { matches: tokenMatches, exact: tokenMatches.length === 1, mode: 'token' };
  return { matches: [], exact: false, mode: 'none' };
}

function findFaculty(nq, data) {
  const { faculty, allTeachers } = getIndexes(data);
  const fullMatches = faculty.filter((person) => nq.includes(personKey(person.name)));
  if (fullMatches.length) return { matches: fullMatches, exact: true, mode: 'faculty' };
  const tokens = nq.split(' ').filter((token) => token.length > 2 && !STOP_WORDS.has(token) && !BRANCH_WORDS[token]);
  if (!tokens.length) return { matches: [], exact: false };
  const tokenMatches = faculty.filter((person) => {
    const keys = personTokens(person.name);
    return tokens.every((token) => keys.some((key) => key === token || key.startsWith(token) || (token.length > 4 && key.includes(token))));
  });
  if (tokenMatches.length) return { matches: tokenMatches, exact: tokenMatches.length === 1, mode: 'faculty' };
  const teacherMatches = [...allTeachers.entries()]
    .filter(([key, name]) => tokens.every((token) => key.split(' ').some((part) => part === token || part.startsWith(token))) || nq.includes(key))
    .map(([key, name]) => ({ name, timetableOnly: true, key }));
  if (teacherMatches.length) return { matches: teacherMatches, exact: teacherMatches.length === 1, mode: 'timetable-teacher' };
  return { matches: [], exact: false };
}

function findPlace(nq, data, options = {}) {
  const { places } = getIndexes(data);
  let best = null;
  for (const place of places) {
    const aliases = [place.name, ...(place.aliases || [])].map((alias) => norm(alias)).filter(Boolean);
    for (const alias of aliases) {
      if (!alias || alias.length < 3) continue;
      if (nq === alias || nq.includes(alias)) {
        const score = alias.length + (nq === alias ? 20 : 0);
        if (!best || score > best.score) best = { place, score, alias };
      }
    }
  }
  if (best) return best.place;
  const tokens = nq.split(' ').filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  if (!tokens.length) return null;
  const ranked = places
    .map((place) => ({
      place,
      score: searchScore(`${place.name} ${(place.aliases || []).join(' ')} ${place.description || ''}`, tokens.join(' ')),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked[0]) return ranked[0].place;
  if (!options.allowLoose) return null;
  return ranked[0]?.place || null;
}

function findRoom(nq, data) {
  const { rooms } = getIndexes(data);
  const normalized = nq.replace(/\s+/g, '');
  const codeMatch = nq.match(/\b([fsg])\s*-?\s*(\d{2,3})\s*([a-c])?\b/i);
  if (codeMatch) {
    const code = `${codeMatch[1]}${codeMatch[2]}${codeMatch[3] || ''}`.toUpperCase();
    const found = rooms.find((room) => room.id === code || room.id === code.replace(/-/g, ''));
    if (found) return found;
  }
  const byCode = rooms.find((room) => normalized.includes(room.id.toLowerCase()) || nq.includes(room.code.toLowerCase()));
  if (byCode) return byCode;
  const tokenMatch = nq.match(/\b([a-z]{1,2}\s*-?\s*\d{1,3}[a-z]?)\b/i);
  if (tokenMatch) {
    const code = tokenMatch[1].replace(/[\s-]+/g, '').toUpperCase();
    const prefixMatches = rooms.filter((room) => {
      const roomCode = room.code.toUpperCase();
      const roomId = room.id.toUpperCase();
      return roomId.startsWith(code) || roomCode.startsWith(code) || roomCode.startsWith(`${code} (`);
    });
    if (prefixMatches.length === 1) return prefixMatches[0];
    if (prefixMatches.length > 1) {
      const exact = prefixMatches.find(
        (room) => room.id.toUpperCase() === code || room.code.toUpperCase() === code || room.code.toUpperCase().startsWith(`${code} (`),
      );
      if (exact) return exact;
      return [...prefixMatches].sort((a, b) => a.code.length - b.code.length)[0];
    }
  }
  const byLabel = rooms.find((room) => {
    const label = norm(room.label);
    return label.length > 4 && nq.includes(label);
  });
  return byLabel || null;
}

function roomPlace(room, data) {
  const places = data.campus?.places || [];
  if (!room) return null;
  if (room.placeId) return places.find((place) => place.id === room.placeId) || null;
  const label = norm(`${room.label || ''} ${room.code || ''}`);
  if (!label) return null;
  const ranked = places
    .map((place) => {
      const aliases = [place.name, ...(place.aliases || [])].map((alias) => norm(alias)).filter((alias) => alias.length > 3);
      const score = aliases.reduce((best, alias) => (label.includes(alias) && alias.length > best ? alias.length : best), 0);
      return { place, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.place || null;
}

function findPaperSubject(nq, data) {
  const { papers } = getIndexes(data);
  const codeMatch = nq.match(/\b([a-z]{2,5})\s*-?\s*(\d{3,4})\b/i);
  if (codeMatch) {
    const code = `${codeMatch[1].toUpperCase()}-${codeMatch[2]}`;
    const matches = papers.filter((paper) => paper.code?.toUpperCase() === code);
    if (matches.length) return { code, papers: matches };
  }
  const tokens = nq
    .split(' ')
    .filter((token) => token.length > 3 && !STOP_WORDS.has(token) && !['paper', 'papers', 'question', 'previous', 'year', 'find', 'show', 'notes', 'syllabus'].includes(token));
  if (!tokens.length) return null;
  const scored = papers
    .map((paper) => ({
      paper,
      score: searchScore(`${paper.code} ${paper.title} ${paper.name} ${paper.department}`, tokens.join(' ')),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  return { code: scored[0].paper.code, papers: scored.map((entry) => entry.paper) };
}

function detectDay(nq, now) {
  const date = new Date(now);
  if (nq.includes('day after tomorrow') || nq.includes('parso')) {
    date.setDate(date.getDate() + 2);
    return { date, day: dayIndexFor(date), label: 'day after tomorrow', explicit: true };
  }
  if (nq.includes('tomorrow') || nq.includes('kal')) {
    date.setDate(date.getDate() + 1);
    return { date, day: dayIndexFor(date), label: 'tomorrow', explicit: true };
  }
  if (nq.includes('yesterday')) {
    date.setDate(date.getDate() - 1);
    return { date, day: dayIndexFor(date), label: 'yesterday', explicit: true };
  }
  const dayMatch = DAYS.map((day) => day.toLowerCase()).find((day) => nq.includes(day));
  if (dayMatch) {
    const target = DAYS.findIndex((day) => day.toLowerCase() === dayMatch);
    let diff = (target - dayIndexFor(now) + 7) % 7;
    if (diff === 0 && nq.includes('next')) diff = 7;
    date.setDate(date.getDate() + diff);
    return { date, day: target, label: DAYS[target], explicit: true };
  }
  const shortMatch = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].find((day) => new RegExp(`\\b${day}`).test(nq));
  if (shortMatch) {
    const target = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(shortMatch);
    let diff = (target - dayIndexFor(now) + 7) % 7;
    date.setDate(date.getDate() + diff);
    return { date, day: target, label: DAYS[target], explicit: true };
  }
  if (nq.includes('today') || nq.includes('aaj')) {
    return { date, day: dayIndexFor(now), label: 'today', explicit: true };
  }
  return { date, day: dayIndexFor(now), label: 'today', explicit: false };
}

function extractPeriod(nq) {
  const match = nq.match(/\b(?:period|pd|p)\s*([1-8])\b/);
  if (match) return Number(match[1]) - 1;
  const timeMatch = nq.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (timeMatch && (timeMatch[3] || timeMatch[2] || Number(timeMatch[1]) <= 8)) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2] || 0);
    if (timeMatch[3] === 'pm' && hours < 12) hours += 12;
    if (timeMatch[3] === 'am' && hours === 12) hours = 0;
    const total = hours * 60 + minutes;
    const starts = [510, 570, 630, 690, 750, 810, 870, 930];
    const index = starts.findIndex((start, i) => total >= start && total < (starts[i + 1] || start + 60));
    if (index >= 0) return index;
  }
  return null;
}

function extractRoute(nq, data) {
  const fromMatch = nq.match(/\bfrom\s+(.+?)\s+to\s+(.+)$/);
  if (fromMatch) {
    return { from: findPlace(fromMatch[1], data, { allowLoose: true }), to: findPlace(fromMatch[2], data, { allowLoose: true }) };
  }
  const toMatch = nq.match(/\bto\s+(.+)$/);
  if (toMatch) return { from: null, to: findPlace(toMatch[1], data, { allowLoose: true }) };
  const reachMatch = nq.match(/\b(?:reach|go to|route for|direction for|directions for)\s+(.+)$/);
  if (reachMatch) return { from: null, to: findPlace(reachMatch[1], data, { allowLoose: true }) };
  return { from: null, to: null };
}

function formatLecture(lecture, section) {
  const teacher = lecture.teacher || lecture.teachers?.join(', ') || 'Faculty not listed';
  return `${formatClock(lecture.start)}–${formatClock(lecture.end)} · **${lecture.subject}** · ${lecture.room || 'Room not listed'} · ${teacher}`;
}

function sourceFor(data, kind) {
  const source = (data.sources?.sources || []).find((item) => item.kind === kind);
  return source ? { label: source.label, url: source.url } : null;
}

function action(label, path, icon = 'arrow') {
  return { label, path, icon };
}

function studentSummary(student, data) {
  const section = sectionForStudent(data.timetable, student);
  return [
    `**${student.name}**`,
    `CRN **${student.crn}** · ${branchShort(student.branch)} · Section **${student.section}**${student.subsection ? ` · Sub-section ${student.subsection}` : ''}`,
    student.academicGroup ? `Academic / mentoring group: **${student.academicGroup}**` : '',
    `Mentor: ${student.mentor || 'Not listed'}${student.mentorVenue ? ` · Mentor venue: ${student.mentorVenue}` : ''}${student.mentorPhone ? ` · Mentor phone: ${student.mentorPhone}` : ''}`,
    section ? `Timetable match: ${section.label}` : 'Timetable: section not in the current export',
  ]
    .filter(Boolean)
    .join('\n');
}

function answerStudent(student, data, profile, memory) {
  const section = sectionForStudent(data.timetable, student);
  const actions = [
    action('Open full profile', `/students?crn=${student.crn}`, 'student'),
    ...(section ? [action('Open timetable', `/timetable?section=${section.id}&student=${student.crn}`, 'timetable')] : []),
  ];
  const mentorRoom = (data.rooms?.rooms || []).find((room) => norm(room.id) === norm(student.mentorVenue).replace(/\s+/g, ''));
  if (mentorRoom) actions.push(action('Route to mentor venue', `/map?room=${encodeURIComponent(mentorRoom.code)}`, 'map'));
  return {
    intent: 'student',
    confidence: 'high',
    text: studentSummary(student, data),
    actions,
    chips: ['What is their timetable?', 'Who is their mentor?', `How many students in ${student.section}?`],
    memory: { lastStudentCrn: student.crn, lastSectionId: section?.id || memory?.lastSectionId, lastIntent: 'student' },
  };
}

function answerFaculty(person, data, memory) {
  if (person.timetableOnly) {
    const schedule = teacherSchedule(data.timetable, person.name);
    return {
      intent: 'faculty',
      confidence: 'medium',
      text: [
        `**${person.name}** appears in the official timetable as a teacher.`,
        schedule.length ? `Classes listed: ${schedule.length}.` : 'No classes are listed in the current export.',
        schedule.length
          ? schedule.slice(0, 6).map((lecture) => `${DAYS[lecture.day]} · ${formatLecture(lecture, lecture)}`).join('\n')
          : '',
        'A full faculty profile is not in the public directory yet.',
      ]
        .filter(Boolean)
        .join('\n'),
      actions: [action('Open timetable', `/timetable?teacher=${encodeURIComponent(person.name)}`, 'timetable')],
      memory: { lastFacultyName: person.name, lastIntent: 'faculty' },
    };
  }
  const schedule = teacherSchedule(data.timetable, person.name);
  const actions = [
    ...(schedule.length ? [action('Open teacher timetable', `/timetable?teacher=${encodeURIComponent(person.name)}`, 'timetable')] : []),
    ...(person.profileUrl ? [{ label: 'Official faculty profile', url: person.profileUrl, icon: 'external' }] : []),
  ];
  return {
    intent: 'faculty',
    confidence: 'high',
    text: [
      `**${person.name}**`,
      `${person.designation || 'Faculty'} · ${person.department || 'GNDEC'}`,
      person.email ? `Email: ${person.email}` : 'Email not published in the public directory.',
      person.experience ? `Experience: ${person.experience}` : '',
      person.qualifications ? `Qualifications: ${String(person.qualifications).slice(0, 180)}` : '',
      schedule.length ? `Timetable: ${schedule.length} classes found in the current export.` : 'Timetable: no matching classes in the current export.',
      'Office room and personal phone are not published in our verified data.',
    ]
      .filter(Boolean)
      .join('\n'),
    actions,
    chips: ['Which subjects do they teach?', 'Show their classes', 'Where is their department?'],
    memory: { lastFacultyName: person.name, lastIntent: 'faculty' },
  };
}

function findCourseAlias(nq) {
  const tokens = new Set(nq.split(/\s+/).filter(Boolean));
  for (const course of COURSE_GLOSSARY) {
    const aliases = [...course.aliases, course.short.toLowerCase()];
    if (aliases.some((alias) => (alias.includes(' ') ? nq.includes(alias) : tokens.has(alias)))) return course;
  }
  return null;
}

function courseLectures(data, course) {
  const words = course.subjectWords.map(norm);
  const lectures = [];
  for (const entry of timetableEntries(data.timetable)) {
    for (const lecture of entry.lectures || []) {
      const subject = norm(lecture.subject);
      if (!words.some((word) => subject.includes(word))) continue;
      lectures.push({ ...lecture, sectionId: entry.id, sectionLabel: entry.label });
    }
  }
  return lectures.sort((a, b) => a.day - b.day || a.period - b.period);
}

function answerCourseAlias(course, data, nq) {
  const lectures = courseLectures(data, course);
  const teachers = [
    ...new Set(lectures.flatMap((lecture) => (lecture.teachers?.length ? lecture.teachers : lecture.teacher ? [lecture.teacher] : []))),
  ];
  const asksTeacher = /\b(who|teach|teacher|faculty|professor)\b/.test(nq);
  const asksClass = /\b(timetable|class|classes|schedule|lecture|period|when)\b/.test(nq);
  const openTeacher = teachers[0]
    ? action('Open teacher timetable', `/timetable?teacher=${encodeURIComponent(teachers[0])}`, 'timetable')
    : null;
  if (asksTeacher) {
    return {
      intent: 'subject-teacher',
      confidence: teachers.length ? 'high' : 'medium',
      text: [
        `**${course.short}** is **${course.title}**.`,
        teachers.length
          ? `In the current timetable it is listed with ${teachers.map((name) => `**${name}**`).join(', ')} (${lectures.length} classes).`
          : 'The official timetable does not name a teacher for this subject in the current export.',
        'The timetable does not prove who is the official course coordinator.',
      ].join('\n'),
      actions: [openTeacher, action('Open Study hub', '/study', 'study')].filter(Boolean),
      memory: { lastSubject: course.short, lastIntent: 'subject-teacher' },
    };
  }
  if (asksClass && lectures.length) {
    const seen = new Set();
    const lines = [];
    for (const lecture of lectures) {
      const key = `${lecture.day}-${lecture.start}-${lecture.sectionId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`${DAYS[lecture.day]} · ${formatClock(lecture.start)} · ${lecture.sectionId}${lecture.room ? ` · ${lecture.room}` : ''}${lecture.teacher ? ` · ${lecture.teacher}` : ''}`);
      if (lines.length >= 10) break;
    }
    return {
      intent: 'timetable',
      confidence: 'high',
      text: `**${course.short}** is **${course.title}**. Classes in the current export:\n${lines.join('\n')}\n\nSource: official FET export (17 Sep 2026). Confirm room changes with your department.`,
      actions: [
        action('Open timetable', `/timetable?section=${lectures[0].sectionId}`, 'timetable'),
        openTeacher,
      ].filter(Boolean),
      memory: { lastSubject: course.short, lastSectionId: lectures[0].sectionId, lastIntent: 'timetable' },
    };
  }
  return {
    intent: 'glossary',
    confidence: 'high',
    text: [
      `**${course.short}** stands for **${course.title}**.`,
      lectures.length
        ? `The official timetable lists it as **${lectures[0].subject.replace(/\s+[LPT]$/, '')}**${teachers.length ? ` and names ${teachers.map((name) => `**${name}**`).join(', ')}` : ''}.`
        : 'It is not scheduled in the current timetable export.',
      'Ask “who teaches PPS” or “EDG timetable” for the current slots.',
    ].join('\n'),
    actions: [openTeacher, action('Open Study hub', '/study', 'study')].filter(Boolean),
    chips: [`Who teaches ${course.short}?`, `${course.short} timetable`],
    memory: { lastSubject: course.short, lastIntent: 'glossary' },
  };
}

function answerPlace(place, data, nq, memory) {
  const route = findRoute(data.campus, 'main-gate', place.id);
  const lines = [
    `**${place.name}**`,
    place.description || 'This place is listed in the campus guide.',
    `Location confidence: ${place.verified ? 'public map location checked' : 'approximate; confirm on campus'}.`,
  ];
  if (route && route.meters > 0) {
    lines.push(`From the Main Gate: about **${Math.round(route.meters)} m** · **${walkMinutes(route.meters)} min walk**.`);
  }
  return {
    intent: 'place',
    confidence: place.verified ? 'high' : 'medium',
    text: lines.join('\n'),
    actions: [
      action('Open on map', `/map?to=${place.id}&from=main-gate`, 'map'),
      action('Photo & step guide', `/map?to=${place.id}&from=main-gate&guide=1`, 'camera'),
    ],
    chips: ['How do I reach it?', 'Show its photo', 'What is nearby?'],
    memory: { lastPlaceId: place.id, lastIntent: 'place' },
  };
}

function answerRoom(room, data, memory) {
  const place = roomPlace(room, data);
  const route = place ? findRoute(data.campus, 'main-gate', place.id) : null;
  return {
    intent: 'room',
    confidence: place ? 'medium' : 'low',
    text: [
      `**${room.code}**`,
      place ? `Block: **${place.name}**${room.floor ? ` · ${room.floor}` : ''}.` : 'This is a room/lab name from the official timetable. Its block is not verified in our data.',
      room.image ? 'A classroom photo is available.' : 'No verified room photo is available yet.',
      route ? `From the Main Gate to the block entrance: about **${Math.round(route.meters)} m** · **${walkMinutes(route.meters)} min**.` : '',
      'Room-to-door navigation is not yet verified. Use the block entrance and ask at the department office.',
    ]
      .filter(Boolean)
      .join('\n'),
    actions: [
      ...(place ? [action('Route to this block', `/map?to=${place.id}&room=${encodeURIComponent(room.code)}`, 'map')] : []),
      ...(room.image ? [action('See room photo', `/map?room=${encodeURIComponent(room.code)}`, 'camera')] : []),
    ],
    memory: { lastRoom: room.code, lastPlaceId: place?.id, lastIntent: 'room' },
  };
}

function answerTimetable({ data, profile, memory, nq, section, dayInfo, teacher, room, student, now = new Date(), nowIntent = false }) {
  const sectionLabel = section?.personalized
    ? `${section.label}${section.cohortId ? ` · subsection ${section.cohortId}` : ''}${section.academicGroup ? ` · ${section.academicGroup}` : ''}`
    : section?.kind === 'subgroup'
      ? `${section.label} · subsection ${section.id}`
      : section?.label;
  if (teacher) {
    const schedule = teacherSchedule(data.timetable, teacher.name || teacher);
    const targetDay = dayInfo.explicit ? dayInfo.day : null;
    const filtered = targetDay === null ? schedule : schedule.filter((lecture) => lecture.day === targetDay);
    return {
      intent: 'teacher-timetable',
      confidence: 'high',
      text: filtered.length
        ? [
            `**${teacher.name || teacher}** — ${targetDay === null ? 'weekly classes' : DAYS[targetDay]} in the official export:`,
            ...filtered.slice(0, 12).map((lecture) => `${DAYS[lecture.day]} · ${formatLecture(lecture, lecture)} · ${lecture.sectionId}`),
            filtered.length > 12 ? `…and ${filtered.length - 12} more.` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : `No classes found for **${teacher.name || teacher}**${targetDay === null ? '' : ` on ${DAYS[targetDay]}`} in the current timetable export.`,
      actions: [action('Open teacher timetable', `/timetable?teacher=${encodeURIComponent(teacher.name || teacher)}`, 'timetable')],
      memory: { lastFacultyName: teacher.name || teacher, lastIntent: 'teacher-timetable' },
    };
  }
  if (room) {
    const schedule = roomSchedule(data.timetable, room.code);
    const targetDay = dayInfo.explicit ? dayInfo.day : null;
    const filtered = targetDay === null ? schedule : schedule.filter((lecture) => lecture.day === targetDay);
    return {
      intent: 'room-timetable',
      confidence: 'medium',
      text: filtered.length
        ? [
            `**${room.code}** — ${targetDay === null ? 'weekly schedule' : DAYS[targetDay]} in the official export:`,
            ...filtered.slice(0, 12).map((lecture) => `${DAYS[lecture.day]} · ${formatLecture(lecture, lecture)} · ${lecture.sectionId}`),
          ].join('\n')
        : `No scheduled classes found for **${room.code}**${targetDay === null ? '' : ` on ${DAYS[targetDay]}`}. It may still be used for events or department work.`,
      actions: [action('Open room details', `/map?room=${encodeURIComponent(room.code)}`, 'map')],
      memory: { lastRoom: room.code, lastIntent: 'room-timetable' },
    };
  }
  if (!section) {
    return {
      intent: 'timetable',
      confidence: 'low',
      text: [
        'I need a timetable to look up.',
        'Set your profile with your name/CRN, or ask with a section such as **ECE B1**, **CSE D** or **D2CSA**.',
      ].join('\n'),
      actions: [action('Set up my profile', '/settings', 'settings'), action('Open timetable page', '/timetable', 'timetable')],
      chips: ['Show ECE B1 timetable', 'Show CSE D timetable', 'My next class'],
      memory,
    };
  }
  if (
    nq.includes('free period') ||
    nq.includes('free periods') ||
    /breaks?\s+(today|tomorrow|on|for|between)/.test(nq) ||
    /\bgaps?\s+between\b/.test(nq) ||
    /\bkhali\b/.test(nq)
  ) {
    const day = dayInfo.explicit ? dayInfo.day : dayIndexFor(new Date());
    const free = freeSlotsOn(section, day, data.timetable);
    return {
      intent: 'free-periods',
      confidence: 'high',
      text: free.length
        ? `Breaks and free periods for **${sectionLabel}** on **${DAYS[day]}**: ${free.map((slot) => `${formatClock(slot.start)}–${formatClock(slot.end)}`).join(', ')}.\nA free period means no class is listed — it does not reserve a room or promise quiet. Confirm changes with your department.`
        : `No free periods are listed for **${sectionLabel}** on **${DAYS[day]}**.`,
      actions: [
        action('Open timetable', `/timetable?section=${section.id}`, 'timetable'),
        action('Find a free room', '/timetable?tab=free', 'timetable'),
      ],
      memory: { lastSectionId: section.id, lastIntent: 'free-periods' },
    };
  }
  if (
    nowIntent ||
    nq.includes('next class') ||
    nq.includes('next lecture') ||
    nq.includes('next period') ||
    nq.includes('current class') ||
    nq.includes('what class')
  ) {
    let activeSection = section;
    let { current, next } = findCurrentAndNext(activeSection, now, data.timetable);
    if (!current && !next && (section.kind === 'subgroup' || (section.personalized && section.cohortId))) {
      const baseSection = findSection(data.timetable, section.sectionId || section.id);
      if (baseSection) {
        const base = findCurrentAndNext(baseSection, now, data.timetable);
        if (base.current || base.next) {
          activeSection = baseSection;
          current = base.current;
          next = base.next;
        }
      }
    }
    const upcoming = next || current;
    const later = !upcoming ? nextClassTodayOrLater(activeSection, now) : null;
    const laterLabel = later && !later.isToday
      ? `${DAYS[later.day]}${later.date ? `, ${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(later.date)}` : ''}`
      : null;
    return {
      intent: 'next-class',
      confidence: 'high',
      text: upcoming
        ? [
            current ? `You are in **${current.subject}** now (${formatClock(current.start)}–${formatClock(current.end)} · ${current.room || 'room not listed'}).` : '',
            next
              ? `Next: **${next.subject}** at **${formatClock(next.start)}** in **${next.room || 'room not listed'}** · ${next.teacher || next.teachers?.join(', ') || 'faculty not listed'}.`
              : current
                ? 'No later class is listed today.'
                : '',
            `Section: ${activeSection.label}${activeSection !== section ? ` (whole section; subsection ${section.id} has no class listed now)` : ''}.`,
          ]
            .filter(Boolean)
            .join('\n')
        : later
          ? `No class is left today for **${activeSection.label}**. Next listed class: **${later.lecture.subject}** on **${laterLabel}** at **${formatClock(later.lecture.start)}** in **${later.lecture.room || 'room not listed'}**.`
          : `No current or upcoming class is listed for **${activeSection.label}** in the current timetable export.`,
      actions: [
        action('Open today’s timetable', `/timetable?section=${activeSection.id}`, 'timetable'),
        ...(upcoming?.room ? [action('Route to room', `/map?room=${encodeURIComponent(upcoming.room)}`, 'map')] : []),
      ],
      memory: { lastSectionId: section.id, lastIntent: 'next-class' },
    };
  }
  if (nq.includes('week') || nq.includes('full timetable') || nq.includes('all classes')) {
    const lines = [];
    for (let day = 0; day < 6; day += 1) {
      const lectures = lecturesOn(section, day);
      if (!lectures.length) continue;
      lines.push(`**${DAYS[day]}** — ${lectures.length} class${lectures.length === 1 ? '' : 'es'}`);
      for (const lecture of lectures.slice(0, 4)) lines.push(`  ${formatLecture(lecture, section)}`);
      if (lectures.length > 4) lines.push(`  …and ${lectures.length - 4} more`);
    }
    return {
      intent: 'weekly-timetable',
      confidence: 'high',
      text: lines.length
        ? `Weekly timetable for **${sectionLabel}**:\n${lines.join('\n')}\n\nSource: official FET export (17 Sep 2026). Confirm room changes with your department.`
        : `No classes are listed for **${sectionLabel}** in the current export.`,
      actions: [action('Open full timetable', `/timetable?section=${section.id}`, 'timetable')],
      memory: { lastSectionId: section.id, lastIntent: 'weekly-timetable' },
    };
  }
  const day = dayInfo.day;
  const dayLabel = day < 0 ? 'Sunday' : DAYS[day];
  const lectures = day >= 0 ? lecturesOn(section, day) : [];
  const targetName = student ? `${student.name} (${sectionLabel})` : sectionLabel;
  return {
    intent: 'timetable',
    confidence: 'high',
    text: lectures.length
      ? [
          `**${dayLabel}** timetable for **${targetName}**:`,
          ...lectures.map((lecture) => formatLecture(lecture, section)),
          '',
          dayInfo.explicit ? '' : 'Showing today by default. Ask for “tomorrow” or any weekday for another day.',
          'Source: official FET export (17 Sep 2026). Verify last-minute changes with your department.',
        ]
          .filter((line, index, array) => !(line === '' && array[index - 1] === ''))
          .join('\n')
      : day < 0
        ? `It is Sunday — no classes are scheduled. Ask for a weekday to see **${sectionLabel}**’s timetable.`
        : `No classes are listed for **${targetName}** on **${dayLabel}** in the current export. It may be a free day, or the official timetable may have changed.`,
    actions: [
      action('Open timetable', `/timetable?section=${section.id}`, 'timetable'),
      action('Compare sections', `/timetable?section=${section.id}&compare=1`, 'columns'),
    ],
    chips: ['My timetable tomorrow', 'Which rooms are free?', 'Show weekly timetable'],
    memory: { lastSectionId: section.id, lastIntent: 'timetable' },
  };
}

function answerFreeRooms({ data, nq, dayInfo, now = new Date() }) {
  const period = extractPeriod(nq);
  const day = dayInfo.explicit ? dayInfo.day : dayIndexFor(now);
  const currentPeriod = Math.max(0, Math.min(7, Math.floor((now.getHours() * 60 + now.getMinutes() - 510) / 60)));
  const targetPeriod = period ?? (day === dayIndexFor(now) ? currentPeriod : 0);
  if (day < 0) {
    return {
      intent: 'free-rooms',
      confidence: 'high',
      text: 'It is Sunday, so the teaching timetable is not running. Classrooms may still be open for study — check with the department or security.',
      actions: [action('Open campus map', '/map', 'map')],
    };
  }
  const free = freeClassrooms(data, day, targetPeriod);
  const rooms = free.filter((room) => room.kind === 'classroom').slice(0, 16);
  const timeStart = [510, 570, 630, 690, 750, 810, 870, 930][targetPeriod];
  return {
    intent: 'free-rooms',
    confidence: 'medium',
    text: [
      `**${rooms.length ? `${free.length} rooms look free` : 'No free classroom found'}** on **${DAYS[day]}**, period ${targetPeriod + 1} (${formatClock(timeStart)}–${formatClock(timeStart + 60)}).`,
      rooms.length ? rooms.map((room) => `• ${room.code}${room.block ? ` · ${room.block}` : ''}`).join('\n') : '',
      'Based on the official timetable export. A room can still be used for an event, makeup class or department work — confirm at the door.',
    ]
      .filter(Boolean)
      .join('\n'),
    actions: [action('Open timetable & free rooms', '/timetable?tab=free', 'timetable')],
    chips: ['Free rooms tomorrow', 'Free rooms period 3', 'My free periods'],
    memory: { lastIntent: 'free-rooms' },
  };
}

function answerCounts({ data, nq, section, explicitSection, student, faculty }) {
  const { students, faculty: allFaculty, sections } = getIndexes(data);
  const mentorMatch = nq.match(/\bmentor\s+(.+)$/);
  if (mentorMatch) {
    const mentorText = mentorMatch[1].replace(/\b(ke|ka|ki|students?|kitne|how many|under|with)\b/g, ' ').trim();
    const matched = allFaculty.find((person) => nq.includes(personKey(person.name)) || personKey(person.name).split(' ').every((token) => mentorText.includes(token)));
    const mentorName = matched?.name || mentorText;
    const count = students.filter((item) => norm(item.mentor).includes(norm(mentorName))).length;
    return {
      intent: 'mentor-count',
      confidence: 'high',
      text: `**${count}** students are listed under mentor **${mentorName || 'that name'}** in the first-year permanent-section roster.`,
      actions: [action('Open student directory', `/students?mentor=${encodeURIComponent(mentorName)}`, 'students')],
      memory: { lastIntent: 'mentor-count' },
    };
  }
  const branch = extractBranch(nq);
  if (/\b(teachers?|faculty|professors?|staff)\b/.test(nq)) {
    const deptFilter = branch ? branchShort(branch).toLowerCase() : null;
    const list = deptFilter
      ? allFaculty.filter((person) => `${person.department}`.toLowerCase().includes(deptFilter) || `${person.department}`.toLowerCase().includes(branch === 'CS' ? 'computer science' : branch === 'EC' ? 'electronics' : branch === 'ME' ? 'mechanical' : branch === 'CE' ? 'civil' : branch === 'EE' ? 'electrical' : branch === 'IT' ? 'information technology' : ''))
      : allFaculty;
    return {
      intent: 'faculty-count',
      confidence: 'high',
      text: `Our faculty directory has **${list.length}** public profiles${branch ? ` matching **${branchShort(branch)}**` : ''}. The total public directory contains ${allFaculty.length} records.`,
      actions: [action('Open faculty directory', `/faculty${branch ? `?dept=${branch}` : ''}`, 'faculty')],
      memory: { lastIntent: 'faculty-count' },
    };
  }
  if (/\b(section|sections|class sections)\b/.test(nq) && !explicitSection) {
    const year = extractYear(nq);
    const list = sections.filter((item) => item.kind === 'section' && (!branch || item.branch === branch) && (!year || item.year === year));
    return {
      intent: 'section-count',
      confidence: 'high',
      text: `I found **${list.length}** timetable sections${branch ? ` for ${branchShort(branch)}` : ''}${year ? ` in ${yearLabel(year)}` : ''}. ${list.slice(0, 12).map((item) => item.id).join(', ')}${list.length > 12 ? '…' : ''}. Note: the official export is complete for 1st year and partial for some 2nd/3rd-year groups.`,
      actions: [action('Open timetable', '/timetable', 'timetable')],
      memory: { lastIntent: 'section-count' },
    };
  }
  // An explicit section (ECE B1, CSE D, D2CSB) beats both the branch and the profile.
  if (explicitSection || (section && !branch)) {
    const target = explicitSection || section;
    const base =
      target.kind === 'subgroup'
        ? sections.find(
            (item) =>
              item.kind === 'section' &&
              item.year === target.year &&
              item.branch === target.branch &&
              item.group === target.group,
          ) || target
        : target;
    const list = students.filter((item) => item.section === base.id);
    if (list.length) {
      const groups = [...new Set(list.map((item) => item.subsection).filter(Boolean))];
      const subsection = target.kind === 'subgroup' ? list.filter((item) => item.subsection === target.id).length : 0;
      return {
        intent: 'section-student-count',
        confidence: 'high',
        text: `**${list.length}** first-year students are listed in section **${base.id}**${groups.length ? ` (sub-sections: ${groups.join(', ')})` : ''} in the permanent-section roster.${subsection ? ` Sub-section **${target.id}** itself has **${subsection}** listed students.` : ''}`,
        actions: [action('Open section directory', `/students?section=${base.id}`, 'students')],
        memory: { lastSectionId: base.id, lastIntent: 'section-student-count' },
      };
    }
  }
  if (student) return answerStudent(student, data, null, {});
  if (branch) {
    const list = students.filter((item) => item.branch === branch);
    const perSection = Object.entries(
      list.reduce((acc, item) => {
        acc[item.section] = (acc[item.section] || 0) + 1;
        return acc;
      }, {}),
    )
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => `${name}: ${count}`)
      .join(' · ');
    return {
      intent: 'branch-student-count',
      confidence: 'high',
      text: `**${list.length}** first-year students are listed for **${branchShort(branch)}** across ${new Set(list.map((item) => item.section)).size} sections.\n${perSection}`,
      actions: [action('Open student directory', `/students?branch=${branch}`, 'students')],
      memory: { lastIntent: 'branch-student-count' },
    };
  }
  if (/\b(student|students)\b/.test(nq)) {
    return {
      intent: 'student-count',
      confidence: 'high',
      text: `The first-year permanent-section roster contains **${students.length}** students across ${new Set(students.map((item) => item.branch)).size} branches and ${new Set(students.map((item) => item.section)).size} sections.`,
      actions: [action('Open student directory', '/students', 'students')],
      memory: { lastIntent: 'student-count' },
    };
  }
  return null;
}

function answerStudy({ data, nq }) {
  const branch = extractBranch(nq);
  const semester = extractSemester(nq) || extractYear(nq);
  if (nq.includes('syllabus') || nq.includes('scheme') || nq.includes('course structure')) {
    let docs = data.syllabus?.documents || [];
    if (branch) docs = docs.filter((doc) => doc.branch === 'ALL' || doc.branch === branch);
    if (semester) docs = docs.filter((doc) => doc.branch === 'ALL' || doc.semesters?.includes(semester) || String(doc.semester).includes(String(semester)));
    docs = docs.sort((a, b) => String(b.scheme || '').localeCompare(String(a.scheme || '')));
    const top = docs.slice(0, 6);
    return {
      intent: 'syllabus',
      confidence: 'high',
      text: top.length
        ? [
            `I found **${docs.length}** syllabus resources${branch ? ` for ${branchShort(branch)}` : ''}${semester ? ` / semester ${semester}` : ''}.`,
            ...top.map((doc) => `• **${doc.title}** — ${doc.program || 'GNDEC'}${doc.semester ? ` · ${doc.semester}` : ''}${doc.scheme ? ` · Scheme ${doc.scheme}` : ''}`),
            'Always match the scheme/session to your batch before relying on a syllabus.',
          ].join('\n')
        : 'No matching syllabus document is indexed for that branch/semester. Try “B.Tech first year syllabus” or browse the Study hub.',
      actions: [action('Open Study hub', `/study?tab=syllabus${branch ? `&branch=${branch}` : ''}`, 'study')],
      chips: ['B.Tech first year syllabus', 'Show ECE question banks', 'Previous year papers'],
      memory: { lastBranch: branch, lastSemester: semester, lastIntent: 'syllabus' },
    };
  }
  if (nq.includes('notes')) {
    return {
      intent: 'notes',
      confidence: 'medium',
      text: [
        'We do **not** have a verified student-notes library yet, so I will not pretend to find notes that are not there.',
        'What is available now: official syllabus PDFs, IT department question banks and 1,600 indexed previous-year papers.',
        'A moderated notes upload workflow is planned in the admin studio. For now, use the Study hub or ask your subject teacher.',
      ].join('\n'),
      actions: [action('Open Study hub', '/study', 'study'), action('Open question banks', '/study?tab=questionbank', 'book')],
      memory: { lastIntent: 'notes' },
    };
  }
  if (nq.includes('paper') || nq.includes('pyq') || nq.includes('question paper') || nq.includes('previous year')) {
    const subject = findPaperSubject(nq, data);
    if (!subject) {
      return {
        intent: 'papers',
        confidence: 'medium',
        text: 'Tell me a subject name or code (for example **AM-101**, **Data Structures**, **Math I**) and I will find the indexed paper sessions.',
        actions: [action('Browse all papers', '/study?tab=papers', 'study')],
        chips: ['AM-101 papers', 'Data Structures previous papers', 'Show question banks'],
        memory: { lastIntent: 'papers' },
      };
    }
    const sessions = [...new Set(subject.papers.map((paper) => paper.session).filter(Boolean))].slice(0, 8);
    return {
      intent: 'papers',
      confidence: 'high',
      text: [
        `**${subject.code}** has **${subject.papers.length}** indexed paper records.`,
        sessions.length ? `Sessions available: ${sessions.join(' · ')}.` : '',
        `Example: ${subject.papers[0].name || subject.papers[0].title}`,
        'These open the original PDF from the shared archive. Solutions are not included unless separately tagged.',
      ]
        .filter(Boolean)
        .join('\n'),
      actions: [action('Open papers for this subject', `/study?tab=papers&q=${encodeURIComponent(subject.code)}`, 'study')],
      chips: ['Show more sessions', 'Syllabus for this subject', 'Exam tips'],
      memory: { lastSubject: subject.code, lastIntent: 'papers' },
    };
  }
  if (nq.includes('exam tip') || nq.includes('exam preparation') || nq.includes('how to prepare') || nq.includes('study tip')) {
    return {
      intent: 'tips',
      confidence: 'medium',
      text: [
        '**A practical exam plan** (student guidance, not an official college circular):',
        '1. Build a 7-day topic map from the official syllabus — mark confident / revise / learn.',
        '2. Solve one previous-year paper under timed conditions before revising topic-by-topic.',
        '3. Keep a one-page formula + definition sheet for the last 24 hours.',
        '4. Sleep before the paper. A tired brain loses more marks than one unread chapter.',
        '5. In the hall: read all questions, attempt the ones you know first, show every step.',
        'Open Study hub for syllabus and PYQs.',
      ].join('\n'),
      actions: [action('Open exam tips', '/study?tab=tips', 'study')],
      memory: { lastIntent: 'tips' },
    };
  }
  return null;
}

function answerNotices({ data, nq, memory }) {
  if (nq.includes('holiday') || nq.includes('chutti')) {
    const now = dateKey(new Date());
    const upcoming = data.notices?.holidays
      ?.filter((holiday) => holiday.date >= now)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
    return {
      intent: 'holidays',
      confidence: 'high',
      text: upcoming?.length
        ? [
            '**Upcoming holidays** from the published 2026 list:',
            ...upcoming.map((holiday) => `• **${holiday.displayDate || holiday.date}** — ${holiday.name}${holiday.category && holiday.category !== 'Public holiday' ? ` (${holiday.category})` : ''}`),
            'This is the published holiday list; department events or special working Saturdays can override it.',
          ].join('\n')
        : 'No upcoming holiday is listed in the published 2026 holiday data.',
      actions: [action('Open holiday calendar', '/notices?tab=holidays', 'calendar')],
      memory: { lastIntent: 'holidays' },
    };
  }
  if (/\b(exam|date sheet|datesheet|result|makeup)\b/.test(nq)) {
    const examNotices = (data.notices?.notices || []).filter((notice) => notice.kind === 'exam');
    const latest = [...examNotices, ...(data.notices?.exams || [])]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 5);
    return {
      intent: 'exams',
      confidence: 'high',
      text: latest.length
        ? [
            '**Latest examination updates** from official sources:',
            ...latest.map((notice) => `• **${notice.title}** — ${notice.displayDate || notice.date || 'date not listed'}`),
            'A full semester date sheet is not present in our verified data yet. Open the official ERP notice for the actual PDF.',
          ].join('\n')
        : 'No examination notice is indexed. Open the official ERP notice board for the current date sheet.',
      actions: [action('Open notices & exams', '/notices?tab=exams', 'notices')],
      memory: { lastIntent: 'exams' },
    };
  }
  const kind = nq.includes('event')
    ? 'event'
    : nq.includes('admin')
      ? 'admin'
      : nq.includes('exam')
        ? 'exam'
        : null;
  let notices = (data.notices?.notices || []).filter((notice) => !kind || notice.kind === kind);
  const queryTerms = nq.split(' ').filter((word) => word.length > 3 && !STOP_WORDS.has(word));
  if (queryTerms.length) {
    notices = notices
      .map((notice) => ({ notice, score: searchScore(`${notice.title} ${notice.source} ${notice.kind}`, queryTerms.join(' ')) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.notice);
  }
  notices = notices.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 6);
  return {
    intent: 'notices',
    confidence: 'high',
    text: notices.length
      ? [
          '**Latest notices** from official college sources:',
          ...notices.map((notice) => `• **${notice.title}** — ${notice.displayDate || notice.date || 'date not listed'}${notice.kind ? ` · ${notice.kind}` : ''}`),
          'Tap any notice in the Notices page to open the original source.',
        ].join('\n')
      : 'No matching notice found in the indexed list. The official noticeboard may have newer updates.',
    actions: [action('Open all notices', '/notices', 'notices')],
    chips: ['Show exam notices', 'Upcoming holidays', 'Latest events'],
    memory: { lastIntent: 'notices' },
  };
}

function answerContact({ data, nq }) {
  const people = data.contacts?.people || [];
  const roles = data.contacts?.roles || [];
  const candidates = [...people, ...roles];
  if (!candidates.length) return null;
  const matches = candidates
    .filter((person) => nq.includes(personKey(person.name || '')) || nq.includes(norm(person.role || '')))
    .slice(0, 5);
  if (!matches.length) return null;
  return {
    intent: 'contact',
    confidence: 'high',
    text: matches
      .map((person) =>
        [
          `**${person.role || person.name}**`,
          person.name ? `Name: ${person.name}` : '',
          person.phone || person.landline ? `Phone: ${person.phone || person.landline}` : '',
          person.email ? `Email: ${person.email}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n'),
    actions: [action('Open official contact page', 'https://gndec.ac.in/?q=node/6', 'external')],
    memory: { lastIntent: 'contact' },
  };
}

function evaluateMath(raw) {
  const normalized = raw
    .toLowerCase()
    .replace(/what is|calculate|solve|answer|equals?|kitna|hota|hoti|hai/g, ' ')
    .replace(/\bplus\b/g, '+')
    .replace(/\bminus\b/g, '-')
    .replace(/\b(multiplied by|times|into)\b/g, '*')
    .replace(/\bdivided by\b/g, '/')
    .replace(/\bpercent of\b/g, '% of')
    .replace(/,/g, '')
    .trim();
  const percent = normalized.match(/(\d+(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)/);
  let expression = percent ? `(${percent[1]}/100)*${percent[2]}` : normalized;
  expression = expression.replace(/(\d)\s*x\s*(\d)/g, '$1*$2');
  if (!/^[\d\s+\-*/().%]+$/.test(expression)) return null;
  if (!/\d/.test(expression)) return null;
  if (!/[+\-*/%]/.test(expression)) return null;
  try {
    const result = Function(`"use strict"; return (${expression});`)();
    if (!Number.isFinite(result)) return null;
    return Math.round(result * 10000) / 10000;
  } catch {
    return null;
  }
}

function answerMath(nq) {
  const result = evaluateMath(nq);
  if (result === null) return null;
  return {
    intent: 'math',
    confidence: 'high',
    text: `**${result}**`,
    chips: ['Show my next class', 'Where is the library?', 'How many students in CS?'],
    memory: { lastIntent: 'math' },
  };
}

function isNowClassQuery(nq, explicitSection, place) {
  const classWord = /\b(class|classes|lecture|period|room|timetable)\b/.test(nq);
  if (/\b(next|current)\s+(class|lecture|period)\b/.test(nq)) return true;
  if (/\b(where|which|what)\b.*\b(my|our)\s+(class|lecture|period)\b/.test(nq)) return true;
  if (/\b(class|lecture)\s+(right\s+)?now\b/.test(nq)) return true;
  if (/\b(right now|now)\b/.test(nq) && (classWord || explicitSection)) return true;
  if (/\b(my|our)\s+(class|lecture)\b/.test(nq) && /\b(where|which|what|next|current)\b/.test(nq)) return true;
  if (/\b(class|lecture|period)\b.*\b(where|now)\b/.test(nq)) return true;
  if (explicitSection && !place && /\b(where is|where|kahan)\b/.test(nq)) return true;
  return false;
}

export function answerQuestion(raw, context = {}) {
  const { data, profile = {}, memory = {}, now = new Date() } = context;
  if (!data) {
    return { intent: 'loading', confidence: 'low', text: 'Campus data is still loading. Try again in a moment.' };
  }
  const original = String(raw || '').trim();
  if (!original) return { intent: 'empty', confidence: 'low', text: 'Ask me something about GNDEC — timetable, rooms, people, notices, papers or routes.' };
  const nq = normalizeQuestion(original);

  // Small talk and project identity before entity matching.
  if (/^(hi|hello|hey|hola|namaste|sat sri akal|good morning|good evening|yo)\b/.test(nq)) {
    const name = profile.name ? `, ${profile.name.split(' ')[0]}` : '';
    return {
      intent: 'greeting',
      confidence: 'high',
      text: `Sat Sri Akal${name}! I'm **Ask Compass** — grounded in GNDEC timetable, roster, map and public college data. I can find a class, a room, a student, a teacher, a paper, a notice or a route. What do you need?`,
      chips: ['My next class', 'Where is the library?', 'Show ECE B1 timetable', 'How many students in CS?'],
      memory: { lastIntent: 'greeting' },
    };
  }
  if (hasAny(nq, CREATOR_PATTERNS)) {
    return {
      intent: 'creator',
      confidence: 'high',
      text: 'GNDEC Compass 2.0 is built by **Team Codestorm** — Rahul Kumar, Kaushik Jain, Mohitveer Singh and Monu — as an independent student project for GNDEC Ludhiana. It is not an official college service.',
      actions: [action('About the project', '/about', 'about')],
      memory: { lastIntent: 'creator' },
    };
  }
  if (nq.includes('thank')) {
    return { intent: 'thanks', confidence: 'high', text: 'Happy to help. Ask me again whenever you need a room, class or update.', memory: { lastIntent: 'thanks' } };
  }
  if (hasAny(nq, ['help', 'what can you do', 'capabilities', 'how do you work', 'features'])) {
    return {
      intent: 'help',
      confidence: 'high',
      text: [
        'I can answer from the data cached in Compass:',
        '• **Timetable** — today, tomorrow, any weekday, week, section, student, teacher or room.',
        '• **People** — search a student by CRN/name, a teacher by name, mentors and section counts.',
        '• **Campus** — find a place, room or building and estimate a walking route.',
        '• **Academics** — syllabus, previous-year papers, question banks and exam tips.',
        '• **Updates** — notices, exam notices and holidays.',
        '• **Basics** — college facts, contacts, dates, times and arithmetic.',
        'I work offline after the first visit. I am a deterministic retrieval assistant, not a generative LLM, so I will say when information is missing.',
      ].join('\n'),
      chips: ['My next class', 'Free rooms', 'AM-101 papers', 'Where is the admission cell?'],
      memory: { lastIntent: 'help' },
    };
  }
  if (nq.includes('what time') || nq.includes('current time') || nq === 'time' || nq.includes('date today') || nq.includes('what date')) {
    return {
      intent: 'time',
      confidence: 'high',
      text: `It is **${new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).format(now)}** on **${new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)}**. Timetable day: **${DAYS[dayIndexFor(now)] || 'Sunday'}**.`,
      memory: { lastIntent: 'time' },
    };
  }

  const math = answerMath(nq);
  if (math) return math;

  const studentResult = findStudents(nq, data);
  const student = studentResult.matches[0];
  const facultyResult = findFaculty(nq, data);
  const faculty = facultyResult.matches[0];
  const explicitSection = directSection(nq, getIndexes(data).sections);
  const section = explicitSection || resolveSection(nq, data, profile, memory, student);
  const profileEntry = profile?.sectionId ? findSection(data.timetable, profile.sectionId) : null;
  const profileBase = profileEntry ? baseSectionFor(data.timetable, profileEntry) : null;
  const sectionBase = section ? baseSectionFor(data.timetable, section) : null;
  const personalizationProfile =
    section?.kind === 'subgroup' && !section.mentoringGroup
      ? { ...profile, sectionId: section.id, subsection: section.id }
      : profile;
  const activeSection =
    profileBase && sectionBase && profileBase.id === sectionBase.id
      ? personalizeSection(data.timetable, personalizationProfile) || section
      : section;
  const place = findPlace(nq, data);
  const room = findRoom(nq, data);
  const dayInfo = detectDay(nq, now);

  // Counts before generic lookup, so "how many students in ECE" is not treated as a student search.
  if (/\bhow many\b|\bcount\b|\btotal\b|\bnumber of\b/.test(nq)) {
    const countAnswer = answerCounts({ data, nq, section, explicitSection, student, faculty });
    if (countAnswer) return countAnswer;
  }

  // Direct student lookup.
  if (student && !/\btimetable|class|schedule|mentor|section|branch\b/.test(nq)) {
    return answerStudent(student, data, profile, memory);
  }
  if (studentResult.matches.length > 1 && studentResult.mode === 'token' && /\b(student|who|find|search)\b/.test(nq)) {
    return {
      intent: 'student-list',
      confidence: 'medium',
      text: `I found **${studentResult.matches.length}** matching students. Add more of the name or use a CRN:\n${studentResult.matches
        .slice(0, 8)
        .map((item) => `• **${item.name}** — CRN ${item.crn} · ${item.section}`)
        .join('\n')}`,
      actions: [action('Open student directory', `/students?q=${encodeURIComponent(original)}`, 'students')],
      memory: { lastIntent: 'student-list' },
    };
  }

  // Course abbreviations such as EDG and PPS, before generic timetable/teacher matching.
  const courseAlias = findCourseAlias(nq);
  if (courseAlias && !/\b(papers?|syllabus|question|previous|exam|result|fee)\b/.test(nq)) {
    return answerCourseAlias(courseAlias, data, nq);
  }

  // Contacts and college facts.
  if (/\b(principal|hod|head of department|contact|phone|email|reception)\b/.test(nq)) {
    const contact = answerContact({ data, nq });
    if (contact) return contact;
  }
  if (/\b(established|foundation|founded|acres|autonomous|affiliated|hostel|library timing|library hours|college timing|college address|address of college)\b/.test(nq)) {
    const facts = data.campus?.facts || {};
    const lines = [];
    if (nq.includes('established') || nq.includes('founded') || nq.includes('foundation')) lines.push(`GNDEC was established in **${facts.established || 1953}**.`);
    if (nq.includes('acres')) lines.push(`The campus is about **${facts.campusAcres || 86} acres**.`);
    if (nq.includes('autonomous')) lines.push(`GNDEC is an **autonomous** institute${facts.affiliatedTo ? `, affiliated to ${facts.affiliatedTo}` : ''}.`);
    if (nq.includes('affiliated')) lines.push(`Affiliation: **${facts.affiliatedTo || 'IK Gujral Punjab Technical University (PTU)'}**.`);
    if (nq.includes('address') || nq.includes('where is college') || nq.includes('where is gndec')) lines.push(`Address: **${facts.address || 'Gill Park, Gill Road, Ludhiana, Punjab 141006'}**.`);
    if (nq.includes('hostel')) lines.push(`Hostels: ${facts.hostels || 'Three boys’ hostels and one girls’ hostel.'}`);
    if (nq.includes('library')) lines.push(`Library hours: weekdays **${facts.libraryHours?.weekdays || '8:00 am – 10:00 pm'}**, weekends **${facts.libraryHours?.weekend || '9:00 am – 5:00 pm'}**.`);
    if (nq.includes('phone') || nq.includes('contact')) lines.push(`College phone: **${facts.phone || '0161-5064501'}** · Email: **${facts.email || 'principal@gndec.ac.in'}**.`);
    if (!lines.length) lines.push(`GNDEC is at **${facts.address}**. Campus: ${facts.campusAcres} acres, established ${facts.established}.`);
    return {
      intent: 'facts',
      confidence: 'high',
      text: lines.join('\n'),
      actions: [action('Open campus map', '/map', 'map'), action('Official GNDEC site', 'https://gndec.ac.in/', 'external')],
      memory: { lastIntent: 'facts' },
    };
  }

  // Current/next class before generic place lookup, so "where is my class" does not become a map search.
  if (isNowClassQuery(nq, explicitSection, place)) {
    return answerTimetable({ data, profile, memory, nq, section: activeSection, dayInfo, now, nowIntent: true });
  }

  // Faculty and subject-teacher questions before generic place scoring.
  if (faculty && !/\bhow many|count\b/.test(nq)) return answerFaculty(faculty, data, memory);
  if (/\b(teach\w*|faculty|professor\w*|who teaches|kis teacher)\b/.test(nq)) {
    const subject = findPaperSubject(nq, data);
    const subjectWordMatch = nq.match(
      /\b(maths?|physics|chemistry|programming|electronics|civil|mechanical|electrical|data structures|dbms|os|networks|english|economics|drawing)\b/,
    );
    const subjectPhrase = nq
      .replace(/\b(who|which|what|teach\w*|for|subject|subjects|is|are|the|of|class|classes|teacher|teachers)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const allLectures = (data.timetable?.sections || []).flatMap((sectionItem) =>
      (sectionItem.lectures || []).map((lecture) => ({ ...lecture, sectionId: sectionItem.id })),
    );
    const scopeSection = explicitSection || (profile?.sectionId ? findSection(data.timetable, profile.sectionId) : null);
    const scopedLectures = (scopeSection?.lectures || []).map((lecture) => ({ ...lecture, sectionId: scopeSection.id }));
    const scopedMatches = subjectPhrase.length >= 3
      ? scopedLectures.filter((lecture) => norm(lecture.subject).includes(subjectPhrase))
      : [];
    const scopedWordMatches = subjectWordMatch
      ? scopedLectures.filter((lecture) => norm(lecture.subject).includes(subjectWordMatch[0]))
      : [];
    const phraseMatches = subjectPhrase.length >= 3
      ? allLectures.filter((lecture) => norm(lecture.subject).includes(subjectPhrase))
      : [];
    const teacherMatches = scopedMatches.length
      ? scopedMatches
      : scopedWordMatches.length
        ? scopedWordMatches
        : phraseMatches.length
          ? phraseMatches
          : allLectures.filter((lecture) => {
              const subjectText = norm(lecture.subject);
              const byWord = subjectWordMatch ? subjectText.includes(subjectWordMatch[0]) : false;
              const byCode = subject?.code ? subjectText.includes(subject.code.split('-')[0].toLowerCase()) : false;
              return byWord || byCode;
            });
    if (teacherMatches.length) {
      const teachers = [
        ...new Set(
          teacherMatches.flatMap((lecture) => (lecture.teachers?.length ? lecture.teachers : lecture.teacher ? [lecture.teacher] : [])),
        ),
      ];
      const label = phraseMatches.length && subjectPhrase ? subjectPhrase : subjectWordMatch ? subjectWordMatch[0] : subject?.code || 'that subject';
      const shownTeachers = teachers.slice(0, 8);
      return {
        intent: 'subject-teacher',
        confidence: 'medium',
        text: `${scopedMatches.length || scopedWordMatches.length ? `In **${scopeSection.label}**, **${label}**` : `From the current timetable, **${label}**`} classes list: ${shownTeachers.length ? shownTeachers.map((name) => `**${name}**`).join(', ') : 'no teacher name'}${teachers.length > shownTeachers.length ? ` and ${teachers.length - shownTeachers.length} more` : ''}. The timetable does not prove who is the official course coordinator.`,
        actions: [
          action('Open teacher timetable', `/timetable?teacher=${encodeURIComponent(teachers[0] || '')}`, 'timetable'),
          action('Open Study hub', '/study', 'study'),
        ],
        memory: { lastSubject: subject?.code || label, lastIntent: 'subject-teacher' },
      };
    }
    if (subject) {
      return {
        intent: 'subject-teacher',
        confidence: 'low',
        text: `I found **${subject.code}** study records, but no timetable lecture with a teacher name for that subject in the current export. The timetable is only complete for first year and partial for some later-year groups.`,
        actions: [action('Open papers for this subject', `/study?tab=papers&q=${encodeURIComponent(subject.code)}`, 'study')],
        memory: { lastSubject: subject.code, lastIntent: 'subject-teacher' },
      };
    }
  }

  // Campus route/place/room.
  if (nq.includes('route') || nq.includes('direction') || nq.includes('distance') || nq.includes('how to reach') || nq.includes('where is') || nq.includes('kahan')) {
    if (room) return answerRoom(room, data, memory);
    const extracted = extractRoute(nq, data);
    const destination = extracted.to || place;
    const origin = extracted.from || findPlace('main gate', data) || { id: 'main-gate' };
    if (destination) {
      const route = findRoute(data.campus, origin?.id || 'main-gate', destination.id);
      const lines = [
        `**${destination.name}**`,
        destination.description || '',
        route
          ? `From **${origin?.name || 'Main Gate'}**: about **${Math.round(route.meters)} m** · **${route.minutes} min walk** (estimate, not a live route).\n${route.steps.slice(0, 4).map((step, index) => `${index + 1}. ${step.instruction}`).join('\n')}`
          : 'A route could not be calculated from the available campus graph.',
        route?.approx ? 'Route distances are approximate. Check campus signs and closures.' : '',
      ].filter(Boolean);
      return {
        intent: 'route',
        confidence: route?.verified ? 'high' : 'medium',
        text: lines.join('\n'),
        actions: [
          action('Open photo-guided route', `/map?from=${origin?.id || 'main-gate'}&to=${destination.id}&guide=1`, 'map'),
          action('See place photos', `/map?to=${destination.id}`, 'camera'),
        ],
        memory: { lastPlaceId: destination.id, lastIntent: 'route' },
      };
    }
  }

  if (place && !/\btimetable|paper|notice|syllabus|student|teacher|faculty|teach|class|lecture|periods?\b|breaks?\s+(today|tomorrow|on|for|between)/.test(nq)) {
    return answerPlace(place, data, nq, memory);
  }
  if (room && !/\bfree\b/.test(nq)) return answerRoom(room, data, memory);

  // Notices, exams and holidays.
  if (/\bnotice|notices|circular|update|news|holiday|holidays|exam|exams|date sheet|datesheet|result|event\b/.test(nq)) {
    return answerNotices({ data, nq, memory });
  }

  // Study resources.
  const study = answerStudy({ data, nq });
  if (study) return study;

  // Free rooms and timetable intents.
  if (/\bfree room|\bfree rooms|room availability|which room|khali room\b/.test(nq)) {
    return answerFreeRooms({ data, nq, dayInfo, now });
  }
  if (/\btimetable|class|classes|schedule|lecture|period|periods|free period|free periods|breaks?\s+(today|tomorrow|on|for|between)|gaps?\s+between|next class|what do i have\b/.test(nq)) {
    return answerTimetable({ data, profile, memory, nq, section: activeSection, dayInfo, teacher: faculty, room, student, now });
  }

  // Student lookup fallback (for "who is ..." or a name-only query).
  if (student) return answerStudent(student, data, profile, memory);

  // Places / rooms named without "where".
  if (place && findPlace(original, data)) return answerPlace(place, data, nq, memory);

  // Broad fallback: show the best grounded matches instead of inventing an answer.
  const candidateTerms = nq.split(' ').filter((word) => word.length > 3 && !STOP_WORDS.has(word));
  const suggestions = [];
  if (candidateTerms.length) {
    for (const sectionItem of data.timetable?.sections || []) {
      if (sectionItem.lectures?.some((lecture) => candidateTerms.some((term) => norm(lecture.subject).includes(term)))) {
        suggestions.push({ title: sectionItem.label, subtitle: 'Timetable section with a matching subject', path: `/timetable?section=${sectionItem.id}` });
      }
      if (suggestions.length >= 3) break;
    }
  }
  return {
    intent: 'unknown',
    confidence: 'low',
    text: [
      'I could not match that to a verified record, so I will not guess.',
      'Try one of these:',
      '• “ECE B1 timetable tomorrow”',
      '• “Where is the admission cell?”',
      '• “Kaushik Jain 2617070”',
      '• “Free rooms period 3”',
      '• “AM-101 previous papers”',
      '• “Latest notices” or “upcoming holidays”',
      'If it is a changing rule, fee, result or date sheet, use the official GNDEC/ERP source.',
    ].join('\n'),
    actions: [action('Open official GNDEC site', 'https://gndec.ac.in/', 'external')],
    chips: ['My next class', 'Where is the library?', 'Latest notices', 'AM-101 papers'],
    memory: { lastIntent: 'unknown' },
    matches: suggestions,
  };
}

export const ASSISTANT_STARTERS = [
  'My next class',
  'Show ECE B1 timetable',
  'Where is the admission cell?',
  'Free rooms period 3',
  'Who is Kaushik Jain?',
  'AM-101 previous papers',
  'Latest notices',
  'Upcoming holidays',
  'How many students in CS?',
  'How do I reach the library?',
  'Who teaches Math I?',
  'What is 18% of 450?',
];

export function assistantSuggestions(profile, data) {
  const section = profile?.sectionId ? findSection(data?.timetable, profile.sectionId) : null;
  const base = [
    'My next class',
    'My timetable tomorrow',
    section ? `Free rooms on ${DAYS[dayIndexFor(new Date())] || 'Monday'}` : 'Show ECE B1 timetable',
    'Where is the library?',
    'Latest notices',
    'Upcoming holidays',
  ];
  if (profile?.crn) base.splice(2, 0, 'My mentor');
  return [...new Set(base)];
}
