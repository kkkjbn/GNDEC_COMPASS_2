import React from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Compass,
  ExternalLink,
  FileText,
  Github,
  GraduationCap,
  Heart,
  Info,
  MapPin,
  ShieldCheck,
  Sparkles,
  Users,
  WifiOff,
} from 'lucide-react';
import { Link } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import {
  Badge,
  CoverageMeter,
  DataFoot,
  InlineNotice,
  PageHeader,
  Panel,
  PanelHead,
} from '../components/ui.jsx';

const TEAM = [
  { name: 'Rahul Kumar', role: 'Team lead · product & data', initials: 'RK' },
  { name: 'Kaushik Jain', role: 'Engineering · campus experience', initials: 'KJ' },
  { name: 'Mohitveer Singh', role: 'Research · validation', initials: 'MS' },
  { name: 'Monu', role: 'Design · quality', initials: 'M' },
];

const FAQ = [
  {
    q: 'Is GNDEC Compass an official college app?',
    a: 'No. It is an independent student project built by Team Codestorm. It links to official GNDEC sources, but it is not owned, endorsed or operated by the college. For official decisions, use gndec.ac.in or the ERP.',
  },
  {
    q: 'How does Ask Compass answer without an AI model?',
    a: 'It normalises your question, translates common Hinglish/Punjabi-English words, and matches it against structured campus data with deterministic rules. That is why it can work offline and why it refuses to guess when a record is missing.',
  },
  {
    q: 'Why are some second and third-year timetables incomplete?',
    a: 'The current official FET export only publishes complete section schedules for first year. Some higher-year groups appear partially or not at all. We label this clearly instead of inventing missing classes.',
  },
  {
    q: 'Does Compass update itself live?',
    a: 'No. Compass ships a published snapshot of the official FET export. A scheduled check can rebuild the data when a newer official export appears, but opening the app does not poll the college site, and room or teacher changes made after the export date are not reflected automatically. The build date and source are shown with the data.',
  },
  {
    q: 'Can Compass tell me my attendance, fees or results?',
    a: 'No. Those are private ERP records and are not part of the public data used here. Compass links to official systems but does not log in or store your credentials.',
  },
  {
    q: 'Where do the photos and map come from?',
    a: 'Photos come from the public GNDEC gallery, the official room gallery and one credited Wikimedia Commons image. Map positions are an illustrated campus plan maintained inside Compass. Walking times are estimates.',
  },
  {
    q: 'Does it work without internet?',
    a: 'Yes, after the first visit. The app shell, campus data and map geometry are cached. You can also download the campus photo pack in Settings. External PDFs and external photos still need a connection.',
  },
];

