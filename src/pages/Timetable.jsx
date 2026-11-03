import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Clock3,
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
  norm,
  timeToMin,
  yearLabel,
} from '../lib/utils.js';
import {
  compareSections,
  findSection,
  freeClassrooms,
  lecturesOn,
  periodForMinutes,
  roomSchedule,
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
  const now = new Date();
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
  const { data, profile } = useApp();
  const { searchParams, navigate } = useRouter();
  const timetable = data?.timetable;
  const [selected, setSelected] = useState(null);
  const [now, setNow] = useState(new Date());
  const [roomQuery, setRoomQuery] = useState('');
  const [blockFilter, setBlockFilter] = useState('all');

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const teacherQuery = searchParams.get('teacher') || '';
  const roomQueryParam = searchParams.get('room') || '';
  const tabParam = searchParams.get('tab');
  const tab = tabParam || (teacherQuery ? 'teacher' : roomQueryParam ? 'room' : 'day');
  const selectedSectionId = searchParams.get('section') || profile.sectionId || 'ECB';
  const section = findSection(timetable, selectedSectionId);
  const [day, setDay] = useState(() => Math.max(0, dayIndexFor(new Date())));
  const teacher = teacherQuery ? teacherQuery : '';

  const setParam = (updates, options = {}) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    navigate(`/timetable?${next.toString()}`, { replace: true, keepScroll: options.keepScroll ?? true });
  };

  const teacherLectures = useMemo(() => (teacher ? teacherSchedule(timetable, teacher) : []), [timetable, teacher]);
  const roomInfo = useMemo(() => (data?.rooms?.rooms || []).find((item) => norm(item.code) === norm(roomQueryParam) || norm(item.id) === norm(roomQueryParam)), [data, roomQueryParam]);
  const roomLectures = useMemo(() => (roomQueryParam ? roomSchedule(timetable, roomInfo?.code || roomQueryParam) : []), [timetable, roomInfo, roomQueryParam]);

  const lectures = useMemo(() => (section ? section.lectures || [] : []), [section]);
  const dayLectures = useMemo(() => (day >= 0 ? lecturesOn(section, day) : []), [section, day]);
  const weekCount = lectures.length;
  const coverage = sectionCoverage(section);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentPeriod = periodForMinutes(timetable, nowMinutes);
  const today = dayIndexFor(now);

  const freePeriod = tab === 'free' ? Number(searchParams.get('period') ?? Math.max(0, currentPeriod)) : Math.max(0, currentPeriod);
  const freeDay = tab === 'free' ? Number(searchParams.get('day') ?? Math.max(0, today)) : Math.max(0, today);
  const free = useMemo(
    () => freeClassrooms(timetable, data?.rooms?.rooms, freeDay, Math.min(7, Math.max(0, freePeriod))),
    [timetable, data, freeDay, freePeriod],
  );
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
            <SectionSelect value={section?.id || selectedSectionId} onChange={(value) => setParam({ section: value })} />
            <Link to="/ask?q=My%20next%20class" className="btn secondary">
              Ask Compass
            </Link>
          </div>
        }
      />

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
          {section && (
            <div className="section-summary">
              <span className="section-code">{section.id}</span>
              <div>
                <b>{section.label}</b>
                <small>
                  {weekCount} classes/week · {branchShort(section.branch)} · {yearLabel(section.year)}
                </small>
              </div>
              <Badge tone={section.year === 1 ? 'green' : 'gold'}>
                {section.year === 1 ? 'Published export' : coverage.percent > 40 ? 'Mostly covered' : 'Partial export'}
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
                <h2>{DAYS[day]} · {section?.label || 'No section'}</h2>
                <p>
                  {dayLectures.length} classes · {8 - dayLectures.length} free periods
                  {today === day ? ` · period ${currentPeriod + 1} now` : ''}
                </p>
              </div>
              <Link to={`/timetable?section=${section?.id || ''}&tab=week`} className="btn subtle">
                See full week <ArrowRight size={15} />
              </Link>
            </div>
            {dayLectures.length ? (
              <div className="day-timeline timetable-list">
                {dayLectures.map((lecture) => {
                  const isCurrent = today === day && nowMinutes >= timeToMin(lecture.start) && nowMinutes < timeToMin(lecture.end);
                  return (
                    <button type="button" className={`timeline-row clickable ${isCurrent ? 'current' : ''}`} key={lecture.id} onClick={() => setSelected(lecture)}>
                      <div className="timeline-time">
                        <b>{formatClock(lecture.start)}</b>
                        <small>{formatClock(lecture.end)}</small>
                      </div>
                      <span className="timeline-dot" />
                      <div className="timeline-copy">
                        <div className="timeline-title">
                          <b>{cleanSubject(lecture.subject)}</b>
                          {subjectKind(lecture.subject) && <Badge tone="neutral">{subjectKind(lecture.subject)}</Badge>}
                          {isCurrent && <Badge tone="green">Now</Badge>}
                        </div>
                        <p>
                          {lecture.teacher || lecture.teachers?.join(', ') || 'Faculty not listed'}
                          <span>·</span>
                          {lecture.room || 'Room not listed'}
                          {lecture.subsection ? <><span>·</span>{lecture.subsection}</> : null}
                        </p>
                      </div>
                      <div className="timeline-actions">
                        <span className="room-pill">
                          <MapPin size={13} /> {lecture.room || 'TBC'}
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
                <h2>{section?.label || 'Weekly timetable'}</h2>
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
                <h2>Free classrooms</h2>
                <p>Rooms with no scheduled class in the official export for the chosen period.</p>
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
                  options={[
                    { value: 'all', label: 'All blocks' },
                    { value: 'F-Block', label: 'F-Block' },
                    { value: 'G-Block', label: 'G-Block' },
                    { value: 'S-Block', label: 'S-Block' },
                  ]}
                />
              </div>
            </div>
            <InlineNotice tone="warn" title="A timetable gap is not a booking">
              Rooms can still be used for events, makeup classes, exams or faculty work. Knock before using a room and follow department instructions.
            </InlineNotice>
            <div className="free-count-row">
              <b>{free.length}</b>
              <span>candidate free rooms · {DAYS[freeDay]}, P{Math.min(7, Math.max(0, freePeriod)) + 1} ({formatClock(PERIOD_STARTS[Math.min(7, Math.max(0, freePeriod))])}–{formatClock(PERIOD_STARTS[Math.min(7, Math.max(0, freePeriod))] + 60)})</span>
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
                              {room.floor || room.kind || 'Room'} · free in timetable
                            </small>
                          </span>
                          <ArrowRight size={14} />
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={DoorOpen} title="No candidate free room in this filter">
                Try another period or block. Only rooms that appear in the official timetable are listed.
              </EmptyState>
            )}
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
              <SearchField value={roomQuery} onChange={setRoomQuery} placeholder="Try F107, S214, G18 or “workshop”…" />
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
                        <small>{[room.block, room.floor, room.kind].filter(Boolean).join(' · ')}</small>
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
                  {roomInfo.image ? <img src={roomInfo.image} alt={`${roomInfo.code} classroom`} /> : <span className="room-detail-placeholder"><DoorOpen size={26} /></span>}
                  <div>
                    <span className="eyebrow">ROOM PROFILE</span>
                    <h3>{roomInfo.code}</h3>
                    <p>{[roomInfo.block, roomInfo.floor, roomInfo.kind].filter(Boolean).join(' · ') || 'Block and floor are not verified.'}</p>
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
                ) : (
                  <EmptyState icon={DoorOpen} title="No scheduled classes for this room">
                    It may be a lab, office, exam hall or a room used only for events. Block and floor data may need on-site verification.
                  </EmptyState>
                )}
                <DataFoot>Room codes come from the official timetable. Block/floor matches are inferred from code patterns and editable in the admin studio.</DataFoot>
              </>
            ) : (
              <div className="room-empty">
                <span className="empty-icon"><DoorOpen size={24} /></span>
                <b>Choose a room to see its week</b>
                <p>Room codes such as F107 (F-Block), S214 (S-Block) and G18 (G-Block) come from the official timetable.</p>
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
