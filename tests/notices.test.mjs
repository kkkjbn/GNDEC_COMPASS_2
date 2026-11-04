import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyNotice,
  displayDateFor,
  mergeNotices,
  noticeDateKey,
  parseErpNotices,
} from '../scripts/lib/notices-build.mjs';
import { istDayLabel } from '../src/lib/utils.js';

const fixture = `
  <div>
    <p> administrator   <!--Administrator -->October 23, 2026  </p>
    <p class="font-weight-bolder" style="font-size:30px;"><img src="/files/logo_gndec.png" width="80px"> <a href="noticeboard/reminder-pending-original-documents-admissions-2026">Reminder Pending Original Documents Admissions 2026</a></p>
    <hr>
  </div>
  <div>
    <p> coe_office   <!--coe_office@gndec.ac.in -->September 8, 2026  </p>
    <p class="font-weight-bolder" style="font-size:30px;"><img src="None" width="80px"> <a href="noticeboard/final-date-sheet-for-makeup-examinations-may-2026">Final date sheet for Makeup Examinations May -2026</a></p>
    <hr>
  </div>
  <div>
    <p> it_department   <!--it@gndec.ac.in -->November 2, 2026  </p>
    <p class="font-weight-bolder" style="font-size:30px;"><img src="None" width="80px"> <a href="noticeboard/ai-workshop">AICTE <b>VAANI</b> workshop &amp; demo</a></p>
    <hr>
  </div>
  <!--
  <div>
    <p> administrator</p>
    <p class="font-weight-bolder"><a href="noticeboard/old-sample">Old sample without a date</a></p>
  </div>
  -->
`;

test('parses dated ERP notices and ignores undated sample markup', () => {
  const notices = parseErpNotices(fixture);
  assert.equal(notices.length, 3);
  assert.equal(notices[0].date, '2026-11-02');
  assert.equal(notices[0].title, 'AICTE VAANI workshop & demo');
  assert.equal(notices[0].url, 'https://erp.gndec.ac.in/noticeboard/ai-workshop');
  assert.equal(notices[0].source, 'GNDEC ERP Notice Board');
  assert.equal(notices[0].kind, 'event');
  assert.equal(notices[0].displayDate, 'November 2, 2026');
  assert.ok(!notices.some((notice) => notice.url.endsWith('old-sample')));
  assert.deepEqual(
    notices.map((notice) => notice.date),
    ['2026-11-02', '2026-10-23', '2026-09-08'],
  );
});

test('renders data refresh timestamps in IST, including midnight rollover', () => {
  assert.equal(istDayLabel('2026-11-03T16:19:47.336Z'), '3 Nov 2026');
  assert.equal(istDayLabel('2026-11-03T19:30:00Z'), '4 Nov 2026');
  assert.equal(istDayLabel(''), '');
});

test('normalises notice dates and classifies common titles', () => {
  assert.equal(noticeDateKey('October 23, 2026'), '2026-10-23');
  assert.equal(noticeDateKey('Not a date'), null);
  assert.equal(displayDateFor('2026-09-08'), 'September 8, 2026');
  assert.equal(classifyNotice('Final date sheet for Makeup Examinations'), 'exam');
  assert.equal(classifyNotice('Fee Notice Jul - Dec. 2026'), 'admin');
  assert.equal(classifyNotice('Readmission_Notice 13_30.09.26, Neelam Kumari'), 'admin');
  assert.equal(classifyNotice('Workshop on AI'), 'event');
  assert.equal(classifyNotice('Felicitation ceremony'), 'general');
});

test('merges notices by URL, keeps existing IDs and sorts newest first', () => {
  const incoming = parseErpNotices(fixture);
  const existing = [
    { ...incoming[1], id: 'existing-id', title: 'Reminder Pending Original Documents Admissions 2026' },
    { id: 'home-1', title: 'Homepage feature', date: '2026-10-24', url: 'https://gndec.ac.in/?q=node/1', kind: 'general' },
  ];
  const { notices, added } = mergeNotices(existing, incoming);
  assert.equal(added, 2);
  assert.equal(notices.length, 4);
  assert.equal(notices.find((notice) => notice.url.endsWith('reminder-pending-original-documents-admissions-2026')).id, 'existing-id');
  assert.deepEqual(
    notices.map((notice) => notice.date),
    ['2026-11-02', '2026-10-24', '2026-10-23', '2026-09-08'],
  );
});
