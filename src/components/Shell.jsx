import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BookOpen,
  CalendarDays,
  ExternalLink,
  GraduationCap,
  Info,
  LayoutDashboard,
  Map,
  Menu,
  Monitor,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  UserRound,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { Link, routeTitle, useRouter } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import { findSection } from '../lib/timetable.js';
import { CommandSearch } from './CommandSearch.jsx';
import { ProfileDialog } from './ProfileDialog.jsx';
import { Avatar, Toasts } from './ui.jsx';

const ShellContext = createContext(null);
export const useShell = () => useContext(ShellContext);

const NAV_GROUPS = [
  {
    label: 'Your campus',
    items: [
      { path: '/today', label: 'Today', icon: LayoutDashboard },
      { path: '/timetable', label: 'Timetable', icon: CalendarDays },
      { path: '/map', label: 'Rasta Saathi', icon: Map, tag: 'Map' },
      { path: '/notices', label: 'Notices & exams', icon: Bell },
    ],
  },
  {
    label: 'People',
    items: [
      { path: '/students', label: 'Students', icon: Users },
      { path: '/faculty', label: 'Faculty', icon: GraduationCap },
    ],
  },
  {
    label: 'Academics',
    items: [
      { path: '/study', label: 'Study hub', icon: BookOpen },
      { path: '/ask', label: 'Ask Compass', icon: Sparkles, tag: 'New' },
    ],
  },
];

const SYSTEM_NAV = [
  { path: '/settings', label: 'Settings', icon: Settings },
  { path: '/about', label: 'About & sources', icon: Info },
];

const MOBILE_NAV = [
  { path: '/today', label: 'Today', icon: LayoutDashboard },
  { path: '/timetable', label: 'Classes', icon: CalendarDays },
  { path: '/map', label: 'Map', icon: Map },
  { path: '/ask', label: 'Ask', icon: Sparkles, feature: true },
];

function navIsActive(path, itemPath) {
  if (itemPath === '/today') return path === '/today';
  return path === itemPath || path.startsWith(`${itemPath}/`);
}

function SidebarSectionCard({ onProfile }) {
  const { data, profile } = useApp();
  const section = findSection(data?.timetable, profile.sectionId);
  return (
    <div className="side-section-card">
      <div className="side-section-top">
        <span>My timetable</span>
        <button type="button" onClick={onProfile}>
          Change
        </button>
      </div>
      <b>{section?.id || profile.sectionId || 'Not set'}</b>
      <small>{section?.label || 'Choose a section to see your classes'}</small>
      <Link to={`/timetable?section=${section?.id || profile.sectionId || 'ECB'}`} className="side-section-link">
        Open my schedule <CalendarDays size={13} />
      </Link>
    </div>
  );
}

