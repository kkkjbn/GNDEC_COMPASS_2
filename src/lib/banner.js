import { clamp, dateKey, readStorage, writeStorage } from './utils.js';

export const BANNER_STORAGE_KEY = 'compass2.noticeBanner';
export const BANNER_CACHE_KEY = 'compass2.noticeBannerCache';
export const BANNER_DISMISS_KEY = 'compass2.dismissedTopNotices';
export const BANNER_API = '/api/notice-banner';
export const NOTICE_WINDOW_DAYS = 3;
export const HOLIDAY_WINDOW_DAYS = 5;

export const DEFAULT_BANNER_CONFIG = Object.freeze({
  durationDays: NOTICE_WINDOW_DAYS,
  hiddenNoticeIds: [],
  hiddenAll: false,
  updatedAt: null,
});

const normalizeConfig = (value = {}) => {
  const duration = Number(value.durationDays);
  return {
    durationDays: Number.isFinite(duration) ? clamp(Math.round(duration), 1, 14) : DEFAULT_BANNER_CONFIG.durationDays,
    hiddenNoticeIds: Array.isArray(value.hiddenNoticeIds)
      ? [...new Set(value.hiddenNoticeIds.filter((item) => typeof item === 'string' && item.trim()))]
      : [],
    hiddenAll: Boolean(value.hiddenAll),
    updatedAt: value.updatedAt || null,
  };
};

export const readBannerConfig = () => normalizeConfig(readStorage(BANNER_STORAGE_KEY, DEFAULT_BANNER_CONFIG));

export const BANNER_EVENT = 'compass:banner-config';

export const writeBannerConfig = (config) => {
  const next = normalizeConfig(config);
  writeStorage(BANNER_STORAGE_KEY, next);
  return next;
};

const broadcastBannerConfig = (config) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BANNER_EVENT, { detail: config }));
};

/** Best cached config, used while the API is offline or still loading. */
export const readCachedBannerConfig = () =>
  normalizeConfig(readStorage(BANNER_CACHE_KEY, readBannerConfig()));

const dateKeyToUtc = (value) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

/** Whole calendar days from `fromDate` to `toDate` (both YYYY-MM-DD). */
export const daysBetweenKeys = (fromDate, toDate) => {
  const from = dateKeyToUtc(fromDate);
  const to = dateKeyToUtc(toDate);
  if (from === null || to === null) return null;
  return Math.round((to - from) / 86400000);
};

export const noticeAgeDays = (notice, now = new Date()) => {
  if (!notice?.date) return null;
  return daysBetweenKeys(notice.date, dateKey(now));
};

/** Notices published within the admin-configured window, newest first. */
export const eligibleTopNotices = (notices = [], config = DEFAULT_BANNER_CONFIG, now = new Date()) => {
  if (config.hiddenAll) return [];
  const hidden = new Set(config.hiddenNoticeIds || []);
  const duration = normalizeConfig(config).durationDays;
  return notices
    .filter((notice) => {
      if (!notice?.id || hidden.has(notice.id) || !notice.date) return false;
      const age = noticeAgeDays(notice, now);
      return age !== null && age >= 0 && age < duration;
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
};

export const currentTopNotice = (notices = [], config = DEFAULT_BANNER_CONFIG, now = new Date()) =>
  eligibleTopNotices(notices, config, now)[0] || null;

export const isNoticeHidden = (noticeId, config = DEFAULT_BANNER_CONFIG) =>
  Boolean(config.hiddenAll) || (config.hiddenNoticeIds || []).includes(noticeId);

/** Split a list into the newest notice plus how many more are in the window. */
export const topNoticeSummary = (notices = [], config = DEFAULT_BANNER_CONFIG, now = new Date()) => {
  const eligible = eligibleTopNotices(notices, config, now);
  return { notice: eligible[0] || null, extraCount: Math.max(0, eligible.length - 1), eligible };
};

export const isFullDayHoliday = (holiday = {}) => {
  const category = String(holiday.category || holiday.type || '').toLowerCase();
  if (holiday.closed === false) return false;
  if (category.includes('restricted') || category.includes('optional')) return false;
  if (category.includes('half')) return false;
  return true;
};

/**
 * Legacy GNDEC rule: a full-day/gazetted holiday is announced from five days
 * before the holiday through the holiday itself. Restricted and half-day
 * holidays are never promoted to the campus banner.
 */
export const currentHolidayBanner = (holidays = [], now = new Date()) => {
  const today = dateKey(now);
  const next = holidays
    .filter((holiday) => holiday?.date && holiday.date >= today && isFullDayHoliday(holiday))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  const daysUntil = daysBetweenKeys(today, next.date);
  if (daysUntil === null || daysUntil < 0 || daysUntil > HOLIDAY_WINDOW_DAYS) return null;
  return { holiday: next, daysUntil };
};

export const holidayHeadline = ({ holiday, daysUntil }) => {
  if (daysUntil === 0) return `Today is a holiday: ${holiday.name}`;
  if (daysUntil === 1) return `Tomorrow is a holiday: ${holiday.name}`;
  return `Upcoming holiday: ${holiday.name} in ${daysUntil} days`;
};

const withTimeout = async (promise, timeoutMs) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export const fetchBannerConfig = async ({ timeoutMs = 4500 } = {}) => {
  try {
    const response = await withTimeout(fetch(BANNER_API, { cache: 'no-store' }), timeoutMs);
    if (!response?.ok) return null;
    const payload = await response.json();
    if (!payload?.config) return null;
    const config = normalizeConfig(payload.config);
    writeStorage(BANNER_CACHE_KEY, config);
    broadcastBannerConfig(config);
    return config;
  } catch {
    return null;
  }
};

const saveRequest = async (method, config, adminHash) => {
  const response = await fetch(BANNER_API, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-admin-hash': adminHash || '',
    },
    body: method === 'DELETE' ? undefined : JSON.stringify(normalizeConfig(config)),
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    /* an empty error body is still an error */
  }
  if (!response.ok) {
    throw new Error(payload.error || `The banner API returned ${response.status}.`);
  }
  const next = normalizeConfig({ ...DEFAULT_BANNER_CONFIG, ...payload.config });
  writeBannerConfig(next);
  writeStorage(BANNER_CACHE_KEY, next);
  broadcastBannerConfig(next);
  return next;
};

export const saveBannerConfig = (config, adminHash) => saveRequest('PUT', config, adminHash);
export const resetBannerConfig = (adminHash) => saveRequest('DELETE', DEFAULT_BANNER_CONFIG, adminHash);

export const readDismissedNoticeIds = () => {
  const value = readStorage(BANNER_DISMISS_KEY, []);
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
};

export const dismissNoticeForBrowser = (noticeId) => {
  if (!noticeId) return;
  const next = [...new Set([...readDismissedNoticeIds(), noticeId])].slice(-50);
  writeStorage(BANNER_DISMISS_KEY, next);
};

export const restoreDismissedNotices = () => {
  writeStorage(BANNER_DISMISS_KEY, []);
};
