import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = path.join(root, 'public', 'data');
const read = name => JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`), 'utf8'));

test('published timetable includes first-year EC and CS sections with sourced records', () => {
  const timetable = read('timetable');
  assert.match(timetable.source.url, /^https:\/\/appsc\.gndec\.ac\.in\//);
  for (const section of ['ECB', 'CSB']) assert.ok(timetable.sections.some(item => item.id === section && item.year === 1));
  assert.ok(timetable.sections.every(section => section.lectures.every(lecture => Number.isInteger(lecture.day) && lecture.start && lecture.end)));
});

test('campus routes reference known nodes and every place has a label and valid coordinates', () => {
  const campus = read('campus');
  const ids = new Set([...campus.junctions.map(x => x.id), ...campus.places.map(x => x.node).filter(Boolean)]);
  assert.ok(campus.places.length >= 30);
  assert.ok(campus.places.every(place => place.name && Number.isFinite(place.lat) && Number.isFinite(place.lon)));
  assert.ok(campus.edges.every(edge => ids.has(edge.a) && ids.has(edge.b)));
});

test('published photo files exist and the public roster omits private contact data', () => {
  const campus = read('campus');
  for (const item of campus.gallery) {
    if (!item.src) continue;
    let publicPath = item.src.replace(/^\/(assets\/img\/|img\/)/, 'img/');
    if (item.src.endsWith('/main-gate.jpg')) publicPath = 'img/hero/gndec_2022_newgate.jpg';
    if (item.src.endsWith('/library.jpg')) publicPath = 'img/gallery/library-sign.jpg';
    const file = path.join(root, 'public', publicPath);
    assert.ok(fs.existsSync(file), `Missing public photo ${item.src}`);
  }
  const students = read('students');
  assert.ok(Array.isArray(students.records) && students.records.length > 1000);
  assert.ok(students.records.every(student => student.crn && student.name && student.section));
  assert.ok(students.records.every(student => !('phone' in student) && !('email' in student) && !('address' in student)));
  assert.ok(!fs.existsSync(path.join(dataDir, 'search.json')));
});

test('public contact data omits personal mobile numbers', () => {
  const contacts = read('contacts');
  assert.ok((contacts.roles || []).every(role => !('phone' in role)));
  assert.ok((contacts.people || []).every(person => !('phone' in person) && !('phoneSource' in person)));
  const mobilePattern = /\b[6-9]\d{9}\b/;
  assert.ok(!mobilePattern.test(JSON.stringify(contacts)), 'contacts.json still contains a 10-digit mobile number');
});

test('source registry has official college references', () => {
  const registry = read('sources');
  assert.ok(registry.sources.some(source => source.url?.includes('gndec.ac.in')));
});

test('faculty directory exposes all published departments', () => {
  const faculty = read('faculty');
  const departments = new Set(faculty.records.map(person => person.department).filter(Boolean));
  assert.ok(departments.size >= 10, `expected at least 10 departments, found ${departments.size}`);
  assert.ok(departments.has('Computer Science & Engg.'));
});
