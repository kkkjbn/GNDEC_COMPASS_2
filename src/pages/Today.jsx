import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Clock3,
  Coffee,
  Compass,
  ExternalLink,
  MapPin,
  Navigation,
  Sparkles,
} from 'lucide-react';
import { Link } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import { DAYS, DAYS_SHORT, formatClock, greeting, istDate, longDate, dayIndexFor, dateKey, timeToMin } from '../lib/utils.js';
import {
  COLLEGE_DAY_END_MINUTES,
  dayPlanOn,
  findCurrentAndNext,
  findSection,
  isMentoringLecture,
  lecturesOn,
  nextStudyDay,
  nowNextThen,
  personalizeSection,
} from '../lib/timetable.js';
import { findRoute } from '../lib/campus.js';
import { Badge, DataFoot, Panel, PanelHead } from '../components/ui.jsx';
import { useShell } from '../components/Shell.jsx';

function minutesUntil(lecture, now) {
  const start = new Date(now);
  const [hours, minutes] = lecture.start.split(':').map(Number);
  start.setHours(hours, minutes, 0, 0);
  const diff = Math.round((start - now) / 60000);
  if (diff <= 0) return 'now';
  if (diff < 60) return `in ${diff} min`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `in ${h}h${m ? ` ${m}m` : ''}`;
}

const cleanSubject = (value = '') => value.replace(/\s+[LTP]$/, '') || 'Class';

function AgendaRow({ tag, lecture, empty, when, isNow = false }) {
  if (!lecture) {
    return (
      <div className={`agenda-row ${isNow ? 'is-now' : ''} empty`}>
        <span className="agenda-tag">{tag}</span>
        <div className="agenda-main">
          <b>{empty}</b>
        </div>
      </div>
    );
  }
  return (
    <div className={`agenda-row ${isNow ? 'is-now' : ''}`}>
      <span className="agenda-tag">{tag}</span>
      <div className="agenda-main">
        <b>{cleanSubject(lecture.subject)}</b>
        <small>
          <Clock3 size={11} /> {formatClock(lecture.start)}–{formatClock(lecture.end)}
          <span>·</span>
          {lecture.room || 'Room not listed'}
        </small>
      </div>
      {when && <span className="agenda-when">{when}</span>}
    </div>
  );
}

/**
 * Now / Next / Then card in the hero. After 5pm and on weekends it follows
 * the old Compass behaviour and moves to the next study day.
 */
