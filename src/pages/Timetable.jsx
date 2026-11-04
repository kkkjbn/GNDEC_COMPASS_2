import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Clock3,
  Coffee,
  DoorOpen,
  ExternalLink,
  Info,
  MapPin,
  Search,
  Users,
} from 'lucide-react';
import { Link, useRouter } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import {
  DAYS,
  DAYS_SHORT,
  branchShort,
  dayIndexFor,
  formatClock,
  istDate,
  norm,
  timeToMin,
  yearLabel,
} from '../lib/utils.js';
import {
  baseSectionFor,
  cohortsForSection,
  compareSections,
  dayPlanOn,
  findSection,
  freeClassrooms,
  isMentoringLecture,
  lecturesOn,
  mentoringGroupsForSection,
  periodForMinutes,
  personalizationContext,
  personalizeSection,
  roomBlocks,
  roomKindLabel,
  roomScheduleFromData,
  sectionCoverage,
  teacherSchedule,
  timetableEntries,
} from '../lib/timetable.js';
import {
  Badge,
  DataFoot,
  EmptyState,
  InlineNotice,
  Modal,
  PageHeader,
  Panel,
  PanelHead,
  SearchField,
  Segmented,
  Select,
  Tabs,
} from '../components/ui.jsx';

const PERIOD_STARTS = [510, 570, 630, 690, 750, 810, 870, 930];

function cleanSubject(subject = '') {
  return subject.replace(/\s+([LPT])(?:\s.*)?$/, '').trim() || subject;
}

function subjectKind(subject = '') {
  const match = subject.trim().match(/\s([LPT])(?:\s|$)/);
  return match ? { L: 'Lecture', P: 'Practical', T: 'Tutorial' }[match[1]] : null;
}

