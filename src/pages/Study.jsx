import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  CalendarDays,
  Check,
  ClipboardList,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  HelpCircle,
  Info,
  Library,
  ListChecks,
  NotebookPen,
  Search,
  Sparkles,
  Target,
  Timer,
} from 'lucide-react';
import { Link, useRouter } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import { branchShort, dateTimeLabel, sortByDateDesc } from '../lib/utils.js';
import {
  ArrowLink,
  Badge,
  DataFoot,
  EmptyState,
  InlineNotice,
  Modal,
  PageHeader,
  Panel,
  PanelHead,
  SearchField,
  Select,
  Tabs,
} from '../components/ui.jsx';

const PAPER_PAGE = 30;
const QB_PAGE = 24;

const EXAM_TIPS = [
  {
    icon: Target,
    title: 'Map the syllabus, not the whole book',
    body: 'Turn the official syllabus into a three-column list: confident, revise, learn. Study the “learn” column first — not the chapters you already enjoy.',
  },
  {
    icon: Timer,
    title: 'Solve one paper against the clock',
    body: 'Pick a previous-year paper, set the real exam duration, and write without notes. The feedback is worth more than re-reading a solved PDF.',
  },
  {
    icon: ListChecks,
    title: 'Build a one-page recall sheet',
    body: 'Formulae, definitions, diagrams and common mistakes on one A4 page. Rewrite it from memory the night before — do not just look at it.',
  },
  {
    icon: Clock3,
    title: 'Protect sleep before the paper',
    body: 'A tired brain loses more marks than one unread chapter. Keep the last six hours for sleep and a calm review, not fresh topics.',
  },
  {
    icon: ClipboardList,
    title: 'Read the whole paper first',
    body: 'Mark questions you know, then attempt them first. Show every step — method marks are often easier to earn than final answers.',
  },
  {
    icon: Sparkles,
    title: 'Use question banks as a checklist',
    body: 'Question banks show the shape of questions your department asks. If two questions test the same concept, revise the concept, not the wording.',
  },
];

function PaperRow({ paper }) {
  const { toggleBookmark, isBookmarked } = useApp();
  const saved = isBookmarked('paper', paper.id);
  return (
    <div className="paper-row">
      <span className="paper-icon">
        <FileText size={18} />
      </span>
      <a className="paper-main" href={paper.view || paper.download} target="_blank" rel="noreferrer">
        <span className="paper-code">{paper.code}</span>
        <span className="paper-copy">
          <b>{paper.name?.replace(/\.pdf$/i, '') || paper.title}</b>
          <small>
            {paper.department || 'GNDEC'} · {paper.session || paper.year || 'Session not listed'}
            {paper.makeup ? ' · Makeup' : ''}
          </small>
        </span>
        <ExternalLink size={14} />
      </a>
      <button
        type="button"
        className={`icon-btn paper-save ${saved ? 'saved' : ''}`}
        onClick={() => toggleBookmark({ type: 'paper', id: paper.id, title: `${paper.code} · ${paper.session}`, path: `/study?tab=papers&q=${encodeURIComponent(paper.code)}` })}
        aria-label={saved ? 'Remove saved paper' : 'Save paper'}
      >
        {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
      </button>
    </div>
  );
}

function ExamPlanner() {
  const [checked, setChecked] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('compass2.examPlan') || '[]');
    } catch {
      return [];
    }
  });
  const tasks = [
    'Download the official syllabus for my current scheme',
    'Collect 2–3 previous-year papers for each subject',
    'Write the exam dates and reporting times in one place',
    'Make my three-column revision list',
    'Solve one paper under timed conditions',
    'Create the one-page recall sheet',
    'Check the official ERP notice for venue and timing',
  ];
  const toggle = (index) => {
    const next = checked.includes(index) ? checked.filter((item) => item !== index) : [...checked, index];
    setChecked(next);
    try {
      localStorage.setItem('compass2.examPlan', JSON.stringify(next));
    } catch {
      /* storage may be unavailable */
    }
  };
  return (
    <div className="exam-planner">
      <div className="exam-planner-head">
        <div>
          <span className="eyebrow">7-STEP EXAM PLAN</span>
          <h3>Don’t start from panic.</h3>
        </div>
        <span className="planner-progress">{checked.length}/{tasks.length}</span>
      </div>
      <div className="planner-track">
        <span style={{ width: `${(checked.length / tasks.length) * 100}%` }} />
      </div>
      <div className="planner-list">
        {tasks.map((task, index) => (
          <label className={`planner-task ${checked.includes(index) ? 'done' : ''}`} key={task}>
            <input type="checkbox" checked={checked.includes(index)} onChange={() => toggle(index)} />
            <span className="planner-check">{checked.includes(index) && <Check size={13} />}</span>
            <span>{task}</span>
          </label>
        ))}
      </div>
      <p className="fine-print">Saved only in this browser. This checklist is student guidance, not an official college instruction.</p>
    </div>
  );
}