function Sidebar({ onProfile }) {
  const { path } = useRouter();
  const { online, data } = useApp();
  const stats = useMemo(() => {
    const sections = data?.timetable?.sections || [];
    const lectures = sections.reduce((sum, item) => sum + (item.lectures?.length || 0), 0);
    return { sections: sections.length, lectures };
  }, [data]);

  return (
    <aside className="sidebar">
      <Link to="/today" className="brand" aria-label="GNDEC Compass home">
        <span className="brand-mark">C</span>
        <span className="brand-text">
          <b>
            GNDEC <em>Compass</em>
          </b>
          <small>YOUR CAMPUS, IN VIEW</small>
        </span>
      </Link>

      <SidebarSectionCard onProfile={onProfile} />

      <nav className="side-nav" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <div className="side-group" key={group.label}>
            <span className="side-label">{group.label}</span>
            {group.items.map((item) => (
              <Link key={item.path} to={item.path} className={`side-link ${navIsActive(path, item.path) ? 'active' : ''}`}>
                <item.icon size={17} />
                <span>{item.label}</span>
                {item.tag && <em className="side-tag">{item.tag}</em>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="side-lower">
        <span className="side-label">System</span>
        {SYSTEM_NAV.map((item) => (
          <Link key={item.path} to={item.path} className={`side-link ${navIsActive(path, item.path) ? 'active' : ''}`}>
            <item.icon size={16} />
            <span>{item.label}</span>
          </Link>
        ))}
        <Link to="/legacy" className={`side-link ${navIsActive(path, '/legacy') ? 'active' : ''}`}>
          <ExternalLink size={16} />
          <span>Old Compass</span>
        </Link>
      </div>

      <div className="side-status">
        <span className={`status-dot ${online ? 'online' : 'offline'}`} />
        <div>
          <b>{online ? 'Online' : 'Offline mode'}</b>
          <small>
            {stats.sections} sections · {stats.lectures.toLocaleString('en-IN')} classes cached
          </small>
        </div>
        {online ? <Wifi size={14} /> : <WifiOff size={14} />}
      </div>
      <p className="side-credit">
        Student project · Not an official GNDEC service
      </p>
    </aside>
  );
}

function Topbar({ onSearch, onProfile, onMore }) {
  const { path } = useRouter();
  const { online, profile, theme, setTheme, installPrompt, promptInstall, toast } = useApp();
  const resolved = document.documentElement.dataset.theme;
  const title = routeTitle(path);

  const toggleTheme = () => {
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="topbar">
      <button type="button" className="icon-btn mobile-only" onClick={onMore} aria-label="Open menu">
        <Menu size={19} />
      </button>
      <div className="topbar-title">
        <span>GNDEC Compass</span>
        <b>{title}</b>
      </div>
      <button type="button" className="search-trigger" onClick={onSearch}>
        <Search size={16} />
        <span>Search students, rooms, papers…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="topbar-actions">
        <span className={`connection ${online ? 'online' : 'offline'}`} title={online ? 'Online' : 'Offline — cached data is active'}>
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{online ? 'Online' : 'Offline'}</span>
        </span>
        {installPrompt && (
          <button
            type="button"
            className="install-btn"
            onClick={async () => {
              const accepted = await promptInstall();
              toast(accepted ? 'Compass is installing on this device.' : 'Install cancelled.', accepted ? 'success' : 'info');
            }}
          >
            Install app
          </button>
        )}
        <button type="button" className="icon-btn theme-toggle" onClick={toggleTheme} aria-label="Toggle dark mode">
          {resolved === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button type="button" className="profile-trigger" onClick={onProfile} aria-label="Open profile">
          <Avatar name={profile.name || 'Guest'} size={34} />
          <span>
            <b>{profile.name?.split(' ')[0] || 'Your profile'}</b>
            <small>{profile.sectionId || 'Choose section'}</small>
          </span>
        </button>
      </div>
    </header>
  );
}

function MobileSheet({ open, onClose, onProfile, onSearch }) {
  const { path } = useRouter();
  const { theme, setTheme } = useApp();
  const resolved = document.documentElement.dataset.theme;
  if (!open) return null;
  const all = [...NAV_GROUPS.flatMap((group) => group.items), ...SYSTEM_NAV, { path: '/legacy', label: 'Old Compass', icon: ExternalLink }];
  return (
    <div className="sheet-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="mobile-sheet">
        <div className="sheet-head">
          <div>
            <span className="eyebrow">GNDEC COMPASS</span>
            <h2>Everything, in one place</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <button type="button" className="sheet-search" onClick={onSearch}>
          <Search size={17} /> Search the whole campus
        </button>
        <div className="sheet-grid">
          {all.map((item) => (
            <Link key={item.path} to={item.path} className={`sheet-link ${navIsActive(path, item.path) ? 'active' : ''}`} onClick={onClose}>
              <item.icon size={18} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn secondary" onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}>
            {resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {resolved === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              onClose();
              onProfile();
            }}
          >
            <UserRound size={16} /> My profile
          </button>
        </div>
        <p className="sheet-foot">Built by Team Codestorm · Not an official GNDEC service</p>
      </div>
    </div>
  );
}

function MobileNav({ onMore }) {
  const { path } = useRouter();
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {MOBILE_NAV.map((item) => (
        <Link key={item.path} to={item.path} className={`${navIsActive(path, item.path) ? 'active' : ''} ${item.feature ? 'feature' : ''}`}>
          <span className="mobile-nav-icon">
            <item.icon size={20} />
          </span>
          <small>{item.label}</small>
        </Link>
      ))}
      <button type="button" onClick={onMore} aria-label="More navigation">
        <span className="mobile-nav-icon">
          <Menu size={20} />
        </span>
        <small>More</small>
      </button>
    </nav>
  );
}

function Footer() {
  const { data, online } = useApp();
  const checked = data?.timestamp || 'Nov 2026';
  return (
    <footer className="site-footer">
      <div>
        <b>GNDEC Compass 2.0</b>
        <p>A student-built campus companion for Guru Nanak Dev Engineering College, Ludhiana. Not an official college service.</p>
      </div>
      <div className="footer-links">
        <Link to="/about">Sources & method</Link>
        <Link to="/settings">Offline & privacy</Link>
        <Link to="/legacy">Old Compass</Link>
        <a href="https://gndec.ac.in/" target="_blank" rel="noreferrer">
          Official GNDEC <ExternalLink size={12} />
        </a>
      </div>
      <div className="footer-meta">
        <span className={`status-dot ${online ? 'online' : 'offline'}`} /> {online ? 'Connected' : 'Offline-ready'}
        <span>·</span>
        <span>Data checked {checked}</span>
        <span>·</span>
        <Link to="/admin" className="footer-admin" aria-label="Admin studio">
          v2.0
        </Link>
      </div>
    </footer>
  );
}

export function Shell({ children }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { path } = useRouter();
  const { toasts, dismissToast } = useApp();

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [path]);

  const shellValue = useMemo(
    () => ({ openSearch: () => setSearchOpen(true), openProfile: () => setProfileOpen(true), openMore: () => setMoreOpen(true) }),
    [],
  );

  return (
    <ShellContext.Provider value={shellValue}>
      <div className="app-shell">
        <Sidebar onProfile={() => setProfileOpen(true)} />
        <div className="app-body">
          <Topbar onSearch={() => setSearchOpen(true)} onProfile={() => setProfileOpen(true)} onMore={() => setMoreOpen(true)} />
          <main className="page">{children}</main>
          <Footer />
        </div>
        <MobileNav onMore={() => setMoreOpen(true)} />
        <CommandSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
        <MobileSheet open={moreOpen} onClose={() => setMoreOpen(false)} onProfile={() => setProfileOpen(true)} onSearch={() => { setMoreOpen(false); setSearchOpen(true); }} />
        <Toasts items={toasts} onDismiss={dismissToast} />
      </div>
    </ShellContext.Provider>
  );
}
