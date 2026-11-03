import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  Search,
  WifiOff,
  X,
} from 'lucide-react';
import { initials } from '../lib/utils.js';

export function PageHeader({ eyebrow, title, description, actions, children, compact = false }) {
  return (
    <header className={`page-head ${compact ? 'compact' : ''}`}>
      <div className="page-head-copy">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  );
}

export function Panel({ children, className = '', as: Tag = 'section', ...rest }) {
  return (
    <Tag className={`panel ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function PanelHead({ eyebrow, title, description, action, children }) {
  return (
    <div className="panel-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        {title && <h2>{title}</h2>}
        {description && <p>{description}</p>}
        {children}
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', className = '', ...rest }) {
  return (
    <span className={`badge badge-${tone} ${className}`} {...rest}>
      {children}
    </span>
  );
}

export function Avatar({ name, src, size = 38, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className={`avatar avatar-${size} ${className}`} aria-hidden="true">
      {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : initials(name)}
    </span>
  );
}

export function EmptyState({ icon: Icon = Info, title, children, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={22} />
      </span>
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Spinner({ size = 18, className = '' }) {
  return <Loader2 size={size} className={`spin ${className}`} aria-hidden="true" />;
}

export function SearchField({ value, onChange, placeholder, className = '', onClear, autoFocus = false, ...rest }) {
  return (
    <label className={`search-field ${className}`}>
      <Search size={17} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        {...rest}
      />
      {value ? (
        <button type="button" className="search-clear" aria-label="Clear search" onClick={() => (onClear ? onClear() : onChange(''))}>
          <X size={15} />
        </button>
      ) : null}
    </label>
  );
}

export function Segmented({ options, value, onChange, ariaLabel, className = '' }) {
  return (
    <div className={`segmented ${className}`} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.icon ? <option.icon size={15} /> : null}
          {option.label}
          {option.count !== undefined ? <span className="seg-count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ options, value, onChange, className = '' }) {
  return (
    <div className={`tabs ${className}`} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.icon ? <option.icon size={16} /> : null}
          <span>{option.label}</span>
          {option.count !== undefined ? <span className="tab-count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', className = '' }) {
  const titleId = useId();
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement;
    const timer = setTimeout(() => {
      const target = ref.current?.querySelector('[data-autofocus]') || ref.current?.querySelector('button, input, select, textarea, a[href]');
      target?.focus?.();
    }, 40);
    document.body.classList.add('modal-open');
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      previous?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className={`modal-layer ${className}`} onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <div className="modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Toasts({ items, onDismiss }) {
  return createPortal(
    <div className="toast-stack" aria-live="polite">
      {items.map((item) => (
        <div className={`toast toast-${item.type}`} key={item.id}>
          <span className="toast-icon">
            {item.type === 'error' ? <AlertTriangle size={16} /> : item.type === 'offline' ? <WifiOff size={16} /> : <CheckCircle2 size={16} />}
          </span>
          <div>
            <p>{item.message}</p>
            {item.action ? (
              <button type="button" onClick={() => { item.action.onClick(); onDismiss(item.id); }}>
                {item.action.label}
              </button>
            ) : null}
          </div>
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => onDismiss(item.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// Renders the small, controlled subset of Markdown used by the assistant.
export function RichText({ text = '', className = '' }) {
  const lines = String(text).split('\n');
  return (
    <div className={`rich-text ${className}`}>
      {lines.map((line, index) => {
        if (!line.trim()) return <div className="rich-gap" key={index} />;
        const bullet = line.match(/^\s*[•\-*]\s+(.*)$/);
        const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/);
        const content = bullet ? bullet[1] : numbered ? numbered[2] : line;
        const parts = content.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
        const rendered = parts.map((part, partIndex) =>
          part.startsWith('**') && part.endsWith('**') ? <strong key={partIndex}>{part.slice(2, -2)}</strong> : <React.Fragment key={partIndex}>{part}</React.Fragment>,
        );
        if (bullet) {
          return (
            <div className="rich-line rich-bullet" key={index}>
              <span />
              <p>{rendered}</p>
            </div>
          );
        }
        if (numbered) {
          return (
            <div className="rich-line rich-number" key={index}>
              <b>{numbered[1]}</b>
              <p>{rendered}</p>
            </div>
          );
        }
        return (
          <p className="rich-line" key={index}>
            {rendered}
          </p>
        );
      })}
    </div>
  );
}

export function CopyButton({ value, label = 'Copy', className = '' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`copy-button ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

export function CoverageMeter({ value = 0, label, detail, tone = 'good' }) {
  return (
    <div className={`coverage ${tone}`}>
      <div className="coverage-top">
        <span>{label}</span>
        <b>{value}%</b>
      </div>
      <div className="coverage-track">
        <span style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </div>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function InlineNotice({ tone = 'info', title, children, icon: Icon }) {
  const Fallback = tone === 'warn' ? AlertTriangle : tone === 'good' ? CheckCircle2 : Info;
  const ActualIcon = Icon || Fallback;
  return (
    <div className={`inline-notice ${tone}`}>
      <ActualIcon size={17} />
      <div>
        {title && <b>{title}</b>}
        <p>{children}</p>
      </div>
    </div>
  );
}

export function Select({ value, onChange, options, label, className = '', ...rest }) {
  return (
    <label className={`select-field ${className}`}>
      {label && <span>{label}</span>}
      <span className="select-wrap">
        <select value={value} onChange={(event) => onChange(event.target.value)} {...rest}>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={15} />
      </span>
    </label>
  );
}

export function ArrowLink({ children, onClick, className = '', ...rest }) {
  return (
    <button type="button" className={`arrow-link ${className}`} onClick={onClick} {...rest}>
      {children}
      <ArrowRight size={15} />
    </button>
  );
}

export function DataFoot({ children }) {
  return (
    <p className="data-foot">
      <Info size={13} />
      <span>{children}</span>
    </p>
  );
}

export function Metric({ icon: Icon, value, label, tone = 'green', onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`metric metric-${tone}`} onClick={onClick}>
      {Icon && (
        <span className="metric-icon">
          <Icon size={18} />
        </span>
      )}
      <span className="metric-copy">
        <b>{value}</b>
        <small>{label}</small>
      </span>
      {onClick && <ChevronRight size={15} className="metric-arrow" />}
    </Tag>
  );
}

export function Skeleton({ className = '', height, width }) {
  return <span className={`skeleton ${className}`} style={{ height, width }} aria-hidden="true" />;
}

export function LoadingScreen({ label = 'Opening GNDEC Compass…' }) {
  return (
    <div className="loading-screen">
      <span className="brand-mark big">C</span>
      <b>GNDEC Compass</b>
      <span className="loading-bar">
        <span />
      </span>
      <small>{label}</small>
    </div>
  );
}

export function ErrorScreen({ message, onRetry }) {
  return (
    <div className="error-screen">
      <span className="empty-icon">
        <WifiOff size={24} />
      </span>
      <h2>Campus data is not available yet</h2>
      <p>{message || 'The app could not load its data. If you are offline, reconnect once to save the campus pack.'}</p>
      <button type="button" className="btn primary" onClick={onRetry}>
        <Loader2 size={16} /> Try again
      </button>
    </div>
  );
}