export default function Study() {
  const { data, toggleBookmark, isBookmarked } = useApp();
  const { searchParams, navigate } = useRouter();
  const tab = searchParams.get('tab') || 'syllabus';
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [branch, setBranch] = useState('ALL');
  const [semester, setSemester] = useState('ALL');
  const [dept, setDept] = useState('ALL');
  const [year, setYear] = useState('ALL');
  const [visible, setVisible] = useState(PAPER_PAGE);
  const [qbVisible, setQbVisible] = useState(QB_PAGE);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
    setVisible(PAPER_PAGE);
    setQbVisible(QB_PAGE);
  }, [searchParams]);

  const papers = data?.papers?.papers || [];
  const documents = data?.syllabus?.documents || [];
  const questionBanks = data?.syllabus?.questionBanks || [];
  const notes = data?.syllabus?.notes || [];

  const setTab = (value) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    next.delete('q');
    setQuery('');
    navigate(`/study?${next.toString()}`, { replace: true, keepScroll: true });
  };

  const syllabusBranches = useMemo(() => [...new Set(documents.map((doc) => doc.branch).filter(Boolean))].sort(), [documents]);
  const semesters = useMemo(() => {
    const values = new Set();
    for (const doc of documents) {
      (doc.semesters || []).forEach((value) => values.add(value));
      if (doc.semester && /\d/.test(doc.semester)) {
        const matches = String(doc.semester).match(/\d+/g);
        matches?.forEach((value) => values.add(Number(value)));
      }
    }
    return [...values].sort((a, b) => a - b);
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const terms = query.trim().toLowerCase();
    return documents
      .filter((doc) => branch === 'ALL' || doc.branch === branch)
      .filter((doc) => semester === 'ALL' || (doc.semesters || []).includes(Number(semester)) || String(doc.semester).includes(String(semester)))
      .filter((doc) => !terms || `${doc.title} ${doc.branchName} ${doc.scheme} ${doc.semester} ${doc.program}`.toLowerCase().includes(terms))
      .sort((a, b) => String(b.scheme || '').localeCompare(String(a.scheme || '')));
  }, [documents, branch, semester, query]);

  const paperDepartments = useMemo(() => [...new Set(papers.map((paper) => paper.department).filter(Boolean))].sort(), [papers]);
  const paperYears = useMemo(() => [...new Set(papers.map((paper) => paper.year).filter(Boolean))].sort((a, b) => b - a), [papers]);

  const filteredPapers = useMemo(() => {
    const terms = query.trim().toLowerCase();
    return papers
      .filter((paper) => dept === 'ALL' || paper.department === dept)
      .filter((paper) => year === 'ALL' || String(paper.year) === String(year))
      .filter((paper) => !terms || `${paper.code} ${paper.name} ${paper.title} ${paper.department} ${paper.session}`.toLowerCase().includes(terms))
      .sort((a, b) => (b.year || 0) - (a.year || 0) || String(b.session || '').localeCompare(String(a.session || '')) || String(a.code).localeCompare(String(b.code)));
  }, [papers, dept, year, query]);

  const filteredBanks = useMemo(() => {
    const terms = query.trim().toLowerCase();
    return questionBanks.filter((bank) => !terms || `${bank.title} ${bank.url}`.toLowerCase().includes(terms));
  }, [questionBanks, query]);

  const examNotices = useMemo(() => {
    const combined = [...(data?.notices?.exams || []), ...(data?.notices?.notices || []).filter((notice) => notice.kind === 'exam')];
    const seen = new Set();
    return combined
      .filter((notice) => {
        const key = notice.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [data]);

  if (!data) return null;

  const tabs = [
    { value: 'syllabus', label: 'Syllabus', icon: BookOpen, count: documents.length },
    { value: 'papers', label: 'Previous papers', icon: FileText, count: data.papers?.count },
    { value: 'questionbank', label: 'Question banks', icon: HelpCircle, count: questionBanks.length },
    { value: 'exam', label: 'Exam toolkit', icon: GraduationCap },
  ];

  return (
    <div className="study-page">
      <PageHeader
        eyebrow="LEARN AT YOUR PACE"
        title="Study hub"
        description="Official syllabus PDFs, 1,600 indexed previous-year papers and department question banks. Always match the scheme and session to your batch."
        actions={
          <div className="head-actions">
            <a className="btn secondary" href="https://erp.gndec.ac.in/notice" target="_blank" rel="noreferrer">
              ERP notices <ExternalLink size={15} />
            </a>
            <Link className="btn primary" to="/ask?q=Exam%20tips">
              Ask for a study plan
            </Link>
          </div>
        }
      />

      <div className="study-summary">
        <div>
          <span className="summary-icon green"><BookOpen size={18} /></span>
          <b>{documents.length}</b>
          <span>syllabus resources</span>
        </div>
        <div>
          <span className="summary-icon blue"><FileText size={18} /></span>
          <b>{(data.papers?.count || 0).toLocaleString('en-IN')}</b>
          <span>previous-year papers</span>
        </div>
        <div>
          <span className="summary-icon gold"><HelpCircle size={18} /></span>
          <b>{questionBanks.length}</b>
          <span>question banks</span>
        </div>
        <div>
          <span className="summary-icon orange"><NotebookPen size={18} /></span>
          <b>{notes.length || '—'}</b>
          <span>verified notes</span>
        </div>
      </div>

      <Panel className="study-shell">
        <Tabs options={tabs} value={tab} onChange={setTab} />

        {tab === 'syllabus' && (
          <div className="study-pane">
            <div className="study-toolbar">
              <div>
                <h2>Official syllabus & study schemes</h2>
                <p>PDFs published by GNDEC departments and the Applied Science department. Older schemes are kept for reference.</p>
              </div>
              <div className="study-filters">
                <Select label="Branch" value={branch} onChange={setBranch} options={[{ value: 'ALL', label: 'All branches' }, ...syllabusBranches.map((code) => ({ value: code, label: code === 'ALL' ? 'Common / first year' : branchShort(code) }))]} />
                <Select label="Semester" value={semester} onChange={setSemester} options={[{ value: 'ALL', label: 'All semesters' }, ...semesters.map((value) => ({ value: String(value), label: `Semester ${value}` }))]} />
              </div>
            </div>
            <div className="study-search-row">
              <SearchField value={query} onChange={setQuery} placeholder="Search syllabus by title, scheme or semester…" />
              <span>{filteredDocuments.length} resources</span>
            </div>
            {filteredDocuments.length ? (
              <div className="syllabus-grid">
                {filteredDocuments.map((doc) => (
                  <article className="syllabus-card" key={doc.id}>
                    <div className="syllabus-card-top">
                      <span className="resource-icon">
                        <BookOpen size={17} />
                      </span>
                      <div className="syllabus-badges">
                        {doc.scheme && <Badge tone="gold">Scheme {doc.scheme}</Badge>}
                        <Badge tone="neutral">{doc.semester || 'Semester not stated'}</Badge>
                      </div>
                    </div>
                    <h3>{doc.title}</h3>
                    <p>
                      {doc.program || 'GNDEC'} · {doc.branch === 'ALL' ? 'Common for all branches' : doc.branchName || branchShort(doc.branch)}
                    </p>
                    <div className="syllabus-card-foot">
                      <a href={doc.url} target="_blank" rel="noreferrer" className="arrow-link">
                        Open official PDF <ExternalLink size={13} />
                      </a>
                      <button type="button" className="icon-btn" onClick={() => setPreview(doc)} aria-label="Syllabus details">
                        <Info size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon={BookOpen} title="No syllabus matches those filters">
                Try “All branches” and “All semesters”, or search for the scheme year.
              </EmptyState>
            )}
            <InlineNotice tone="info" title="Check the scheme before you study">
              A syllabus from 2014 may not match a 2024 batch. First-year B.Tech is currently published under the December 2025 study scheme. When in doubt, ask your department.
            </InlineNotice>
            <DataFoot>
              First-year study scheme has {data.syllabus?.firstYear?.pages?.length || 33} source pages.{" "}
              <a href={data.syllabus?.firstYear?.source} target="_blank" rel="noreferrer">Open source PDF <ExternalLink size={11} /></a>
            </DataFoot>
          </div>
        )}

        {tab === 'papers' && (
          <div className="study-pane">
            <div className="study-toolbar">
              <div>
                <h2>Previous-year question papers</h2>
                <p>Indexed from the shared GNDEC paper archive. PDFs open in Google Drive. Solutions are not included.</p>
              </div>
              <div className="study-filters">
                <Select label="Department" value={dept} onChange={setDept} options={[{ value: 'ALL', label: 'All departments' }, ...paperDepartments.map((name) => ({ value: name, label: name }))]} />
                <Select label="Year" value={year} onChange={setYear} options={[{ value: 'ALL', label: 'All years' }, ...paperYears.map((value) => ({ value: String(value), label: String(value) }))]} />
              </div>
            </div>
            <div className="study-search-row">
              <SearchField value={query} onChange={setQuery} placeholder="Search a paper code like AM-101, subject or session…" />
              <span>{filteredPapers.length.toLocaleString('en-IN')} papers</span>
            </div>
            {filteredPapers.length ? (
              <>
                <div className="paper-list">
                  {filteredPapers.slice(0, visible).map((paper) => (
                    <PaperRow key={paper.id} paper={paper} />
                  ))}
                </div>
                {visible < filteredPapers.length && (
                  <div className="load-more">
                    <button type="button" className="btn secondary" onClick={() => setVisible((value) => value + PAPER_PAGE)}>
                      Load more papers <span className="load-count">{Math.min(visible, filteredPapers.length)} / {filteredPapers.length}</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState icon={FileText} title="No paper matches that search">
                Try a course code such as AM-101 or CS-301, a shorter subject name, or remove the year filter.
              </EmptyState>
            )}
            <div className="paper-actions">
              <span className="paper-actions-note">
                <Bookmark size={14} /> Save individual papers with the bookmark button.
              </span>
              <a className="btn ghost" href="https://drive.google.com/drive/folders/11ywkOKyeixCPihsCzqZDyzy2msLXxx6w" target="_blank" rel="noreferrer">
                <Library size={15} /> Source archive <ExternalLink size={13} />
              </a>
            </div>
            <DataFoot>Paper titles and sessions come from the archived filenames. Some sessions or subjects may be missing; the archive is maintained externally.</DataFoot>
          </div>
        )}

        {tab === 'questionbank' && (
          <div className="study-pane">
            <div className="study-toolbar">
              <div>
                <h2>Department question banks</h2>
                <p>Question banks published by the IT department. These are not solved papers, but they show how topics are usually tested.</p>
              </div>
            </div>
            <div className="study-search-row">
              <SearchField value={query} onChange={setQuery} placeholder="Search Data Structures, DBMS, ESIT-101…" />
              <span>{filteredBanks.length} banks</span>
            </div>
            {filteredBanks.length ? (
              <>
                <div className="bank-list">
                  {filteredBanks.slice(0, qbVisible).map((bank) => (
                    <a className="bank-row" key={bank.id} href={bank.url} target="_blank" rel="noreferrer">
                      <span className="resource-icon">
                        <HelpCircle size={17} />
                      </span>
                      <span>
                        <b>{bank.title}</b>
                        <small>IT Department · official PDF</small>
                      </span>
                      <ExternalLink size={14} />
                    </a>
                  ))}
                </div>
                {qbVisible < filteredBanks.length && (
                  <div className="load-more">
                    <button type="button" className="btn secondary" onClick={() => setQbVisible((value) => value + QB_PAGE)}>
                      Show more banks <span className="load-count">{Math.min(qbVisible, filteredBanks.length)} / {filteredBanks.length}</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState icon={HelpCircle} title="No question bank matched" />
            )}
            <InlineNotice tone="warn" title="Student notes are not indexed yet">
              We do not have a verified, moderated notes library, so Compass will not pretend to find notes. Use the official syllabus, question banks and previous
              papers above. A notes contribution workflow is planned for the admin studio, with review before anything is published.
            </InlineNotice>
          </div>
        )}

        {tab === 'exam' && (
          <div className="study-pane exam-pane">
            <div className="exam-grid">
              <div>
                <PanelHead eyebrow="EXAM DESK" title="Latest official exam notices" description="Dates, venues and form-filling updates come from the GNDEC ERP notice board." />
                <div className="exam-notice-list">
                  {examNotices.slice(0, 6).map((notice) => (
                    <a key={notice.id || notice.title} href={notice.url} target="_blank" rel="noreferrer" className="exam-notice">
                      <span className="exam-notice-date">
                        <b>{String(notice.date || '').slice(8, 10) || '•'}</b>
                        <small>{String(notice.date || '').slice(5, 7) || ''}</small>
                      </span>
                      <span>
                        <b>{notice.title}</b>
                        <small>{notice.displayDate || dateTimeLabel(notice.date)} · {notice.source || 'GNDEC notice'}</small>
                      </span>
                      <ExternalLink size={14} />
                    </a>
                  ))}
                  {!examNotices.length && <EmptyState icon={CalendarDays} title="No exam notice indexed" />}
                </div>
                <InlineNotice tone="warn" title="No complete date sheet in Compass">
                  The indexed notices link to official PDFs, but a full semester date sheet is not stored in our verified data. Always open the ERP notice or ask your
                  department for the final schedule and reporting time.
                </InlineNotice>
                <div className="official-links">
                  <a href="https://erp.gndec.ac.in/notice" target="_blank" rel="noreferrer">
                    <ClipboardList size={15} /> ERP notice board <ExternalLink size={12} />
                  </a>
                  <a href="https://gndec.ac.in/" target="_blank" rel="noreferrer">
                    <GraduationCap size={15} /> GNDEC official site <ExternalLink size={12} />
                  </a>
                  <Link to="/notices?tab=exams">
                    <FileText size={15} /> All exam notices <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
              <ExamPlanner />
            </div>

            <div className="tips-section">
              <div className="tips-head">
                <span className="eyebrow">STUDENT-TESTED STUDY HABITS</span>
                <h2>Six things that actually help in the exam hall.</h2>
              </div>
              <div className="tips-grid">
                {EXAM_TIPS.map((tip) => (
                  <article className="tip-card" key={tip.title}>
                    <span className="tip-icon">
                      <tip.icon size={18} />
                    </span>
                    <h3>{tip.title}</h3>
                    <p>{tip.body}</p>
                  </article>
                ))}
              </div>
            </div>
            <DataFoot>These tips are general student guidance, not official college policy. Follow your department’s exam instructions.</DataFoot>
          </div>
        )}
      </Panel>

      {preview && (
        <Modal open onClose={() => setPreview(null)} title={preview.title} subtitle={`${preview.program} · ${preview.branch === 'ALL' ? 'All branches' : preview.branchName}`} size="sm"
          footer={<div className="modal-actions"><button type="button" className="btn ghost" onClick={() => setPreview(null)}>Close</button><a className="btn primary" href={preview.url} target="_blank" rel="noreferrer">Open PDF <ExternalLink size={15} /></a></div>}>
          <dl className="profile-facts">
            <div><dt>Scheme</dt><dd>{preview.scheme || 'Not stated'}</dd></div>
            <div><dt>Semester</dt><dd>{preview.semester || 'Not stated'}</dd></div>
            <div><dt>Programme</dt><dd>{preview.program || 'GNDEC'}</dd></div>
            <div><dt>Source</dt><dd>Official department page</dd></div>
          </dl>
          <p className="fine-print">Open the PDF and confirm the scheme year against your admission batch before relying on it.</p>
        </Modal>
      )}
    </div>
  );
}