function SectionSelect({ value, onChange, includeGroup = false, label = 'Section' }) {
  const { data } = useApp();
  const sections = [...(data?.timetable?.sections || [])].sort(
    (a, b) => a.year - b.year || String(a.branch).localeCompare(String(b.branch)) || String(a.group).localeCompare(String(b.group)),
  );
  const current = findSection(data?.timetable, value);
  const groups = [];
  for (const section of sections) {
    const group = groups.find((entry) => entry.year === section.year);
    if (group) group.sections.push(section);
    else groups.push({ year: section.year, sections: [section] });
  }
  const needsCurrent = current && !sections.some((section) => section.id === current.id);
  return (
    <label className="select-field">
      <span>{label}</span>
      <span className="select-wrap">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {needsCurrent && <option value={current.id}>{current.label} · {current.id} (sub-section)</option>}
          {groups.map((group) => (
            <optgroup key={group.year} label={yearLabel(group.year)}>
              {group.sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label} · {section.id}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown size={15} />
      </span>
    </label>
  );
}

function WeekGrid({ lectures, onSelect, showSection = false, timetable }) {
  const periods = timetable?.periods || ['08:30', '09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30'];
  const find = (day, period) => (lectures || []).find((lecture) => lecture.day === day && lecture.period === period);
  const now = istDate();
  const today = dayIndexFor(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentPeriod = periodForMinutes(timetable, nowMinutes);

  return (
    <>
      <div className="week-grid-wrap">
        <div className="week-grid">
          <div className="week-grid-corner">Time</div>
          {DAYS.map((day, index) => (
            <div key={day} className={`week-grid-day ${index === today ? 'today' : ''}`}>
              <span>{day.slice(0, 3)}</span>
              <small>{index === today ? 'Today' : ''}</small>
            </div>
          ))}
          {periods.map((start, period) => {
            const end = periods[period + 1] || '16:30';
            return (
              <React.Fragment key={start}>
                <div className={`week-grid-time ${period === currentPeriod && today >= 0 ? 'now' : ''}`}>
                  <b>{formatClock(start)}</b>
                  <small>{formatClock(end)}</small>
                </div>
                {DAYS.map((day, dayIndex) => {
                  const lecture = find(dayIndex, period);
                  const isNow = dayIndex === today && period === currentPeriod;
                  return (
                    <div key={`${day}-${period}`} className={`week-cell ${lecture ? 'filled' : ''} ${isNow ? 'now' : ''}`}>
                      {lecture ? (
                        <button type="button" className="lecture-chip" onClick={() => onSelect?.(lecture)}>
                          <b>{cleanSubject(lecture.subject)}</b>
                          <small>
                            {lecture.room || 'Room TBC'}
                            {showSection && lecture.sectionId ? ` · ${lecture.sectionId}` : ''}
                          </small>
                          {lecture.teacher && <em>{lecture.teacher.replace(/^(Dr\.?|Ms\.?|Mr\.?|Er\.?)\s*/i, '')}</em>}
                        </button>
                      ) : (
                        <span className="free-cell">—</span>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
      <div className="mobile-week">
        {DAYS.map((day, index) => {
          const items = (lectures || []).filter((lecture) => lecture.day === index).sort((a, b) => a.period - b.period);
          return (
            <details key={day} className={`mobile-week-day ${index === today ? 'today' : ''}`} open={index === today || (today < 0 && index === 0)}>
              <summary>
                <b>{day}</b>
                <span>{items.length} classes</span>
                <ChevronDown size={15} />
              </summary>
              {items.length ? (
                items.map((lecture) => (
                  <button type="button" className="mobile-lecture" key={lecture.id} onClick={() => onSelect?.(lecture)}>
                    <span className="mobile-lecture-time">
                      <b>{formatClock(lecture.start)}</b>
                      <small>{formatClock(lecture.end)}</small>
                    </span>
                    <span className="mobile-lecture-copy">
                      <b>{cleanSubject(lecture.subject)}</b>
                      <small>
                        {lecture.room || 'Room not listed'}
                        {lecture.teacher ? ` · ${lecture.teacher}` : ''}
                      </small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                ))
              ) : (
                <p className="mobile-week-empty">No classes listed.</p>
              )}
            </details>
          );
        })}
      </div>
    </>
  );
}

function LectureModal({ lecture, onClose }) {
  if (!lecture) return null;
  const kind = subjectKind(lecture.subject);
  return (
    <Modal
      open={Boolean(lecture)}
      onClose={onClose}
      title={cleanSubject(lecture.subject)}
      subtitle={`${DAYS[lecture.day]} · ${formatClock(lecture.start)}–${formatClock(lecture.end)}`}
      size="sm"
      footer={
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
          {lecture.room && (
            <Link to={`/map?room=${encodeURIComponent(lecture.room)}`} className="btn primary" onClick={onClose}>
              <MapPin size={16} /> Open room on map
            </Link>
          )}
        </div>
      }
    >
      <div className="lecture-detail">
        <div className="lecture-detail-tags">
          {kind && <Badge tone="gold">{kind}</Badge>}
          {lecture.sectionId && <Badge tone="green">{lecture.sectionId}</Badge>}
          {isMentoringLecture(lecture) && <Badge tone="gold">Mentoring</Badge>}
          {lecture.mentoringGroup && <Badge tone="neutral">{lecture.mentoringGroup}</Badge>}
          <Badge tone="neutral">Period {lecture.period + 1}</Badge>
        </div>
        <dl>
          <div>
            <dt>Room</dt>
            <dd>{lecture.room || 'Not listed'}</dd>
          </div>
          <div>
            <dt>Faculty</dt>
            <dd>{lecture.teachers?.join(', ') || lecture.teacher || 'Not listed'}</dd>
          </div>
          <div>
            <dt>Section</dt>
            <dd>{lecture.sectionLabel || lecture.sectionId || '—'}</dd>
          </div>
          <div>
            <dt>Sub-section</dt>
            <dd>{lecture.subsection || 'All students'}</dd>
          </div>
          {lecture.mentoringGroup && (
            <div>
              <dt>Mentoring group</dt>
              <dd>{lecture.mentoringGroup}</dd>
            </div>
          )}
        </dl>
        <InlineNotice tone="info">
          This comes from the official FET export dated 17 Sep 2026. Room changes and makeup classes are not reflected automatically.
        </InlineNotice>
        <div className="lecture-detail-links">
          <Link to={`/ask?q=${encodeURIComponent(`Who teaches ${cleanSubject(lecture.subject)}?`)}`} onClick={onClose}>
            Ask about this subject <ArrowRight size={13} />
          </Link>
          <Link to={`/timetable?section=${lecture.sectionId}&tab=week`} onClick={onClose}>
            Open section week <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </Modal>
  );
}

export default function Timetable() {
  const { data, profile, setProfile, toast } = useApp();
  const { searchParams, navigate } = useRouter();
  const timetable = data?.timetable;
  const [selected, setSelected] = useState(null);
  const [now, setNow] = useState(() => istDate());
  const [roomQuery, setRoomQuery] = useState('');
  const [blockFilter, setBlockFilter] = useState('all');

  useEffect(() => {
    const timer = setInterval(() => setNow(istDate()), 30000);
    return () => clearInterval(timer);
  }, []);

  const teacherQuery = searchParams.get('teacher') || '';
  const roomQueryParam = searchParams.get('room') || '';
  const tabParam = searchParams.get('tab');
  const tab = tabParam || (teacherQuery ? 'teacher' : roomQueryParam ? 'room' : 'day');
  const selectedSectionId = searchParams.get('section') || profile.sectionId || 'ECB';
  const section = findSection(timetable, selectedSectionId);
  const currentBase = useMemo(() => baseSectionFor(timetable, section) || section, [timetable, section]);
  const validSubsections = useMemo(() => {
    const tokens = new Set();
    if (!currentBase) return tokens;
    for (const cohort of cohortsForSection(timetable, currentBase)) tokens.add(cohort.id.toUpperCase());
    for (const lecture of currentBase.lectures || []) {
      for (const token of String(lecture.subsection || '').split(',')) {
        const value = token.trim().toUpperCase();
        if (value && !/M\d+$/.test(value)) tokens.add(value);
      }
    }
    return tokens;
  }, [timetable, currentBase]);
  const urlSubsection = searchParams.get('subsection');
  const requestedSubsection = String(
    urlSubsection !== null
      ? urlSubsection
      : profile.subsection || (section?.kind === 'subgroup' && !section.mentoringGroup ? section.id : ''),
  ).toUpperCase();
  // A shared URL or an old profile may point at another section's lab batch.
  // Ignore it rather than showing a subsection that does not belong here.
  const selectedSubsection = validSubsections.has(requestedSubsection) ? requestedSubsection : '';
  const selectedAcademicGroup = String(
    searchParams.get('group') || profile.academicGroup || (section?.mentoringGroup ? section.id : ''),
  ).toUpperCase();
  const activeProfile = useMemo(
    () => ({
      ...profile,
      branch: currentBase?.branch || profile.branch,
      year: currentBase?.year || profile.year,
      sectionId: currentBase?.id || profile.sectionId,
      subsection: selectedSubsection,
      academicGroup: selectedAcademicGroup,
    }),
    [profile, currentBase, selectedSubsection, selectedAcademicGroup],
  );
  const personalization = useMemo(() => personalizationContext(timetable, activeProfile), [timetable, activeProfile]);
  const profileApplies =
    Boolean(section && personalization) && baseSectionFor(timetable, section)?.id === personalization.base.id;
  const activeSection = useMemo(
    () => (profileApplies ? personalizeSection(timetable, activeProfile) || section : section),
    [profileApplies, timetable, activeProfile, section],
  );
  const [day, setDay] = useState(() => {
    const requested = Number(searchParams.get('day'));
    return Number.isInteger(requested) && requested >= 0 && requested <= 5 ? requested : Math.max(0, dayIndexFor(istDate()));
  });
  const teacher = teacherQuery ? teacherQuery : '';

  const setParam = (updates, options = {}) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    navigate(`/timetable?${next.toString()}`, { replace: true, keepScroll: options.keepScroll ?? true });
  };

  const branchOptions = useMemo(() => {
    const seen = new Set();
    const options = [];
    for (const item of timetable?.sections || []) {
      if (!item.branch || seen.has(item.branch)) continue;
      seen.add(item.branch);
      options.push({ value: item.branch, label: `${branchShort(item.branch)} · ${item.branch}` });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }, [timetable]);

  const sectionOptions = useMemo(
    () =>
      [...(timetable?.sections || [])]
        .filter((item) => item.branch === (currentBase?.branch || profile.branch))
        .sort((a, b) => a.year - b.year || String(a.group || '').localeCompare(String(b.group || '')))
        .map((item) => ({
          value: item.id,
          label: item.group ? `${item.id} · Group ${item.group} · Year ${item.year}` : `${item.id} · ${item.label}`,
        })),
    [timetable, currentBase, profile.branch],
  );

  const subsectionOptions = useMemo(() => {
    const options = [{ value: '', label: 'Whole section · all lab batches' }];
    const base = currentBase;
    if (!base) return options;
    const seen = new Set();
    for (const cohort of cohortsForSection(timetable, base)) {
      const id = cohort.id.toUpperCase();
      seen.add(id);
      options.push({ value: id, label: `${id} · lab batch` });
    }
    if (options.length === 1) {
      for (const lecture of base.lectures || []) {
        for (const token of String(lecture.subsection || '')
          .split(',')
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean)) {
          if (seen.has(token) || /M\d+$/.test(token)) continue;
          seen.add(token);
          options.push({ value: token, label: `${token} · lab batch` });
        }
      }
    }
    if (selectedSubsection && !seen.has(selectedSubsection)) {
      options.push({ value: selectedSubsection, label: `${selectedSubsection} · current selection` });
    }
    return options;
  }, [timetable, currentBase, selectedSubsection]);

  const applySelection = (nextSection, nextSubsection = '') => {
    const base = baseSectionFor(timetable, nextSection) || nextSection;
    if (!base) return;
    const requested = String(nextSubsection || '').toUpperCase();
    const cohorts = cohortsForSection(timetable, base);
    const cohort = cohorts.find((item) => item.id.toUpperCase() === requested);
    const lectureTokens = new Set();
    for (const lecture of base.lectures || []) {
      for (const token of String(lecture.subsection || '').split(',')) {
        const value = token.trim().toUpperCase();
        if (value) lectureTokens.add(value);
      }
    }
    const subsection = cohort?.id?.toUpperCase() || (lectureTokens.has(requested) ? requested : '');
    const group = mentoringGroupsForSection(timetable, base).find(
      (item) => item.id.toUpperCase() === selectedAcademicGroup,
    );
    const nextProfile = {
      ...profile,
      branch: base.branch,
      year: base.year,
      sectionId: base.id,
      subsection,
      academicGroup: group?.id?.toUpperCase() || '',
    };
    setProfile(nextProfile);
    setParam({
      section: base.id,
      subsection: subsection || null,
      group: nextProfile.academicGroup || null,
    });
    toast(`Timetable set to ${base.label}${subsection ? ` · ${subsection}` : ''}`, 'success');
  };

  const handleBranchChange = (branch) => {
    const candidates = (timetable?.sections || []).filter((item) => item.branch === branch);
    const next = candidates.find((item) => item.year === currentBase?.year) || candidates[0];
    if (next) applySelection(next, '');
  };

  const handleSectionChange = (sectionId) => {
    const next = findSection(timetable, sectionId);
    if (next) applySelection(next, selectedSubsection);
  };

  const teacherLectures = useMemo(() => (teacher ? teacherSchedule(timetable, teacher) : []), [timetable, teacher]);
  const roomInfo = useMemo(() => (data?.rooms?.rooms || []).find((item) => norm(item.code) === norm(roomQueryParam) || norm(item.id) === norm(roomQueryParam)), [data, roomQueryParam]);
  const roomLectures = useMemo(() => (roomQueryParam ? roomScheduleFromData(data, roomInfo?.code || roomQueryParam) : []), [data, roomInfo, roomQueryParam]);

  const lectures = useMemo(() => (activeSection ? activeSection.lectures || [] : []), [activeSection]);
  const dayLectures = useMemo(() => (day >= 0 ? lecturesOn(activeSection, day) : []), [activeSection, day]);
  const dayPlan = useMemo(() => (day >= 0 ? dayPlanOn(activeSection, day, timetable) : []), [activeSection, day, timetable]);
  const breakCount = dayPlan.filter((item) => item.free).length;
  const weekCount = lectures.length;
  const coverage = sectionCoverage(activeSection);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentPeriod = periodForMinutes(timetable, nowMinutes);
  const today = dayIndexFor(now);

  const freePeriod = tab === 'free' ? Number(searchParams.get('period') ?? Math.max(0, currentPeriod)) : Math.max(0, currentPeriod);
  const freeDay = tab === 'free' ? Number(searchParams.get('day') ?? Math.max(0, today)) : Math.max(0, today);
  const free = useMemo(
    () => freeClassrooms(data, freeDay, Math.min(7, Math.max(0, freePeriod))),
    [data, freeDay, freePeriod],
  );
  const blocks = useMemo(() => roomBlocks(data), [data]);
  useEffect(() => {
    if (blockFilter !== 'all' && !blocks.some((block) => block.value === blockFilter)) setBlockFilter('all');
  }, [blockFilter, blocks]);
  const freeByBlock = useMemo(() => {
    const filtered = free.filter((room) => blockFilter === 'all' || room.block === blockFilter);
    const groups = new Map();
    for (const room of filtered) {
      const key = room.block || 'Other rooms & labs';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(room);
    }
    return [...groups.entries()];
  }, [free, blockFilter]);

  const compareA = searchParams.get('a') || 'ECA';
  const compareB = searchParams.get('b') || 'ECB';
  const compare = useMemo(() => compareSections(timetable, compareA, compareB, day), [timetable, compareA, compareB, day]);

  const roomOptions = useMemo(
    () =>
      [...(data?.rooms?.rooms || [])]
        .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }))
        .map((room) => ({ value: room.code, label: `${room.code}${room.block ? ` · ${room.block}` : ''}` })),
    [data],
  );

  const searchRoom = useMemo(() => {
    const query = roomQuery.trim().toLowerCase();
    if (!query) return [];
    return (data?.rooms?.rooms || [])
      .filter((room) => `${room.code} ${room.block} ${room.floor} ${room.kind}`.toLowerCase().includes(query))
      .slice(0, 14);
  }, [roomQuery, data]);

  if (!data) return null;

  const tabs = [
    { value: 'day', label: 'My day', icon: CalendarDays },
    { value: 'week', label: 'Full week', icon: CalendarDays },
    { value: 'free', label: 'Free rooms', icon: DoorOpen },
    { value: 'room', label: 'Room finder', icon: MapPin },
    { value: 'compare', label: 'Compare', icon: ArrowLeftRight },
  ];

  return (
    <div className="timetable-page">
      <PageHeader
        eyebrow="YOUR WEEK, MADE SIMPLE"
        title="Timetable"
        description="Section-wise schedule from the official FET export. Complete for first year, partial for some higher-year groups."
        actions={
          <div className="head-actions">
            <Link to="/ask?q=My%20next%20class" className="btn secondary">
              Ask Compass
            </Link>
          </div>
        }
      />

      <div className="timetable-picker">
        <div className="timetable-picker-copy">
          <span className="eyebrow">YOUR TIMETABLE</span>
          <small>Choose branch, section and lab subsection. This selection is used by Timetable, Today and Ask Compass on this device.</small>
        </div>
        <div className="timetable-picker-grid">
          <Select
            label="Branch"
            value={currentBase?.branch || profile.branch || ''}
            onChange={handleBranchChange}
            options={branchOptions}
          />
          <Select
            label="Section"
            value={currentBase?.id || ''}
            onChange={handleSectionChange}
            options={sectionOptions}
          />
          <Select
            label="Subsection"
            value={selectedSubsection}
            onChange={(value) => currentBase && applySelection(currentBase, value)}
            options={subsectionOptions}
          />
        </div>
      </div>

      {activeSection?.personalized && (activeSection.cohortId || activeSection.academicGroup || activeSection.mentor) && (
        <div className="mode-banner mentoring-banner">
          <span className="mode-icon">
            <Users size={18} />
          </span>
          <div>
            <b>
              Personalized for {currentBase?.label || activeSection.id}
              {activeProfile.subsection ? ` · ${activeProfile.subsection}` : ''}
              {activeSection.academicGroup ? ` · Academic group ${activeSection.academicGroup}` : ''}
            </b>
            <small>
              {activeSection.mentoringEntryId
                ? `Mentoring group ${activeSection.mentoringGroup || activeSection.academicGroup} merged into the section timetable.`
                : 'Your lab batch is applied to practicals.'}
              {activeSection.mentor ? ` Mentor: ${activeSection.mentor}.` : ''}
              {activeSection.mentorVenue ? ` Venue: ${activeSection.mentorVenue}.` : ''}
            </small>
          </div>
          {activeSection.cohortId && <Badge tone="green">{activeSection.cohortId}</Badge>}
        </div>
      )}

      {teacher && (
        <div className="mode-banner">
          <span className="mode-icon">
            <Users size={18} />
          </span>
          <div>
            <b>Teacher timetable: {teacher}</b>
            <small>{teacherLectures.length} classes across all published sections in the current export.</small>
          </div>
          <button type="button" className="btn ghost small" onClick={() => setParam({ teacher: null, tab: 'day' })}>
            Clear teacher
          </button>
        </div>
      )}
      {roomQueryParam && tab === 'room' && (
        <div className="mode-banner">
          <span className="mode-icon">
            <DoorOpen size={18} />
          </span>
          <div>
            <b>Room timetable: {roomInfo?.code || roomQueryParam}</b>
            <small>
              {roomInfo?.block ? `${roomInfo.block} · ${roomInfo.floor || 'floor not verified'}` : 'Block not verified for this room'} · {roomLectures.length} classes listed
            </small>
          </div>
          <Link to={`/map?room=${encodeURIComponent(roomInfo?.code || roomQueryParam)}`} className="btn ghost small">
            Open map
          </Link>
        </div>
      )}

      <Panel className="timetable-shell">
        <div className="timetable-toolbar">
          <Tabs
            options={tabs.map((entry) => ({ ...entry, count: entry.value === 'free' ? undefined : undefined }))}
            value={tab}
            onChange={(value) => setParam({ tab: value })}
          />
          {activeSection && (
            <div className="section-summary">
              <span className="section-code">{activeSection.cohortId || activeSection.id}</span>
              <div>
                <b>{activeSection.label}</b>
                <small>
                  {weekCount} classes/week · {branchShort(activeSection.branch)} · {yearLabel(activeSection.year)}
                  {activeSection.academicGroup ? ` · ${activeSection.academicGroup}` : ''}
                </small>
              </div>
              <Badge tone={activeSection.year === 1 ? 'green' : 'gold'}>
                {activeSection.year === 1 ? 'Published export' : coverage.percent > 40 ? 'Mostly covered' : 'Partial export'}
              </Badge>
            </div>
          )}
        </div>

        {tab === 'day' && (
          <div className="tab-pane">
            <div className="day-strip wide">
              {DAYS.map((label, index) => (
                <button type="button" key={label} className={`${day === index ? 'active' : ''} ${today === index ? 'today' : ''}`} onClick={() => setDay(index)}>
                  <small>{label.slice(0, 3)}</small>
                  <b>{label}</b>
                  {today === index && <span>Today</span>}
                </button>
              ))}
            </div>
            <div className="day-summary-row">
              <div>
                <h2>{DAYS[day]} · {activeSection?.label || 'No section'}</h2>
                <p>
                  {dayLectures.length} classes · {breakCount} {breakCount === 1 ? 'break' : 'breaks'}
                  {today === day ? ` · period ${currentPeriod + 1} now` : ''}
                </p>
              </div>
              <Link to={`/timetable?section=${activeSection?.id || ''}&tab=week`} className="btn subtle">
                See full week <ArrowRight size={15} />
              </Link>
            </div>
            {dayLectures.length ? (
              <div className="day-timeline timetable-list">
                {dayPlan.map((item) => {
                  if (item.free) {
                    return (
                      <div className="timeline-row free-slot" key={item.id}>
                        <div className="timeline-time">
                          <b>{formatClock(item.start)}</b>
                          <small>{formatClock(item.end)}</small>
                        </div>
                        <span className="timeline-dot" />
                        <div className="timeline-copy">
                          <div className="timeline-title">
                            <b>Break · no class listed</b>
                            <Badge tone="neutral">Free period</Badge>
                          </div>
                          <p>
                            Open study time
                            <span>·</span>
                            rooms are not reserved
                          </p>
                        </div>
                        <div className="timeline-actions">
                          <Link to={`/timetable?tab=free&day=${day}&period=${item.period}`} className="room-pill" title="Find a free room for this period">
                            <Coffee size={13} /> Free rooms
                          </Link>
                        </div>
                      </div>
                    );
                  }
                  const isCurrent = today === day && nowMinutes >= timeToMin(item.start) && nowMinutes < timeToMin(item.end);
                  return (
                    <button type="button" className={`timeline-row clickable ${isCurrent ? 'current' : ''}`} key={item.id} onClick={() => setSelected(item)}>
                      <div className="timeline-time">
                        <b>{formatClock(item.start)}</b>
                        <small>{formatClock(item.end)}</small>
                      </div>
                      <span className="timeline-dot" />
                      <div className="timeline-copy">
                        <div className="timeline-title">
                          <b>{cleanSubject(item.subject)}</b>
                          {subjectKind(item.subject) && <Badge tone="neutral">{subjectKind(item.subject)}</Badge>}
                          {isMentoringLecture(item) && <Badge tone="gold">Mentoring</Badge>}
                          {isCurrent && <Badge tone="green">Now</Badge>}
                        </div>
                        <p>
                          {item.teacher || item.teachers?.join(', ') || 'Faculty not listed'}
                          <span>·</span>
                          {item.room || 'Room not listed'}
                          {item.subsection ? <><span>·</span>{item.subsection}</> : null}
                        </p>
                      </div>
                      <div className="timeline-actions">
                        <span className="room-pill">
                          <MapPin size={13} /> {item.room || 'TBC'}
                        </span>
                        <ArrowRight size={15} />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={CalendarDays} title="No classes listed for this day">
                This can be a genuinely free day, or the published export may not include this section. Check the official FET timetable before travelling.
              </EmptyState>
            )}
            <DataFoot>
              {timetable?.source?.label} · <a href={timetable?.source?.index} target="_blank" rel="noreferrer">Official timetable index <ExternalLink size={11} /></a>
            </DataFoot>
          </div>
        )}

        {tab === 'week' && (
          <div className="tab-pane">
            <div className="week-toolbar">
              <div>
                <h2>{activeSection?.label || 'Weekly timetable'}</h2>
                <p>{weekCount} classes in the published export. Tap any class for room and faculty details.</p>
              </div>
              <span className="week-hint">
                <Info size={13} /> Horizontal scroll on small screens
              </span>
            </div>
            <WeekGrid lectures={lectures} onSelect={setSelected} timetable={timetable} />
            <DataFoot>Source: official FET export (17 Sep 2026). A blank cell means no class is listed, not necessarily that the room is free.</DataFoot>
          </div>
        )}

        {tab === 'free' && (
          <div className="tab-pane">
            <div className="free-toolbar">
              <div>
                <h2>Free rooms & study spaces</h2>
                <p>Every published section, sub-section, lab, workshop and seminar hall in the official room timetable — plus the Central Library.</p>
              </div>
              <div className="free-filters">
                <Select
                  label="Day"
                  value={String(freeDay)}
                  onChange={(value) => setParam({ day: value, tab: 'free' })}
                  options={DAYS.map((label, index) => ({ value: String(index), label }))}
                />
                <Select
                  label="Period"
                  value={String(Math.min(7, Math.max(0, freePeriod)))}
                  onChange={(value) => setParam({ period: value, tab: 'free' })}
                  options={PERIOD_STARTS.map((start, index) => ({
                    value: String(index),
                    label: `P${index + 1} · ${formatClock(start)}–${formatClock(start + 60)}`,
                  }))}
                />
                <Select
                  label="Block"
                  value={blockFilter}
                  onChange={setBlockFilter}
                  options={[{ value: 'all', label: 'All blocks' }, ...blocks.map((block) => ({ value: block.value, label: `${block.label} · ${block.count}` }))]}
                />
              </div>
            </div>
            <div className="free-coverage" aria-label="Timetable year coverage">
              <span className="free-coverage-label">Year coverage</span>
              {[1, 2, 3, 4].map((year) => {
                const checked = (data?.roomTimetable?.coverage?.yearsPublished || []).includes(year);
                const suffix = year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th';
                return (
                  <span className={`free-year ${checked ? 'ok' : 'missing'}`} key={year}>
                    <b>
                      {year}
                      {suffix} year
                    </b>
                    <small>{checked ? 'Checked' : 'Not published'}</small>
                  </span>
                );
              })}
              <span className="free-coverage-note">
                Free rooms are computed from every published section, sub-section, lab, workshop and seminar hall. Central Library is always
                added as an open study space.
              </span>
            </div>
            <InlineNotice tone="info" title="Coverage from the official room timetable">
              {data?.roomTimetable?.coverage?.note ||
                'This check uses every published section, lab, workshop and seminar hall in the official room timetable.'}{' '}
              Central Library is added separately as an open study space because it is not a scheduled classroom.
            </InlineNotice>
            <InlineNotice tone="warn" title="A timetable gap is not a booking">
              Rooms can still be used for events, makeup classes, exams or faculty work. Knock before using a room and follow department instructions.
            </InlineNotice>
            <div className="free-count-row">
              <b>{free.length}</b>
              <span>
                candidate free rooms & study spaces · {DAYS[freeDay]}, P{Math.min(7, Math.max(0, freePeriod)) + 1} (
                {formatClock(PERIOD_STARTS[Math.min(7, Math.max(0, freePeriod))])}–
                {formatClock(PERIOD_STARTS[Math.min(7, Math.max(0, freePeriod))] + 60)})
                {data?.roomTimetable?.count ? ` · ${data.roomTimetable.count} official rooms checked` : ''}
              </span>
            </div>
            {freeByBlock.length ? (
              <div className="free-groups">
                {freeByBlock.map(([block, rooms]) => (
                  <div className="free-group" key={block}>
                    <div className="free-group-head">
                      <h3>{block}</h3>
                      <span>{rooms.length} free</span>
                    </div>
                    <div className="free-room-grid">
                      {rooms.map((room) => (
                        <Link to={`/map?room=${encodeURIComponent(room.code)}`} className="free-room-card" key={room.id}>
                          {room.image ? <img src={room.image} alt="" loading="lazy" /> : <span className="free-room-placeholder"><DoorOpen size={18} /></span>}
                          <span className="free-room-copy">
                            <b>{room.code}</b>
                            <small>
                              {room.alwaysFree ? 'Open study space' : `${room.floor || room.roomKind || 'Room'} · free in timetable`}
                            </small>
                          </span>
                          {room.alwaysFree ? <Badge tone="green">Open</Badge> : <ArrowRight size={14} />}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={DoorOpen} title="No candidate free room in this filter">
                Try another period or block. Only rooms that appear in the official room timetable are listed.
              </EmptyState>
            )}
            <DataFoot>
              Official room timetable: {data?.roomTimetable?.source?.label || 'FET room export'} ·{' '}
              {data?.roomTimetable?.count || 0} rooms checked. The browser shows a published snapshot; it does not poll the college site.
            </DataFoot>
          </div>
        )}

        {tab === 'room' && (
          <div className="tab-pane">
            <div className="room-finder-head">
              <div>
                <h2>Room finder</h2>
                <p>Search a room code, then see its weekly schedule and campus location.</p>
              </div>
              <div className="room-select-wrap">
                <Select
                  label="Jump to room"
                  value={roomInfo?.code || ''}
                  onChange={(value) => setParam({ room: value, tab: 'room' })}
                  options={[{ value: '', label: 'Choose a room' }, ...roomOptions]}
                />
              </div>
            </div>
            <div className="room-search-box">
              <SearchField value={roomQuery} onChange={setRoomQuery} placeholder="Try F107, S214, G18, “comp lab” or “library”…" />
              {searchRoom.length > 0 && (
                <div className="room-search-results">
                  {searchRoom.map((room) => (
                    <button
                      type="button"
                      key={room.id}
                      onClick={() => {
                        setParam({ room: room.code, tab: 'room' });
                        setRoomQuery('');
                      }}
                    >
                      <span>
                        <b>{room.code}</b>
                        <small>{[room.block, room.floor, roomKindLabel(room)].filter(Boolean).join(' · ')}</small>
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {roomInfo ? (
              <>
                <div className="room-detail-strip">
                  {roomInfo.image ? <img src={roomInfo.image} alt={`${roomInfo.code} room`} /> : <span className="room-detail-placeholder"><DoorOpen size={26} /></span>}
                  <div>
                    <span className="eyebrow">ROOM PROFILE</span>
                    <h3>{roomInfo.code}</h3>
                    <p>{[roomInfo.block, roomInfo.floor, roomKindLabel(roomInfo)].filter(Boolean).join(' · ') || 'Block and floor are not verified.'}</p>
                    <small>{roomInfo.source}</small>
                  </div>
                  <div className="room-detail-actions">
                    <Link to={`/map?room=${encodeURIComponent(roomInfo.code)}`} className="btn primary small">
                      <MapPin size={14} /> Route to block
                    </Link>
                    {roomLectures.length > 0 && <Badge tone="gold">{roomLectures.length} classes/week</Badge>}
                  </div>
                </div>
                {roomLectures.length ? (
                  <WeekGrid lectures={roomLectures.map((lecture) => ({ ...lecture, sectionLabel: lecture.sectionLabel }))} onSelect={setSelected} showSection timetable={timetable} />
                ) : roomInfo.openStudySpace ? (
                  <InlineNotice tone="info" title="Open study space, not a scheduled classroom">
                    Central Library is not part of the FET room timetable. Check the official library hours before travelling.
                  </InlineNotice>
                ) : (
                  <EmptyState icon={DoorOpen} title="No scheduled classes for this room">
                    It may be a lab, office, exam hall or a room used only for events. Block and floor data may need on-site verification.
                  </EmptyState>
                )}
                <DataFoot>Room schedules come from the official FET room timetable; block/floor labels are inferred from code patterns and editable in the admin studio.</DataFoot>
              </>
            ) : (
              <div className="room-empty">
                <span className="empty-icon"><DoorOpen size={24} /></span>
                <b>Choose a room to see its week</b>
                <p>Room codes such as F107 (F-Block), S214 (S-Block), G18 (G-Block), CSE labs and the Central Library come from the official room data.</p>
              </div>
            )}
          </div>
        )}

        {tab === 'compare' && (
          <div className="tab-pane">
            <div className="compare-head">
              <div>
                <h2>Compare two sections</h2>
                <p>See where schedules overlap and where you can meet between classes.</p>
              </div>
              <div className="day-strip compact">
                {DAYS_SHORT.map((label, index) => (
                  <button type="button" key={label} className={day === index ? 'active' : ''} onClick={() => setDay(index)}>
                    <small>{label}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="compare-selects">
              <SectionSelect label="First section" value={compareA} onChange={(value) => setParam({ a: value })} />
              <span className="compare-vs">vs</span>
              <SectionSelect label="Second section" value={compareB} onChange={(value) => setParam({ b: value })} />
            </div>
            <div className="compare-table">
              <div className="compare-row head">
                <span>Period</span>
                <b>{compare.first?.id || compareA}</b>
                <b>{compare.second?.id || compareB}</b>
              </div>
              {PERIOD_STARTS.map((start, period) => {
                const left = compare.left.find((lecture) => lecture.period === period);
                const right = compare.right.find((lecture) => lecture.period === period);
                return (
                  <div className={`compare-row ${left && right && left.subject === right.subject ? 'same' : ''}`} key={start}>
                    <span className="compare-period">
                      <b>P{period + 1}</b>
                      <small>{formatClock(start)}</small>
                    </span>
                    {[left, right].map((lecture, index) => (
                      <div className={`compare-cell ${lecture ? 'filled' : 'free'}`} key={index}>
                        {lecture ? (
                          <>
                            <b>{cleanSubject(lecture.subject)}</b>
                            <small>{lecture.room || 'Room TBC'} · {lecture.teacher || 'Faculty TBC'}</small>
                          </>
                        ) : (
                          <small>Free</small>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="compare-summary">
              <Badge tone="green">{compare.leftFree} free periods in {compare.first?.id || compareA}</Badge>
              <Badge tone="gold">{compare.rightFree} free periods in {compare.second?.id || compareB}</Badge>
              <span>Same subject overlap is highlighted.</span>
            </div>
          </div>
        )}
      </Panel>

      {teacher && teacherLectures.length > 0 && tab !== 'teacher' && (
        <Panel className="teacher-week-panel">
          <PanelHead eyebrow="TEACHER VIEW" title={`${teacher} · weekly classes`} description="All classes in the current export that name this teacher." />
          <WeekGrid lectures={teacherLectures} onSelect={setSelected} showSection timetable={timetable} />
        </Panel>
      )}

      {tab === 'teacher' && (
        <Panel className="teacher-week-panel">
          <PanelHead eyebrow="TEACHER VIEW" title={`${teacher} · weekly classes`} description={`${teacherLectures.length} classes found across published sections.`} />
          {teacherLectures.length ? <WeekGrid lectures={teacherLectures} onSelect={setSelected} showSection timetable={timetable} /> : <EmptyState title="No classes found for this teacher" />}
        </Panel>
      )}

      <LectureModal lecture={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
