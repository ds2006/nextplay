import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import './App.css';

// ── Types ─────────────────────────────────────────────────────────────────
type Priority = 'low' | 'normal' | 'high';
type Status   = 'todo' | 'in_progress' | 'in_review' | 'done';

interface ActivityEntry { action: string; at: string; }
interface TaskLink { url: string; label: string; }
interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  due_date: string | null;
  label_names: string[];
  links: TaskLink[];
  activity: ActivityEntry[];
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────
const COLUMNS: { id: Status; label: string; color: string; light: string }[] = [
  { id: 'todo',        label: 'To Do',       color: '#6366f1', light: '#eef2ff' },
  { id: 'in_progress', label: 'In Progress', color: '#f59e0b', light: '#fffbeb' },
  { id: 'in_review',   label: 'In Review',   color: '#3b82f6', light: '#eff6ff' },
  { id: 'done',        label: 'Done',        color: '#10b981', light: '#ecfdf5' },
];
const STATUS_LABELS: Record<Status, string> = {
  todo: 'To Do', in_progress: 'In Progress', in_review: 'In Review', done: 'Done',
};
const PRIORITY_STYLES: Record<Priority, { bg: string; text: string }> = {
  high:   { bg: '#fee2e2', text: '#dc2626' },
  normal: { bg: '#fef9c3', text: '#ca8a04' },
  low:    { bg: '#dcfce7', text: '#16a34a' },
};
const LABEL_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#ec4899','#8b5cf6','#14b8a6'];

// ── Link helpers ──────────────────────────────────────────────────────────
interface LinkMeta { icon: string; color: string; defaultLabel: string; }

function detectLink(url: string): LinkMeta {
  try {
    const h = new URL(url).hostname.replace('www.', '');
    if (h.includes('drive.google') || h.includes('docs.google'))
      return { icon: '📄', color: '#1a73e8', defaultLabel: 'Google Drive' };
    if (h.includes('canvas') || h.includes('instructure'))
      return { icon: '🎓', color: '#e66000', defaultLabel: 'Canvas' };
    if (h.includes('notion'))
      return { icon: '📝', color: '#6366f1', defaultLabel: 'Notion' };
    if (h.includes('github'))
      return { icon: '🐙', color: '#24292f', defaultLabel: 'GitHub' };
    if (h.includes('figma'))
      return { icon: '🎨', color: '#f24e1e', defaultLabel: 'Figma' };
    if (h.includes('slack'))
      return { icon: '💬', color: '#4a154b', defaultLabel: 'Slack' };
    if (h.includes('zoom'))
      return { icon: '📹', color: '#2d8cff', defaultLabel: 'Zoom' };
    if (h.includes('youtube') || h.includes('youtu.be'))
      return { icon: '▶️', color: '#ff0000', defaultLabel: 'YouTube' };
    if (h.includes('dropbox'))
      return { icon: '📦', color: '#0061ff', defaultLabel: 'Dropbox' };
    if (h.includes('sharepoint') || h.includes('onedrive'))
      return { icon: '☁️', color: '#0078d4', defaultLabel: 'OneDrive' };
  } catch {}
  return { icon: '🔗', color: '#64748b', defaultLabel: 'Link' };
}

function ensureHttps(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return 'https://' + url;
  return url;
}

// ── Other helpers ─────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function dueBadge(d: string | null) {
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(d);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, bg: '#fee2e2', color: '#dc2626' };
  if (diff === 0) return { label: 'Due today',                  bg: '#fef9c3', color: '#b45309' };
  if (diff <= 3)  return { label: `Due in ${diff}d`,            bg: '#fff7ed', color: '#c2410c' };
  return { label: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), bg: '#f1f5f9', color: '#64748b' };
}

function labelColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return LABEL_COLORS[Math.abs(h) % LABEL_COLORS.length];
}