function AgendaCard({ section, now }) {
  const { data } = useApp();
  const agenda = nowNextThen(section, now || new Date());
  const { current, next, then, mode, nextDay } = agenda;
  const focus = current || next;
  const dayIndex = dayIndexFor(now);
  const dayPlan = dayIndex >= 0 ? lecturesOn(section, dayIndex) : [];
  const currentLectures = findCurrentAndNext(section, now, data?.timetable);
  const progress = current
    ? Math.max(0, Math.min(100, ((now.getHours() * 60 + now.getMinutes() - timeToMin(current.start)) / Math.max(1, timeToMin(current.end) - timeToMin(current.start))) * 100))
    : 0;

  if (!section) {
    return (
      <div className="next-class-card agenda-card empty">
        <span className="next-label">YOUR TIMETABLE</span>
        <h3>Pick your section</h3>
        <p>Choose a section once and Compass keeps your day in view.</p>
        <Link to="/settings" className="btn light small">
          Set up profile <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  const nextDayLabel = nextDay ? `${DAYS[nextDay.day].slice(0, 3)} ${nextDay.date.getDate()}` : '';
  const heading = current
    ? 'IN CLASS NOW'
    : nextDay
      ? `NEXT STUDY DAY · ${nextDayLabel}`
      : mode === 'finished'
        ? 'CLASSES FINISHED'
        : 'UP NEXT';
  const nowEmpty =
    mode === 'after-hours'
      ? 'Classes are finished for today'
      : mode === 'weekend'
        ? 'It’s the weekend — no classes today'
        : mode === 'finished'
          ? 'No class right now'
          : 'Free time right now';
  const nextEmpty = nextDay ? 'No classes on the next study day' : 'Nothing else listed today';
  const nextWhen = next ? (nextDay ? DAYS_SHORT[nextDay.day] : minutesUntil(next, now)) : '';
  const thenWhen = then ? (nextDay ? DAYS_SHORT[nextDay.day] : minutesUntil(then, now)) : '';
  const dayCopy = nextDay
    ? `${DAYS[nextDay.day]} ${nextDay.date.getDate()} ${nextDay.date.toLocaleDateString('en-IN', { month: 'short' })}`
    : currentLectures.current
      ? `until ${formatClock(currentLectures.current.end)}`
      : dayPlan.length
        ? 'Today'
        : '';

  return (
    <div className={`next-class-card agenda-card ${current ? 'live' : ''}`}>
      <div className="next-card-top">
        <span className="next-label">
          <span className={`live-dot ${current ? 'on' : ''}`} />
          {heading}
        </span>
        <span className="next-time">{dayCopy}</span>
      </div>

      {current && (
        <span className="agenda-progress" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </span>
      )}

      <div className="agenda-list">
        <AgendaRow tag="Now" lecture={current} empty={nowEmpty} isNow />
        <AgendaRow tag="Next" lecture={next} empty={nextEmpty} when={nextWhen} />
        <AgendaRow tag="Then" lecture={then} empty={then ? '' : 'Nothing else listed'} when={thenWhen} />
      </div>

      <div className="next-actions">
        <Link to={`/timetable?section=${section.id}${nextDay ? `&day=${nextDay.day}` : ''}`} className="btn light small">
          Full timetable
        </Link>
        {focus?.room && (
          <Link to={`/map?room=${encodeURIComponent(focus.room)}`} className="next-route">
            Route to {focus.room} <ArrowUpRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function Today() {
  const { data, profile, online } = useApp();
  const { openProfile } = useShell();
  const [now, setNow] = useState(() => istDate());
  const [manualDay, setManualDay] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(istDate()), 30000);
    return () => clearInterval(timer);
  }, []);

  const section = useMemo(
    () => personalizeSection(data?.timetable, profile) || findSection(data?.timetable, profile.sectionId),
    [data, profile],
  );
  const timetable = data?.timetable;
  const campus = data?.campus;
  const todayIndex = dayIndexFor(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const afterCollegeHours = nowMinutes >= COLLEGE_DAY_END_MINUTES;
  const currentToday = useMemo(
    () => (section && todayIndex >= 0 ? lecturesOn(section, todayIndex).find((lecture) => timeToMin(lecture.start) <= nowMinutes && timeToMin(lecture.end) > nowMinutes) : null),
    [section, todayIndex, nowMinutes],
  );
  const lookAheadDay = useMemo(
    () => (section && (todayIndex < 0 || (afterCollegeHours && !currentToday)) ? nextStudyDay(section, now) : null),
    [section, todayIndex, afterCollegeHours, currentToday, now],
  );
  const chosenDay = manualDay ?? lookAheadDay?.day ?? Math.max(0, todayIndex);
  const lectures = useMemo(() => (chosenDay >= 0 ? lecturesOn(section, chosenDay) : []), [section, chosenDay]);
  const dayPlan = useMemo(() => (chosenDay >= 0 ? dayPlanOn(section, chosenDay, timetable) : []), [section, chosenDay, timetable]);
  const breakCount = dayPlan.filter((item) => item.free).length;
  const notices = useMemo(
    () => [...(data?.notices?.notices || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 3),
    [data],
  );
  const route = useMemo(() => findRoute(campus, 'main-gate', 'library'), [campus]);
  const stats = data?.timetable?.sections || [];
  const nextHoliday = useMemo(() => {
    const today = dateKey(now);
    return (data?.notices?.holidays || []).filter((holiday) => holiday.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  }, [data, now]);

  if (!data) return null;

  return (
    <div className="today-page">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">{longDate(now)}</span>
          <h1>
            {greeting(now)}
            {profile.name ? (
              <>
                ,<br />
                <em>{profile.name.split(' ')[0]}.</em>
              </>
            ) : (
              <>
                .<br />
                <em>Let’s make it count.</em>
              </>
            )}
          </h1>
          <p className="hero-lede">
            {section
              ? `You’re in ${section.label}${section.cohortId ? ` · ${section.cohortId}` : ''}. Here’s your day, your rooms and everything happening around campus.`
              : 'Your timetable, campus routes, people and study material — all in one calm place.'}
          </p>
          <div className="hero-actions">
            <Link to="/timetable" className="btn primary">
              Open my timetable <ArrowRight size={16} />
            </Link>
            <button type="button" className="btn ghost" onClick={openProfile}>
              {profile.name ? 'Edit profile' : 'Set up my section'}
            </button>
          </div>
          <div className="hero-meta">
            <span>
              <span className={`status-dot ${online ? 'online' : 'offline'}`} />
              {online ? 'Published campus data' : 'Working offline'}
            </span>
            <span>·</span>
            <span>{stats.length} sections indexed</span>
            {nextHoliday && (
              <>
                <span>·</span>
                <span>Next holiday: {nextHoliday.name}</span>
              </>
            )}
          </div>
        </div>
        <div className="hero-media">
          <img src="/img/hero/gndec_gne_front.jpg" alt="The GNDEC main entrance on Gill Road" />
          <span className="hero-photo-tag">
            <MapPin size={13} /> GNDEC · Gill Road, Ludhiana
          </span>
          <span className="hero-stamp">
            <Compass size={16} />
            <span>
              <b>Compass</b>
              <small>EST. 1953 · CAMPUS GUIDE</small>
            </span>
          </span>
          <AgendaCard section={section} now={now} />
        </div>
      </section>

      <div className="today-grid">
        <Panel className="day-panel">
          <PanelHead
            eyebrow="YOUR DAY"
            title={chosenDay === dayIndexFor(now) ? 'Today’s classes' : `${DAYS[chosenDay]}’s classes`}
            description={section ? `${section.label}${section.academicGroup ? ` · ${section.academicGroup}` : ''} · ${lectures.length} ${lectures.length === 1 ? 'class' : 'classes'}${breakCount ? ` · ${breakCount} ${breakCount === 1 ? 'break' : 'breaks'}` : ''}${lookAheadDay ? ` · ${DAYS[lookAheadDay.day]} ${lookAheadDay.date.getDate()} is the next study day` : ''}` : 'Choose a section to see your classes'}
            action={
              <Link to="/timetable" className="subtle-link">
                Full week <ArrowRight size={14} />
              </Link>
            }
          />
          <div className="day-strip">
            {DAYS_SHORT.map((label, index) => {
              const date = new Date(now);
              const today = dayIndexFor(now);
              const diff = today >= 0 ? (index - today + 7) % 7 : null;
              if (today >= 0) date.setDate(date.getDate() + diff);
              else date.setDate(date.getDate() + index + 1);
              return (
                <button
                  type="button"
                  key={label}
                  className={`${chosenDay === index ? 'active' : ''} ${today === index ? 'today' : ''}`}
                  onClick={() => setManualDay(index)}
                >
                  <small>{label}</small>
                  <b>{today >= 0 ? date.getDate() : index + 1}</b>
                  {today === index && <span>Today</span>}
                </button>
              );
            })}
          </div>

          {lectures.length ? (
            <div className="day-timeline">
              {dayPlan.map((item) => {
                const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                const isCurrent = !item.free && chosenDay === dayIndexFor(now) && nowTime >= item.start && nowTime < item.end;
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
                          Water, food or open study time
                          <span>·</span>
                          rooms are not reserved
                        </p>
                      </div>
                      <div className="timeline-actions">
                        <Link
                          to={`/timetable?tab=free&day=${chosenDay}&period=${item.period}`}
                          className="mini-action"
                          title="Find a free room for this period"
                        >
                          <Coffee size={14} /> Free rooms
                        </Link>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className={`timeline-row ${isCurrent ? 'current' : ''}`} key={item.id}>
                    <div className="timeline-time">
                      <b>{formatClock(item.start)}</b>
                      <small>{formatClock(item.end)}</small>
                    </div>
                    <span className="timeline-dot" />
                    <div className="timeline-copy">
                      <div className="timeline-title">
                        <b>{item.subject}</b>
                        {isMentoringLecture(item) && <Badge tone="gold">Mentoring</Badge>}
                        {isCurrent && <Badge tone="green">Now</Badge>}
                      </div>
                      <p>
                        {item.teacher || item.teachers?.join(', ') || 'Faculty not listed'}
                        <span>·</span>
                        {item.room || 'Room not listed'}
                      </p>
                    </div>
                    <div className="timeline-actions">
                      {item.room && (
                        <Link to={`/map?room=${encodeURIComponent(item.room)}`} className="mini-action" title="Open room on map">
                          <MapPin size={14} /> Map
                        </Link>
                      )}
                      <Link to={`/timetable?section=${section.id}&day=${chosenDay}`} className="mini-action">
                        Details
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-day">
              <span className="empty-icon">
                <CalendarDays size={22} />
              </span>
              <b>{chosenDay === 0 && dayIndexFor(now) === -1 ? 'It’s Sunday.' : 'No classes listed for this day.'}</b>
              <p>
                {chosenDay === 5
                  ? 'Saturday schedules change often. Check the official FET export before coming to campus.'
                  : 'This could be a free day, or the official timetable may have changed after the last data check.'}
              </p>
              <button type="button" className="btn subtle" onClick={() => setManualDay(null)}>
                Back to today
              </button>
            </div>
          )}
          <DataFoot>Official FET timetable export · 17 September 2026 · always confirm last-minute changes with your department.</DataFoot>
        </Panel>

        <aside className="today-rail">
          <Panel className="quick-panel">
            <span className="eyebrow">MOVE QUICKLY</span>
            <h2>What do you need?</h2>
            <div className="quick-action-list">
              <Link to="/timetable?tab=free" className="quick-action">
                <span className="qa-icon green">
                  <Clock3 size={17} />
                </span>
                <span>
                  <b>Find a free room</b>
                  <small>Free classrooms by period</small>
                </span>
                <ArrowRight size={15} />
              </Link>
              <Link to="/map" className="quick-action">
                <span className="qa-icon orange">
                  <Navigation size={17} />
                </span>
                <span>
                  <b>Walk somewhere</b>
                  <small>{route ? `Library is ${Math.round(route.meters)} m from the gate` : 'Rasta Saathi campus routes'}</small>
                </span>
                <ArrowRight size={15} />
              </Link>
              <Link to="/ask" className="quick-action">
                <span className="qa-icon blue">
                  <Sparkles size={17} />
                </span>
                <span>
                  <b>Ask Compass</b>
                  <small>Timetable, people, papers, routes</small>
                </span>
                <ArrowRight size={15} />
              </Link>
              <Link to="/study" className="quick-action">
                <span className="qa-icon gold">
                  <BookOpen size={17} />
                </span>
                <span>
                  <b>Study material</b>
                  <small>Syllabus, PYQs & question banks</small>
                </span>
                <ArrowRight size={15} />
              </Link>
            </div>
          </Panel>

          <Panel className="notice-mini">
            <div className="notice-mini-head">
              <div>
                <span className="eyebrow">FROM THE NOTICEBOARD</span>
                <h2>Latest updates</h2>
              </div>
              <Link to="/notices" className="icon-link" aria-label="All notices">
                <ArrowUpRight size={17} />
              </Link>
            </div>
            <div className="notice-mini-list">
              {notices.map((notice, index) => (
                <a key={notice.id} href={notice.url} target="_blank" rel="noreferrer" className="notice-mini-row">
                  <span className={`notice-dot ${notice.kind}`} />
                  <span>
                    <b>{notice.title}</b>
                    <small>{notice.displayDate || notice.date} · {notice.source}</small>
                  </span>
                  <ExternalLink size={13} />
                </a>
              ))}
            </div>
            <Link to="/notices" className="arrow-link">
              All notices & exams <ArrowRight size={14} />
            </Link>
          </Panel>

          <div className="campus-card">
            <img src="/img/gallery/campus-courtyard.jpg" alt="GNDEC campus courtyard" loading="lazy" />
            <div>
              <span className="eyebrow pale">CAMPUS, IN FRAME</span>
              <h3>The courtyard between classes.</h3>
              <p>Real photos from around GNDEC — no stock campus imagery.</p>
              <Link to="/map?tab=gallery" className="btn light small">
                Open photo gallery
              </Link>
            </div>
          </div>
        </aside>
      </div>

      <section className="feature-band">
        <div className="feature-heading">
          <div>
            <span className="eyebrow">MADE FOR CAMPUS LIFE</span>
            <h2>
              Less guesswork.<br />
              <em>More campus.</em>
            </h2>
          </div>
          <p>Four tools that replace the scattered WhatsApp forwards, blurry PDFs and “which block is this?” messages.</p>
        </div>
        <div className="feature-grid">
          <Link to="/map" className="feature-card tall" style={{ backgroundImage: 'linear-gradient(180deg, rgba(8,40,31,.05), rgba(8,40,31,.82)), url(/img/gallery/campus-road.jpg)' }}>
            <span className="feature-tag">RASTA SAATHI</span>
            <div>
              <h3>Find your way, block by block.</h3>
              <p>Photo-guided walking routes between gates, departments, library and hostels.</p>
              <span className="feature-link">
                Open campus map <ArrowRight size={15} />
              </span>
            </div>
          </Link>
          <Link to="/study" className="feature-card" style={{ backgroundImage: 'linear-gradient(180deg, rgba(8,40,31,.05), rgba(8,40,31,.8)), url(/img/gallery/library-sign.jpg)' }}>
            <span className="feature-tag">STUDY HUB</span>
            <div>
              <h3>Syllabus, papers, question banks.</h3>
              <span className="feature-link">
                1,600 indexed papers <ArrowRight size={15} />
              </span>
            </div>
          </Link>
          <Link to="/students" className="feature-card" style={{ backgroundImage: 'linear-gradient(180deg, rgba(8,40,31,.05), rgba(8,40,31,.8)), url(/img/gallery/academic-block.jpg)' }}>
            <span className="feature-tag">PEOPLE</span>
            <div>
              <h3>Know who’s in your section.</h3>
              <span className="feature-link">
                Student & faculty directory <ArrowRight size={15} />
              </span>
            </div>
          </Link>
        </div>
      </section>

      <section className="coverage-band">
        <div>
          <span className="eyebrow">HONEST BY DESIGN</span>
          <h2>What Compass knows — and what it doesn’t.</h2>
          <p>
            Every dataset carries its source and coverage. First-year timetables are complete; some second and third-year groups are partial. We never fill gaps
            with invented rooms, teachers or dates.
          </p>
          <Link to="/about" className="arrow-link">
            Read our method & data notes <ArrowRight size={14} />
          </Link>
        </div>
        <div className="coverage-list">
          <div>
            <b>First-year timetable</b>
            <span className="coverage-bar">
              <i style={{ width: '100%' }} />
            </span>
            <small>Complete published export</small>
          </div>
          <div>
            <b>Second & third-year timetable</b>
            <span className="coverage-bar partial">
              <i style={{ width: '28%' }} />
            </span>
            <small>Partial — section coverage varies</small>
          </div>
          <div>
            <b>Indoor room-level routes</b>
            <span className="coverage-bar gap">
              <i style={{ width: '8%' }} />
            </span>
            <small>Not yet verified; block routes only</small>
          </div>
          <div>
            <b>Official exam date sheets</b>
            <span className="coverage-bar gap">
              <i style={{ width: '12%' }} />
            </span>
            <small>Notice links only — no full date sheet</small>
          </div>
        </div>
      </section>
    </div>
  );
}
