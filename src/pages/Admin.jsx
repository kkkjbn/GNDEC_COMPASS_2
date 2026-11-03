import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  HardDrive,
  Info,
  LockKeyhole,
  MapPin,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { Link } from '../lib/router.jsx';
import { useApp } from '../context.jsx';
import { downloadJson, norm } from '../lib/utils.js';
import { subgroupList } from '../lib/timetable.js';
import {
  Badge,
  DataFoot,
  InlineNotice,
  PageHeader,
  Panel,
  PanelHead,
  SearchField,
  Select,
} from '../components/ui.jsx';

const ADMIN_HASH = 'e2f527cd57b562ce5917e90f32d6814efd332d8e702ebf23dff1165dd80549cc';
const UNLOCK_KEY = 'compass2.adminUnlocked';

const VALIDATION_RECORDS = [
  { crn: '2617070', name: 'Kaushik Jain', section: 'ECB', subsection: 'ECB1', branch: 'EC' },
  { crn: '2617092', name: 'Rahul Kumar', section: 'ECB', subsection: 'ECB1', branch: 'EC' },
  { crn: '2615231', name: 'Mohitveer Singh', section: 'CSD', subsection: 'CSD2', branch: 'CS' },
];

async function sha256Hex(value) {
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  // Very old browsers without Web Crypto cannot open the admin studio.
  return '';
}