function normalizeTask(t: any): Task {
  return {
    ...t,
    label_names: Array.isArray(t.label_names) ? t.label_names : [],
    links:       Array.isArray(t.links)       ? t.links       : [],
    activity:    Array.isArray(t.activity)    ? t.activity    : [],
    description: t.description ?? '',
  };
}

// ── Link chip (card + modal view) ─────────────────────────────────────────
function LinkChip({ link, small = false }: { link: TaskLink; small?: boolean }) {
  const meta = detectLink(link.url);
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={small ? 'link-chip-small' : 'link-chip'}
      style={{ color: meta.color, borderColor: meta.color + '44', background: meta.color + '11' }}
      onClick={e => e.stopPropagation()}
    >
      <span className="link-chip-icon">{meta.icon}</span>
      <span className="link-chip-label">{link.label || meta.defaultLabel}</span>
      {!small && <span className="link-chip-arrow">↗</span>}
    </a>
  );
}

// ── Link editor (inside edit modal) ───────────────────────────────────────
function LinkEditor({ links, onChange }: { links: TaskLink[]; onChange: (links: TaskLink[]) => void }) {
  const [newUrl, setNewUrl]     = useState('');
  const [newLabel, setNewLabel] = useState('');

  const addLink = () => {
    const raw = newUrl.trim();
    if (!raw) return;
    const url = ensureHttps(raw);
    const meta = detectLink(url);
    const label = newLabel.trim() || meta.defaultLabel;
    onChange([...links, { url, label }]);
    setNewUrl('');
    setNewLabel('');
  };

  const removeLink = (i: number) => onChange(links.filter((_, idx) => idx !== i));

  const updateLabel = (i: number, label: string) =>
    onChange(links.map((l, idx) => idx === i ? { ...l, label } : l));

  return (
    <div className="link-editor">
      <p className="link-editor-title">🔗 Linked Documents</p>

      {links.map((link, i) => {
        const meta = detectLink(link.url);
        return (
          <div key={i} className="link-editor-row">
            <span className="link-editor-icon">{meta.icon}</span>
            <input
              className="add-input link-editor-label"
              value={link.label}
              onChange={e => updateLabel(i, e.target.value)}
              placeholder="Label"
            />
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-editor-url"
              title={link.url}
              onClick={e => e.stopPropagation()}
            >
              {link.url.replace(/^https?:\/\//, '').slice(0, 30)}{link.url.length > 34 ? '…' : ''}
            </a>
            <button className="link-editor-remove" onClick={() => removeLink(i)} title="Remove">✕</button>
          </div>
        );
      })}

      <div className="link-editor-add">
        <input
          className="add-input"
          placeholder="Paste URL (Google Drive, Canvas, Notion…)"
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
          style={{ flex: 2 }}
        />
        <input
          className="add-input"
          placeholder="Label (optional)"
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
          style={{ flex: 1 }}
        />
        <button
          className="btn-add-link"
          onClick={e => { e.preventDefault(); addLink(); }}
          disabled={!newUrl.trim()}
        >
          + Add
        </button>
      </div>
    </div>
  );
}

// ── Welcome Screen ────────────────────────────────────────────────────────
// Shows a loading state, then:
//   1. If a Supabase session + stored name exist → auto-restore board (no flicker).
//   2. If name is typed and matches a stored session name → restore that session.
//   3. Otherwise → create a new anonymous session.

type WelcomeStatus = 'idle' | 'checking' | 'found' | 'notfound';

function WelcomeScreen({ onEnter }: { onEnter: (name: string) => void }) {
  const [name, setName]           = useState('');
  const [status, setStatus]       = useState<WelcomeStatus>('idle');
  const [taskCount, setTaskCount] = useState(0);

  // Pre-fill with stored name so returning users see their name instantly
  useEffect(() => {
    const stored = localStorage.getItem('tb_name');
    if (stored) setName(stored);
  }, []);

  // When name changes, check if there's a matching stored session
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed) { setStatus('idle'); return; }

    const storedName = localStorage.getItem('tb_name');
    const storedUid  = localStorage.getItem('tb_uid');

    if (
      storedName &&
      storedUid &&
      storedName.toLowerCase() === trimmed.toLowerCase()
    ) {
      // Quickly peek at task count to show encouraging hint
      setStatus('checking');
      (async () => {
        try {
          const { count } = await supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', storedUid);
          setTaskCount(count ?? 0);
          setStatus('found');
        } catch {
          setStatus('notfound');
        }
      })();
    } else {
      setStatus('idle');
    }
  }, [name]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onEnter(trimmed);
  };

  return (
    <div className="welcome-root">
      <div className="welcome-card">
        <div className="welcome-logo">⬡</div>
        <h1 className="welcome-title">Task Board</h1>
        <p className="welcome-sub">Your personal workspace. No account needed — just enter your name.</p>
        <div className="welcome-features">
          <div className="welcome-feature">
            <span className="wf-icon">🔒</span>
            <div><p className="wf-title">Private by default</p><p className="wf-desc">Only you can see your tasks</p></div>
          </div>
          <div className="welcome-feature">
            <span className="wf-icon">☁️</span>
            <div><p className="wf-title">Persists across sessions</p><p className="wf-desc">Come back and your tasks are still here</p></div>
          </div>
          <div className="welcome-feature">
            <span className="wf-icon">⚡</span>
            <div><p className="wf-title">No sign-up required</p><p className="wf-desc">Just enter your name and go</p></div>
          </div>
        </div>
        <div className="welcome-name-row">
          <input
            className="welcome-input"
            placeholder="Your name…"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            autoFocus
          />
        </div>

        {/* Status hint beneath the input */}
        <div className="welcome-hint-row">
          {status === 'checking' && (
            <span className="welcome-hint checking">🔍 Checking for your board…</span>
          )}
          {status === 'found' && (
            <span className="welcome-hint found">
              ✅ Found your board!{taskCount > 0 ? ` ${taskCount} task${taskCount !== 1 ? 's' : ''} waiting.` : ''}
            </span>
          )}
          {status === 'notfound' && (
            <span className="welcome-hint notfound">✨ New board will be created for you.</span>
          )}
        </div>

        <button
          className="welcome-btn"
          onClick={submit}
          disabled={!name.trim()}
        >
          {status === 'found' ? '→ Return to My Board' : 'Enter Board →'}
        </button>
        <p className="welcome-note">Your session is saved in this browser. Return anytime to see your tasks.</p>
      </div>
    </div>
  );
}

