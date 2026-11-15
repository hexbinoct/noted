import { $, escapeHtml, fmtDate } from '../util.js';
import { api } from '../api.js';
import { state, emit } from '../state.js';

export async function loadPushed() {
  state.pushed = await api('/claude/pushed');
  state.pushedUnread = state.pushed.filter((i) => !i.read).length;
}

export function renderPushedList(body) {
  if (!state.pushed.length) {
    body.innerHTML = '<p class="hint">Nothing here yet. Claude can push to <code>POST /api/claude/push</code>.</p>';
    return;
  }
  body.innerHTML = state.pushed.map((i) => `
    <div class="pushed-item ${i.read ? '' : 'unread'} ${state.currentPushed?.id === i.id ? 'active' : ''}" data-pushed-id="${i.id}">
      <div class="pushed-main">
        <div class="pushed-title">${escapeHtml(i.topic)}</div>
        <div class="pushed-meta">${fmtDate(i.created_at)}${i.repo ? ' · ' + escapeHtml(i.repo) : ''}</div>
      </div>
      <button class="pushed-del" data-del-pushed="${i.id}" title="Delete" aria-label="Delete">×</button>
    </div>
  `).join('');
}

// Re-render everything that shows pushed state (badge, list, read markers).
export function refreshPushedUI() {
  state.pushedUnread = state.pushed.filter((i) => !i.read).length;
  if (state.view.type === 'pushed') renderPushedList($('#list-body'));
  emit('library-render');
}

export function initPushedList(body) {
  body.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del-pushed]');
    if (del) {
      e.stopPropagation();
      const id = Number(del.dataset.delPushed);
      await api('/claude/pushed/' + id, { method: 'DELETE' });
      if (state.currentPushed?.id === id) emit('clear-editor');
      await loadPushed();
      refreshPushedUI();
      return;
    }
    const el = e.target.closest('[data-pushed-id]');
    if (!el || state.view.type !== 'pushed') return;
    const item = state.pushed.find((p) => p.id === Number(el.dataset.pushedId));
    if (item) emit('open-pushed', item);
  });
}

// ---------- outbox (For Claude) ----------
export async function loadOutbox() {
  state.outbox = await api('/claude/outbox');
}

export function renderOutboxPanel(body) {
  body.innerHTML = `
    <p class="hint">Leave a note for Claude. It can fetch it via the inbox API.</p>
    <form id="outbox-form" class="outbox-form">
      <input name="topic" placeholder="topic" required />
      <textarea name="content" placeholder="What should Claude know?" required></textarea>
      <button type="submit">Leave note</button>
    </form>
    <div id="outbox-list">
      ${state.outbox.length ? state.outbox.map((i) => `
        <div class="claude-card ${i.fetched_at ? '' : 'unread'}">
          <div class="claude-topic">${escapeHtml(i.topic)}</div>
          <div class="claude-meta">
            <span>${fmtDate(i.created_at)}</span>
            <span>${i.fetched_at ? 'fetched ' + fmtDate(i.fetched_at) : 'unread'}</span>
          </div>
          <div class="claude-content">${escapeHtml(i.content)}</div>
          <div class="claude-actions">
            <button data-del-outbox="${i.id}">Delete</button>
          </div>
        </div>
      `).join('') : '<p class="hint">No notes waiting for Claude.</p>'}
    </div>
  `;
  body.querySelector('#outbox-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api('/claude/outbox', {
      method: 'POST',
      body: { topic: fd.get('topic'), content: fd.get('content') },
    });
    await loadOutbox();
    renderOutboxPanel(body);
  });
  body.querySelectorAll('[data-del-outbox]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api('/claude/outbox/' + b.dataset.delOutbox, { method: 'DELETE' });
      await loadOutbox();
      renderOutboxPanel(body);
    })
  );
}