export default function About() {
  const { data, online } = useApp();
  const sources = data?.sources?.sources || [];
  const grouped = sources.reduce((acc, source) => {
    const key = source.kind || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(source);
    return acc;
  }, {});

  return (
    <div className="about-page">
      <section className="about-hero">
        <div className="about-hero-copy">
          <span className="eyebrow">ABOUT THE PROJECT</span>
          <h1>
            A clearer way<br />
            <em>around campus.</em>
          </h1>
          <p>
            GNDEC Compass 2.0 brings timetables, people, navigation and study material into one calm, installable web app — built by students who kept getting
            lost between blocks.
          </p>
          <div className="about-hero-actions">
            <Link to="/today" className="btn primary">Open Compass <ArrowRight size={16} /></Link>
            <a className="btn ghost" href="https://github.com/kkkjbn/GNDEC_COMPASS_2" target="_blank" rel="noreferrer">
              <Github size={16} /> Project repository
            </a>
          </div>
        </div>
        <div className="about-hero-photo">
          <img src="/img/gallery/auditorium-a.jpg" alt="GNDEC auditorium" />
          <span className="about-photo-credit">GNDEC public gallery · Auditorium</span>
        </div>
      </section>

      <div className="about-stats">
        <div><b>{data?.timetable?.sections?.length || 0}</b><span>timetable sections</span></div>
        <div><b>{(data?.students?.count || 0).toLocaleString('en-IN')}</b><span>students in roster</span></div>
        <div><b>{data?.faculty?.count || 0}</b><span>faculty profiles</span></div>
        <div><b>{(data?.papers?.count || 0).toLocaleString('en-IN')}</b><span>previous papers</span></div>
        <div><b>{data?.campus?.places?.length || 45}</b><span>mapped places</span></div>
      </div>

      <div className="about-grid">
        <Panel className="about-story">
          <span className="about-icon"><Compass size={20} /></span>
          <span className="eyebrow">WHY IT EXISTS</span>
          <h2>Less scattered. More grounded.</h2>
          <p>
            Campus information usually lives in a dozen places: a PDF on a department page, a screenshot in a group chat, a notice on a board you walked past
            yesterday. Compass puts the useful parts together — with the source attached.
          </p>
          <p>
            The goal is not to replace official systems. It is to answer the small, everyday questions fast: <em>Where is F107? What’s next? Who teaches Math I?
            Which rooms are free right now?</em>
          </p>
          <ul className="about-values">
            <li><CheckCircle2 size={16} /> Real data with visible sources</li>
            <li><CheckCircle2 size={16} /> Honest gaps instead of invented answers</li>
            <li><CheckCircle2 size={16} /> Local-first privacy and offline support</li>
            <li><CheckCircle2 size={16} /> Student-built, open to correction</li>
          </ul>
        </Panel>
        <Panel className="about-principles">
          <span className="eyebrow">OUR METHOD</span>
          <div className="principle">
            <span>01</span>
            <div>
              <b>Collect only public data</b>
              <p>Official timetables, faculty pages, public notices, syllabus PDFs and map data. No scraping of private ERP accounts.</p>
            </div>
          </div>
          <div className="principle">
            <span>02</span>
            <div>
              <b>Label coverage</b>
              <p>Every dataset states what is complete, partial or inferred. A blank timetable cell is not presented as a free room.</p>
            </div>
          </div>
          <div className="principle">
            <span>03</span>
            <div>
              <b>Answer by retrieval</b>
              <p>Ask Compass matches structured records instead of generating plausible text. When it does not know, it says so.</p>
            </div>
          </div>
          <div className="principle">
            <span>04</span>
            <div>
              <b>Keep it local</b>
              <p>Your preferences, bookmarks and conversation never leave this browser. There is no account system.</p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel className="coverage-panel">
        <PanelHead eyebrow="DATA COVERAGE" title="What is complete, and what still needs a campus visit" description="This is the honest state of the data in this build. We would rather show a gap than fill it with fiction." />
        <div className="coverage-grid">
          <CoverageMeter value={100} label="First-year timetable" detail="All published first-year B.Tech sections" />
          <CoverageMeter value={30} tone="warn" label="Higher-year timetables" detail="Partial sections; varies by branch" />
          <CoverageMeter value={100} label="First-year student roster" detail="1,146 records across 24 sections" />
          <CoverageMeter value={78} tone="warn" label="Faculty directory" detail="Public profiles; some posts may be missing" />
          <CoverageMeter value={20} tone="warn" label="Block-level navigation" detail="Campus geometry + estimated paths" />
          <CoverageMeter value={5} tone="bad" label="Indoor / door-level routes" detail="Not verified — needs on-site mapping" />
          <CoverageMeter value={35} tone="warn" label="Exam information" detail="Official notice links, no complete date sheet" />
          <CoverageMeter value={0} tone="bad" label="Student notes library" detail="Not published yet; no fake notes" />
        </div>
        <InlineNotice tone="warn" title="A note on room codes">
          Room block and floor are inferred from official room codes (F101, S214, G18) and the timetable. They are not independently verified door by door. Use the
          block entrance and ask at the department office for the exact room.
        </InlineNotice>
      </Panel>

      <div className="about-grid second">
        <Panel className="about-sources">
          <PanelHead eyebrow="SOURCES" title="Follow it to the source" description={`${sources.length} public sources indexed for this build.`} />
          {Object.entries(grouped).map(([kind, items]) => (
            <div className="source-group" key={kind}>
              <span className="source-kind">{kind.replace(/-/g, ' ')}</span>
              {items.slice(0, 8).map((source) => (
                <a key={`${source.url}-${source.label}`} href={source.url.split(' · ')[0]} target="_blank" rel="noreferrer" className="source-row">
                  <span>{source.label}</span>
                  <ExternalLink size={13} />
                </a>
              ))}
            </div>
          ))}
          <DataFoot>Links open official college pages or the external paper archive. A source may change after the indexed date.</DataFoot>
        </Panel>

        <div className="about-side-stack">
          <Panel className="team-panel">
            <span className="eyebrow">TEAM CODESTORM</span>
            <h2>Built by students.</h2>
            <div className="team-list">
              {TEAM.map((member) => (
                <div className="team-row" key={member.name}>
                  <span className="team-avatar">{member.initials}</span>
                  <span>
                    <b>{member.name}</b>
                    <small>{member.role}</small>
                  </span>
                </div>
              ))}
            </div>
            <p className="fine-print">Four students, one shared campus problem. Corrections and contributions are welcome through the project repository.</p>
          </Panel>

          <div className="about-old-compass">
            <span className="eyebrow pale">PROJECT HISTORY</span>
            <h3>Compass 1.0 is still online.</h3>
            <p>The original build remains available at its own address. Compass 2.0 is a separate project with its own data.</p>
            <a href="https://gndec-compass.koushikjain2007.workers.dev/#/today" target="_blank" rel="noreferrer" className="btn light small">
              Open old Compass <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </div>

      <Panel className="faq-panel">
        <PanelHead eyebrow="QUESTIONS" title="The things people ask first" />
        <div className="faq-list">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>
                {item.q}
                <span>+</span>
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </Panel>

      <section className="about-footer-cta">
        <div>
          <span className="eyebrow">FOUND SOMETHING WRONG?</span>
          <h2>Data changes. Tell us.</h2>
          <p>Room moved, teacher changed, a section missing, or a route that no longer works? The project is open to corrections — that is how the data gets better.</p>
        </div>
        <div className="about-footer-actions">
          <a href="https://github.com/kkkjbn/GNDEC_COMPASS_2/issues" target="_blank" rel="noreferrer" className="btn primary">
            <Github size={16} /> Report an issue
          </a>
          <Link to="/settings" className="btn ghost"><WifiOff size={16} /> Offline settings</Link>
        </div>
      </section>

      <p className="about-disclaimer">
        GNDEC Compass is an independent student project and is not affiliated with Guru Nanak Dev Engineering College. Names, timetables and college information
        belong to their respective owners. Map geometry is an illustrated campus plan drawn for Compass. Photos credited individually in the gallery.
      </p>
    </div>
  );
}