// ── Task Detail / Edit Modal ──────────────────────────────────────────────
interface TaskModalProps {
  task: Task;
  onClose: () => void;
  onSave: (updated: Task) => void;
  onDelete: (id: string) => void;
}

function TaskModal({ task, onClose, onSave, onDelete }: TaskModalProps) {
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle]       = useState(task.title);
  const [eDesc, setEDesc]         = useState(task.description);
  const [ePriority, setEPriority] = useState<Priority>(task.priority);
  const [eStatus, setEStatus]     = useState<Status>(task.status);
  const [eDue, setEDue]           = useState(task.due_date ?? '');
  const [eLabels, setELabels]     = useState(task.label_names.join(', '));
  const [eLinks, setELinks]       = useState<TaskLink[]>(task.links ?? []);
  const [saving, setSaving]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setETitle(task.title);
    setEDesc(task.description);
    setEPriority(task.priority);
    setEStatus(task.status);
    setEDue(task.due_date ?? '');
    setELabels(task.label_names.join(', '));
    setELinks(task.links ?? []);
  }, [task]);

  const handleSave = async () => {
    if (!eTitle.trim()) return;
    setSaving(true);

    const changes: string[] = [];
    if (eTitle.trim() !== task.title)      changes.push('Updated title');
    if (eDesc.trim() !== task.description) changes.push('Updated description');
    if (ePriority !== task.priority)       changes.push(`Priority → ${ePriority}`);
    if (eStatus !== task.status)           changes.push(`Status → ${STATUS_LABELS[eStatus]}`);
    if ((eDue || null) !== task.due_date)  changes.push('Updated due date');
    if (eLinks.length !== (task.links ?? []).length) changes.push('Updated links');

    const newLabels = eLabels.split(',').map(l => l.trim()).filter(Boolean);
    const entry: ActivityEntry = {
      action: changes.length ? changes.join(', ') : 'Edited task',
      at: new Date().toISOString(),
    };
    const newActivity = [entry, ...task.activity];

    const { data: saved, error } = await supabase
      .from('tasks')
      .update({
        title:       eTitle.trim(),
        description: eDesc.trim(),
        priority:    ePriority,
        status:      eStatus,
        due_date:    eDue || null,
        label_names: newLabels,
        links:       eLinks,
        activity:    newActivity,
      })
      .eq('id', task.id)
      .select()
      .single();

    setSaving(false);

    if (error) {
      alert('Failed to save: ' + error.message);
      return;
    }

    onSave(normalizeTask(saved));
    setEditing(false);
  };

  const handleDelete = async () => {
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) { alert('Delete failed: ' + error.message); return; }
    onDelete(task.id);
  };

  const due = dueBadge(task.due_date);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        {editing ? (
          <>
            <p className="modal-section-title" style={{ marginBottom: 8 }}>Edit Task</p>

            <input
              className="add-input"
              style={{ marginBottom: 8, fontWeight: 600, fontSize: 15 }}
              placeholder="Task title…"
              value={eTitle}
              onChange={e => setETitle(e.target.value)}
            />
            <textarea
              className="add-input add-textarea"
              placeholder="Description (optional)"
              value={eDesc}
              onChange={e => setEDesc(e.target.value)}
              rows={3}
              style={{ marginBottom: 8 }}
            />
            <div className="add-form-row" style={{ marginBottom: 8 }}>
              <select className="add-select" value={ePriority} onChange={e => setEPriority(e.target.value as Priority)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
              <select className="add-select" value={eStatus} onChange={e => setEStatus(e.target.value as Status)}>
                {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="add-form-row" style={{ marginBottom: 8 }}>
              <input
                type="date"
                className="add-select"
                value={eDue}
                onChange={e => setEDue(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <input
              className="add-input"
              placeholder="Labels (comma-separated)"
              value={eLabels}
              onChange={e => setELabels(e.target.value)}
              style={{ marginBottom: 12 }}
            />

            <LinkEditor links={eLinks} onChange={setELinks} />

            <div className="add-actions" style={{ justifyContent: 'space-between', marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-confirm" onClick={handleSave} disabled={saving || !eTitle.trim()}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
                <button className="btn-cancel" onClick={() => setEditing(false)}>Cancel</button>
              </div>
              <div>
                {confirmDelete ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#dc2626' }}>Sure?</span>
                    <button className="btn-delete-confirm" onClick={handleDelete}>Yes, delete</button>
                    <button className="btn-cancel" onClick={() => setConfirmDelete(false)}>No</button>
                  </div>
                ) : (
                  <button className="btn-delete" onClick={() => setConfirmDelete(true)}>🗑 Delete</button>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <h2 className="modal-title" style={{ margin: 0, flex: 1 }}>{task.title}</h2>
              <button className="btn-edit" onClick={() => setEditing(true)}>✏️ Edit</button>
            </div>

            {task.description && <p className="modal-desc">{task.description}</p>}

            <div className="modal-meta">
              <span className="priority-badge" style={{ background: PRIORITY_STYLES[task.priority].bg, color: PRIORITY_STYLES[task.priority].text }}>
                {task.priority}
              </span>
              <span className="status-chip">{STATUS_LABELS[task.status]}</span>
              {task.due_date && due && (
                <span className="due-badge" style={{ background: due.bg, color: due.color }}>📅 {due.label}</span>
              )}
              {task.label_names.map(l => {
                const c = labelColor(l);
                return <span key={l} className="label-chip" style={{ background: c + '22', color: c, border: `1px solid ${c}44` }}>{l}</span>;
              })}
            </div>

            {task.links && task.links.length > 0 && (
              <div className="modal-section">
                <p className="modal-section-title">🔗 Linked Documents</p>
                <div className="modal-links">
                  {task.links.map((link, i) => (
                    <LinkChip key={i} link={link} />
                  ))}
                </div>
              </div>
            )}

            <div className="modal-section">
              <p className="modal-section-title">Activity Log</p>
              {task.activity.length === 0
                ? <p className="muted">No activity yet</p>
                : (
                  <div className="activity-list">
                    {task.activity.map((a, i) => (
                      <div key={i} className="activity-item">
                        <span className="activity-dot" />
                        <span className="activity-action">{a.action}</span>
                        <span className="activity-time">{timeAgo(a.at)}</span>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────
// Key fix: start in 'loading' state and immediately check for an existing
// Supabase session + stored name. Only transition to 'welcome' if there's
// no recoverable session. This eliminates the welcome-screen flash entirely.

type AppState = 'loading' | 'welcome' | 'ready' | 'error';

export default function App() {
  // Start in 'loading' — we don't know yet whether to show welcome or board.
  const [appState, setAppState]       = useState<AppState>('loading');
  const [userName, setUserName]       = useState('');
  const [userId, setUserId]           = useState<string | null>(null);
  const [tasks, setTasks]             = useState<Task[]>([]);
  const [search, setSearch]           = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [dragOverCol, setDragOverCol] = useState<Status | null>(null);
  const [detailTask, setDetailTask]   = useState<Task | null>(null);
  const [addingTo, setAddingTo]       = useState<Status | null>(null);

  const [nTitle, setNTitle]       = useState('');
  const [nDesc, setNDesc]         = useState('');
  const [nPriority, setNPriority] = useState<Priority>('normal');
  const [nDue, setNDue]           = useState('');
  const [nLabel, setNLabel]       = useState('');

  const dragId = useRef<string | null>(null);

  // ── On mount: try to restore session silently ──────────────────────────
  useEffect(() => {
    const storedName = localStorage.getItem('tb_name');
    const storedUid  = localStorage.getItem('tb_uid');

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      // Case 1: active Supabase session AND stored name → restore silently
      if (session?.user && storedName) {
        const uid = session.user.id;
        setUserName(storedName);
        setUserId(uid);
        // Store uid in case it wasn't stored before
        localStorage.setItem('tb_uid', uid);
        await loadTasks(uid);
        // loadTasks sets appState to 'ready'
        return;
      }

      // Case 2: no live session but we have a stored uid — try to resume
      // (anonymous sessions can expire; in this case fall through to welcome)
      if (storedName) {
        // Show welcome with the name pre-filled (handled inside WelcomeScreen)
        setAppState('welcome');
        return;
      }

      // Case 3: truly new visitor
      setAppState('welcome');
    });
  }, []);

  // ── Called when user submits the welcome form ──────────────────────────
  const handleEnter = async (name: string) => {
    setAppState('loading');
    setUserName(name);

    const storedName = localStorage.getItem('tb_name');
    const storedUid  = localStorage.getItem('tb_uid');

    // If the name matches the stored name, try to re-authenticate with the
    // existing anonymous session first.
    if (
      storedName &&
      storedUid &&
      storedName.toLowerCase() === name.toLowerCase()
    ) {
      // Check whether the existing session is still alive
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id === storedUid) {
        // Session still valid — just reload tasks
        localStorage.setItem('tb_name', name);
        setUserId(storedUid);
        await loadTasks(storedUid);
        return;
      }
    }

    // No matching live session — create a new anonymous one
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      const uid = data.user?.id;
      if (!uid) throw new Error('No user ID returned');

      // Persist name and uid for future visits
      localStorage.setItem('tb_name', name);
      localStorage.setItem('tb_uid', uid);

      setUserId(uid);
      await loadTasks(uid);
    } catch (e) {
      console.error('AUTH FAILED:', e);
      setAppState('error');
    }
  };

  async function loadTasks(uid: string) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: true });
    if (error) console.error('Load error:', error);
    if (data) setTasks(data.map(normalizeTask));
    setAppState('ready');
  }

  async function handleAddTask(status: Status) {
    if (!nTitle.trim()) { alert('Please enter a task title'); return; }
    if (!userId) { alert('User ID missing. Please reload.'); return; }

    const entry: ActivityEntry = { action: `Created in ${STATUS_LABELS[status]}`, at: new Date().toISOString() };
    const payload = {
      title:       nTitle.trim(),
      description: nDesc.trim(),
      priority:    nPriority,
      status,
      due_date:    nDue || null,
      user_id:     userId,
      label_names: nLabel ? [nLabel.trim()] : [],
      links:       [],
      activity:    [entry],
    };

    const { data, error } = await supabase.from('tasks').insert(payload).select().single();
    if (error) { alert('Error adding task: ' + error.message); return; }

    setTasks(prev => [...prev, normalizeTask(data)]);
    setNTitle(''); setNDesc(''); setNLabel(''); setNDue(''); setNPriority('normal');
    setAddingTo(null);
  }

  function handleTaskSaved(updated: Task) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    setDetailTask(updated);
  }

  function handleTaskDeleted(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
    setDetailTask(null);
  }

  function onDragStart(e: React.DragEvent, id: string) {
    dragId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: React.DragEvent, col: Status) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(col);
  }
  async function onDrop(e: React.DragEvent, status: Status) {
    e.preventDefault();
    const id = dragId.current;
    if (!id) return;
    const task = tasks.find(t => t.id === id);
    if (!task || task.status === status) { dragId.current = null; setDragOverCol(null); return; }
    const entry: ActivityEntry = {
      action: `Moved from ${STATUS_LABELS[task.status]} → ${STATUS_LABELS[status]}`,
      at: new Date().toISOString(),
    };
    const newActivity = [entry, ...(task.activity ?? [])];
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status, activity: newActivity } : t));
    await supabase.from('tasks').update({ status, activity: newActivity }).eq('id', id);
    dragId.current = null;
    setDragOverCol(null);
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const totalTasks   = tasks.length;
  const doneTasks    = tasks.filter(t => t.status === 'done').length;
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < today && t.status !== 'done').length;

  const filtered = tasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
    return true;
  });

  // ── Render states ──────────────────────────────────────────────────────
  if (appState === 'welcome') return <WelcomeScreen onEnter={handleEnter} />;

  if (appState === 'loading') return (
    <div className="splash">
      <div className="splash-logo">⬡</div>
      <p className="splash-text">
        {userName ? `Loading ${userName}'s board…` : 'Setting up your board…'}
      </p>
      <div className="splash-bar"><div className="splash-progress" /></div>
    </div>
  );

  if (appState === 'error') return (
    <div className="splash">
      <p className="splash-text" style={{ color: '#f87171' }}>Failed to connect. Make sure Anonymous sign-in is enabled in Supabase.</p>
      <button className="welcome-btn" style={{ marginTop: 16, maxWidth: 220 }} onClick={() => handleEnter(userName)}>Retry</button>
    </div>
  );

  return (
    <div className="board-root">
      <header className="board-header">
        <div className="board-header-left">
          <span className="board-logo">⬡</span>
          <h1 className="board-title">Task Board</h1>
        </div>
        <div className="board-stats">
          <span className="stat"><span className="stat-num">{totalTasks}</span> total</span>
          <span className="stat-divider" />
          <span className="stat"><span className="stat-num stat-green">{doneTasks}</span> done</span>
          <span className="stat-divider" />
          <span className="stat"><span className="stat-num stat-red">{overdueTasks}</span> overdue</span>
        </div>
        <div className="board-header-right">
          <span className="guest-badge">👤 {userName}'s board</span>
        </div>
      </header>

      <div className="filters-bar">
        <input
          className="search-input"
          placeholder="🔍  Search tasks…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="filter-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value as any)}>
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </div>

      <main className="board-main">
        {COLUMNS.map(col => {
          const colTasks = filtered.filter(t => t.status === col.id);
          const isOver = dragOverCol === col.id;
          return (
            <div
              key={col.id}
              className={`column${isOver ? ' column-drag-over' : ''}`}
              onDragOver={e => onDragOver(e, col.id)}
              onDrop={e => onDrop(e, col.id)}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null); }}
            >
              <div className="column-header" style={{ borderTopColor: col.color }}>
                <div className="column-header-left">
                  <span className="column-dot" style={{ background: col.color }} />
                  <span className="column-label">{col.label}</span>
                </div>
                <span className="column-badge" style={{ background: col.light, color: col.color }}>{colTasks.length}</span>
              </div>

              <div className="column-body">
                {colTasks.length === 0 && addingTo !== col.id && (
                  <div className={`empty-state${isOver ? ' empty-state-active' : ''}`}>
                    {isOver ? '⬇ Drop here' : 'No tasks yet'}
                  </div>
                )}

                {colTasks.map(task => {
                  const p = PRIORITY_STYLES[task.priority];
                  const due = dueBadge(task.due_date);
                  return (
                    <div
                      key={task.id}
                      className="task-card"
                      draggable
                      onDragStart={e => onDragStart(e, task.id)}
                      onDragEnd={() => { dragId.current = null; setDragOverCol(null); }}
                      onClick={() => setDetailTask(task)}
                    >
                      <p className="task-title">{task.title}</p>

                      {task.label_names.length > 0 && (
                        <div className="task-labels">
                          {task.label_names.map(l => {
                            const c = labelColor(l);
                            return (
                              <span key={l} className="label-chip small"
                                style={{ background: c + '22', color: c, border: `1px solid ${c}44` }}>
                                {l}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {task.links && task.links.length > 0 && (
                        <div className="task-card-links">
                          {task.links.map((link, i) => (
                            <LinkChip key={i} link={link} small />
                          ))}
                        </div>
                      )}

                      <div className="task-footer">
                        <span className="priority-badge" style={{ background: p.bg, color: p.text }}>{task.priority}</span>
                        {due && <span className="due-badge" style={{ background: due.bg, color: due.color }}>📅 {due.label}</span>}
                      </div>
                    </div>
                  );
                })}

                {addingTo === col.id ? (
                  <div className="add-form">
                    <input
                      autoFocus
                      className="add-input"
                      placeholder="Task title…"
                      value={nTitle}
                      onChange={e => setNTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddTask(col.id); if (e.key === 'Escape') setAddingTo(null); }}
                    />
                    <textarea
                      className="add-input add-textarea"
                      placeholder="Description (optional)"
                      value={nDesc}
                      onChange={e => setNDesc(e.target.value)}
                      rows={2}
                    />
                    <div className="add-form-row">
                      <select className="add-select" value={nPriority} onChange={e => setNPriority(e.target.value as Priority)}>
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                      </select>
                      <input type="date" className="add-select" value={nDue} onChange={e => setNDue(e.target.value)} />
                    </div>
                    <input
                      className="add-input"
                      placeholder="Label (optional, e.g. Bug)"
                      value={nLabel}
                      onChange={e => setNLabel(e.target.value)}
                    />
                    <div className="add-actions">
                      <button className="btn-confirm" onClick={() => handleAddTask(col.id)}>Add Task</button>
                      <button className="btn-cancel" onClick={() => { setAddingTo(null); setNTitle(''); setNDesc(''); setNLabel(''); }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="add-task-btn" onClick={() => setAddingTo(col.id)}>+ Add task</button>
                )}
              </div>
            </div>
          );
        })}
      </main>

      {detailTask && (
        <TaskModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onSave={handleTaskSaved}
          onDelete={handleTaskDeleted}
        />
      )}
    </div>
  );
}