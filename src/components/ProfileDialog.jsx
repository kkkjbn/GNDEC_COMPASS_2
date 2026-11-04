import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Check, Search, UserRound } from 'lucide-react';
import { useApp } from '../context.jsx';
import { baseSectionFor, findSection, mentoringGroupsForSection, sectionForStudent } from '../lib/timetable.js';
import { branchShort, yearLabel } from '../lib/utils.js';
import { Avatar, Badge, Modal, Select } from './ui.jsx';

const sectionRosterId = (student) => String(student.section || '').toUpperCase();

export function ProfileDialog({ open, onClose }) {
  const { data, profile, setProfile, toast } = useApp();
  const [draft, setDraft] = useState(profile);
  const [lookup, setLookup] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');
  const timetable = data?.timetable;
  const roster = data?.students?.records || [];

  const normalize = (value) => {
    const entry = findSection(timetable, value.sectionId);
    if (!entry) return value;
    const base = baseSectionFor(timetable, entry) || entry;
    if (entry.id === base.id) return value;
    if (entry.mentoringGroup) {
      return { ...value, sectionId: base.id, academicGroup: value.academicGroup || entry.id };
    }
    return { ...value, sectionId: base.id, subsection: value.subsection || entry.id };
  };

  const rosterMatch = (value, { subsection = true } = {}) => {
    const section = String(value.sectionId || '').toUpperCase();
    if (!section) return null;
    const group = String(value.academicGroup || '').toUpperCase();
    const sub = String(value.subsection || '').toUpperCase();
    if (group) {
      const exact = roster.find((student) => sectionRosterId(student) === section && String(student.academicGroup || '').toUpperCase() === group);
      if (exact) return exact;
    }
    if (subsection && sub) {
      const bySub = roster.filter((student) => sectionRosterId(student) === section && String(student.subsection || '').toUpperCase() === sub);
      if (bySub.length) return bySub[0];
    }
    return null;
  };

  const fillMentor = (value, { overwrite = false } = {}) => {
    const match = rosterMatch(value);
    if (!match) return value;
    const next = { ...value };
    if ((overwrite || !next.mentor) && match.mentor) next.mentor = match.mentor;
    if ((overwrite || !next.mentorPhone) && match.mentorPhone) next.mentorPhone = match.mentorPhone;
    const venue = match.mentorVenue || match.venue;
    if ((overwrite || !next.mentorVenue) && venue) next.mentorVenue = venue;
    return next;
  };

  useEffect(() => {
    if (open) {
      const next = fillMentor(normalize(profile));
      setDraft(next);
      setLookup(profile.crn || '');
      setLookupMessage('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile, timetable]);

  const rosterRecord = useMemo(
    () => (draft.crn ? roster.find((student) => String(student.crn) === String(draft.crn)) || null : null),
    [draft.crn, roster],
  );

  const sections = useMemo(() => {
    const all = [...(data?.timetable?.sections || [])].sort(
      (a, b) => a.year - b.year || String(a.branch).localeCompare(String(b.branch)) || String(a.group).localeCompare(String(b.group)),
    );
    return all;
  }, [data]);

  const branchOptions = useMemo(() => {
    const map = new Map();
    for (const section of sections) {
      if (!section.branch) continue;
      if (!map.has(section.branch)) map.set(section.branch, section.branchName || branchShort(section.branch));
    }
    return [...map.entries()]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([value, label]) => ({ value, label: `${label} (${value})` }));
  }, [sections]);

  const yearOptions = useMemo(() => {
    const years = [...new Set(sections.filter((section) => !draft.branch || section.branch === draft.branch).map((section) => section.year))].sort((a, b) => a - b);
    return years.map((year) => ({ value: String(year), label: yearLabel(year) }));
  }, [sections, draft.branch]);

  const sectionOptions = useMemo(() => {
    return sections
      .filter((section) => (!draft.branch || section.branch === draft.branch) && (!draft.year || section.year === Number(draft.year)))
      .map((section) => ({ value: section.id, label: `${section.label} · ${section.id}` }));
  }, [sections, draft.branch, draft.year]);

  const currentSection = findSection(timetable, draft.sectionId);

  const sectionSubgroups = useMemo(() => {
    if (!currentSection) return [];
    const base = baseSectionFor(timetable, currentSection) || currentSection;
    return (data?.timetable?.subgroups || [])
      .filter((group) => baseSectionFor(timetable, group)?.id === base.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  }, [data, currentSection]);

  const subsectionOptions = useMemo(() => {
    if (!currentSection) return [];
    const values = new Set(
      sectionSubgroups.filter((group) => !group.mentoringGroup).map((group) => group.id.toUpperCase()),
    );
    for (const student of roster) {
      if (sectionRosterId(student) !== currentSection.id.toUpperCase() || !student.subsection) continue;
      values.add(String(student.subsection).toUpperCase());
    }
    return [
      { value: '', label: 'Whole section (no lab batch)' },
      ...[...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((value) => ({ value, label: value })),
    ];
  }, [currentSection, sectionSubgroups, roster]);

  const academicOptions = useMemo(() => {
    if (!currentSection) return [];
    const sectionId = currentSection.id.toUpperCase();
    const values = new Set(mentoringGroupsForSection(timetable, currentSection).map((group) => group.id.toUpperCase()));
    for (const student of roster) {
      if (sectionRosterId(student) !== sectionId || !student.academicGroup) continue;
      const group = String(student.academicGroup).toUpperCase();
      // The published roster occasionally carries a cross-section mentoring
      // code (for example an ECB student tagged ECAM3). Only offer groups that
      // belong to the chosen section so the picker stays predictable.
      if (!group.startsWith(sectionId)) continue;
      values.add(group);
    }
    return [
      { value: '', label: 'No mentoring group' },
      ...[...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((value) => ({ value, label: value })),
    ];
  }, [currentSection, timetable, roster]);

  const matches = useMemo(() => {
    const query = lookup.trim().toLowerCase();
    if (query.length < 3) return [];
    return roster
      .filter((student) => student.crn.includes(query) || student.name.toLowerCase().includes(query))
      .slice(0, 5);
  }, [lookup, roster]);

  const chooseStudent = (student) => {
    const matchedSection = sectionForStudent(timetable, student);
    const base = matchedSection ? baseSectionFor(timetable, matchedSection) || matchedSection : null;
    setDraft((current) =>
      fillMentor(
        {
          ...current,
          name: student.name,
          crn: student.crn,
          branch: student.branch,
          year: student.year || 1,
          sectionId: base?.id || student.section,
          subsection: student.subsection || '',
          academicGroup: student.academicGroup || '',
          registrationNo: student.registrationNo || '',
          serialNo: student.currentSerialNo || student.serialNo || '',
          mentor: student.mentor || '',
          mentorPhone: student.mentorPhone || '',
          mentorVenue: student.mentorVenue || student.venue || '',
        },
        { overwrite: true },
      ),
    );
    setLookup(student.crn);
    setLookupMessage(`Matched the public first-year roster for ${student.name}.`);
  };

  const applyLookup = () => {
    const query = lookup.trim();
    if (!query) {
      setLookupMessage('Enter your CRN or name to search the first-year roster.');
      return;
    }
    const exact = roster.find((student) => student.crn === query);
    const match = exact || matches[0];
    if (match) {
      chooseStudent(match);
    } else {
      setLookupMessage('No first-year roster record matched. You can still choose your branch and section manually.');
    }
  };

  const resetChoices = {
    sectionId: '',
    subsection: '',
    academicGroup: '',
    mentor: '',
    mentorPhone: '',
    mentorVenue: '',
  };

  const changeBranch = (branch) => {
    const years = sections.filter((section) => section.branch === branch).map((section) => section.year);
    setDraft((current) => ({
      ...current,
      ...resetChoices,
      branch,
      year: years.length ? Math.min(...years) : current.year,
    }));
  };

  const changeYear = (year) => {
    setDraft((current) => ({ ...current, ...resetChoices, year: Number(year) }));
  };

  const changeSection = (sectionId) => {
    const entry = findSection(timetable, sectionId);
    setDraft((current) => ({
      ...current,
      ...resetChoices,
      sectionId,
      branch: entry?.branch || current.branch,
      year: entry?.year || current.year,
    }));
  };

  const changeSubsection = (subsection) => {
    setDraft((current) => {
      const next = { ...current, subsection, academicGroup: '' };
      const candidates = roster.filter(
        (student) =>
          sectionRosterId(student) === String(current.sectionId || '').toUpperCase() &&
          String(student.subsection || '').toUpperCase() === subsection.toUpperCase(),
      );
      const groups = [...new Set(candidates.map((student) => student.academicGroup).filter(Boolean))];
      if (groups.length === 1) next.academicGroup = groups[0];
      return fillMentor(next, { overwrite: true });
    });
  };

  const changeAcademicGroup = (academicGroup) => {
    setDraft((current) => fillMentor({ ...current, academicGroup }, { overwrite: true }));
  };

  const submit = (event) => {
    event.preventDefault();
    if (draft.crn && !/^\d{7}$/.test(draft.crn.trim())) {
      toast('A GNDEC CRN is normally 7 digits.', 'error');
      return;
    }
    if (!draft.sectionId) {
      toast('Choose at least your branch and timetable section.', 'error');
      return;
    }
    setProfile({
      ...draft,
      crn: draft.crn.trim(),
      name: draft.name.trim(),
      sectionId: String(draft.sectionId).toUpperCase(),
      subsection: String(draft.subsection || '').toUpperCase(),
      academicGroup: String(draft.academicGroup || '').toUpperCase(),
    });
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
            Only the public first-year permanent-section roster is searchable. The mentor name, phone and venue below come from that public roster; edit them if your section office has updated them.
          </p>
        </div>

        {rosterRecord && (
          <div className="roster-card">
            <div className="roster-card-head">
              <b>{rosterRecord.name}</b>
              <span>
                {rosterRecord.branch} / {rosterRecord.section}
                {rosterRecord.subsection ? ` / ${rosterRecord.subsection}` : ''}
              </span>
            </div>
            <dl>
              <div>
                <dt>CRN</dt>
                <dd>{rosterRecord.crn}</dd>
              </div>
              <div>
                <dt>Registration</dt>
                <dd>{rosterRecord.registrationNo || '—'}</dd>
              </div>
              <div>
                <dt>Current serial</dt>
                <dd>{rosterRecord.currentSerialNo || rosterRecord.serialNo || '—'}</dd>
              </div>
              <div>
                <dt>Section</dt>
                <dd>
                  {rosterRecord.section}
                  {rosterRecord.subsection ? ` / ${rosterRecord.subsection}` : ''}
                </dd>
              </div>
              <div>
                <dt>Academic group</dt>
                <dd>{rosterRecord.academicGroup || '—'}</dd>
              </div>
              <div>
                <dt>Mentor</dt>
                <dd>{rosterRecord.mentor || '—'}</dd>
              </div>
              <div>
                <dt>Mentor phone</dt>
                <dd>{rosterRecord.mentorPhone || '—'}</dd>
              </div>
              <div>
                <dt>Mentor venue</dt>
                <dd>{rosterRecord.mentorVenue || rosterRecord.venue || '—'}</dd>
              </div>
            </dl>
          </div>
        )}

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

        <div className="form-grid three">
          <Select
            label="Branch"
            value={draft.branch || ''}
            onChange={changeBranch}
            options={[{ value: '', label: 'Choose a branch', disabled: true }, ...branchOptions]}
          />
          <Select
            label="Year"
            value={String(draft.year || '')}
            onChange={changeYear}
            options={yearOptions}
          />
          <Select
            label="Section"
            value={draft.sectionId || ''}
            onChange={changeSection}
            options={[{ value: '', label: 'Choose a section', disabled: true }, ...sectionOptions]}
          />
        </div>

        {currentSection && (
          <div className="profile-preview">
            <span className="profile-preview-icon">
              <UserRound size={18} />
            </span>
            <div>
              <b>{currentSection.label}</b>
              <small>
                {currentSection.id} · {currentSection.lectures?.length || 0} classes in the current export
                {draft.subsection ? ` · ${draft.subsection}` : ''}
                {draft.academicGroup ? ` · ${draft.academicGroup}` : ''}
              </small>
            </div>
            <Badge tone={currentSection.year === 1 ? 'green' : 'gold'}>{currentSection.year === 1 ? 'Complete export' : 'Partial export'}</Badge>
          </div>
        )}

        <div className="form-grid">
          <Select
            label="Lab sub-section"
            value={draft.subsection || ''}
            onChange={changeSubsection}
            options={subsectionOptions.length ? subsectionOptions : [{ value: '', label: 'Choose a section first', disabled: true }]}
          />
          <Select
            label="Academic / mentoring group"
            value={draft.academicGroup || ''}
            onChange={changeAcademicGroup}
            options={academicOptions.length ? academicOptions : [{ value: '', label: 'Choose a section first', disabled: true }]}
          />
        </div>

        <div className="form-grid">
          <label className="field">
            <span>Mentor <small>optional</small></span>
            <input
              value={draft.mentor || ''}
              onChange={(event) => setDraft({ ...draft, mentor: event.target.value })}
              placeholder="Mentor name"
            />
          </label>
          <label className="field">
            <span>Mentor phone <small>optional</small></span>
            <input
              value={draft.mentorPhone || ''}
              onChange={(event) => setDraft({ ...draft, mentorPhone: event.target.value })}
              placeholder="From the public roster"
              inputMode="tel"
            />
          </label>
          <label className="field">
            <span>Mentor venue <small>optional</small></span>
            <input
              value={draft.mentorVenue || ''}
              onChange={(event) => setDraft({ ...draft, mentorVenue: event.target.value })}
              placeholder="e.g. G6"
            />
          </label>
        </div>

        <div className="privacy-note">
          <Badge tone="neutral">Local-first</Badge>
          <p>No account, password or student number is sent to a server. Profile, bookmarks and chat history are stored in this browser only.</p>
        </div>
      </form>
    </Modal>
  );
}
