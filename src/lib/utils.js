export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const BRANCH_META = {
  CE: { name: 'Civil Engineering', short: 'Civil', color: '#b4763f' },
  CS: { name: 'Computer Science & Engineering', short: 'CSE', color: '#4766c7' },
  EC: { name: 'Electronics & Communication', short: 'ECE', color: '#138a72' },
  EE: { name: 'Electrical Engineering', short: 'EE', color: '#c49a25' },
  IT: { name: 'Information Technology', short: 'IT', color: '#7d56b8' },
  ME: { name: 'Mechanical Engineering', short: 'ME', color: '#c6583e' },
  RAI: { name: 'Robotics & AI', short: 'RAI', color: '#0e7e9e' },
  ARCH: { name: 'School of Architecture', short: 'B.Arch', color: '#8a6d3b' },
  BVOC: { name: 'B.Voc', short: 'B.Voc', color: '#6f7d34' },
  BCA: { name: 'BCA', short: 'BCA', color: '#496f9c' },
  MCA: { name: 'MCA', short: 'MCA', color: '#6f4d91' },
  BCOM: { name: 'B.Com', short: 'B.Com', color: '#8c6a3f' },
  BBA: { name: 'BBA', short: 'BBA', color: '#9a5b72' },
};

export const BRANCH_ALIASES = {
  CE: ['ce', 'civil', 'civil engineering'],
  CS: ['cs', 'cse', 'c s e', 'computer science', 'computer sciences', 'computers', 'software'],
  EC: ['ec', 'ece', 'electronics', 'electronics and communication', 'electronics communication'],
  EE: ['ee', 'electrical', 'electrical engineering'],
  IT: ['it', 'information technology', 'info tech'],
  ME: ['me', 'mechanical', 'mechanical engineering'],
  RAI: ['rai', 'robotics', 'artificial intelligence', 'ai', 'robotics and ai'],
  ARCH: ['arch', 'architecture', 'b arch', 'barch'],
  BVOC: ['bvoc', 'b voc', 'vocational'],
  BCA: ['bca'],
  MCA: ['mca'],
  BCOM: ['bcom', 'b com', 'commerce'],
  BBA: ['bba', 'business administration', 'management'],
};

export const norm = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9+*/%.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const compact = (value = '') => norm(value).replace(/[^a-z0-9]/g, '');

export const titleCase = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bIit\b/g, 'IIT')
    .replace(/\bEce\b/g, 'ECE')
    .replace(/\bCse\b/g, 'CSE');

