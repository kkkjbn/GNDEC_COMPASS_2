import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { readStorage, writeStorage } from './lib/utils.js';
import { buildSearchIndex } from './lib/search.js';

const DATA_FILES = [
  'campus',
  'timetable',
  'room-timetable',
  'notices',
  'papers',
  'syllabus',
  'rooms',
  'sources',
  'status',
  'students',
  'faculty',
  'contacts',
  'branches',
];

const DATA_KEYS = {
  'room-timetable': 'roomTimetable',
};

const AppContext = createContext(null);
const OFFLINE_CACHE = 'compass-offline-media-v2';

const defaultProfile = {
  name: '',
  crn: '',
  sectionId: 'ECB',
  subsection: '',
  academicGroup: '',
  mentor: '',
  mentorPhone: '',
  mentorVenue: '',
  venue: '',
  branch: 'EC',
  year: 1,
};

async function fetchJson(name) {
  const response = await fetch(`/data/${name}.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${name}.json returned ${response.status}`);
  return response.json();
}

function mergeOverrides(data, overrides = {}) {
  if (!data) return data;
  const roomOverrides = overrides.rooms || {};
  const placeOverrides = overrides.places || {};
  const rooms = data.rooms
    ? {
        ...data.rooms,
        rooms: (data.rooms.rooms || []).map((room) =>
          roomOverrides[room.id] ? { ...room, ...roomOverrides[room.id], locallyEdited: true } : room,
        ),
      }
    : data.rooms;
  const campus = data.campus
    ? {
        ...data.campus,
        places: (data.campus.places || []).map((place) =>
          placeOverrides[place.id] ? { ...place, ...placeOverrides[place.id], locallyEdited: true } : place,
        ),
      }
    : data.campus;
  return { ...data, rooms, campus };
}