function Gate({ onUnlock }) {
  const { toast } = useApp();
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const submit = async (event) => {
    event.preventDefault();
    if (!passcode.trim()) return;
    setBusy(true);
    setError('');
    const hash = await sha256Hex(passcode.trim());
    setBusy(false);
    if (hash && hash === ADMIN_HASH) {
      try {
        sessionStorage.setItem(UNLOCK_KEY, '1');
      } catch {
        /* session storage can be disabled */
      }
      onUnlock();
      toast('Admin studio unlocked for this browser session.', 'success');
    } else {
      setError('That passcode did not match. The admin studio is passcode-gated on this device.');
      setPasscode('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="admin-gate-page">
      <div className="admin-gate">
        <span className="admin-gate-mark">
          <LockKeyhole size={24} />
        </span>
        <span className="eyebrow">RESTRICTED · LOCAL ADMIN</span>
        <h1>Admin studio</h1>
        <p>
          Data health, room and place corrections, local overrides and cache controls. This is a browser-local tool, not a
          server-authenticated college dashboard.
        </p>
        <form onSubmit={submit} className="admin-gate-form">
          <label className="field">
            <span>Admin passcode</span>
            <input
              ref={inputRef}
              type="password"
              value={passcode}
              onChange={(event) => {
                setPasscode(event.target.value);
                setError('');
              }}
              placeholder="Enter the project passcode"
              autoComplete="current-password"
              autoFocus
            />
          </label>
          {error && (
            <p className="admin-gate-error">
              <XCircle size={14} /> {error}
            </p>
          )}
          <button type="submit" className="btn primary" disabled={busy || !passcode.trim()}>
            {busy ? 'Checking…' : 'Unlock admin studio'}
            <ArrowRight size={15} />
          </button>
        </form>
        <div className="admin-gate-note">
          <Info size={15} />
          <p>
            The passcode is shared separately with project maintainers. Unlocking lasts for this tab session only. Do not treat
            this as protection for private data — everything in the public build is already downloadable.
          </p>
        </div>
        <Link to="/today" className="admin-gate-back">
          <ArrowRight size={14} /> Back to Compass
        </Link>
      </div>
    </div>
  );
}

function StatusDot({ status }) {
  return <span className={`health-dot ${status}`} aria-hidden="true" />;
}

function HealthRow({ label, count, status, detail }) {
  return (
    <div className="health-row">
      <StatusDot status={status} />
      <span className="health-label">
        <b>{label}</b>
        <small>{detail}</small>
      </span>
      <span className="health-count">{count}</span>
    </div>
  );
}

function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export default function Admin() {
  const {
    data,
    reload,
    online,
    overrides,
    setOverrides,
    toast,
    prepareOffline,
    cacheState,
  } = useApp();
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(UNLOCK_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />;
  if (!data) return null;

  return (
    <AdminStudio
      data={data}
      reload={reload}
      online={online}
      overrides={overrides}
      setOverrides={setOverrides}
      toast={toast}
      prepareOffline={prepareOffline}
      cacheState={cacheState}
      onLock={() => {
        try {
          sessionStorage.removeItem(UNLOCK_KEY);
        } catch {
          /* session storage can be disabled */
        }
        setUnlocked(false);
      }}
    />
  );
}

function AdminStudio({ data, reload, online, overrides, setOverrides, toast, prepareOffline, cacheState, onLock }) {
  const [roomQuery, setRoomQuery] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [roomDraft, setRoomDraft] = useState({ block: '', floor: '', floorNo: '', placeId: '', kind: 'classroom' });
  const [selectedPlaceId, setSelectedPlaceId] = useState('');
  const [placeDraft, setPlaceDraft] = useState({ name: '', category: '', description: '', verified: false, lat: '', lon: '', x: '', y: '' });
  const [importText, setImportText] = useState('');
  const fileRef = useRef(null);

  const rooms = data.rooms?.rooms || [];
  const places = data.campus?.places || [];
  const timetable = data.timetable;
  const sections = timetable?.sections || [];
  const subgroups = subgroupList(timetable);
  const lectures = sections.flatMap((section) => section.lectures || []);
  const subLectures = subgroups.flatMap((section) => section.lectures || []);
  const allLectures = [...lectures, ...subLectures];
  const roomCodes = [...new Set(allLectures.map((lecture) => lecture.room).filter(Boolean))];
  const knownRoomIds = new Set(rooms.map((room) => norm(room.id).replace(/\s+/g, '')));
  const missingRoomCodes = roomCodes.filter((code) => !knownRoomIds.has(norm(code).replace(/\s+/g, '')));

  const health = useMemo(() => {
    const noTeacher = allLectures.filter((lecture) => !lecture.teacher && !(lecture.teachers || []).length).length;
    const noRoom = allLectures.filter((lecture) => !lecture.room).length;
    const unverifiedRooms = rooms.filter((room) => !room.block || !room.floor).length;
    const noMentor = (data.students?.records || []).filter((student) => !student.mentor).length;
    const noEmail = (data.faculty?.records || []).filter((person) => !person.email).length;
    const noPhoto = places.filter((place) => !place.photo).length;
    const noDate = (data.notices?.notices || []).filter((notice) => !notice.date).length;
    const noPaperUrl = (data.papers?.papers || []).filter((paper) => !paper.view && !paper.download).length;
    return [
      {
        label: 'Timetable sections',
        count: sections.length,
        status: sections.length ? 'good' : 'bad',
        detail: `${lectures.length.toLocaleString('en-IN')} section classes · ${subgroups.length} sub-sections (${subLectures.length} classes)`,
      },
      {
        label: 'Classes without a listed teacher',
        count: noTeacher,
        status: noTeacher === 0 ? 'good' : noTeacher < allLectures.length * 0.25 ? 'warn' : 'bad',
        detail: 'Labs sometimes list no faculty in the official export. Do not invent names.',
      },
      {
        label: 'Classes without a room',
        count: noRoom,
        status: noRoom === 0 ? 'good' : 'warn',
        detail: 'Missing room strings are left blank rather than guessed.',
      },
      {
        label: 'Timetable rooms missing from room index',
        count: missingRoomCodes.length,
        status: missingRoomCodes.length === 0 ? 'good' : 'bad',
        detail: missingRoomCodes.length ? missingRoomCodes.slice(0, 8).join(' · ') : 'Every room string has a matching room record.',
      },
      {
        label: 'Rooms with unverified block/floor',
        count: unverifiedRooms,
        status: unverifiedRooms === 0 ? 'good' : 'warn',
        detail: `${rooms.length} rooms indexed · ${rooms.filter((room) => room.image).length} have official photos`,
      },
      {
        label: 'Students without a mentor',
        count: noMentor,
        status: noMentor === 0 ? 'good' : 'warn',
        detail: `${(data.students?.count || 0).toLocaleString('en-IN')} public first-year roster records`,
      },
      {
        label: 'Faculty without a public email',
        count: noEmail,
        status: noEmail === 0 ? 'good' : 'warn',
        detail: `${data.faculty?.count || 0} profiles · checked ${formatDate(data.faculty?.checkedAt)}`,
      },
      {
        label: 'Mapped places without a photo',
        count: noPhoto,
        status: noPhoto === 0 ? 'good' : 'warn',
        detail: `${places.length} places · ${data.campus?.geometry?.length || 0} OSM shapes · ${data.campus?.edges?.length || 0} walking edges`,
      },
      {
        label: 'Notices without a date',
        count: noDate,
        status: noDate === 0 ? 'good' : 'warn',
        detail: `${(data.notices?.notices || []).length} notices · ${(data.notices?.holidays || []).length} holidays · ${(data.notices?.exams || []).length} exam updates`,
      },
      {
        label: 'Papers without an external link',
        count: noPaperUrl,
        status: noPaperUrl === 0 ? 'good' : 'bad',
        detail: `${(data.papers?.count || 0).toLocaleString('en-IN')} indexed previous-year papers`,
      },
    ];
  }, [data, allLectures, missingRoomCodes, places, rooms, sections, subgroups, subLectures]);

  const validation = VALIDATION_RECORDS.map((record) => {
    const student = (data.students?.records || []).find((item) => item.crn === record.crn);
    const section = sections.find((item) => item.id === record.section);
    return {
      ...record,
      student,
      section,
      pass: Boolean(student && student.section === record.section && student.subsection === record.subsection && section),
      nameMatches: student ? norm(student.name) === norm(record.name) : false,
    };
  });

  const filteredRooms = useMemo(() => {
    const terms = norm(roomQuery).split(' ').filter(Boolean);
    return rooms
      .filter((room) => {
        if (!terms.length) return true;
        const haystack = norm(`${room.code} ${room.block} ${room.floor} ${room.kind} ${room.label}`);
        return terms.every((term) => haystack.includes(term));
      })
      .slice(0, 60);
  }, [rooms, roomQuery]);

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) || null;
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) || null;

  const selectRoom = (id) => {
    const room = rooms.find((item) => item.id === id);
    setSelectedRoomId(id);
    setRoomDraft({
      block: room?.block || '',
      floor: room?.floor || '',
      floorNo: room?.floorNo ?? '',
      placeId: room?.placeId || '',
      kind: room?.kind || 'classroom',
    });
  };

  const selectPlace = (id) => {
    const place = places.find((item) => item.id === id);
    setSelectedPlaceId(id);
    setPlaceDraft({
      name: place?.name || '',
      category: place?.category || '',
      description: place?.description || '',
      verified: Boolean(place?.verified),
      lat: place?.lat ?? '',
      lon: place?.lon ?? '',
      x: place?.pos?.[0] ?? '',
      y: place?.pos?.[1] ?? '',
    });
  };

  const saveRoom = () => {
    if (!selectedRoom) return;
    setOverrides((current) => ({
      ...current,
      rooms: {
        ...(current.rooms || {}),
        [selectedRoom.id]: {
          block: roomDraft.block.trim() || null,
          floor: roomDraft.floor.trim() || null,
          floorNo: roomDraft.floorNo === '' ? null : Number(roomDraft.floorNo),
          placeId: roomDraft.placeId || null,
          kind: roomDraft.kind,
          locallyEdited: true,
          editedAt: new Date().toISOString(),
        },
      },
    }));
    toast(`Saved local corrections for ${selectedRoom.code}.`, 'success');
  };

  const clearRoomOverride = () => {
    if (!selectedRoom) return;
    setOverrides((current) => {
      const nextRooms = { ...(current.rooms || {}) };
      delete nextRooms[selectedRoom.id];
      return { ...current, rooms: nextRooms };
    });
    toast(`Removed the local override for ${selectedRoom.code}.`, 'info');
  };

  const savePlace = () => {
    if (!selectedPlace) return;
    const x = Number(placeDraft.x);
    const y = Number(placeDraft.y);
    setOverrides((current) => ({
      ...current,
      places: {
        ...(current.places || {}),
        [selectedPlace.id]: {
          name: placeDraft.name.trim() || selectedPlace.name,
          category: placeDraft.category.trim() || selectedPlace.category,
          description: placeDraft.description.trim(),
          verified: Boolean(placeDraft.verified),
          lat: Number(placeDraft.lat) || selectedPlace.lat,
          lon: Number(placeDraft.lon) || selectedPlace.lon,
          pos: Number.isFinite(x) && Number.isFinite(y) && placeDraft.x !== '' && placeDraft.y !== '' ? [x, y] : selectedPlace.pos,
          locallyEdited: true,
          editedAt: new Date().toISOString(),
        },
      },
    }));
    toast(`Saved local corrections for ${selectedPlace.name}.`, 'success');
  };

  const clearPlaceOverride = () => {
    if (!selectedPlace) return;
    setOverrides((current) => {
      const nextPlaces = { ...(current.places || {}) };
      delete nextPlaces[selectedPlace.id];
      return { ...current, places: nextPlaces };
    });
    toast(`Removed the local override for ${selectedPlace.name}.`, 'info');
  };

  const exportOverrides = () => {
    downloadJson('gndec-compass-overrides.json', {
      exportedAt: new Date().toISOString(),
      note: 'Browser-local corrections for GNDEC Compass 2.0. Import through the admin studio.',
      overrides,
    });
    toast('Local overrides exported.', 'success');
  };

  const exportHealth = () => {
    downloadJson('gndec-compass-data-health.json', {
      exportedAt: new Date().toISOString(),
      datasetCounts: {
        sections: sections.length,
        subgroups: subgroups.length,
        lectures: allLectures.length,
        students: data.students?.count || 0,
        faculty: data.faculty?.count || 0,
        rooms: rooms.length,
        papers: data.papers?.count || 0,
        notices: (data.notices?.notices || []).length,
        holidays: (data.notices?.holidays || []).length,
        places: places.length,
      },
      health,
      validation: validation.map(({ student, section, ...rest }) => ({
        ...rest,
        studentFound: Boolean(student),
        sectionFound: Boolean(section),
      })),
      overrides,
    });
    toast('Data health report exported.', 'success');
  };

  const importOverrides = (text) => {
    try {
      const parsed = JSON.parse(text);
      const candidate = parsed.overrides || parsed;
      const next = {
        rooms: candidate.rooms && typeof candidate.rooms === 'object' ? candidate.rooms : {},
        places: candidate.places && typeof candidate.places === 'object' ? candidate.places : {},
      };
      setOverrides(next);
      setImportText('');
      toast(
        `Imported ${Object.keys(next.rooms).length} room and ${Object.keys(next.places).length} place overrides.`,
        'success',
      );
    } catch {
      toast('That file is not valid JSON. Export a fresh overrides file and try again.', 'error');
    }
  };

  const readImportFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importOverrides(String(reader.result || ''));
    reader.onerror = () => toast('Could not read that file.', 'error');
    reader.readAsText(file);
    event.target.value = '';
  };

  const clearCache = async () => {
    if (!('caches' in window)) {
      toast('This browser does not support cache storage.', 'error');
      return;
    }
    await caches.delete('compass-offline-media-v2');
    toast('Offline photo cache cleared. Core app data is still cached by the service worker.', 'success');
  };

  const resetEverything = () => {
    if (!window.confirm('Remove all Compass 2.0 local data, including profile, booksmarks, chat, overrides and cache?')) return;
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith('compass2.'))
        .forEach((key) => localStorage.removeItem(key));
    } catch {
      /* storage may be unavailable */
    }
    caches?.keys?.().then((keys) => Promise.all(keys.filter((key) => key.startsWith('gndec-compass-') || key.startsWith('compass-')).map((key) => caches.delete(key))));
    toast('All local Compass data was cleared. Reloading…', 'success');
    setTimeout(() => window.location.reload(), 700);
  };

  const roomOverrideCount = Object.keys(overrides.rooms || {}).length;
  const placeOverrideCount = Object.keys(overrides.places || {}).length;
  const warnings = health.filter((item) => item.status !== 'good').length;

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="ADMIN STUDIO · LOCAL TOOL"
        title="Data health & corrections"
        description="A passcode-gated browser tool for checking coverage, fixing inferred room data and managing local overrides. Changes apply only to this browser."
        actions={
          <div className="head-actions">
            <button type="button" className="btn secondary" onClick={reload}>
              <RefreshCw size={15} /> Reload data
            </button>
            <button type="button" className="btn ghost" onClick={onLock}>
              <LockKeyhole size={15} /> Lock studio
            </button>
          </div>
        }
      />

      <InlineNotice tone="warn" title="Client-side gate, not server authentication">
        The public build is a static site. The passcode hides this studio from ordinary navigation, but it cannot protect data
        that is already shipped to the browser. For real access control, a backend with authenticated admin roles is required.
      </InlineNotice>

      <div className="admin-summary">
        <div>
          <Database size={18} />
          <b>11</b>
          <span>datasets loaded</span>
        </div>
        <div>
          <CheckCircle2 size={18} />
          <b>{health.filter((item) => item.status === 'good').length}/{health.length}</b>
          <span>checks clean</span>
        </div>
        <div>
          <AlertTriangle size={18} />
          <b>{warnings}</b>
          <span>checks to review</span>
        </div>
        <div>
          <Sparkles size={18} />
          <b>{roomOverrideCount + placeOverrideCount}</b>
          <span>local overrides</span>
        </div>
        <div>
          <span className={`status-dot ${online ? 'online' : 'offline'}`} />
          <b>{online ? 'Online' : 'Offline'}</b>
          <span>data refresh</span>
        </div>
      </div>

      <div className="admin-grid">
        <Panel className="admin-health">
          <PanelHead
            eyebrow="DATA HEALTH"
            title="What the public build actually contains"
            description="Counts are read from the JSON datasets in this build. No expected number is invented."
          />
          <div className="health-list">
            {health.map((item) => (
              <HealthRow key={item.label} {...item} />
            ))}
          </div>
          <div className="admin-source-stamp">
            <span>Timetable source</span>
            <b>{timetable?.source?.label || 'Official FET export'}</b>
            <small>{formatDate(timetable?.generatedAt || '2026-09-17')}</small>
          </div>
        </Panel>

        <Panel className="admin-validation">
          <PanelHead
            eyebrow="VALIDATION RECORDS"
            title="Known student checks"
            description="The roster lookups used while building Compass. These verify CRN, section and sub-section matching."
          />
          <div className="validation-list">
            {validation.map((record) => (
              <div className={`validation-row ${record.pass ? 'pass' : 'fail'}`} key={record.crn}>
                <span className="validation-icon">
                  {record.pass ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                </span>
                <span>
                  <b>{record.student?.name || record.name}</b>
                  <small>
                    CRN {record.crn} · {record.section?.id || record.section} / {record.subsection} · {record.branch}
                  </small>
                </span>
                <Badge tone={record.pass ? 'green' : 'orange'}>
                  {record.pass ? 'Matches' : record.student ? 'Mismatch' : 'Missing'}
                </Badge>
              </div>
            ))}
          </div>
          <DataFoot>
            If a record fails after a data refresh, check the public permanent-section PDF before editing the roster.
          </DataFoot>
        </Panel>
      </div>

      <div className="admin-grid">
        <Panel>
          <PanelHead
            eyebrow="ROOM CORRECTIONS"
            title="Fix inferred block & floor"
            description="Room codes come from the official timetable. Block, floor and place links are inferred and can be corrected here."
            action={<Badge tone={roomOverrideCount ? 'gold' : 'neutral'}>{roomOverrideCount} overrides</Badge>}
          />
          <div className="admin-editor">
            <SearchField value={roomQuery} onChange={setRoomQuery} placeholder="Search a room, block or floor…" />
            <Select
              label="Room"
              value={selectedRoomId}
              onChange={selectRoom}
              options={[
                { value: '', label: `${filteredRooms.length} rooms shown — choose one` },
                ...filteredRooms.map((room) => ({
                  value: room.id,
                  label: `${room.code}${room.block ? ` · ${room.block}` : ' · block unknown'}`,
                })),
              ]}
            />
            {selectedRoom && (
              <div className="admin-form">
                <div className="admin-form-grid">
                  <label className="field">
                    <span>Block</span>
                    <input
                      value={roomDraft.block}
                      onChange={(event) => setRoomDraft({ ...roomDraft, block: event.target.value })}
                      placeholder="F-Block"
                    />
                  </label>
                  <label className="field">
                    <span>Floor</span>
                    <input
                      value={roomDraft.floor}
                      onChange={(event) => setRoomDraft({ ...roomDraft, floor: event.target.value })}
                      placeholder="First floor"
                    />
                  </label>
                  <label className="field">
                    <span>Floor number</span>
                    <input
                      type="number"
                      value={roomDraft.floorNo}
                      onChange={(event) => setRoomDraft({ ...roomDraft, floorNo: event.target.value })}
                      placeholder="1"
                    />
                  </label>
                  <label className="field">
                    <span>Room type</span>
                    <select value={roomDraft.kind} onChange={(event) => setRoomDraft({ ...roomDraft, kind: event.target.value })}>
                      <option value="classroom">Classroom</option>
                      <option value="lab">Lab</option>
                      <option value="facility">Facility</option>
                    </select>
                  </label>
                </div>
                <Select
                  label="Campus place link"
                  value={roomDraft.placeId}
                  onChange={(value) => setRoomDraft({ ...roomDraft, placeId: value })}
                  options={[
                    { value: '', label: 'No verified place link' },
                    ...places
                      .filter((place) => ['academic', 'lab', 'admin'].includes(place.category))
                      .map((place) => ({ value: place.id, label: place.name })),
                  ]}
                />
                <div className="admin-form-actions">
                  <button type="button" className="btn primary" onClick={saveRoom}>
                    Save local override
                  </button>
                  {selectedRoom.locallyEdited && (
                    <button type="button" className="btn ghost" onClick={clearRoomOverride}>
                      <RotateCcw size={14} /> Remove override
                    </button>
                  )}
                  <span className="fine-print">
                    Source: {selectedRoom.source || 'timetable room code'}
                    {selectedRoom.locallyEdited ? ' · locally edited' : ''}
                  </span>
                </div>
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHead
            eyebrow="PLACE CORRECTIONS"
            title="Correct a campus place"
            description="Names, categories, descriptions and map positions can be corrected locally. Coordinates affect walking estimates."
            action={<Badge tone={placeOverrideCount ? 'gold' : 'neutral'}>{placeOverrideCount} overrides</Badge>}
          />
          <div className="admin-editor">
            <Select
              label="Place"
              value={selectedPlaceId}
              onChange={selectPlace}
              options={[
                { value: '', label: `Choose from ${places.length} places` },
                ...places.map((place) => ({ value: place.id, label: `${place.name} · ${place.category}` })),
              ]}
            />
            {selectedPlace && (
              <div className="admin-form">
                <label className="field">
                  <span>Name</span>
                  <input value={placeDraft.name} onChange={(event) => setPlaceDraft({ ...placeDraft, name: event.target.value })} />
                </label>
                <div className="admin-form-grid">
                  <label className="field">
                    <span>Category</span>
                    <input
                      value={placeDraft.category}
                      onChange={(event) => setPlaceDraft({ ...placeDraft, category: event.target.value })}
                      placeholder="academic"
                    />
                  </label>
                  <label className="field">
                    <span>Latitude</span>
                    <input
                      value={placeDraft.lat}
                      onChange={(event) => setPlaceDraft({ ...placeDraft, lat: event.target.value })}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="field">
                    <span>Longitude</span>
                    <input
                      value={placeDraft.lon}
                      onChange={(event) => setPlaceDraft({ ...placeDraft, lon: event.target.value })}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="field checkbox-field">
                    <span>Location confidence</span>
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={placeDraft.verified}
                        onChange={(event) => setPlaceDraft({ ...placeDraft, verified: event.target.checked })}
                      />
                      <span>Verified on site</span>
                    </label>
                  </label>
                </div>
                <label className="field">
                  <span>Description</span>
                  <textarea
                    rows={3}
                    value={placeDraft.description}
                    onChange={(event) => setPlaceDraft({ ...placeDraft, description: event.target.value })}
                  />
                </label>
                <div className="admin-form-grid">
                  <label className="field">
                    <span>Map X (0–1)</span>
                    <input
                      value={placeDraft.x}
                      onChange={(event) => setPlaceDraft({ ...placeDraft, x: event.target.value })}
                      inputMode="decimal"
                    />
                  </label>
                  <label className="field">
                    <span>Map Y (0–1)</span>
                    <input
                      value={placeDraft.y}
                      onChange={(event) => setPlaceDraft({ ...placeDraft, y: event.target.value })}
                      inputMode="decimal"
                    />
                  </label>
                </div>
                <div className="admin-form-actions">
                  <button type="button" className="btn primary" onClick={savePlace}>
                    Save local override
                  </button>
                  {selectedPlace.locallyEdited && (
                    <button type="button" className="btn ghost" onClick={clearPlaceOverride}>
                      <RotateCcw size={14} /> Remove override
                    </button>
                  )}
                </div>
                <p className="fine-print">
                  Map X/Y should be between 0 and 1 on the illustrated campus plan. Latitude/longitude are used for distance
                  estimates and external map links.
                </p>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="admin-grid">
        <Panel>
          <PanelHead
            eyebrow="IMPORT / EXPORT"
            title="Move local corrections safely"
            description="Overrides are browser-local. Export them before clearing site data, or import a reviewed file from another device."
          />
          <div className="admin-storage-actions">
            <button type="button" className="btn secondary" onClick={exportOverrides}>
              <Download size={15} /> Export overrides
            </button>
            <button type="button" className="btn secondary" onClick={exportHealth}>
              <Download size={15} /> Export health report
            </button>
            <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Import overrides
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={readImportFile} />
          </div>
          <div className="admin-import">
            <label className="field">
              <span>Or paste an overrides JSON object</span>
              <textarea
                rows={5}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder={'{ "rooms": { "F107": { "block": "F-Block" } }, "places": {} }'}
              />
            </label>
            <button type="button" className="btn secondary" disabled={!importText.trim()} onClick={() => importOverrides(importText)}>
              Validate & import pasted JSON
            </button>
          </div>
          <DataFoot>Import replaces the current local overrides as a set. Dataset JSON files themselves are never modified.</DataFoot>
        </Panel>

        <Panel>
          <PanelHead
            eyebrow="CACHE & STORAGE"
            title="Offline pack controls"
            description="Core data is cached by the service worker. The optional campus pack adds photos and map assets."
          />
          <div className="admin-offline">
            <div className="admin-offline-status">
              <span className={`offline-icon ${online ? 'online' : 'offline'}`}>
                {online ? <ShieldCheck size={20} /> : <WifiOff size={20} />}
              </span>
              <div>
                <b>{online ? 'Connected' : 'Offline'}</b>
                <small>{cacheState.busy ? cacheState.detail : cacheState.done ? `${cacheState.progress}% — campus photos saved` : 'Campus pack not downloaded yet'}</small>
              </div>
            </div>
            {cacheState.busy && (
              <div className="cache-track">
                <span style={{ width: `${cacheState.progress}%` }} />
              </div>
            )}
            <div className="admin-storage-actions">
              <button type="button" className="btn primary" onClick={prepareOffline} disabled={cacheState.busy || !online}>
                <HardDrive size={15} /> {cacheState.done ? 'Refresh campus pack' : 'Download campus pack'}
              </button>
              <button type="button" className="btn ghost" onClick={clearCache}>
                <Trash2 size={15} /> Clear photo cache
              </button>
            </div>
            <p className="fine-print">
              Clearing the photo cache does not remove timetable or map data. Use “Reload data” above to fetch the newest dataset
              files when online.
            </p>
          </div>
        </Panel>
      </div>

      <Panel className="admin-danger">
        <PanelHead eyebrow="DANGER ZONE" title="Local reset" description="These actions affect this browser only. The deployed app and its public data are unchanged." />
        <div className="admin-danger-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setOverrides({ rooms: {}, places: {} });
              toast('All local room and place overrides removed.', 'info');
            }}
            disabled={!roomOverrideCount && !placeOverrideCount}
          >
            <RotateCcw size={15} /> Clear overrides only
          </button>
          <button type="button" className="btn danger" onClick={resetEverything}>
            <Trash2 size={15} /> Clear all Compass local data
          </button>
        </div>
        <InlineNotice tone="warn">
          Clearing all local data removes the profile, bookmarks, chat history, exam plan, theme and overrides from this browser.
          The public datasets cannot be edited here.
        </InlineNotice>
      </Panel>

      <div className="admin-footer-links">
        <Link to="/about" className="arrow-link">
          Sources & methodology <ArrowRight size={14} />
        </Link>
        <Link to="/today" className="arrow-link">
          Back to Compass <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
