import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bell, CalendarDays, ExternalLink, Sun, X } from 'lucide-react';
import { Link } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import {
  BANNER_EVENT,
  currentHolidayBanner,
  currentTopNotice,
  dismissNoticeForBrowser,
  fetchBannerConfig,
  holidayHeadline,
  readBannerConfig,
  readCachedBannerConfig,
  readDismissedNoticeIds,
} from '../lib/banner.js';
import { istDate } from '../lib/utils.js';

const REFRESH_MS = 5 * 60 * 1000;

/**
 * Campus-wide banners under the top bar: the legacy-style holiday alert and
 * the newest GNDEC notice for the first few days after it is published.
 * The notice config is shared through the Worker API, with a local cache so
 * the banner still behaves sensibly offline.
 */
export function CampusBanner() {
  const { data, online, toast } = useApp();
  const [config, setConfig] = useState(() => (typeof navigator !== 'undefined' && !navigator.onLine ? readCachedBannerConfig() : readBannerConfig()));
  const [now, setNow] = useState(() => istDate());
  const [dismissed, setDismissed] = useState(() => readDismissedNoticeIds());

  useEffect(() => {
    const timer = setInterval(() => setNow(istDate()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!navigator.onLine) return;
      const next = await fetchBannerConfig();
      if (active && next) setConfig(next);
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener('online', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('online', refresh);
    };
  }, []);

  useEffect(() => {
    const onChange = (event) => {
      if (event.detail) setConfig(event.detail);
    };
    window.addEventListener(BANNER_EVENT, onChange);
    return () => window.removeEventListener(BANNER_EVENT, onChange);
  }, []);

  const holiday = useMemo(
    () => currentHolidayBanner(data?.notices?.holidays || [], now),
    [data, now],
  );
  const notice = useMemo(() => {
    const candidate = currentTopNotice(data?.notices?.notices || [], config, now);
    return candidate && !dismissed.includes(candidate.id) ? candidate : null;
  }, [data, config, now, dismissed]);

  if (!holiday && !notice) return null;

  return (
    <div className="campus-banners" role="region" aria-label="Campus alerts">
      {holiday && (
        <div className={`campus-banner holiday ${holiday.daysUntil === 0 ? 'today' : ''}`}>
          <span className="campus-banner-icon" aria-hidden="true">
            {holiday.daysUntil === 0 ? <Sun size={18} /> : <CalendarDays size={18} />}
          </span>
          <div className="campus-banner-copy">
            <b>{holidayHeadline(holiday)}</b>
            <span>
              {holiday.holiday.displayDate || holiday.holiday.date}
              {holiday.holiday.weekday ? ` · ${holiday.holiday.weekday}` : ''} · {holiday.holiday.category || 'Full-day holiday'}
            </span>
          </div>
          <Link to="/notices?tab=holidays" className="campus-banner-action">
            Holiday list <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {notice && (
        <div className="campus-banner notice">
          <span className="campus-banner-icon" aria-hidden="true">
            <Bell size={18} />
          </span>
          <div className="campus-banner-copy">
            <span className="campus-banner-label">NEW FROM GNDEC</span>
            <b>{notice.title}</b>
            <span>
              {notice.displayDate || notice.date} · {notice.source || 'Official notice'}
            </span>
          </div>
          <div className="campus-banner-actions">
            {notice.url && (
              <a href={notice.url} target="_blank" rel="noreferrer" className="campus-banner-action">
                Read notice <ExternalLink size={13} />
              </a>
            )}
            <Link to="/notices" className="campus-banner-action quiet">
              All notices
            </Link>
          </div>
          <button
            type="button"
            className="campus-banner-close"
            aria-label="Hide this notice on this device"
            title="Hide on this device"
            onClick={() => {
              dismissNoticeForBrowser(notice.id);
              setDismissed(readDismissedNoticeIds());
              toast('This notice is hidden on this device. It stays visible for everyone else until it expires.', 'info');
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {!online && (
        <span className="campus-banners-offline">
          Offline · showing the cached banner state
        </span>
      )}
    </div>
  );
}
