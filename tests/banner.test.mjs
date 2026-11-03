import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  currentHolidayBanner,
  currentTopNotice,
  daysBetweenKeys,
  eligibleTopNotices,
  isFullDayHoliday,
  noticeAgeDays,
} from '../src/lib/banner.js';
import { COLLEGE_DAY_END_MINUTES, findSection, lecturesOn, nextStudyDay, nowNextThen } from '../src/lib/timetable.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', `${name}.json`), 'utf8'));
const timetable = read('timetable');
const notices = read('notices');

const config = (patch = {}) => ({ durationDays: 3, hiddenNoticeIds: [], hiddenAll: false, updatedAt: null, ...patch });

test('calendar-day maths does not drift across month boundaries', () => {
  assert.equal(daysBetweenKeys('2026-10-31', '2026-11-03'), 3);
  assert.equal(daysBetweenKeys('2026-11-03', '2026-11-08'), 5);
  assert.equal(noticeAgeDays({ date: '2026-11-01' }, new Date(2026, 10, 3, 10, 0)), 2);
});

test('a top notice stays for the configured window, then expires', () => {
  const list = [{ id: 'a', title: 'A', date: '2026-11-01' }, { id: 'b', title: 'B', date: '2026-10-30' }];
  const dayOne = currentTopNotice(list, config(), new Date(2026, 10, 1, 9, 0));
  assert.equal(dayOne?.id, 'a');
  const dayThree = currentTopNotice(list, config(), new Date(2026, 10, 3, 9, 0));
  assert.equal(dayThree?.id, 'a', 'third day of a 3-day window must still show the notice');
  const dayFour = currentTopNotice(list, config(), new Date(2026, 10, 4, 9, 0));
  assert.equal(dayFour, null, 'notice must disappear after the window');
});

test('admin controls hide a notice or the whole banner for everyone', () => {
  const list = [
    { id: 'new', title: 'Newest notice', date: '2026-11-02' },
    { id: 'old', title: 'Older notice', date: '2026-11-01' },
  ];
  const now = new Date(2026, 10, 3, 9, 0);
  assert.equal(currentTopNotice(list, config(), now)?.id, 'new');
  assert.equal(currentTopNotice(list, config({ hiddenNoticeIds: ['new'] }), now)?.id, 'old');
  assert.equal(currentTopNotice(list, config({ hiddenAll: true }), now), null);
  assert.deepEqual(eligibleTopNotices(list, config({ durationDays: 14 }), now).map((item) => item.id), ['new', 'old']);
});

test('legacy holiday banner uses full-day holidays only, five days ahead', () => {
  const holidays = notices.holidays;
  const diwali = holidays.find((holiday) => holiday.name === 'Diwali');
  assert.ok(diwali);
  assert.equal(isFullDayHoliday(diwali), true);
  assert.equal(currentHolidayBanner(holidays, new Date(2026, 10, 2, 12)), null, 'six days early is too soon');
  assert.equal(currentHolidayBanner(holidays, new Date(2026, 10, 3, 12))?.daysUntil, 5);
  assert.equal(currentHolidayBanner(holidays, new Date(2026, 10, 8, 12))?.daysUntil, 0);
  assert.notEqual(currentHolidayBanner(holidays, new Date(2026, 10, 9, 12))?.holiday.name, 'Diwali');
  const restricted = holidays.find((holiday) => /restricted/i.test(holiday.category));
  assert.ok(restricted);
  assert.equal(isFullDayHoliday(restricted), false);
  const halfDay = holidays.find((holiday) => /half/i.test(holiday.category));
  assert.ok(halfDay);
  assert.equal(isFullDayHoliday(halfDay), false);
});

test('Today agenda follows the 5pm rule and moves to the next study day', () => {
  const section = findSection(timetable, 'ECB');
  assert.ok(section);
  const mondayEvening = new Date(2026, 10, 2, 18, 0);
  const agenda = nowNextThen(section, mondayEvening);
  assert.equal(agenda.mode, 'after-hours');
  assert.equal(agenda.current, null);
  assert.equal(agenda.nextDay.day, 1, 'Monday evening should point at Tuesday');
  assert.equal(agenda.next.subject, lecturesOn(section, 1)[0].subject);
  assert.equal(agenda.then.subject, lecturesOn(section, 1)[1].subject);

  const mondayClassTime = new Date(2026, 10, 2, 9, 45);
  const live = nowNextThen(section, mondayClassTime);
  assert.equal(live.mode, 'now');
  assert.ok(live.current, 'a class running at 9:45 should be current');
  assert.ok(live.next, 'the following class should be listed');

  const sunday = new Date(2026, 10, 8, 12, 0);
  const weekend = nowNextThen(section, sunday);
  assert.equal(weekend.mode, 'weekend');
  assert.equal(weekend.nextDay.day, 0, 'Sunday should look ahead to Monday');
  assert.equal(COLLEGE_DAY_END_MINUTES, 17 * 60);
});

test('next study day skips empty days and Sunday', () => {
  const section = findSection(timetable, 'ECB');
  const saturdayEvening = new Date(2026, 10, 7, 18, 0);
  const next = nextStudyDay(section, saturdayEvening);
  assert.equal(next.day, 0, 'Saturday evening should roll to Monday');
  const sunday = new Date(2026, 10, 8, 12, 0);
  assert.equal(nextStudyDay(section, sunday).day, 0);
});

test('worker exposes the notice banner API and KV binding', () => {
  const worker = fs.readFileSync(path.join(root, 'worker', 'index.js'), 'utf8');
  assert.match(worker, /\/api\/notice-banner/);
  assert.match(worker, /COMPASS_V2_KV/);
  assert.match(worker, /ADMIN_PASSCODE_HASH/);
  const wrangler = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
  assert.match(wrangler, /"main": "worker\/index\.js"/);
  assert.match(wrangler, /"binding": "COMPASS_V2_KV"/);
  assert.match(wrangler, /"binding": "ASSETS"/);
});
