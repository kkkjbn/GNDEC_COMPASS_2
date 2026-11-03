import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { personalizeSection, freeClassrooms, roomBlocks, isMentoringLecture } from '../src/lib/timetable.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', `${name}.json`), 'utf8'));

const timetable = read('timetable');
const rooms = read('rooms');
const roomTimetable = read('room-timetable');
const students = read('students');

const student = (crn) => students.records.find((record) => record.crn === crn);
const data = { timetable, rooms, roomTimetable };

const profileFor = (record) => ({
  name: record.name,
  crn: record.crn,
  sectionId: record.section,
  subsection: record.subsection,
  academicGroup: record.academicGroup,
  mentor: record.mentor,
  mentorPhone: record.mentorPhone,
  mentorVenue: record.mentorVenue,
});

test('official room timetable covers published years and every block', () => {
  assert.equal(roomTimetable.count, 99);
  assert.deepEqual(roomTimetable.coverage.yearsPublished.sort(), [1, 2, 3]);
  assert.ok(roomTimetable.coverage.yearsMissing.includes(4));
  assert.ok(roomTimetable.rooms.length === 99);
  assert.ok(roomTimetable.rooms.every((room) => Array.isArray(room.occupancy)));
  assert.ok(roomTimetable.rooms.some((room) => room.block === 'F-Block'));
  assert.ok(roomTimetable.rooms.some((room) => room.block === 'S-Block'));
  assert.ok(roomTimetable.rooms.some((room) => room.block === 'G-Block'));
});

test('Central Library is published as an open study space and never marked busy', () => {
  const library = rooms.rooms.find((room) => /central library/i.test(room.code));
  assert.ok(library, 'Central Library must be present in rooms.json');
  assert.equal(library.openStudySpace, true);
  const free = freeClassrooms(data, 0, 0);
  const listed = free.find((room) => room.id === library.id);
  assert.ok(listed, 'Central Library must appear in the free-room list');
  assert.equal(listed.alwaysFree, true);
  assert.equal(listed.roomKind, 'Open study space');
});

test('free-room blocks are derived from published rooms instead of a fixed list', () => {
  const blocks = roomBlocks(data).map((block) => block.value);
  assert.ok(blocks.includes('Central Library'));
  assert.ok(blocks.length >= 10);
});

test('ECB1 / ECBM1 profile gets its own mentoring slot, mentor and venue', () => {
  const record = student('2617070');
  assert.equal(record.academicGroup, 'ECBM1');
  assert.equal(record.mentor, 'Dr. Chahat Jain');
  assert.equal(record.mentorPhone, '7837005620');
  const section = personalizeSection(timetable, profileFor(record));
  assert.ok(section, 'personalized section must resolve');
  assert.equal(section.academicGroup, 'ECBM1');
  assert.equal(section.cohortId, 'ECB1');
  const mentoring = section.lectures.filter(isMentoringLecture);
  assert.ok(mentoring.length >= 1, 'mentoring class must be merged into the section timetable');
  const slot = mentoring.find((lecture) => lecture.day === 0 && lecture.period === 5);
  assert.ok(slot, 'ECBM1 mentoring slot (Mon P6) must be present');
  assert.equal(slot.mentoringGroup, 'ECBM1');
  assert.equal(slot.teacher, 'Dr. Chahat Jain');
  assert.equal(slot.room, 'G6');
  assert.ok(!section.lectures.some((lecture) => isMentoringLecture(lecture) && lecture.mentoringGroup === 'ECBM3'));
});

test('CEA1 / CEAM1 mentoring room is not the subgroup code', () => {
  const record = students.records.find((item) => item.section === 'CEA' && item.subsection === 'CEA1');
  const section = personalizeSection(timetable, profileFor(record));
  const mentoring = section.lectures.filter(isMentoringLecture);
  assert.ok(mentoring.length >= 1);
  for (const lecture of mentoring) {
    assert.notEqual(lecture.room, 'CEA1');
    assert.notEqual(lecture.room, 'CEAM1');
  }
  assert.ok(mentoring.some((lecture) => lecture.room === record.mentorVenue));
});

test('CSD1 / CSDM1 mentoring slot inherits the roster venue when FET leaves it blank', () => {
  const record = students.records.find((item) => item.section === 'CSD' && item.subsection === 'CSD1');
  const section = personalizeSection(timetable, profileFor(record));
  const mentoring = section.lectures.filter(isMentoringLecture);
  assert.ok(mentoring.length >= 1);
  assert.ok(mentoring.some((lecture) => lecture.room === record.mentorVenue));
});

test('roster carries legacy serial and mentor phone fields', () => {
  assert.ok(students.roster.legacyMatched > 1000);
  assert.ok(students.records.filter((record) => record.mentorPhone).length > 1000);
  const record = student('2617070');
  assert.equal(record.serialNo, '68');
  assert.equal(record.currentSerialNo, '68');
  assert.equal(record.venue, 'G6');
});

test('web UI no longer links to external map or location services', () => {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(jsx?|css)$/.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(root, 'src'));
  const text = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  for (const forbidden of ['Use my location', 'openstreetmap.org', 'google.com/maps', 'Shared campus map', 'gndpoly.org/CollegeMap2']) {
    assert.ok(!text.includes(forbidden), `src still references ${forbidden}`);
  }
  const campus = fs.readFileSync(path.join(root, 'public', 'data', 'campus.json'), 'utf8');
  assert.ok(!/openstreetmap|google\.com\/maps|mapLinks|gndpoly\.org/i.test(campus));
});
