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
const now = new Date(2026, 10, 3, 15, 30, 0);
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
  ['free rooms period 3', 'free-rooms', /look free/],
  ['AM-101 previous papers', 'papers', /AM-101/],
  ['what is 18% of 450', 'math', /81/],
  ['where is the library', 'route', /Central Library/],
  ['where is the canteen near ECB', 'route', /Day Scholar Canteen/],
];

for (const [query, intent, pattern] of cases) {
  test(`assistant: ${query}`, () => {
    const answer = ask(query);
    assert.equal(answer.intent, intent, `${query} → ${answer.intent}: ${answer.text}`);
    assert.match(answer.text, pattern);
  });
}
