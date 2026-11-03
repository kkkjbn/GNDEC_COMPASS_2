import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Compass,
  ExternalLink,
  Info,
  MapPin,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Link } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import { PageHeader, Panel } from '../components/ui.jsx';

const OLD_URL = 'https://gndec-compass.koushikjain2007.workers.dev/#/today';

export default function Legacy() {
  const { data } = useApp();
  return (
    <div className="legacy-page">
      <PageHeader
        eyebrow="PROJECT HISTORY"
        title="Old GNDEC Compass"
        description="The original student-built Compass remains online at its own address. Compass 2.0 is a separate project — same campus, fresh foundation."
        actions={
          <div className="head-actions">
            <Link to="/today" className="btn secondary">
              <ArrowLeft size={15} /> Back to Compass 2.0
            </Link>
            <a href={OLD_URL} target="_blank" rel="noreferrer" className="btn primary">
              Open old Compass <ExternalLink size={15} />
            </a>
          </div>
        }
      />

      <section className="legacy-hero">
        <div className="legacy-copy">
          <span className="legacy-mark">C</span>
          <span className="eyebrow pale">GNDEC COMPASS · 1.0</span>
          <h1>The original, still online.</h1>
          <p>
            The first Compass introduced the campus dashboard, section timetable, map sketch, notices and study links. It lives in a separate repository and
            Cloudflare Worker, with its own local settings.
          </p>
          <div className="legacy-actions">
            <a href={OLD_URL} target="_blank" rel="noreferrer" className="btn light">
              Launch old Compass <ExternalLink size={15} />
            </a>
            <span className="legacy-url">gndec-compass.koushikjain2007.workers.dev</span>
          </div>
        </div>
        <div className="legacy-art">
          <div className="legacy-window">
            <span className="legacy-window-bar">
              <i /><i /><i />
            </span>
            <div className="legacy-window-body">
              <span className="legacy-window-brand">
                <span>C</span> GNDEC Compass
              </span>
              <span className="legacy-window-line w1" />
              <span className="legacy-window-line w2" />
              <span className="legacy-window-grid">
                <i /><i /><i /><i />
              </span>
              <span className="legacy-window-line w3" />
              <span className="legacy-window-label">Original interface · 2024–25</span>
            </div>
          </div>
        </div>
      </section>

      <div className="legacy-grid">
        <Panel>
          <span className="eyebrow">WHAT CHANGED</span>
          <h2>Rebuilt, not repainted.</h2>
          <div className="legacy-compare">
            <div className="legacy-compare-head">
              <span />
              <b>Old Compass</b>
              <b>Compass 2.0</b>
            </div>
            {[
              ['Design', 'Original green dashboard', 'New responsive design system'],
              ['Timetable', 'First-year sections', 'Sections, sub-sections, free rooms, compare'],
              ['People', 'Basic faculty list', '1,146 students + 272 faculty profiles'],
              ['Map', 'Schematic overview', '45 places, routes and photo guide'],
              ['Ask', 'Keyword lookup', 'Deterministic fuzzy + Hinglish assistant'],
              ['Study', 'Links list', '1,600 papers, syllabus, question banks'],
              ['Offline', 'Basic cache', 'Full app shell + downloadable photo pack'],
              ['Data honesty', 'Partial labels', 'Coverage labels on every dataset'],
            ].map(([field, oldValue, newValue]) => (
              <div className="legacy-compare-row" key={field}>
                <span>{field}</span>
                <small>{oldValue}</small>
                <small>{newValue}</small>
              </div>
            ))}
          </div>
        </Panel>

        <div className="legacy-side">
          <Panel>
            <span className="eyebrow">WHY KEEP IT?</span>
            <ul className="legacy-reasons">
              <li><CheckCircle2 size={16} /> Some students prefer the familiar layout.</li>
              <li><CheckCircle2 size={16} /> It has its own saved section and theme.</li>
              <li><CheckCircle2 size={16} /> You can compare both builds side by side.</li>
              <li><CheckCircle2 size={16} /> Nothing in the old project was modified for 2.0.</li>
            </ul>
          </Panel>
          <Panel className="legacy-note">
            <Info size={18} />
            <div>
              <b>Separate local settings</b>
              <p>Your section, theme and bookmarks do not sync between the two apps. Setting your section in Compass 2.0 will not change the old Compass.</p>
            </div>
          </Panel>
          <Panel className="legacy-shortcuts">
            <span className="eyebrow">OLD COMPASS SHORTCUTS</span>
            <a href={`${OLD_URL}`} target="_blank" rel="noreferrer">
              <CalendarDays size={15} /> Today <ExternalLink size={11} />
            </a>
            <a href="https://gndec-compass.koushikjain2007.workers.dev/#/timetable" target="_blank" rel="noreferrer">
              <CalendarDays size={15} /> Timetable <ExternalLink size={11} />
            </a>
            <a href="https://gndec-compass.koushikjain2007.workers.dev/#/map" target="_blank" rel="noreferrer">
              <MapPin size={15} /> Map <ExternalLink size={11} />
            </a>
            <a href="https://gndec-compass.koushikjain2007.workers.dev/#/assistant" target="_blank" rel="noreferrer">
              <Sparkles size={15} /> Helper <ExternalLink size={11} />
            </a>
          </Panel>
        </div>
      </div>

      <section className="legacy-cta">
        <div>
          <span className="eyebrow">READY FOR THE NEW ONE?</span>
          <h2>Everything old, made clearer.</h2>
          <p>Compass 2.0 keeps the same campus-first spirit with more data, better navigation and honest coverage labels.</p>
        </div>
        <Link to="/today" className="btn primary">
          Return to Compass 2.0 <ArrowRight size={16} />
        </Link>
      </section>

      <p className="legacy-disclaimer">
        <ShieldCheck size={14} /> The old project lives at a separate URL. Compass 2.0 does not deploy to, edit, or overwrite the original GNDEC Compass repository or
        Worker.
      </p>
    </div>
  );
}
