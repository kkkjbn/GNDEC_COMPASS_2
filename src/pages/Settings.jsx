import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  Check,
  Download,
  ExternalLink,
  HardDrive,
  Info,
  Laptop,
  LockKeyhole,
  Monitor,
  Moon,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  WifiOff,
} from 'lucide-react';
import { Link } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import { downloadJson, istDayLabel } from '../lib/utils.js';
import { findSection } from '../lib/timetable.js';
import { useShell } from '../components/Shell.jsx';
import {
  Badge,
  DataFoot,
  EmptyState,
  InlineNotice,
  PageHeader,
  Panel,
  PanelHead,
} from '../components/ui.jsx';

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const value = bytes / 1024 / 1024;
  return value >= 1000 ? `${(value / 1024).toFixed(1)} GB` : `${value.toFixed(1)} MB`;
}

export default function Settings() {
  const {
    data,
    profile,
    theme,
    setTheme,
    online,
    bookmarks,
    toggleBookmark,
    prepareOffline,
    cacheState,
    installPrompt,
    promptInstall,
    updateReady,
    toast,
    chatHistory,
    setChatHistory,
    assistantMemory,
    setAssistantMemory,
  } = useApp();

  const dataChecked = istDayLabel(data?.status?.lastCheckedAt || data?.timetable?.generatedAt || data?.notices?.generatedAt);
  const { openProfile } = useShell();
  const [storage, setStorage] = useState(null);
  const section = findSection(data?.timetable, profile.sectionId);

  useEffect(() => {
    if (!navigator.storage?.estimate) return;
    let cancelled = false;
    navigator.storage.estimate().then((estimate) => {
      if (!cancelled) setStorage(estimate);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheState.done]);

  const resetLocal = () => {
    if (!window.confirm('Remove your profile, bookmarks, chat history and local overrides from this browser? Campus data will stay.')) return;
    ['compass2.profile', 'compass2.bookmarks', 'compass2.chat', 'compass2.assistantMemory', 'compass2.overrides', 'compass2.examPlan', 'compass2.theme'].forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* storage may be unavailable */
      }
    });
    setChatHistory([]);
    setAssistantMemory({});
    toast('Local profile and saved data cleared. Reload to start fresh.', 'success');
  };

  const clearMediaCache = async () => {
    if (!('caches' in window)) return;
    await caches.delete('compass-offline-media-v2');
    toast('Downloaded campus photos were removed from the offline media cache.', 'success');
  };

  const exportLocal = () => {
    downloadJson('gndec-compass-local-data.json', {
      exportedAt: new Date().toISOString(),
      profile,
      theme,
      bookmarks,
      chatHistory,
      assistantMemory,
    });
    toast('Local Compass data exported as JSON.', 'success');
  };

  if (!data) return null;

  const selectedTheme = theme;

  return (
    <div className="settings-page">
      <PageHeader
        eyebrow="YOUR COMPASS"
        title="Settings"
        description="Personalise the app, download the campus pack for offline use, and understand exactly what stays on this device."
        actions={
          <div className="head-actions">
            <Link to="/legacy" className="btn secondary">
              Old Compass <ExternalLink size={15} />
            </Link>
            <button type="button" className="btn primary" onClick={openProfile}>
              <UserRound size={16} /> Edit profile
            </button>
          </div>
        }
      />

      <div className="settings-layout">
        <div className="settings-main">
          <Panel className="settings-profile">
            <div className="settings-profile-head">
              <span className="settings-profile-avatar">
                <UserRound size={24} />
              </span>
              <div>
                <span className="eyebrow">PROFILE & TIMETABLE</span>
                <h2>{profile.name || 'Your Compass profile'}</h2>
                <p>
                  {profile.crn ? `CRN ${profile.crn} · ` : ''}
                  {section?.label || 'Section not set'}
                </p>
              </div>
              <button type="button" className="btn secondary small" onClick={openProfile}>
                Change
              </button>
            </div>
            <div className="settings-profile-grid">
              <div>
                <span>Section</span>
                <b>{section?.id || profile.sectionId || 'Not set'}</b>
              </div>
              <div>
                <span>Branch</span>
                <b>{section?.branch || profile.branch || 'Not set'}</b>
              </div>
              <div>
                <span>Classes / week</span>
                <b>{section?.lectures?.length ?? '—'}</b>
              </div>
              <div>
                <span>Stored</span>
                <b>This browser only</b>
              </div>
            </div>
            <DataFoot>Your profile is used only to answer “my next class” and highlight your timetable. It is never uploaded.</DataFoot>
          </Panel>

          <Panel>
            <PanelHead eyebrow="APPEARANCE" title="Make it feel right" description="Dark mode uses a low-light palette. System follows your device setting." />
            <div className="theme-grid">
              {[
                { value: 'light', label: 'Light', note: 'Warm paper and ink', icon: Sun },
                { value: 'dark', label: 'Dark', note: 'Low-light forest', icon: Moon },
                { value: 'system', label: 'System', note: 'Match this device', icon: Monitor },
              ].map((option) => (
                <button type="button" key={option.value} className={`theme-option ${selectedTheme === option.value ? 'active' : ''}`} onClick={() => setTheme(option.value)}>
                  <span className={`theme-preview theme-preview-${option.value}`}>
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="theme-option-copy">
                    <option.icon size={15} />
                    <b>{option.label}</b>
                    <small>{option.note}</small>
                  </span>
                  {selectedTheme === option.value && (
                    <span className="theme-check">
                      <Check size={12} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHead eyebrow="SAVED ITEMS" title={`${bookmarks.length} saved`} description="Papers, students and pages you bookmarked. These survive a reload but stay in this browser." action={<button type="button" className="btn ghost small" onClick={exportLocal}><Download size={14} /> Export local data</button>} />
            {bookmarks.length ? (
              <div className="saved-list">
                {bookmarks.slice(0, 8).map((item) => (
                  <div className="saved-row" key={`${item.type}-${item.id}`}>
                    <span className="saved-type">{item.type}</span>
                    <Link to={item.path || '/today'} className="saved-copy">
                      <b>{item.title}</b>
                      <small>{item.savedAt ? new Date(item.savedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Saved locally'}</small>
                    </Link>
                    <button type="button" className="icon-btn" onClick={() => toggleBookmark(item)} aria-label="Remove saved item">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {bookmarks.length > 8 && <p className="fine-print">…and {bookmarks.length - 8} more saved items.</p>}
              </div>
            ) : (
              <EmptyState icon={Bookmark} title="Nothing saved yet">
                Use the bookmark button on a previous-year paper, a student record or a notice to keep it here.
              </EmptyState>
            )}
          </Panel>

          <Panel>
            <PanelHead eyebrow="OFFLINE & STORAGE" title="Take campus with you" description="The app shell and data load offline automatically after the first visit. Download the campus pack to save photos too." />
            <div className="offline-panel">
              <div className="offline-status-card">
                <span className={`offline-icon ${online ? 'online' : 'offline'}`}>{online ? <ShieldCheck size={20} /> : <WifiOff size={20} />}</span>
                <div>
                  <b>{online ? 'Connected' : 'Offline mode active'}</b>
                  <small>{online ? 'Cached data is being refreshed in the background.' : 'Timetable, roster, map and chat still work.'}</small>
                </div>
              </div>
              <div className="offline-actions">
                <button type="button" className="btn primary" onClick={prepareOffline} disabled={cacheState.busy || !online}>
                  <Download size={16} /> {cacheState.busy ? 'Saving campus pack…' : cacheState.done ? 'Refresh offline campus pack' : 'Download campus pack'}
                </button>
                <button type="button" className="btn ghost" onClick={clearMediaCache}>
                  Clear photo cache
                </button>
              </div>
              {cacheState.busy || cacheState.done ? (
                <div className="cache-progress">
                  <div className="cache-progress-top">
                    <span>{cacheState.detail}</span>
                    <b>{cacheState.progress}%</b>
                  </div>
                  <div className="cache-track"><span style={{ width: `${cacheState.progress}%` }} /></div>
                </div>
              ) : null}
              <div className="storage-grid">
                <div>
                  <span>Cache + local data</span>
                  <b>{storage ? formatBytes((storage.usage || 0)) : 'Not reported'}</b>
                </div>
                <div>
                  <span>Browser quota</span>
                  <b>{storage ? formatBytes(storage.quota || 0) : 'Not reported'}</b>
                </div>
                <div>
                  <span>Service worker</span>
                  <b>{'serviceWorker' in navigator ? 'Supported' : 'Not supported'}</b>
                </div>
              </div>
              {updateReady && (
                <InlineNotice tone="good" title="A new Compass build is ready">
                  Reload once to use the latest data and fixes.
                  <button type="button" className="inline-action" onClick={() => window.location.reload()}>
                    <RefreshCw size={13} /> Reload now
                  </button>
                </InlineNotice>
              )}
              {installPrompt && (
                <div className="install-row">
                  <span>
                    <Smartphone size={17} />
                    <div>
                      <b>Install Compass</b>
                      <small>Add it to your home screen and open it like an app.</small>
                    </div>
                  </span>
                  <button type="button" className="btn secondary small" onClick={promptInstall}>
                    <Download size={14} /> Install
                  </button>
                </div>
              )}
              <p className="fine-print">
                iPhone or iPad: open this site in Safari, tap Share, then “Add to Home Screen”. Offline photos are stored by the browser and may be cleared if device storage runs low.
              </p>
            </div>
          </Panel>

          <Panel className="danger-panel">
            <PanelHead eyebrow="YOUR DATA" title="Privacy & reset" description="Compass has no account, no server-side profile and no analytics script." />
            <div className="privacy-grid">
              <div>
                <LockKeyhole size={18} />
                <b>Local-first</b>
                <p>Profile, bookmarks and chat live in localStorage on this device.</p>
              </div>
              <div>
                <Info size={18} />
                <b>No tracking</b>
                <p>No advertising or analytics pixels are loaded by Compass.</p>
              </div>
              <div>
                <HardDrive size={18} />
                <b>You control it</b>
                <p>Export your local data, or clear it here at any time.</p>
              </div>
            </div>
            <div className="danger-actions">
              <button type="button" className="btn ghost" onClick={exportLocal}>
                <Download size={15} /> Export my data
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setChatHistory([]);
                  setAssistantMemory({});
                  toast('Chat history and assistant memory cleared.', 'success');
                }}
              >
                Clear chat history
              </button>
              <button type="button" className="btn danger" onClick={resetLocal}>
                <Trash2 size={15} /> Reset all local data
              </button>
            </div>
            <DataFoot>
              Chat history contains {chatHistory.length} messages and assistant memory {Object.keys(assistantMemory || {}).length} keys.
            </DataFoot>
          </Panel>
        </div>

        <aside className="settings-rail">
          <div className="old-compass-card">
            <span className="old-compass-mark">C</span>
            <span className="eyebrow pale">STILL AVAILABLE</span>
            <h2>The old Compass is one tap away.</h2>
            <p>Prefer the original interface? It lives at its own address and remains untouched by Compass 2.0.</p>
            <a className="btn light" href="https://gndec-compass.koushikjain2007.workers.dev/#/today" target="_blank" rel="noreferrer">
              Open old GNDEC Compass <ExternalLink size={15} />
            </a>
            <small>Different project, separate data and settings.</small>
          </div>

          <Panel className="app-info-card">
            <span className="eyebrow">ABOUT THIS BUILD</span>
            <h2>Compass 2.0</h2>
            <dl>
              <div><dt>Version</dt><dd>2.0.0</dd></div>
              <div><dt>Data checked</dt><dd>{dataChecked || 'Not listed'}</dd></div>
              <div><dt>Classes indexed</dt><dd>{(data.timetable?.sections || []).reduce((sum, item) => sum + (item.lectures?.length || 0), 0).toLocaleString('en-IN')}</dd></div>
              <div><dt>Old Compass</dt><dd><a href="https://gndec-compass.koushikjain2007.workers.dev/#/today" target="_blank" rel="noreferrer">Visit <ExternalLink size={11} /></a></dd></div>
            </dl>
            <Link to="/about" className="arrow-link">
              Sources & methodology <ArrowRight size={14} />
            </Link>
          </Panel>

          <div className="settings-tip">
            <Sparkles size={18} />
            <div>
              <b>Try Ask Compass</b>
              <p>“Where is the admission cell?” · “Who teaches Math I?” · “Show ECE B1 timetable tomorrow”</p>
              <Link to="/ask" className="arrow-link">
                Open Ask Compass <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
