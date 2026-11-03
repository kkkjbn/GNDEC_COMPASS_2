import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ExternalLink,
  GraduationCap,
  MapPin,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import { Link, useRouter } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import { branchShort, norm, photoPath, yearLabel } from '../lib/utils.js';
import { sectionForStudent } from '../lib/timetable.js';
import {
  Avatar,
  Badge,
  DataFoot,
  EmptyState,
  InlineNotice,
  Modal,
  PageHeader,
  Panel,
  SearchField,
  Select,
} from '../components/ui.jsx';

const PAGE_SIZE = 48;

export default function Students() {
  const { data, profile, toggleBookmark, isBookmarked } = useApp();
  const { searchParams, navigate } = useRouter();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [branch, setBranch] = useState(searchParams.get('branch') || 'ALL');
  const [sectionFilter, setSectionFilter] = useState(searchParams.get('section') || 'ALL');
  const [mentor, setMentor] = useState(searchParams.get('mentor') || '');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const crn = searchParams.get('crn');
  const students = data?.students?.records || [];

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setBranch(searchParams.get('branch') || 'ALL');
    setSectionFilter(searchParams.get('section') || 'ALL');
    setMentor(searchParams.get('mentor') || '');
    setVisible(PAGE_SIZE);
  }, [searchParams]);

  const sections = useMemo(() => {
    const values = [...new Set(students.map((student) => student.section))].sort();
    return values;
  }, [students]);

  const branches = useMemo(() => {
    const codes = [...new Set(students.map((student) => student.branch))].sort();
    return codes.map((code) => ({ code, count: students.filter((student) => student.branch === code).length }));
  }, [students]);

  const mentors = useMemo(() => {
    const map = new Map();
    for (const student of students) {
      if (!student.mentor) continue;
      map.set(student.mentor, (map.get(student.mentor) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [students]);

  const filtered = useMemo(() => {
    const terms = norm(query).split(' ').filter(Boolean);
    return students
      .filter((student) => branch === 'ALL' || student.branch === branch)
      .filter((student) => sectionFilter === 'ALL' || student.section === sectionFilter)
      .filter((student) => !mentor || norm(student.mentor).includes(norm(mentor)))
      .filter((student) => {
        if (!terms.length) return true;
        const haystack = norm(
          `${student.name} ${student.crn} ${student.registrationNo} ${student.branch} ${student.section} ${student.subsection} ${student.mentor} ${student.academicGroup}`,
        );
        return terms.every((term) => haystack.includes(term));
      })
      .sort((a, b) => a.crn.localeCompare(b.crn));
  }, [students, branch, sectionFilter, mentor, query]);

  const selected = crn ? students.find((student) => student.crn === crn) : null;

  const setParam = (updates) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === 'ALL') next.delete(key);
      else next.set(key, value);
    }
    navigate(`/students?${next.toString()}`, { replace: true, keepScroll: true });
  };

  const applyBranch = (value) => {
    setBranch(value);
    setSectionFilter('ALL');
    setParam({ branch: value, section: null });
  };

  const clearAll = () => {
    setQuery('');
    setBranch('ALL');
    setSectionFilter('ALL');
    setMentor('');
    navigate('/students', { replace: true });
  };

  if (!data) return null;

  return (
    <div className="students-page">
      <PageHeader
        eyebrow="PEOPLE ON CAMPUS"
        title="Student directory"
        description="The public first-year permanent-section roster, searchable by CRN, name, branch, section or mentor. Contact numbers stay private."
        actions={
          <div className="head-actions">
            {profile.crn && (
              <Link to={`/students?crn=${profile.crn}`} className="btn secondary">
                <UserRound size={16} /> My record
              </Link>
            )}
            <Link to="/ask?q=How%20many%20students%20in%20CS%3F" className="btn primary">
              Ask about a section
            </Link>
          </div>
        }
      />

      <div className="directory-stats">
        <div>
          <b>{(data.students?.count || 0).toLocaleString('en-IN')}</b>
          <span>students</span>
        </div>
        <div>
          <b>{branches.length}</b>
          <span>branches</span>
        </div>
        <div>
          <b>{sections.length}</b>
          <span>sections</span>
        </div>
        <div>
          <b>{mentors.length}</b>
          <span>mentors</span>
        </div>
        <p>Source: official permanent-section PDFs, checked 15 Sep 2026.</p>
      </div>

      <Panel className="directory-shell">
        <div className="directory-toolbar">
          <SearchField
            value={query}
            onChange={(value) => {
              setQuery(value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="Search name, CRN, registration number or mentor…"
            className="directory-search"
          />
          <div className="directory-filters">
            <Select
              label="Branch"
              value={branch}
              onChange={applyBranch}
              options={[{ value: 'ALL', label: 'All branches' }, ...branches.map(({ code, count }) => ({ value: code, label: `${branchShort(code)} · ${count}` }))]}
            />
            <Select
              label="Section"
              value={sectionFilter}
              onChange={(value) => {
                setSectionFilter(value);
                setParam({ section: value, branch: null });
              }}
              options={[{ value: 'ALL', label: 'All sections' }, ...sections.map((section) => ({ value: section, label: section }))]}
            />
            <div className="filter-field">
              <span>Mentor</span>
              <span className="filter-input">
                <input value={mentor} onChange={(event) => setMentor(event.target.value)} placeholder="Mentor name" />
                {mentor && <button type="button" onClick={() => setMentor('')} aria-label="Clear mentor filter">×</button>}
              </span>
            </div>
          </div>
        </div>

        <div className="directory-meta">
          <span>
            <b>{filtered.length.toLocaleString('en-IN')}</b> {filtered.length === 1 ? 'student' : 'students'} found
          </span>
          {(query || branch !== 'ALL' || sectionFilter !== 'ALL' || mentor) && (
            <button type="button" className="text-button" onClick={clearAll}>
              Clear filters
            </button>
          )}
        </div>

        {filtered.length ? (
          <>
            <div className="student-grid">
              {filtered.slice(0, visible).map((student) => (
                <button
                  type="button"
                  key={student.crn}
                  className="student-card"
                  onClick={() => setParam({ crn: student.crn })}
                >
                  <Avatar name={student.name} size={42} />
                  <span className="student-card-copy">
                    <b>{student.name}</b>
                    <small>CRN {student.crn}</small>
                  </span>
                  <span className="student-card-meta">
                    <Badge tone="neutral">{student.section}</Badge>
                    <em>{branchShort(student.branch)}</em>
                  </span>
                  <ArrowRight size={14} className="student-card-arrow" />
                </button>
              ))}
            </div>
            {visible < filtered.length && (
              <div className="load-more">
                <button type="button" className="btn secondary" onClick={() => setVisible((value) => value + PAGE_SIZE)}>
                  Show more students
                  <span className="load-count">
                    {Math.min(visible, filtered.length)} / {filtered.length}
                  </span>
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={Users}
            title="No student matches those filters"
            action={
              <button type="button" className="btn secondary" onClick={clearAll}>
                Reset directory
              </button>
            }
          >
            Try a 7-digit CRN, a shorter name, or remove the branch/section filters.
          </EmptyState>
        )}
        <DataFoot>
          Public roster only — mentor phone numbers and personal contact details are deliberately omitted. This is not an attendance or result system.
        </DataFoot>
      </Panel>

      {selected && <StudentModal student={selected} onClose={() => setParam({ crn: null })} sections={sections} />}
    </div>
  );
}

function StudentModal({ student, onClose }) {
  const { data, toggleBookmark, isBookmarked } = useApp();
  const { navigate } = useRouter();
  const section = sectionForStudent(data?.timetable, student);
  const room = (data?.rooms?.rooms || []).find((item) => norm(item.id) === norm(student.mentorVenue).replace(/\s+/g, '') || norm(item.code) === norm(student.mentorVenue));
  const saved = isBookmarked('student', student.crn);
  const classmates = (data?.students?.records || []).filter((item) => item.section === student.section);

  return (
    <Modal
      open
      onClose={onClose}
      title={student.name}
      subtitle={`CRN ${student.crn} · ${branchShort(student.branch)} · Section ${student.section}`}
      footer={
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={() => toggleBookmark({ type: 'student', id: student.crn, title: student.name, path: `/students?crn=${student.crn}` })}>
            {saved ? 'Remove saved record' : 'Save this record'}
          </button>
          {section && (
            <button type="button" className="btn primary" onClick={() => { onClose(); navigate(`/timetable?section=${section.id}`); }}>
              <BookOpen size={16} /> Open timetable
            </button>
          )}
        </div>
      }
    >
      <div className="student-profile">
        <div className="student-profile-head">
          <Avatar name={student.name} size={68} />
          <div>
            <h3>{student.name}</h3>
            <p>
              {yearLabel(student.year)} · {branchShort(student.branch)} · {student.section}
              {student.subsection ? ` · ${student.subsection}` : ''}
            </p>
            <div className="profile-badges">
              <Badge tone="green">Public roster</Badge>
              <Badge tone="neutral">{student.academicGroup || 'Group not listed'}</Badge>
            </div>
          </div>
        </div>

        <dl className="profile-facts">
          <div>
            <dt>CRN</dt>
            <dd>{student.crn}</dd>
          </div>
          <div>
            <dt>Registration no.</dt>
            <dd>{student.registrationNo || 'Not listed'}</dd>
          </div>
          <div>
            <dt>Branch</dt>
            <dd>{branchShort(student.branch)}</dd>
          </div>
          <div>
            <dt>Section</dt>
            <dd>{student.section}{student.subsection ? ` / ${student.subsection}` : ''}</dd>
          </div>
          <div>
            <dt>Mentor</dt>
            <dd>{student.mentor || 'Not listed'}</dd>
          </div>
          <div>
            <dt>Mentor venue</dt>
            <dd>{student.mentorVenue || 'Not listed'}</dd>
          </div>
        </dl>

        <div className="mentor-card">
          <span className="mentor-icon">
            <GraduationCap size={19} />
          </span>
          <div>
            <span className="eyebrow">MENTOR</span>
            <b>{student.mentor || 'Not listed'}</b>
            <small>{student.mentorVenue ? `Usually available at ${student.mentorVenue}` : 'Venue not listed in the roster.'}</small>
          </div>
          {room && (
            <Link to={`/map?room=${encodeURIComponent(room.code)}`} className="btn ghost small" onClick={onClose}>
              <MapPin size={14} /> Route
            </Link>
          )}
        </div>

        <div className="classmates-row">
          <span>
            <Users size={15} /> {classmates.length} classmates in section {student.section}
          </span>
          <button type="button" className="text-button" onClick={() => { onClose(); navigate(`/students?section=${student.section}`); }}>
            View section roster <ArrowRight size={13} />
          </button>
        </div>

        <InlineNotice tone="info" title="Privacy by design">
          The public roster includes names and academic groupings only. Mentor phone numbers and personal contacts are not shown or searchable here.
        </InlineNotice>
      </div>
    </Modal>
  );
}
