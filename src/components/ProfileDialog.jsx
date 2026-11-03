import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Check, Search, UserRound } from 'lucide-react';
import { useApp } from '../context.jsx';
import { findSection, sectionForStudent } from '../lib/timetable.js';
import { branchShort, yearLabel } from '../lib/utils.js';
import { Avatar, Badge, Modal, Select } from './ui.jsx';

export function ProfileDialog({ open, onClose }) {
  const { data, profile, setProfile, toast } = useApp();
  const [draft, setDraft] = useState(profile);
  const [lookup, setLookup] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(profile);
      setLookup(profile.crn || '');
      setLookupMessage('');
    }
  }, [open, profile]);

  const sections = useMemo(() => {
    const all = [...(data?.timetable?.sections || [])].sort(
      (a, b) => a.year - b.year || String(a.branch).localeCompare(String(b.branch)) || String(a.group).localeCompare(String(b.group)),
    );
    return all;
  }, [data]);

  const sectionOptions = useMemo(() => {
    const groups = new Map();
    for (const section of sections) {
      const key = `${section.year}-${section.program}`;
      if (!groups.has(key)) groups.set(key, { label: `${yearLabel(section.year)} · ${section.program}`, options: [] });
      groups.get(key).options.push({ value: section.id, label: section.label });
    }
    return [...groups.values()];
  }, [sections]);

  const currentSection = findSection(data?.timetable, draft.sectionId);
  const matches = useMemo(() => {
    const query = lookup.trim().toLowerCase();
    if (query.length < 3) return [];
    return (data?.students?.records || [])
      .filter((student) => student.crn.includes(query) || student.name.toLowerCase().includes(query))
      .slice(0, 5);
  }, [lookup, data]);

  const chooseStudent = (student) => {
    const matchedSection = sectionForStudent(data?.timetable, student);
    setDraft((current) => ({
      ...current,
      name: student.name,
      crn: student.crn,
      branch: student.branch,
      year: student.year || 1,
      sectionId: matchedSection?.id || student.section,
    }));
    setLookup(student.crn);
    setLookupMessage(`Matched the public first-year roster for ${student.name}.`);
  };

  const applyLookup = () => {
    const query = lookup.trim();
    if (!query) {
      setLookupMessage('Enter your CRN or name to search the first-year roster.');
      return;
    }
    const exact = (data?.students?.records || []).find((student) => student.crn === query);
    const match = exact || matches[0];
    if (match) {
      chooseStudent(match);
    } else {
      setLookupMessage('No first-year roster record matched. You can still choose your section manually.');
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (draft.crn && !/^\d{7}$/.test(draft.crn.trim())) {
      toast('A GNDEC CRN is normally 7 digits.', 'error');
      return;
    }
    setProfile({ ...draft, crn: draft.crn.trim(), name: draft.name.trim() });
    toast('Your Compass profile is saved on this device.', 'success');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your Compass profile"
      subtitle="Choose your timetable section. Everything stays on this device."
      footer={
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="profile-form" className="btn primary">
            <Check size={16} /> Save profile
          </button>
        </div>
      }
    >
      <form id="profile-form" className="profile-form" onSubmit={submit}>
        <div className="lookup-card">
          <span className="eyebrow">FIND YOUR PUBLIC ROSTER RECORD</span>
          <div className="lookup-row">
            <label className="search-field">
              <Search size={16} />
              <input
                data-autofocus
                value={lookup}
                onChange={(event) => {
                  setLookup(event.target.value);
                  setLookupMessage('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyLookup();
                  }
                }}
                placeholder="CRN 2617070 or your full name"
                aria-label="Search your CRN or name"
              />
            </label>
            <button type="button" className="btn secondary" onClick={applyLookup}>
              Find me
            </button>
          </div>
          {lookupMessage && <p className="lookup-message">{lookupMessage}</p>}
          {matches.length > 0 && (
            <div className="lookup-results">
              {matches.map((student) => (
                <button type="button" className="lookup-result" key={student.crn} onClick={() => chooseStudent(student)}>
                  <Avatar name={student.name} size={34} />
                  <span>
                    <b>{student.name}</b>
                    <small>
                      CRN {student.crn} · {branchShort(student.branch)} · {student.section}
                    </small>
                  </span>
                  <BadgeCheck size={16} />
                </button>
              ))}
            </div>
          )}
          <p className="fine-print">
            Only the public first-year permanent-section roster is searchable. Mentor phone numbers and private contact data are not published.
          </p>
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Display name <small>optional</small></span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="How Compass greets you"
              autoComplete="name"
            />
          </label>
          <label className="field">
            <span>CRN <small>optional</small></span>
            <input
              value={draft.crn}
              onChange={(event) => setDraft({ ...draft, crn: event.target.value.replace(/[^\d]/g, '').slice(0, 7) })}
              placeholder="7-digit CRN"
              inputMode="numeric"
            />
          </label>
        </div>

        <Select
          label="Timetable section"
          value={draft.sectionId || ''}
          onChange={(value) => setDraft({ ...draft, sectionId: value })}
          options={[
            { value: '', label: 'Choose a section', disabled: true },
            ...sectionOptions.flatMap((group) => [
              { value: `__group_${group.label}`, label: `— ${group.label} —`, disabled: true },
              ...group.options,
            ]),
          ]}
        />

        {currentSection && (
          <div className="profile-preview">
            <span className="profile-preview-icon">
              <UserRound size={18} />
            </span>
            <div>
              <b>{currentSection.label}</b>
              <small>
                {currentSection.id} · {currentSection.lectures?.length || 0} classes in the current export
              </small>
            </div>
            <Badge tone={currentSection.year === 1 ? 'green' : 'gold'}>{currentSection.year === 1 ? 'Complete export' : 'Partial export'}</Badge>
          </div>
        )}

        <div className="privacy-note">
          <Badge tone="neutral">Local-first</Badge>
          <p>No account, password or student number is sent to a server. Profile, bookmarks and chat history are stored in this browser only.</p>
        </div>
      </form>
    </Modal>
  );
}
