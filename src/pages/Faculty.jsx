import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  ExternalLink,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  Search,
  Users,
} from 'lucide-react';
import { Link, useRouter } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import { norm, personKey, personTokens, titleCase } from '../lib/utils.js';
import { teacherSchedule } from '../lib/timetable.js';
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

const PAGE_SIZE = 36;

const DEPT_ALIASES = {
  'Computer Science & Engg.': 'Computer Science & Engineering',
  'Electronics & Communication Engineering': 'Electronics & Communication',
  'Information Technology': 'Information Technology',
  'Mechanical Engineering': 'Mechanical Engineering',
  'Civil Engineering': 'Civil Engineering',
  'Electrical Engineering': 'Electrical Engineering',
  'Applied Science': 'Applied Science',
  Workshops: 'Workshops',
  'Business Administration': 'Business Administration',
  'Computer Applications': 'Computer Applications',
  'Production Engineering': 'Production Engineering',
  'School of Architecture': 'School of Architecture',
};

const displayName = (name = '') =>
  titleCase(name.replace(/\bDR\.?\b/gi, 'Dr.').replace(/\bER\.?\b/gi, 'Er.').replace(/\bMR\.?\b/gi, 'Mr.').replace(/\bMS\.?\b/gi, 'Ms.'));

export default function Faculty() {
  const { data } = useApp();
  const { searchParams, navigate } = useRouter();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [department, setDepartment] = useState(searchParams.get('dept') || 'ALL');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState(null);

  const faculty = data?.faculty?.records || [];
  const contacts = data?.contacts || { roles: [], people: [] };

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setDepartment(searchParams.get('dept') || 'ALL');
    setSelected(null);
    setVisible(PAGE_SIZE);
  }, [searchParams]);

  const departments = useMemo(() => {
    const map = new Map();
    for (const person of faculty) {
      if (!person.department) continue;
      if (!map.has(person.department)) map.set(person.department, []);
      map.get(person.department).push(person);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [faculty]);

  const timetableTeachers = useMemo(() => {
    const map = new Map();
    for (const section of data?.timetable?.sections || []) {
      for (const lecture of section.lectures || []) {
        for (const name of lecture.teachers?.length ? lecture.teachers : lecture.teacher ? [lecture.teacher] : []) {
          const key = personKey(name);
          if (!key) continue;
          if (!map.has(key)) map.set(key, { name, sections: new Set(), count: 0 });
          map.get(key).sections.add(section.id);
          map.get(key).count += 1;
        }
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [data]);

  const filtered = useMemo(() => {
    const terms = norm(query).split(' ').filter(Boolean);
    return faculty
      .filter((person) => department === 'ALL' || person.department === department)
      .filter((person) => {
        if (!terms.length) return true;
        const haystack = norm(
          `${person.name} ${person.department} ${person.designation} ${person.email} ${person.qualifications} ${person.researchInterests}`,
        );
        return terms.every((term) => haystack.includes(term));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [faculty, department, query]);

  const timetableOnly = useMemo(() => {
    const terms = norm(query).split(' ').filter(Boolean);
    if (!terms.length) return [];
    const directoryKeys = new Set(faculty.map((person) => personKey(person.name)));
    return timetableTeachers.filter((teacher) => {
      const key = personKey(teacher.name);
      if ([...directoryKeys].some((entry) => entry === key || entry.split(' ').at(-1) === key.split(' ').at(-1))) return false;
      const haystack = norm(teacher.name);
      return terms.every((term) => haystack.includes(term));
    });
  }, [faculty, timetableTeachers, query]);

  const setParam = (updates) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === 'ALL') next.delete(key);
      else next.set(key, value);
    }
    navigate(`/faculty?${next.toString()}`, { replace: true, keepScroll: true });
  };

  const setDepartmentValue = (value) => {
    setDepartment(value);
    setParam({ dept: value });
  };

  if (!data) return null;

  const roles = (contacts.roles || []).filter((role) => role.role && role.name);

  return (
    <div className="faculty-page">
      <PageHeader
        eyebrow="THE PEOPLE WHO TEACH"
        title="Faculty directory"
        description="Public GNDEC faculty profiles, linked to the classes they teach in the current timetable export. Office rooms are not published here unless verified."
        actions={
          <div className="head-actions">
            <button type="button" className="btn secondary" onClick={() => setDepartmentValue('ALL')}>
              All departments
            </button>
            <Link to="/ask?q=Who%20teaches%20Math%20I%3F" className="btn primary">
              Who teaches a subject?
            </Link>
          </div>
        }
      />

      <div className="faculty-summary">
        <div>
          <b>{faculty.length}</b>
          <span>public profiles</span>
        </div>
        <div>
          <b>{departments.length}</b>
          <span>departments</span>
        </div>
        <div>
          <b>{timetableTeachers.length}</b>
          <span>teachers in timetable</span>
        </div>
        <p>
          Profiles: gndec.ac.in faculty pages, checked {data.faculty?.checkedAt ? new Date(data.faculty.checkedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sep 2026'}.
        </p>
      </div>

      <div className="department-chips" role="list" aria-label="All departments">
        <button
          type="button"
          role="listitem"
          className={`department-chip ${department === 'ALL' ? 'active' : ''}`}
          onClick={() => setDepartmentValue('ALL')}
        >
          All departments <em>{faculty.length}</em>
        </button>
        {departments.map(([name, people]) => (
          <button
            type="button"
            role="listitem"
            key={name}
            className={`department-chip ${department === name ? 'active' : ''}`}
            onClick={() => setDepartmentValue(name)}
          >
            {DEPT_ALIASES[name] || name} <em>{people.length}</em>
          </button>
        ))}
      </div>

      {roles.length > 0 && (
        <Panel className="offices-panel">
          <div className="offices-head">
            <div>
              <span className="eyebrow">KEY OFFICES</span>
              <h2>Department heads & offices</h2>
            </div>
            <a href="https://gndec.ac.in/?q=node/6" target="_blank" rel="noreferrer" className="arrow-link">
              Official contact page <ExternalLink size={13} />
            </a>
          </div>
          <div className="office-strip">
            {roles.slice(0, 10).map((role) => (
              <div className="office-card" key={`${role.role}-${role.name}`}>
                <span className="office-icon">
                  <BriefcaseBusiness size={16} />
                </span>
                <div>
                  <b>{role.role}</b>
                  <small>{displayName(role.name)}</small>
                  {role.landline && <span className="office-contact"><Phone size={12} /> {role.landline}</span>}
                  {role.email && (
                    <a className="office-contact" href={`mailto:${role.email}`}>
                      <Mail size={12} /> {role.email}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="fine-print">These are published office contacts, not necessarily direct personal lines.</p>
        </Panel>
      )}

      <Panel className="directory-shell faculty-shell">
        <div className="directory-toolbar">
          <SearchField
            value={query}
            onChange={(value) => {
              setQuery(value);
              setVisible(PAGE_SIZE);
            }}
            placeholder="Search a teacher, department, qualification or research area…"
            className="directory-search"
          />
          <div className="directory-filters">
            <Select
              label="Department"
              value={department}
              onChange={setDepartmentValue}
              options={[{ value: 'ALL', label: 'All departments' }, ...departments.map(([name, people]) => ({ value: name, label: `${DEPT_ALIASES[name] || name} · ${people.length}` }))]}
            />
          </div>
        </div>

        <div className="directory-meta">
          <span>
            <b>{filtered.length}</b> {filtered.length === 1 ? 'profile' : 'profiles'} found
          </span>
          {(query || department !== 'ALL') && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setQuery('');
                setDepartment('ALL');
                navigate('/faculty', { replace: true });
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {timetableOnly.length > 0 && (
          <InlineNotice tone="info" title={`${timetableOnly.length} timetable teacher${timetableOnly.length === 1 ? '' : 's'} not in the public profile directory`}>
            {timetableOnly.slice(0, 3).map((teacher) => teacher.name).join(' · ')}
            {timetableOnly.length > 3 ? ' · and more' : ''}. Their timetable classes are still searchable in Ask Compass and the Timetable page.
          </InlineNotice>
        )}

        {filtered.length ? (
          <>
            <div className="faculty-grid">
              {filtered.slice(0, visible).map((person) => (
                <button type="button" className="faculty-card" key={person.profileId || person.email || person.name} onClick={() => setSelected(person)}>
                  <div className="faculty-photo">
                    <Avatar name={person.name} src={person.photoUrl} size={54} />
                    {/head|hod/i.test(person.designation || '') && <span className="faculty-hod">HOD</span>}
                  </div>
                  <div className="faculty-copy">
                    <b>{displayName(person.name)}</b>
                    <small>{person.designation || 'Faculty'}</small>
                    <em>{DEPT_ALIASES[person.department] || person.department || 'GNDEC'}</em>
                  </div>
                  <span className="faculty-card-foot">
                    {person.experience ? <span>{person.experience}</span> : <span>Profile</span>}
                    <ArrowRight size={14} />
                  </span>
                </button>
              ))}
            </div>
            {visible < filtered.length && (
              <div className="load-more">
                <button type="button" className="btn secondary" onClick={() => setVisible((value) => value + PAGE_SIZE)}>
                  Show more profiles <span className="load-count">{Math.min(visible, filtered.length)} / {filtered.length}</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState icon={GraduationCap} title="No faculty profile matches">
            Try the surname only, a department name, or a research area. Timetable-only teachers are handled separately above.
          </EmptyState>
        )}
        <DataFoot>Public directory: {faculty.length} profiles from official GNDEC pages. Some departments may not publish complete staff lists online.</DataFoot>
      </Panel>

      {selected && <FacultyModal person={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function FacultyModal({ person, onClose }) {
  const { data } = useApp();
  const schedule = teacherSchedule(data?.timetable, person.name);
  const subjects = [...new Set(schedule.map((lecture) => lecture.subject.replace(/\s+[LPT]$/, '')))];
  return (
    <Modal
      open
      onClose={onClose}
      title={displayName(person.name)}
      subtitle={`${person.designation || 'Faculty'} · ${DEPT_ALIASES[person.department] || person.department || 'GNDEC'}`}
      size="md"
      footer={
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
          {schedule.length > 0 && (
            <Link to={`/timetable?teacher=${encodeURIComponent(person.name)}`} className="btn primary" onClick={onClose}>
              <BookOpen size={16} /> Open teacher timetable
            </Link>
          )}
        </div>
      }
    >
      <div className="faculty-profile">
        <div className="faculty-profile-head">
          <Avatar name={person.name} src={person.photoUrl} size={82} />
          <div>
            <h3>{displayName(person.name)}</h3>
            <p>{person.designation} · {DEPT_ALIASES[person.department] || person.department}</p>
            <div className="profile-badges">
              {person.experience && <Badge tone="gold">{person.experience}</Badge>}
              {schedule.length > 0 && <Badge tone="green">{schedule.length} classes in timetable</Badge>}
            </div>
          </div>
        </div>

        <div className="faculty-contact-row">
          {person.email && (
            <a href={`mailto:${person.email}`} className="faculty-contact">
              <Mail size={15} /> {person.email}
            </a>
          )}
          {person.profileUrl && (
            <a href={person.profileUrl} target="_blank" rel="noreferrer" className="faculty-contact">
              <ExternalLink size={15} /> Official profile
            </a>
          )}
        </div>

        <div className="faculty-sections">
          {person.qualifications && (
            <section>
              <span className="eyebrow">QUALIFICATIONS</span>
              <p>{person.qualifications}</p>
            </section>
          )}
          {person.researchInterests && (
            <section>
              <span className="eyebrow">RESEARCH INTERESTS</span>
              <p>{person.researchInterests}</p>
            </section>
          )}
          {(person.journalPublications || person.conferencePublications) && (
            <section>
              <span className="eyebrow">PUBLICATIONS</span>
              <p>
                {person.journalPublications ? `${person.journalPublications} journal publications` : ''}
                {person.journalPublications && person.conferencePublications ? ' · ' : ''}
                {person.conferencePublications || ''}
              </p>
            </section>
          )}
          {person.memberships && (
            <section>
              <span className="eyebrow">MEMBERSHIPS</span>
              <p>{person.memberships}</p>
            </section>
          )}
        </div>

        {schedule.length > 0 ? (
          <div className="faculty-timetable">
            <div className="faculty-timetable-head">
              <span className="eyebrow">TEACHES IN THE CURRENT EXPORT</span>
              <span>{subjects.slice(0, 3).join(' · ')}</span>
            </div>
            <div className="faculty-class-list">
              {schedule.slice(0, 8).map((lecture) => (
                <div className="faculty-class" key={`${lecture.id}-${lecture.sectionId}`}>
                  <span className="faculty-class-day">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][lecture.day]}</span>
                  <span>
                    <b>{lecture.subject.replace(/\s+[LPT]$/, '')}</b>
                    <small>{lecture.sectionId} · {lecture.room || 'Room not listed'}</small>
                  </span>
                  <em>{lecture.start}</em>
                </div>
              ))}
            </div>
            {schedule.length > 8 && <p className="fine-print">…and {schedule.length - 8} more classes in the full week.</p>}
          </div>
        ) : (
          <InlineNotice tone="info" title="No classes found in the current export">
            This teacher may be on another duty, teach a programme not included in the FET export, or their name may be written differently in the timetable.
          </InlineNotice>
        )}

        <InlineNotice tone="info" title="Office location not verified">
          The public profile does not publish a confirmed office room. Ask the department office, or search the timetable for classes they teach.
        </InlineNotice>
      </div>
    </Modal>
  );
}