export const initials = (value = 'GN') =>
  String(value)
    .replace(/^(dr|mr|mrs|ms|er|prof)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'GN';

export const photoPath = (src = '') => {
  if (!src) return '/img/gallery/campus-courtyard.jpg';
  if (src.endsWith('/main-gate.jpg')) return '/img/hero/gndec_gne_front.jpg';
  if (src.endsWith('/library.jpg')) return '/img/gallery/library-sign.jpg';
  if (src.startsWith('/assets/img/')) return src.replace('/assets/img/', '/img/');
  if (src.startsWith('assets/img/')) return '/' + src.replace('assets/img/', 'img/');
  return src;
};

export const timeToMin = (value = '00:00') => {
  const [hours, minutes] = String(value).split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

export const minToTime = (minutes) => {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
};

export const formatClock = (value) => {
  const minutes = typeof value === 'number' ? value : timeToMin(value);
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const suffix = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 || 12;
  return `${hour12}${mins ? `:${String(mins).padStart(2, '0')}` : ''} ${suffix}`;
};

// Wall-clock label for a Date whose local getters already represent the target zone.
export const clockLabel = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const suffix = d.getHours() >= 12 ? 'PM' : 'AM';
  const hour = d.getHours() % 12 || 12;
  return `${hour}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
};

export const dateKey = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const IST_TIME_ZONE = 'Asia/Kolkata';
export const IST_OFFSET_MINUTES = 330;

const istPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

// Numeric IST wall-clock parts for an instant, independent of the device timezone.
export const istParts = (date = new Date()) => {
  const target = date instanceof Date ? date : new Date(date);
  const parts = {};
  for (const part of istPartsFormatter.formatToParts(target)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  if (parts.hour === 24) parts.hour = 0;
  return parts;
};

// A Date whose local getters read as IST wall-clock time. Safe for day/date arithmetic.
export const istDate = (date = new Date()) => {
  const parts = istParts(date);
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
};

export const istDateKey = (date = new Date()) => {
  const parts = istParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

export const istStamp = (date = new Date()) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date instanceof Date ? date : new Date(date));

export const istClock = (date = new Date()) => {
  const parts = istParts(date);
  const suffix = parts.hour >= 12 ? 'PM' : 'AM';
  const hour = parts.hour % 12 || 12;
  return `${hour}:${String(parts.minute).padStart(2, '0')} ${suffix}`;
};

export const istDateTimeLabel = (date = new Date()) => `${istStamp(date)} · ${istClock(date)} IST`;

export const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

// The official timetable uses Monday = 0. Sunday returns -1.
export const dayIndexFor = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const jsDay = d.getDay();
  return jsDay === 0 ? -1 : jsDay - 1;
};

export const dayNameFor = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  return ['Sunday', ...DAYS][d.getDay() === 0 ? 0 : d.getDay()];
};

export const longDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(
    date instanceof Date ? date : new Date(date),
  );

export const shortDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(
    date instanceof Date ? date : new Date(date),
  );

export const dateTimeLabel = (value) => {
  const date = parseDate(value);
  if (!date) return value || '';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

export const relativeDay = (value) => {
  const date = parseDate(value);
  if (!date) return '';
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((target - start) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 8) return `In ${diff} days`;
  if (diff < -1 && diff > -8) return `${Math.abs(diff)} days ago`;
  return dateTimeLabel(value);
};

export const secondsLabel = (date) => {
  const diff = Math.max(0, Math.round((date.getTime() - Date.now()) / 1000));
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

export const sortByDateDesc = (items, key = 'date') =>
  [...items].sort((a, b) => String(b[key] || '').localeCompare(String(a[key] || '')));

export const sortByDateAsc = (items, key = 'date') =>
  [...items].sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || '')));

export const uniqueBy = (items, keyFn = (x) => x.id) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const groupBy = (items, keyFn) =>
  items.reduce((groups, item) => {
    const key = keyFn(item);
    (groups[key] ||= []).push(item);
    return groups;
  }, {});

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const plural = (count, single, multiple = `${single}s`) => `${count} ${count === 1 ? single : multiple}`;

export const pct = (value, total) => (total ? Math.round((value / total) * 100) : 0);

export const branchName = (code = '') => BRANCH_META[code]?.name || code || 'GNDEC';

export const branchShort = (code = '') => BRANCH_META[code]?.short || code || 'GNDEC';

export const branchColor = (code = '') => BRANCH_META[code]?.color || '#0e6b4f';

export const yearLabel = (year) =>
  ({ 1: '1st year', 2: '2nd year', 3: '3rd year', 4: '4th year' })[year] || (year ? `${year} year` : 'Year not listed');

export const semesterLabel = (semester) => (semester ? `Sem ${semester}` : 'Semester not listed');

export const programLabel = (program = '') =>
  ({ BTECH: 'B.Tech', BARCH: 'B.Arch', BVOC: 'B.Voc', BCA: 'BCA', MCA: 'MCA', BCOM: 'B.Com', BBA: 'BBA' })[
    String(program).toUpperCase()
  ] || program;

export const sectionLabel = (section) => {
  if (!section) return 'Choose a section';
  if (section.label) return section.label;
  return `${yearLabel(section.year)} · ${branchShort(section.branch)}${section.group ? ` · ${section.group}` : ''}`;
};

const TITLE_PREFIX = /^(dr|mr|mrs|ms|er|prof|professor|shri|smt)\.?\s+/i;
export const personKey = (name = '') =>
  norm(String(name).replace(TITLE_PREFIX, ''))
    .split(' ')
    .filter(Boolean)
    .join(' ');

export const personTokens = (name = '') => personKey(name).split(' ').filter((token) => token.length > 1);

export const levenshtein = (a = '', b = '') => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = current;
  }
  return prev[b.length];
};

export const fuzzyIncludes = (haystack = '', needle = '') => {
  const h = norm(haystack);
  const n = norm(needle);
  if (!n) return true;
  if (h.includes(n)) return true;
  const words = n.split(' ').filter((word) => word.length > 2);
  if (!words.length) return false;
  const hayWords = h.split(' ');
  return words.every((word) =>
    hayWords.some((candidate) => candidate.includes(word) || (word.length > 4 && levenshtein(candidate, word) <= 1)),
  );
};

export const searchScore = (text, query) => {
  const h = norm(text);
  const q = norm(query);
  if (!q) return 0;
  if (!h) return 0;
  if (h === q) return 140;
  if (h.startsWith(q)) return 110;
  if (h.includes(q)) return 90;
  const tokens = q.split(' ').filter(Boolean);
  const matched = tokens.filter((token) => h.includes(token));
  if (matched.length === tokens.length) return 70 + tokens.length;
  const fuzzy = tokens.filter((token) => h.split(' ').some((word) => levenshtein(word, token) <= 1));
  if (fuzzy.length === tokens.length) return 50;
  return matched.length ? 25 + matched.length : 0;
};

export const rankBy = (items, query, getText) =>
  items
    .map((item) => ({ item, score: searchScore(getText(item), query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);

export const readStorage = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const greeting = (date = new Date()) => {
  const hour = date.getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Working late';
};

export const safeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const downloadJson = (filename, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