function resolveTheme(theme) {
  if (theme === 'dark' || theme === 'light') return theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function AppProvider({ children }) {
  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [profile, setProfileState] = useState(() => ({ ...defaultProfile, ...readStorage('compass2.profile', {}) }));
  const [theme, setThemeState] = useState(() => readStorage('compass2.theme', 'system'));
  const [bookmarks, setBookmarks] = useState(() => readStorage('compass2.bookmarks', []));
  const [overrides, setOverridesState] = useState(() => readStorage('compass2.overrides', {}));
  const [toasts, setToasts] = useState([]);
  const [updateReady, setUpdateReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [cacheState, setCacheState] = useState({ busy: false, done: false, progress: 0, detail: '' });
  const [assistantMemory, setAssistantMemory] = useState(() => readStorage('compass2.assistantMemory', {}));
  const [chatHistory, setChatHistory] = useState(() => readStorage('compass2.chat', []));
  const toastTimers = useRef(new Map());
  const firstController = useRef(null);

  const data = useMemo(() => mergeOverrides(rawData, overrides), [rawData, overrides]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const entries = await Promise.all(DATA_FILES.map(async (name) => [name, await fetchJson(name)]));
      setRawData(Object.fromEntries(entries.map(([name, value]) => [DATA_KEYS[name] || name, value])));
    } catch (error) {
      setLoadError(error.message || 'Could not load campus data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      toast('Back online. Fresh data will load on the next visit.', 'online');
    };
    const goOffline = () => {
      setOnline(false);
      toast('You are offline. Cached data still works.', 'offline');
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(theme);
      document.documentElement.style.colorScheme = resolveTheme(theme);
    };
    apply();
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', apply);
    return () => media?.removeEventListener?.('change', apply);
  }, [theme]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    let mounted = true;
    const onControllerChange = () => {
      if (firstController.current === null) {
        firstController.current = navigator.serviceWorker.controller;
        return;
      }
      if (navigator.serviceWorker.controller !== firstController.current) setUpdateReady(true);
    };
    firstController.current = navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (!mounted) return;
        if (registration.waiting) setUpdateReady(true);
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdateReady(true);
          });
        });
      })
      .catch(() => {});
    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  useEffect(() => {
    const handler = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const toast = useCallback((message, type = 'success', action = null) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((current) => [...current.slice(-2), { id, message, type, action }]);
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
      toastTimers.current.delete(id);
    }, action ? 7000 : 4200);
    toastTimers.current.set(id, timer);
  }, []);

  const dismissToast = useCallback((id) => {
    clearTimeout(toastTimers.current.get(id));
    toastTimers.current.delete(id);
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(
    () => () => {
      toastTimers.current.forEach((timer) => clearTimeout(timer));
    },
    [],
  );

  const setProfile = useCallback((next) => {
    setProfileState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      const merged = { ...defaultProfile, ...value };
      writeStorage('compass2.profile', merged);
      return merged;
    });
  }, []);

  const setTheme = useCallback((value) => {
    setThemeState(value);
    writeStorage('compass2.theme', value);
  }, []);

  const toggleBookmark = useCallback(
    (item) => {
      setBookmarks((current) => {
        const exists = current.some((entry) => entry.type === item.type && entry.id === item.id);
        const next = exists
          ? current.filter((entry) => !(entry.type === item.type && entry.id === item.id))
          : [...current, { ...item, savedAt: new Date().toISOString() }];
        writeStorage('compass2.bookmarks', next);
        toast(exists ? 'Removed from saved items' : 'Saved for later', exists ? 'info' : 'success');
        return next;
      });
    },
    [toast],
  );

  const isBookmarked = useCallback(
    (type, id) => bookmarks.some((entry) => entry.type === type && entry.id === id),
    [bookmarks],
  );

  const setOverrides = useCallback((next) => {
    setOverridesState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      writeStorage('compass2.overrides', value);
      return value;
    });
  }, []);

  const prepareOffline = useCallback(async () => {
    if (!('caches' in window)) {
      toast('This browser does not support offline storage.', 'error');
      return;
    }
    setCacheState({ busy: true, done: false, progress: 0, detail: 'Preparing…' });
    try {
      const cache = await caches.open(OFFLINE_CACHE);
      const urls = new Set(['/']);
      DATA_FILES.forEach((name) => urls.add(`/data/${name}.json`));
      for (const gallery of data.campus?.gallery || []) if (gallery.src) urls.add(gallery.src.replace('/assets/img/', '/img/'));
      for (const place of data.campus?.places || []) {
        if (!place.photo) continue;
        urls.add(place.photo.replace('/assets/img/', '/img/'));
      }
      for (const room of data.rooms?.rooms || []) if (room.image) urls.add(room.image);
      ['/img/hero/gndec_2022_newgate.jpg', '/img/hero/gndec_full.jpg', '/img/gallery/academic-block.jpg', '/manifest.webmanifest', '/favicon.svg'].forEach((url) =>
        urls.add(url),
      );
      const list = [...urls];
      let done = 0;
      for (const url of list) {
        try {
          const response = await fetch(url, { cache: 'no-cache' });
          if (response.ok) await cache.put(url, response);
        } catch {
          /* A missing optional image should not stop the download. */
        }
        done += 1;
        setCacheState({
          busy: true,
          done: false,
          progress: Math.round((done / list.length) * 100),
          detail: `Saving campus files ${done}/${list.length}`,
        });
      }
      setCacheState({ busy: false, done: true, progress: 100, detail: `${list.length} files saved` });
      toast('Campus files saved for offline use.', 'success');
    } catch (error) {
      setCacheState({ busy: false, done: false, progress: 0, detail: error.message });
      toast('Could not save all offline files.', 'error');
    }
  }, [data, toast]);

  const promptInstall = useCallback(async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const outcome = await installPrompt.userChoice;
    setInstallPrompt(null);
    return outcome.outcome === 'accepted';
  }, [installPrompt]);

  const searchIndex = useMemo(() => (data ? buildSearchIndex(data) : []), [data]);

  const value = useMemo(
    () => ({
      data,
      loading,
      loadError,
      reload: load,
      online,
      profile,
      setProfile,
      theme,
      setTheme,
      bookmarks,
      toggleBookmark,
      isBookmarked,
      toasts,
      toast,
      dismissToast,
      overrides,
      setOverrides,
      updateReady,
      installPrompt,
      promptInstall,
      prepareOffline,
      cacheState,
      searchIndex,
      assistantMemory,
      setAssistantMemory,
      chatHistory,
      setChatHistory,
    }),
    [
      data,
      loading,
      loadError,
      load,
      online,
      profile,
      setProfile,
      theme,
      setTheme,
      bookmarks,
      toggleBookmark,
      isBookmarked,
      toasts,
      toast,
      dismissToast,
      overrides,
      setOverrides,
      updateReady,
      installPrompt,
      promptInstall,
      prepareOffline,
      cacheState,
      searchIndex,
      assistantMemory,
      setAssistantMemory,
      chatHistory,
      setChatHistory,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
