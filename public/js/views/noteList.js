import { $, escapeHtml, fmtDate, parseUtc, debounce } from '../util.js';
import { api } from '../api.js';
import { state, emit } from '../state.js';
import { isMobile } from '../nav.js';
import { openNote, createNote } from './editor.js';
import { loadPushed, renderPushedList, initPushedList, loadOutbox, renderOutboxPanel } from './claude.js';
import { renderSettingsPanel } from './settings.js';

const NOTE_VIEWS = ['all', 'unfiled', 'folder', 'tag', 'archive'];

function viewTitle(v) {
  switch (v.type) {
    case 'all': return 'All notes';
    case 'unfiled': return 'Unfiled';
    case 'folder': return state.folders.find((f) => f.id === v.id)?.name || 'Folder';
    case 'tag': return '#' + v.name;
    case 'archive': return 'Archive';
    case 'pushed': return 'From Claude';
    case 'outbox': return 'For Claude';
    case 'settings': return 'Settings';
    default: return '';
  }
}

// "#tag" tokens in the search box become the tag filter; the rest is q.
function parseSearch(raw) {
  let tag = null;
  const q = (raw || '')
    .replace(/(^|\s)#([^\s#]+)/g, (m, pre, t) => {
      if (!tag) tag = t.toLowerCase();
      return pre;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { q, tag };
}

function bucketLabel(dateStr, now) {
  const d = parseUtc(dateStr);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round((day(now) - day(d)) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'This month';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function updateChrome() {
  const v = state.view;
  $('#list-title').textContent = viewTitle(v);
  const isNotes = NOTE_VIEWS.includes(v.type);
  $('#search-row').classList.toggle('hidden', !isNotes);
  $('#new-note').classList.toggle('hidden', !isNotes);
  $('#fab-new-note').classList.toggle('hidden', !isNotes || v.type === 'archive');
}

let loadSeq = 0;
let lastViewKey = null;

export async function loadList() {
  const v = state.view;
  const viewKey = JSON.stringify(v);
  if (viewKey !== lastViewKey) {
    lastViewKey = viewKey;
    $('#search').value = '';
  }
  updateChrome();
  const body = $('#list-body');
  const seq = ++loadSeq;

  if (v.type === 'settings') { renderSettingsPanel(body); return; }
  if (v.type === 'outbox') {
    await loadOutbox();
    if (seq === loadSeq) renderOutboxPanel(body);
    return;
  }
  if (v.type === 'pushed') {
    await loadPushed();
    if (seq !== loadSeq) return;
    renderPushedList(body);
    emit('library-render'); // badge may have changed
    return;
  }

  const params = new URLSearchParams();
  if (v.type === 'unfiled') params.set('folder_id', 'null');
  if (v.type === 'folder') params.set('folder_id', v.id);
  if (v.type === 'archive') params.set('archived', 'true');
  const { q, tag } = parseSearch($('#search').value);
  const effTag = tag || (v.type === 'tag' ? v.name : null);
  if (effTag) params.set('tag', effTag);
  if (q) params.set('q', q);
  const notes = await api('/notes?' + params);
  if (seq !== loadSeq) return; // a newer load superseded this one
  state.notes = notes;
  renderNoteList();
  maybeAutoOpen();
}

export function renderNoteList() {
  const body = $('#list-body');
  if (!NOTE_VIEWS.includes(state.view.type)) return;
  if (!state.notes.length) {
    body.innerHTML = '<p class="hint" style="text-align:center;padding:1rem 0">No notes here yet.</p>';
    return;
  }
  const now = new Date();
  let currentBucket = null;
  let html = '';
  for (const n of state.notes) {
    const bucket = bucketLabel(n.updated_at, now);
    if (bucket !== currentBucket) {
      currentBucket = bucket;
      html += `<div class="date-group">${bucket}</div>`;
    }
    const tags = (n.tags || []).slice(0, 3).map((t) => `<span class="mini-tag">#${escapeHtml(t.name)}</span>`).join('');
    html += `
      <div class="note-item ${state.currentNote?.id === n.id ? 'active' : ''}" data-note-id="${n.id}">
        <div class="note-item-title">${escapeHtml(n.title || 'Untitled')}</div>
        <div class="note-item-preview">${escapeHtml((n.preview || '').replace(/\n/g, ' ').slice(0, 80)) || '<em>empty</em>'}</div>
        <div class="note-item-meta">${fmtDate(n.updated_at)}${tags ? ' ' + tags : ''}</div>
      </div>`;
  }
  body.innerHTML = html;
}

// Desktop only: if nothing is open, open the most recent note so the editor
// is never a dead textarea (the fresh-page-load bug).
function maybeAutoOpen() {
  if (isMobile()) return;
  if (state.currentNote || state.currentPushed) return;
  if (!NOTE_VIEWS.includes(state.view.type)) return;
  if (!state.notes.length) return;
  openNote(state.notes[0].id, { navigate: false });
}

// Update one row in place after an autosave (no refetch, no scroll jump).
export function updateRow(note) {
  const i = state.notes.findIndex((n) => n.id === note.id);
  if (i === -1) return;
  state.notes[i] = {
    ...state.notes[i],
    title: note.title,
    preview: (note.content || '').slice(0, 200),
    updated_at: note.updated_at,
    tags: note.tags || state.notes[i].tags,
  };
  renderNoteList();
}

export function initList() {
  const body = $('#list-body');
  body.addEventListener('click', (e) => {
    const el = e.target.closest('.note-item');
    if (el) openNote(Number(el.dataset.noteId));
  });
  initPushedList(body);
  $('#search').addEventListener('input', debounce(loadList, 200));
  $('#new-note').addEventListener('click', createNote);
  $('#fab-new-note').addEventListener('click', createNote);
}
