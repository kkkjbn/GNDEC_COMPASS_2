import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const RouterContext = createContext(null);

export const ROUTES = [
  { path: '/today', label: 'Today', title: 'Today', icon: 'today' },
  { path: '/timetable', label: 'Timetable', title: 'Timetable', icon: 'timetable' },
  { path: '/students', label: 'Students', title: 'Student directory', icon: 'students' },
  { path: '/faculty', label: 'Faculty', title: 'Faculty directory', icon: 'faculty' },
  { path: '/map', label: 'Rasta Saathi', title: 'Campus map', icon: 'map' },
  { path: '/study', label: 'Study hub', title: 'Study hub', icon: 'study' },
  { path: '/notices', label: 'Notices & exams', title: 'Notices & exams', icon: 'notices' },
  { path: '/ask', label: 'Ask Compass', title: 'Ask Compass', icon: 'ask' },
  { path: '/settings', label: 'Settings', title: 'Settings', icon: 'settings' },
  { path: '/about', label: 'About', title: 'About Compass', icon: 'about' },
  { path: '/legacy', label: 'Old Compass', title: 'Old Compass', icon: 'legacy' },
  { path: '/admin', label: 'Admin', title: 'Admin studio', icon: 'admin' },
];

const normalizePath = (path = '/') => {
  if (!path || path === '/') return '/today';
  const clean = path.split('?')[0].replace(/\/+$/, '');
  return clean || '/today';
};

export function RouterProvider({ children }) {
  const [locationValue, setLocationValue] = useState(() => `${window.location.pathname}${window.location.search}`);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const onPop = () => setLocationValue(`${window.location.pathname}${window.location.search}`);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const value = useMemo(() => {
    const [rawPath, rawQuery = ''] = locationValue.split('?');
    const path = normalizePath(rawPath);
    return {
      path,
      rawPath,
      search: `?${rawQuery}`,
      searchParams: new URLSearchParams(rawQuery),
      navigate: (to, { replace = false, keepScroll = false } = {}) => {
        const target = to.startsWith('http') || to.startsWith('mailto:') ? to : to;
        if (target.startsWith('http')) {
          window.open(target, '_blank', 'noopener,noreferrer');
          return;
        }
        if (replace) window.history.replaceState({}, '', target);
        else window.history.pushState({}, '', target);
        setLocationValue(`${window.location.pathname}${window.location.search}`);
        setKey((k) => k + 1);
        if (!keepScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
      },
      routeKey: key,
    };
  }, [locationValue, key]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const context = useContext(RouterContext);
  if (!context) throw new Error('useRouter must be used inside RouterProvider');
  return context;
}

export function Link({ to, children, className = '', onClick, ...rest }) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (to.startsWith('http') || to.startsWith('mailto:') || to.startsWith('#')) return;
        event.preventDefault();
        onClick?.();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export function routeTitle(path) {
  if (path.startsWith('/student/')) return 'Student profile';
  if (path.startsWith('/room/')) return 'Room details';
  if (path.startsWith('/section/')) return 'Section timetable';
  return ROUTES.find((route) => route.path === path)?.title || 'GNDEC Compass';
}
