import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  CornerDownLeft,
  FileText,
  GraduationCap,
  MapPin,
  Search,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { useRouter } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import { searchGrouped } from '../lib/search.js';
import { SearchField } from './ui.jsx';

const TYPE_META = {
  student: { label: 'Students', icon: UserRound },
  faculty: { label: 'Faculty', icon: GraduationCap },
  section: { label: 'Timetable sections', icon: CalendarDays },
  room: { label: 'Rooms', icon: MapPin },
  place: { label: 'Campus places', icon: MapPin },
  paper: { label: 'Previous papers', icon: FileText },
  syllabus: { label: 'Syllabus', icon: BookOpen },
  notice: { label: 'Notices', icon: Bell },
};

const QUICK_LINKS = [
  { label: 'Today', path: '/today', hint: 'Your day at a glance', icon: Sparkles },
  { label: 'Timetable', path: '/timetable', hint: 'Classes, week and free rooms', icon: CalendarDays },
  { label: 'Campus map', path: '/map', hint: 'Rasta Saathi walking guide', icon: MapPin },
  { label: 'Ask Compass', path: '/ask', hint: 'Timetable, rooms, people, papers', icon: Sparkles },
  { label: 'Notices & exams', path: '/notices', hint: 'Official updates and holidays', icon: Bell },
];

export function CommandSearch({ open, onClose }) {
  const { searchIndex, data } = useApp();
  const { navigate } = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const groups = useMemo(() => (query.trim().length >= 2 ? searchGrouped(searchIndex, query, 4) : []), [searchIndex, query]);
  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((current) => Math.min((flat.length || QUICK_LINKS.length) - 1, current + 1));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((current) => Math.max(0, current - 1));
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const result = flat[active];
        if (result) {
          navigate(result.path);
          onClose();
        } else if (!query && QUICK_LINKS[active]) {
          navigate(QUICK_LINKS[active].path);
          onClose();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, flat, active, query, navigate, onClose]);

  useEffect(() => {
    const node = listRef.current?.querySelector('[data-active="true"]');
    node?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const go = (path) => {
    navigate(path);
    onClose();
  };

  return createPortal(
    <div className="command-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="command" role="dialog" aria-modal="true" aria-label="Search GNDEC Compass">
        <div className="command-input">
          <Search size={19} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a student, teacher, room, section, paper…"
            aria-label="Search everything"
            autoComplete="off"
          />
          <button type="button" className="command-close" onClick={onClose} aria-label="Close search">
            <X size={17} />
          </button>
        </div>

        <div className="command-body" ref={listRef}>
          {!query.trim() ? (
            <>
              <div className="command-group">
                <span className="command-label">Jump to</span>
                {QUICK_LINKS.map((item, index) => (
                  <button
                    key={item.path}
                    type="button"
                    className={`command-result ${active === index ? 'active' : ''}`}
                    data-active={active === index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(item.path)}
                  >
                    <span className="command-result-icon">
                      <item.icon size={17} />
                    </span>
                    <span className="command-result-copy">
                      <b>{item.label}</b>
                      <small>{item.hint}</small>
                    </span>
                    <ArrowRight size={15} />
                  </button>
                ))}
              </div>
              <div className="command-tip">
                <span>
                  <b>{data?.students?.count?.toLocaleString('en-IN') || '1,146'}</b> students ·{' '}
                  <b>{data?.faculty?.count || '272'}</b> faculty · <b>{data?.papers?.count?.toLocaleString('en-IN') || '1,600'}</b> papers indexed
                </span>
                <button type="button" onClick={() => go('/students')}>
                  Browse directory <ArrowRight size={13} />
                </button>
              </div>
            </>
          ) : groups.length ? (
            groups.map((group) => (
              <div className="command-group" key={group.type}>
                <span className="command-label">
                  {TYPE_META[group.type]?.label || group.type}
                  <em>{group.items.length}</em>
                </span>
                {group.items.map((item) => {
                  const Icon = TYPE_META[item.type]?.icon || Search;
                  const index = flat.findIndex((entry) => entry.type === item.type && entry.id === item.id);
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      className={`command-result ${active === index ? 'active' : ''}`}
                      data-active={active === index}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(item.path)}
                    >
                      {item.image ? (
                        <img className="command-thumb" src={item.image} alt="" loading="lazy" />
                      ) : (
                        <span className="command-result-icon">
                          <Icon size={17} />
                        </span>
                      )}
                      <span className="command-result-copy">
                        <b>{item.title}</b>
                        <small>{item.subtitle}</small>
                      </span>
                      <ArrowRight size={15} />
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="command-empty">
              <span className="empty-icon">
                <Search size={22} />
              </span>
              <b>No verified match for “{query}”</b>
              <p>Try a CRN, teacher surname, room code like F107, or a subject code like AM-101.</p>
              <button type="button" className="btn subtle" onClick={() => go(`/ask?q=${encodeURIComponent(query)}`)}>
                <Sparkles size={15} /> Ask Compass instead
              </button>
            </div>
          )}
        </div>

        <div className="command-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>Enter</kbd> to open
          </span>
          <span>
            <kbd>Esc</kbd> to close
          </span>
          <span className="command-foot-brand">
            <CornerDownLeft size={12} /> GNDEC Compass
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
