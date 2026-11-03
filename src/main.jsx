import React, { Component, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import './styles/academics.css';
import './styles/campus-study.css';
import './styles/app-pages.css';
import './styles/admin.css';
import './styles/responsive.css';
import { AppProvider, useApp } from './context.jsx';
import { RouterProvider, useRouter, routeTitle } from './lib/router.jsx';
import { Shell } from './components/Shell.jsx';
import { ErrorScreen, LoadingScreen } from './components/ui.jsx';
import Today from './pages/Today.jsx';
import Timetable from './pages/Timetable.jsx';
import Students from './pages/Students.jsx';
import Faculty from './pages/Faculty.jsx';
import MapPage from './pages/MapPage.jsx';
import Study from './pages/Study.jsx';
import Notices from './pages/Notices.jsx';
import Ask from './pages/Ask.jsx';
import Settings from './pages/Settings.jsx';
import About from './pages/About.jsx';
import Legacy from './pages/Legacy.jsx';
import Admin from './pages/Admin.jsx';

const PAGES = {
  '/today': Today,
  '/timetable': Timetable,
  '/students': Students,
  '/faculty': Faculty,
  '/map': MapPage,
  '/study': Study,
  '/notices': Notices,
  '/ask': Ask,
  '/settings': Settings,
  '/about': About,
  '/legacy': Legacy,
  '/admin': Admin,
};

function NotFound() {
  return (
    <div className="not-found">
      <span className="eyebrow">404 · OFF THE MAP</span>
      <h1>That path isn’t on the campus plan.</h1>
      <p>The page may have moved, or the link may be out of date. Try one of these instead.</p>
      <div className="not-found-links">
        <a className="btn primary" href="/today">Go to Today</a>
        <a className="btn secondary" href="/timetable">Open timetable</a>
        <a className="btn ghost" href="/map">Campus map</a>
      </div>
    </div>
  );
}

class Boundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-fallback">
          <ErrorScreen
            message={`The app hit an unexpected error: ${this.state.error.message || 'unknown error'}`}
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const { loading, loadError, reload } = useApp();
  const { path } = useRouter();

  useEffect(() => {
    const title = routeTitle(path);
    document.title = `${title} · GNDEC Compass`;
    const description = document.querySelector('meta[name="description"]');
    if (description && path === '/today') {
      description.setAttribute(
        'content',
        'GNDEC Compass 2.0 — section timetables, campus walking routes, student and faculty directories, notices, previous-year papers and an offline campus assistant for GNDEC Ludhiana.',
      );
    }
  }, [path]);

  if (loading) return <LoadingScreen />;

  if (loadError) {
    return (
      <div className="app-fallback">
        <ErrorScreen message={loadError} onRetry={reload} />
      </div>
    );
  }

  const Page = PAGES[path] || NotFound;

  return (
    <Shell>
      <Page />
    </Shell>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Boundary>
      <AppProvider>
        <RouterProvider>
          <App />
        </RouterProvider>
      </AppProvider>
    </Boundary>
  </React.StrictMode>,
);
