import { $, fmtDate, escapeHtml } from '../util.js';
import { api } from '../api.js';
import { state, setView, emit } from '../state.js';
import { setPane } from '../nav.js';

const RETRY_DELAYS_MS = [1000, 3000];

function setSaveStatus(kind, text) {
  const el = $('#saved-state');
  el.textContent = text;
  el.dataset.status = kind; // editing | saving | saved | failed
  el.classList.toggle('clickable', kind === 'failed');
  $('#note-content').classList.toggle('unsynced', kind === 'failed');
  $('#note-title').classList.toggle('unsynced', kind === 'failed');
}

function applyFormat(fmt, exitPreview) {
  const editor = $('#editor');
  editor.classList.toggle('markdown', fmt === 'markdown');
  if (exitPreview) editor.classList.remove('preview');
  const btn = $('#format-toggle');
  btn.textContent = fmt === 'markdown' ? 'MD' : 'TXT';
  btn.classList.toggle('markdown', fmt === 'markdown');
  if (fmt === 'plain') editor.classList.remove('preview');
  if (editor.classList.contains('preview')) renderPreview();
}

function renderPreview() {
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
    $('#note-preview').textContent = $('#note-content').value;
    return;
  }
  const html = marked.parse($('#note-content').value, { breaks: true, gfm: true });
  $('#note-preview').innerHTML = DOMPurify.sanitize(html);
}

function updateArchiveButton() {
  const btn = $('#archive-note');
  const archived = !!state.currentNote?.archived_at;
  btn.textContent = archived ? '📤' : '🗄';
  btn.title = archived ? 'Unarchive' : 'Archive';
}

// ---------- tag chips ----------
function renderTagRow() {
  const row = $('#tag-row');
  const tags = state.currentNote?.tags || [];
  row.innerHTML =
    tags.map((t) => `
      <span class="tag-chip">${escapeHtml(t.name)}<button class="chip-x" data-remove-tag="${escapeHtml(t.name)}" title="Remove tag" aria-label="Remove tag ${escapeHtml(t.name)}">×</button></span>
    `).join('') +
    '<input class="tag-input" id="tag-input" placeholder="+ tag" aria-label="Add tag" />';
}

async function saveTags(names, { refocus = false } = {}) {
  if (!state.currentNote) return;
  try {
    const updated = await api('/notes/' + state.currentNote.id, { method: 'PUT', body: { tags: names } });
    if (state.currentNote && state.currentNote.id === updated.id) {
      state.currentNote = updated;
      renderTagRow();
      if (refocus) $('#tag-input').focus();
    }
    emit('note-updated', updated);
    emit('library'); // tag counts / possibly new tag
  } catch {
    setSaveStatus('failed', 'tag save failed');
  }
}

// ---------- open / clear ----------
export async function openNote(id, { navigate = true } = {}) {
  clearTimeout(state.saveTimer);
  clearTimeout(state.retryTimer);
  state.currentPushed = null;
  const editor = $('#editor');
  editor.classList.remove('readonly', 'empty');
  const title = $('#note-title');
  const content = $('#note-content');
  title.disabled = false;
  content.disabled = false;
  content.readOnly = false;
  state.currentNote = await api('/notes/' + id);
  title.value = state.currentNote.title || '';
  content.value = state.currentNote.content || '';
  $('#editor-footer').textContent = 'Updated ' + fmtDate(state.currentNote.updated_at);
  setSaveStatus('saved', '');
  applyFormat(state.currentNote.format || 'plain', false);
  updateArchiveButton();
  renderTagRow();
  emit('active-changed');
  if (navigate) setPane('editor');
}

export async function openPushed(item, { navigate = true } = {}) {
  clearTimeout(state.saveTimer);
  clearTimeout(state.retryTimer);
  state.currentNote = null;
  state.currentPushed = item;
  if (!item.read) {
    await api('/claude/pushed/' + item.id + '/read', { method: 'POST' });
    item.read = 1;
  }
  const editor = $('#editor');
  editor.classList.add('readonly');
  editor.classList.remove('empty');
  const title = $('#note-title');
  const content = $('#note-content');
  title.disabled = false;
  content.disabled = false;
  content.readOnly = true;
  title.value = item.topic || '';
  content.value = item.content || '';
  $('#editor-footer').textContent = 'From Claude · ' + fmtDate(item.created_at) + (item.repo ? ' · ' + item.repo : '');
  setSaveStatus('saved', '');
  // Default to markdown preview — Claude pushes markdown.
  applyFormat('markdown', false);
  editor.classList.add('preview');
  renderPreview();
  emit('pushed-changed');
  emit('active-changed');
  if (navigate) setPane('editor');
}

export function clearEditor() {
  clearTimeout(state.saveTimer);
  clearTimeout(state.retryTimer);
  state.currentNote = null;
  state.currentPushed = null;
  const editor = $('#editor');
  editor.classList.remove('readonly', 'preview', 'markdown');
  editor.classList.add('empty');
  $('#note-title').value = '';
  $('#note-content').value = '';
  $('#note-title').disabled = true;
  $('#note-content').disabled = true;
  $('#tag-row').innerHTML = '';
  $('#editor-footer').textContent = '';
  setSaveStatus('saved', '');
  emit('active-changed');
}

