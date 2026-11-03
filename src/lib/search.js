import { branchShort, photoPath, searchScore } from './utils.js';
import { timetableEntries } from './timetable.js';

const TYPE_WEIGHT = {
  student: 10,
  faculty: 10,
  section: 9,
  room: 9,
  place: 8,
  paper: 6,
  syllabus: 6,
  notice: 5,
  contact: 4,
};

const scoreEntry = (query, ...fields) => Math.max(0, ...fields.map((field) => searchScore(field, query)));

export function buildSearchIndex(data) {
  const entries = [];
  for (const student of data.students?.records || []) {
    entries.push({
      type: 'student',
      id: student.crn,
      title: student.name,
      subtitle: `CRN ${student.crn} · ${student.section} · ${branchShort(student.branch)}`,
      path: `/students?crn=${student.crn}`,
      image: null,
      text: `${student.name} ${student.crn} ${student.registrationNo} ${student.section} ${student.subsection} ${student.mentor} ${student.academicGroup}`,
    });
  }
  for (const faculty of data.faculty?.records || []) {
    entries.push({
      type: 'faculty',
      id: faculty.profileId || faculty.email || faculty.name,
      title: faculty.name,
      subtitle: `${faculty.designation || 'Faculty'} · ${faculty.department || 'GNDEC'}`,
      path: `/faculty?q=${encodeURIComponent(faculty.name)}`,
      image: faculty.photoUrl,
      text: `${faculty.name} ${faculty.department} ${faculty.designation} ${faculty.email} ${faculty.researchInterests} ${faculty.qualifications}`,
    });
  }
  for (const section of timetableEntries(data.timetable)) {
    entries.push({
      type: 'section',
      id: section.id,
      title: section.label || section.id,
      subtitle: `${section.program} · ${section.kind === 'subgroup' ? 'Sub-section' : 'Section'} · ${section.lectures?.length || 0} classes listed`,
      path: `/timetable?section=${section.id}`,
      text: `${section.id} ${section.label} ${section.program} ${section.branchName} ${section.group} ${section.semester}`,
    });
  }
  for (const room of data.rooms?.rooms || []) {
    entries.push({
      type: 'room',
      id: room.id,
      title: `${room.code}${room.block ? ` · ${room.block}` : ''}`,
      subtitle: `${room.floor || 'Floor not verified'}${room.kind ? ` · ${room.kind}` : ''}`,
      path: `/map?room=${encodeURIComponent(room.code)}`,
      image: room.image,
      text: `${room.code} ${room.label} ${room.block} ${room.floor} ${room.kind}`,
    });
  }
  for (const place of data.campus?.places || []) {
    entries.push({
      type: 'place',
      id: place.id,
      title: place.name,
      subtitle: `${place.category} · ${place.description?.slice(0, 70) || 'Campus place'}`,
      path: `/map?to=${place.id}`,
      image: place.photo ? photoPath(place.photo) : null,
      text: `${place.name} ${place.category} ${place.description} ${(place.aliases || []).join(' ')}`,
    });
  }
  for (const paper of data.papers?.papers || []) {
    entries.push({
      type: 'paper',
      id: paper.id,
      title: `${paper.code || paper.title}${paper.name ? ` · ${paper.name.replace(/\.pdf$/i, '')}` : ''}`,
      subtitle: `${paper.department || 'GNDEC'} · ${paper.session || paper.year || 'Past paper'}`,
      path: `/study?tab=papers&q=${encodeURIComponent(paper.code || paper.title)}`,
      text: `${paper.code} ${paper.title} ${paper.name} ${paper.department} ${paper.session}`,
    });
  }
  for (const document of data.syllabus?.documents || []) {
    entries.push({
      type: 'syllabus',
      id: document.id,
      title: document.title,
      subtitle: `${document.program || 'GNDEC'} · ${document.branchName || document.branch || 'All'} · ${document.semester || 'Syllabus'}`,
      path: `/study?tab=syllabus&q=${encodeURIComponent(document.code || document.title)}`,
      text: `${document.title} ${document.code} ${document.branchName} ${document.branch} ${document.program} ${document.semester} ${document.scheme}`,
    });
  }
  for (const notice of data.notices?.notices || []) {
    entries.push({
      type: 'notice',
      id: notice.id,
      title: notice.title,
      subtitle: `${notice.displayDate || notice.date || 'Notice'} · ${notice.kind || 'general'}`,
      path: `/notices?q=${encodeURIComponent(notice.title)}`,
      text: `${notice.title} ${notice.kind} ${notice.source} ${notice.displayDate}`,
    });
  }
  return entries;
}

export function searchAll(index, query, limit = 8) {
  const clean = query.trim();
  if (clean.length < 2) return [];
  return index
    .map((entry) => {
      const exactId = entry.id && String(entry.id).toLowerCase() === clean.toLowerCase();
      const score = scoreEntry(clean, entry.title, entry.subtitle, entry.text) + (exactId ? 60 : 0);
      return { ...entry, score: score + TYPE_WEIGHT[entry.type] };
    })
    .filter((entry) => entry.score >= TYPE_WEIGHT[entry.type])
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export function searchGrouped(index, query, perType = 5) {
  const results = searchAll(index, query, 500);
  const groups = [];
  const types = ['student', 'faculty', 'section', 'room', 'place', 'paper', 'syllabus', 'notice'];
  for (const type of types) {
    const items = results.filter((entry) => entry.type === type).slice(0, perType);
    if (items.length) groups.push({ type, items });
  }
  return groups;
}

export function topResults(index, query, limit = 10) {
  return searchAll(index, query, limit);
}
