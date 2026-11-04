import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Fish,
  Gift,
  Info,
  Megaphone,
  PartyPopper,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import { Link, useRouter } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import { dateKey, dateTimeLabel, istDate, istDayLabel, parseDate, relativeDay, sortByDateDesc } from '../lib/utils.js';
import {
  Badge,
  DataFoot,
  EmptyState,
  InlineNotice,
  PageHeader,
  Panel,
  SearchField,
  Tabs,
} from '../components/ui.jsx';

const KIND_META = {
  exam: { label: 'Exam', tone: 'orange', icon: GraduationCapIcon },
  event: { label: 'Event', tone: 'blue', icon: PartyPopper },
  admin: { label: 'Admin', tone: 'gold', icon: ShieldCheck },
  general: { label: 'Notice', tone: 'neutral', icon: Megaphone },
};

function GraduationCapIcon(props) {
  return <Sparkles {...props} />;
}

function holidayIcon(category = '') {
  if (/gazetted|national|republic|independence|gandhi/i.test(category)) return Sun;
  if (/restricted|optional/i.test(category)) return Fish;
  return Gift;
}

export default function Notices() {
  const { data } = useApp();
  const { searchParams, navigate } = useRouter();
  const tab = searchParams.get('tab') || 'all';
  const [query, setQuery] = useState(searchParams.get('q') || '');

  useEffect(() => setQuery(searchParams.get('q') || ''), [searchParams]);

  const notices = data?.notices?.notices || [];
  const holidays = data?.notices?.holidays || [];
  const exams = data?.notices?.exams || [];

  const counts = useMemo(
    () => ({
      all: notices.length,
      exam: notices.filter((notice) => notice.kind === 'exam').length,
      event: notices.filter((notice) => notice.kind === 'event').length,
      admin: notices.filter((notice) => notice.kind === 'admin').length,
      general: notices.filter((notice) => notice.kind === 'general').length,
    }),
    [notices],
  );

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase();
    const source =
      tab === 'holidays'
        ? []
        : tab === 'exams'
          ? [...notices.filter((notice) => notice.kind === 'exam'), ...exams]
          : tab === 'all'
            ? notices
            : notices.filter((notice) => notice.kind === tab);
    const seen = new Set();
    return sortByDateDesc(
      source.filter((notice) => {
        const key = `${notice.title}-${notice.date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        if (!terms) return true;
        return `${notice.title} ${notice.source} ${notice.kind} ${notice.displayDate}`.toLowerCase().includes(terms);
      }),
    );
  }, [notices, exams, tab, query]);

  const noticesUpdated = istDayLabel(data?.notices?.generatedAt);
  const today = dateKey(istDate());
  const upcomingHolidays = useMemo(
    () => holidays.filter((holiday) => holiday.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    [holidays, today],
  );
  const holidayMonths = useMemo(() => {
    const groups = new Map();
    for (const holiday of holidays) {
      const date = parseDate(holiday.date);
      const key = date ? new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(date) : 'Date not listed';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(holiday);
    }
    return [...groups.entries()];
  }, [holidays]);

  const filteredHolidays = useMemo(() => {
    const terms = query.trim().toLowerCase();
    return holidays
      .filter((holiday) => !terms || `${holiday.name} ${holiday.category} ${holiday.displayDate}`.toLowerCase().includes(terms))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays, query]);

  const setTab = (value) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    next.delete('q');
    setQuery('');
    navigate(`/notices?${next.toString()}`, { replace: true, keepScroll: true });
  };

  if (!data) return null;

  const feature = filtered[0];
  const rest = filtered.slice(1);

  return (
    <div className="notices-page">
      <PageHeader
        eyebrow="STAY IN THE LOOP"
        title="Notices & exams"
        description="Official college notices, department updates and the published 2026 holiday list — each one links to its original source."
        actions={
          <div className="head-actions">
            <a className="btn secondary" href="https://gndec.ac.in/?q=holidays" target="_blank" rel="noreferrer">
              Official holidays <ExternalLink size={15} />
            </a>
            <a className="btn primary" href="https://erp.gndec.ac.in/notice" target="_blank" rel="noreferrer">
              ERP notice board <ExternalLink size={15} />
            </a>
          </div>
        }
      />

      <div className="notice-summary">
        <div>
          <span className="summary-icon green"><Bell size={18} /></span>
          <b>{notices.length}</b>
          <span>indexed notices</span>
        </div>
        <div>
          <span className="summary-icon orange"><Sparkles size={18} /></span>
          <b>{counts.exam + exams.length}</b>
          <span>exam updates</span>
        </div>
        <div>
          <span className="summary-icon blue"><PartyPopper size={18} /></span>
          <b>{counts.event}</b>
          <span>events</span>
        </div>
        <div>
          <span className="summary-icon gold"><CalendarDays size={18} /></span>
          <b>{upcomingHolidays.length}</b>
          <span>upcoming holidays</span>
        </div>
      </div>

      <Panel className="notices-shell">
        <div className="notices-toolbar">
          <Tabs
            options={[
              { value: 'all', label: 'All updates', icon: Bell, count: counts.all },
              { value: 'exams', label: 'Exams', icon: Sparkles, count: counts.exam + exams.length },
              { value: 'event', label: 'Events', icon: PartyPopper, count: counts.event },
              { value: 'admin', label: 'Administration', icon: ShieldCheck, count: counts.admin },
              { value: 'holidays', label: 'Holidays', icon: CalendarDays, count: holidays.length },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab !== 'holidays' && <SearchField value={query} onChange={setQuery} placeholder="Search notices…" className="notice-search" />}
        </div>

        {tab !== 'holidays' ? (
          <div className="notices-pane">
            {feature ? (
              <>
                <a className="featured-notice" href={feature.url} target="_blank" rel="noreferrer">
                  <div className="featured-notice-label">
                    <span className={`notice-dot ${feature.kind}`} />
                    {feature.kind === 'exam' ? 'EXAM UPDATE' : feature.kind === 'event' ? 'CAMPUS EVENT' : 'LATEST NOTICE'}
                    <span>{relativeDay(feature.date)}</span>
                  </div>
                  <h2>{feature.title}</h2>
                  <p>{feature.source} · {feature.displayDate || dateTimeLabel(feature.date)}</p>
                  <span className="featured-notice-link">
                    Open official notice <ExternalLink size={14} />
                  </span>
                </a>

                <div className="notice-feed">
                  {rest.map((notice) => {
                    const meta = KIND_META[notice.kind] || KIND_META.general;
                    const date = parseDate(notice.date);
                    return (
                      <a key={notice.id} href={notice.url} target="_blank" rel="noreferrer" className="notice-feed-row">
                        <span className="notice-date-block">
                          <b>{date ? String(date.getDate()).padStart(2, '0') : '•'}</b>
                          <small>{date ? new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date) : ''}</small>
                        </span>
                        <span className="notice-feed-copy">
                          <span className="notice-feed-top">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            <small>{relativeDay(notice.date)} · {notice.source}</small>
                          </span>
                          <b>{notice.title}</b>
                        </span>
                        <ExternalLink size={15} />
                      </a>
                    );
                  })}
                </div>
                {!rest.length && <p className="feed-end">That’s everything indexed for this filter.</p>}
              </>
            ) : (
              <EmptyState icon={Bell} title="No notice matches this search">
                Try a shorter phrase, or open the official ERP notice board for the newest updates.
              </EmptyState>
            )}
            <InlineNotice tone="info" title="Notices are links, not copies">
              Compass indexes titles and dates, then sends you to the original college source. A notice can be edited or withdrawn by the college without our index
              changing — always trust the official page.
            </InlineNotice>
            <DataFoot>
              Sources: GNDEC homepage and ERP notice board; indexed {notices.length} notices.
              {noticesUpdated ? ` Notices last updated ${noticesUpdated}.` : ''}
            </DataFoot>
          </div>
        ) : (
          <div className="holidays-pane">
            <div className="holiday-top">
              <div>
                <span className="eyebrow">PUBLISHED 2026 LIST</span>
                <h2>Holiday calendar</h2>
                <p>Official GNDEC holiday list. Department events and special working Saturdays can override it.</p>
              </div>
              <SearchField value={query} onChange={setQuery} placeholder="Search a holiday…" />
            </div>

            {upcomingHolidays.length > 0 && (
              <div className="upcoming-holidays">
                <span className="eyebrow">COMING UP</span>
                <div className="upcoming-holiday-grid">
                  {upcomingHolidays.slice(0, 4).map((holiday) => {
                    const Icon = holidayIcon(holiday.category);
                    return (
                      <div className="upcoming-holiday" key={holiday.id}>
                        <span className="holiday-icon"><Icon size={18} /></span>
                        <div>
                          <b>{holiday.name}</b>
                          <small>{holiday.displayDate || dateTimeLabel(holiday.date)} · {holiday.weekday}</small>
                        </div>
                        <Badge tone="green">{relativeDay(holiday.date)}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {query ? (
              <div className="holiday-months">
                <div className="holiday-month">
                  <div className="holiday-month-head">
                    <h3>Search results</h3>
                    <span>{filteredHolidays.length} holidays</span>
                  </div>
                  {filteredHolidays.map((holiday) => (
                    <div className={`holiday-row ${holiday.date < today ? 'past' : ''}`} key={holiday.id}>
                      <span className="holiday-date">
                        <b>{String(parseDate(holiday.date)?.getDate() || '').padStart(2, '0')}</b>
                        <small>{parseDate(holiday.date) ? new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(parseDate(holiday.date)) : ''}</small>
                      </span>
                      <span>
                        <b>{holiday.name}</b>
                        <small>{holiday.weekday} · {holiday.category || 'Holiday'}</small>
                      </span>
                      {holiday.date < today ? <Badge tone="neutral">Past</Badge> : <Badge tone="green">Upcoming</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="holiday-months">
                {holidayMonths.map(([month, items]) => (
                  <div className="holiday-month" key={month}>
                    <div className="holiday-month-head">
                      <h3>{month}</h3>
                      <span>{items.length} holidays</span>
                    </div>
                    {items.map((holiday) => (
                      <div className={`holiday-row ${holiday.date < today ? 'past' : ''}`} key={holiday.id}>
                        <span className="holiday-date">
                          <b>{String(parseDate(holiday.date)?.getDate() || '').padStart(2, '0')}</b>
                          <small>{parseDate(holiday.date) ? new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(parseDate(holiday.date)) : ''}</small>
                        </span>
                        <span>
                          <b>{holiday.name}</b>
                          <small>{holiday.weekday} · {holiday.category || 'Holiday'}</small>
                        </span>
                        {holiday.date < today ? <Badge tone="neutral">Past</Badge> : <Badge tone="green">Upcoming</Badge>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <InlineNotice tone="info" title="Verify before planning travel">
              The official holiday list is a reference. Colleges sometimes call special working days or reschedule events. Confirm with the college calendar.
            </InlineNotice>
            <DataFoot>
              Source: <a href="https://gndec.ac.in/?q=holidays" target="_blank" rel="noreferrer">GNDEC official holiday list <ExternalLink size={11} /></a>. {holidays.length} entries indexed.
            </DataFoot>
          </div>
        )}
      </Panel>
    </div>
  );
}