export async function createNote() {
  // Creating from a view that can't show the new note lands in All notes.
  if (!['all', 'unfiled', 'folder'].includes(state.view.type)) setView({ type: 'all' });
  const folder_id = state.view.type === 'folder' ? state.view.id : null;
  const note = await api('/notes', { method: 'POST', body: { title: '', content: '', folder_id } });
  emit('refresh-list');
  await openNote(note.id);
  $('#note-title').focus();
}

// ---------- autosave (debounce + retry backoff) ----------
function scheduleSave() {
  if (!state.currentNote) return;
  // A new edit supersedes any pending retry.
  clearTimeout(state.retryTimer);
  state.retryTimer = null;
  setSaveStatus('editing', 'editing…');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveNow(0), 600);
}

async function saveNow(attempt) {
  if (!state.currentNote) return;
  const noteId = state.currentNote.id;
  const title = $('#note-title').value;
  const content = $('#note-content').value;
  setSaveStatus('saving', attempt === 0 ? 'saving…' : `retrying (${attempt})…`);
  try {
    const updated = await api('/notes/' + noteId, { method: 'PUT', body: { title, content } });
    // Drop the result if the user has navigated to a different note in the meantime.
    if (state.currentNote && state.currentNote.id === noteId) {
      state.currentNote = { ...updated, tags: state.currentNote.tags };
      setSaveStatus('saved', 'saved');
      $('#editor-footer').textContent = 'Updated ' + fmtDate(updated.updated_at);
    }
    emit('note-updated', updated);
  } catch (err) {
    if (!state.currentNote || state.currentNote.id !== noteId) return;
    if (attempt < RETRY_DELAYS_MS.length) {
      setSaveStatus('failed', `save failed — retrying in ${RETRY_DELAYS_MS[attempt] / 1000}s`);
      state.retryTimer = setTimeout(() => saveNow(attempt + 1), RETRY_DELAYS_MS[attempt]);
    } else {
      setSaveStatus('failed', 'save failed — click to retry');
    }
  }
}

// ---------- wiring ----------
export function initEditor() {
  $('#note-title').addEventListener('input', scheduleSave);
  $('#note-content').addEventListener('input', () => {
    scheduleSave();
    if ($('#editor').classList.contains('preview')) renderPreview();
  });

  // Manual retry when in the failed state.
  $('#saved-state').addEventListener('click', () => {
    if ($('#saved-state').dataset.status !== 'failed') return;
    clearTimeout(state.retryTimer);
    saveNow(0);
  });

  $('#format-toggle').addEventListener('click', async () => {
    if (!state.currentNote) return;
    const next = state.currentNote.format === 'markdown' ? 'plain' : 'markdown';
    state.currentNote.format = next;
    applyFormat(next, true);
    // Persist immediately; bypass debounce.
    try {
      setSaveStatus('saving', 'saving…');
      const updated = await api('/notes/' + state.currentNote.id, { method: 'PUT', body: { format: next } });
      state.currentNote = updated;
      setSaveStatus('saved', 'saved');
    } catch {
      setSaveStatus('failed', 'save failed — click to retry');
    }
  });

  $('#preview-toggle').addEventListener('click', () => {
    const isMd = state.currentNote?.format === 'markdown' || state.currentPushed;
    if (!isMd) return;
    const editor = $('#editor');
    editor.classList.toggle('preview');
    if (editor.classList.contains('preview')) renderPreview();
  });

  $('#archive-note').addEventListener('click', async () => {
    if (!state.currentNote) return;
    const action = state.currentNote.archived_at ? 'unarchive' : 'archive';
    await api(`/notes/${state.currentNote.id}/${action}`, { method: 'POST' });
    clearEditor();
    emit('refresh-list');
    setPane('list');
  });

  $('#download-note').addEventListener('click', () => {
    let url;
    if (state.currentNote) url = '/api/notes/' + state.currentNote.id + '/download';
    else if (state.currentPushed) url = '/api/claude/pushed/' + state.currentPushed.id + '/download';
    else return;
    // Same-origin GET: the session cookie rides along, server sets the filename.
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  $('#delete-note').addEventListener('click', async () => {
    if (!state.currentNote) return;
    if (!confirm('Delete this note?')) return;
    await api('/notes/' + state.currentNote.id, { method: 'DELETE' });
    clearEditor();
    emit('refresh-list');
    emit('library'); // tag counts may change
    setPane('list');
  });

  $('#convert-pushed').addEventListener('click', async () => {
    if (!state.currentPushed) return;
    const pushed = state.currentPushed;
    const note = await api('/notes', {
      method: 'POST',
      body: { title: pushed.topic, content: pushed.content, folder_id: null, format: 'markdown' },
    });
    setView({ type: 'all' });
    await openNote(note.id);
  });

  // Tag chips: Enter or comma commits; × removes.
  $('#tag-row').addEventListener('keydown', (e) => {
    if (!e.target.matches('.tag-input')) return;
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const name = e.target.value.trim();
    if (!name || !state.currentNote) return;
    const names = (state.currentNote.tags || []).map((t) => t.name);
    saveTags([...names, name], { refocus: true });
  });
  $('#tag-row').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-tag]');
    if (!btn || !state.currentNote) return;
    const names = (state.currentNote.tags || []).map((t) => t.name).filter((n) => n !== btn.dataset.removeTag);
    saveTags(names);
  });

  $('#empty-new-note').addEventListener('click', createNote);

  clearEditor();
}
