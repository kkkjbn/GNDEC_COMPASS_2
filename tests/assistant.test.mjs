import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { answerQuestion } from '../src/lib/assistant.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', `${name}.json`), 'utf8'));

const data = {
  timetable: read('timetable'),
  students: read('students'),
  faculty: read('faculty'),
  rooms: read('rooms'),
  papers: read('papers'),
  syllabus: read('syllabus'),
  notices: read('notices'),
  campus: read('campus'),
  contacts: read('contacts'),
  sources: read('sources'),
  branches: read('branches'),
};

const profile = { name: 'Kaushik Jain', crn: '2617070', sectionId: 'ECB' };
const now = new Date('2026-11-03T15:30:00+05:30');
const ask = (query) => answerQuestion(query, { data, profile, memory: {}, now });

const cases = [
  ['where is ECB B1 right now', 'next-class', /PROGRAMMING|Section/],
  ['my next class', 'next-class', /PROGRAMMING|Section/],
  ['mera next class', 'next-class', /PROGRAMMING|Section/],
  ['where is my class', 'next-class', /PROGRAMMING|Section/],
  ['class kahan hai', 'next-class', /PROGRAMMING|Section/],
  ['A9 kahan hai', 'room', /Automobile Block/],
  ['where is F107', 'room', /F-Block/],
  ['who teaches Math I', 'subject-teacher', /Sukhminder Singh/],
  ['ECE de teachers kitne hai', 'faculty-count', /faculty directory/],
  ['how many students in CS', 'branch-student-count', /379/],
  ['how many students in ECE B1', 'section-student-count', /64/],
  ['CSE D timetable', 'timetable', /Group D/],
  ['D2CSB timetable', 'timetable', /2nd Year/],
  ['kal ki timetable', 'timetable', /Wednesday/],
  ['ECE B1 free periods', 'free-periods', /subsection ECB1/],
  ['ECE B1 breaks today', 'free-periods', /Breaks and free periods/],
  ['free rooms period 3', 'free-rooms', /look free/],
  ['AM-101 previous papers', 'papers', /AM-101/],
  ['what is 18% of 450', 'math', /81/],
  ['where is the library', 'route', /Central Library/],
  ['where is the canteen near ECB', 'route', /Day Scholar Canteen/],
  ['what is EDG', 'glossary', /Engineering Drawing and Graphics/],
  ['PPS full form', 'glossary', /Programming for Problem Solving/],
  ['who teaches EDG', 'subject-teacher', /Engineering Drawing and Graphics/],
  ['EDG timetable', 'timetable', /Engineering Drawing and Graphics/],
];

for (const [query, intent, pattern] of cases) {
  test(`assistant: ${query}`, () => {
    const answer = ask(query);
    assert.equal(answer.intent, intent, `${query} → ${answer.intent}: ${answer.text}`);
    assert.match(answer.text, pattern);
  });
}

test('assistant personalizes a first-year timetable with the mentoring group', () => {
  const studentProfile = {
    name: 'Kaushik Jain',
    crn: '2617070',
    sectionId: 'ECB',
    subsection: 'ECB1',
    academicGroup: 'ECBM1',
    mentor: 'Dr. Chahat Jain',
    mentorPhone: '7837005620',
    mentorVenue: 'G6',
  };
  const answer = answerQuestion('Monday timetable', { data, profile: studentProfile, memory: {}, now });
  assert.equal(answer.intent, 'timetable');
  assert.match(answer.text, /ECBM1/);
  assert.match(answer.text, /Dr\. Chahat Jain/);
  assert.match(answer.text, /G6/);
});

test('assistant resolves relative days with typos and IST dates', () => {
  const variants = ['csd2 tomorrow', 'csd2 tommorow', 'csd2 tommorrow', 'csd2 tomorow', 'csd2 kal'];
  for (const query of variants) {
    const answer = answerQuestion(query, { data, profile: {}, memory: {}, now });
    assert.equal(answer.intent, 'timetable', `${query} → ${answer.intent}: ${answer.text}`);
    assert.match(answer.text, /Wednesday · 2026-11-04/, query);
    assert.match(answer.text, /CHEMISTRY L[\s\S]*F114[\s\S]*Dr\. Amandeep Kaur/, query);
    assert.match(answer.text, /BASIC ELECTRICAL AND ELECTRONICS ENGINEERING L[\s\S]*F108/, query);
  }
});

test('assistant calendar rolls over on IST midnight, not device midnight', () => {
  // 19:00 UTC on 3 Nov is 00:30 IST on 4 Nov.
  const afterIstMidnight = new Date('2026-11-03T19:00:00Z');
  const answer = answerQuestion('csd2 today', { data, profile: {}, memory: {}, now: afterIstMidnight });
  assert.equal(answer.intent, 'timetable');
  assert.match(answer.text, /Wednesday · 2026-11-04/);
});

test('assistant reports the current time in IST', () => {
  const answer = answerQuestion('what time is it', { data, profile: {}, memory: {}, now: new Date('2026-11-03T17:31:00Z') });
  assert.equal(answer.intent, 'time');
  assert.match(answer.text, /11:01 PM IST/);
  assert.match(answer.text, /Tuesday, 03 November 2026/);
  assert.match(answer.text, /Timetable day: \*\*Tuesday\*\*/);
});
