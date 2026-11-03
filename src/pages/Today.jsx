import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Clock3,
  Coffee,
  Compass,
  ExternalLink,
  FileText,
  GraduationCap,
  Info,
  MapPin,
  Navigation,
  Sparkles,
  Users,
  WifiOff,
} from 'lucide-react';
import { Link, useRouter } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import { DAYS, DAYS_SHORT, branchShort, formatClock, greeting, longDate, dayIndexFor, dateKey } from '../lib/utils.js';
import { findCurrentAndNext, findSection, isMentoringLecture, lecturesOn, nextClassTodayOrLater, personalizeSection, dayPlanOn } from '../lib/timetable.js';
import { findRoute } from '../lib/campus.js';
import { Badge, DataFoot, Metric, PageHeader, Panel, PanelHead, RichText } from '../components/ui.jsx';
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

function NextClassCard({ section, now, compact = false }) {
  const { data } = useApp();
  const { current, next } = findCurrentAndNext(section, now, data?.timetable);
  const later = !current && !next ? nextClassTodayOrLater(section, now) : null;
  const lecture = current || next || later?.lecture;
  if (!section) {
    return (
      <div className="next-class-card empty">
        <span className="next-label">YOUR TIMETABLE</span>
        <h3>Pick your section</h3>
        <p>Choose a section once and Compass keeps your day in view.</p>
        <Link to="/settings" className="btn light small">
          Set up profile <ArrowRight size={14} />
        </Link>
      </div>
    );
  }
  if (!lecture) {
    return (
      <div className="next-class-card empty">
        <span className="next-label">{DAYS[dayIndexFor(now)] || 'Sunday'}</span>
        <h3>No classes left today</h3>
        <p>{section.label} · check tomorrow or the full week.</p>
        <Link to={`/timetable?section=${section.id}`} className="btn light small">
          Open timetable <ArrowRight size={14} />
        </Link>
      </div>
    );
  }
  const isNow = Boolean(current);
  const dayName = later && !later.isToday ? DAYS[later.day] : null;
  return (
    <div className={`next-class-card ${isNow ? 'live' : ''}`}>
      <div className="next-card-top">
        <span className="next-label">
          <span className={`live-dot ${isNow ? 'on' : ''}`} />
          {isNow ? 'IN CLASS NOW' : dayName ? `${dayName.toUpperCase()} · NEXT CLASS` : 'UP NEXT'}
        </span>
        <span className="next-time">{isNow ? `until ${formatClock(lecture.end)}` : minutesUntil(lecture, now)}</span>
      </div>
      <h3>{lecture.subject?.replace(/\s+[LTP]$/, '') || 'Class'}</h3>
      <p className="next-meta">
        <Clock3 size={14} /> {formatClock(lecture.start)}–{formatClock(lecture.end)}
        <span>·</span>
        <MapPin size={14} /> {lecture.room || 'Room not listed'}
      </p>
      {!compact && (
        <p className="next-teacher">
          {lecture.teacher || lecture.teachers?.join(', ') || 'Faculty not listed'} · {section.id}
          {section.academicGroup ? ` · ${section.academicGroup}` : ''}
        </p>
      )}
      <div className="next-actions">
        <Link to={`/timetable?section=${section.id}`} className="btn light small">
          Full timetable
        </Link>
        {lecture.room && (
          <Link to={`/map?room=${encodeURIComponent(lecture.room)}`} className="next-route">
            Route to room <ArrowUpRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}

export default function Today() {
  const { data, profile, online } = useApp();
  const { navigate } = useRouter();
  const { openProfile } = useShell();
  const [now, setNow] = useState(new Date());
  const [day, setDay] = useState(() => Math.max(0, dayIndexFor(new Date())));

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const section = useMemo(
    () => personalizeSection(data?.timetable, profile) || findSection(data?.timetable, profile.sectionId),
    [data, profile],
  );
  const timetable = data?.timetable;
  const campus = data?.campus;
  const lectures = useMemo(() => (day >= 0 ? lecturesOn(section, day) : []), [section, day]);
  const dayPlan = useMemo(() => (day >= 0 ? dayPlanOn(section, day, timetable) : []), [section, day, timetable]);
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

  const chosenDay = day;
  const dateForDay = useMemo(() => {
    const today = dayIndexFor(now);
    if (today < 0) return null;
    const diff = (chosenDay - today + 7) % 7;
    const date = new Date(now);
    date.setDate(date.getDate() + diff);
    return date;
  }, [chosenDay, now]);

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
              ? `You’re in ${section.label}. Here’s your day, your rooms and everything happening around campus.`
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
          <NextClassCard section={section} now={now} />
        </div>
      </section>

      <section className="metric-row">
        <Metric icon={CalendarDays} value={stats.length} label="Timetable sections" tone="green" />
        <Metric icon={Users} value={(data.students?.count || 0).toLocaleString('en-IN')} label="Students in public roster" tone="blue" onClick={() => navigate('/students')} />
        <Metric icon={GraduationCap} value={data.faculty?.count || 0} label="Faculty profiles" tone="gold" onClick={() => navigate('/faculty')} />
        <Metric icon={FileText} value={(data.papers?.count || 0).toLocaleString('en-IN')} label="Previous-year papers" tone="orange" onClick={() => navigate('/study?tab=papers')} />
      </section>

      <div className="today-grid">
        <Panel className="day-panel">
          <PanelHead
            eyebrow="YOUR DAY"
            title={chosenDay === dayIndexFor(now) ? 'Today’s classes' : `${DAYS[chosenDay]}’s classes`}
            description={section ? `${section.label}${section.academicGroup ? ` · ${section.academicGroup}` : ''} · ${lectures.length} ${lectures.length === 1 ? 'class' : 'classes'}${breakCount ? ` · ${breakCount} ${breakCount === 1 ? 'break' : 'breaks'}` : ''}` : 'Choose a section to see your classes'}
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
                  onClick={() => setDay(index)}
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
              <button type="button" className="btn subtle" onClick={() => setDay(Math.max(0, dayIndexFor(now)))}>
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
