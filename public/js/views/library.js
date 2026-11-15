import { $, escapeHtml } from '../util.js';
import { api } from '../api.js';
import { state, setView, emit } from '../state.js';

export async function loadFolders() {
  state.folders = await api('/folders');
}

export async function loadTags() {
  state.tags = await api('/tags');
}

const item = ({ active, type, id, name, icon, label, count, del, indent }) => `
  <div class="lib-item ${active ? 'active' : ''}" role="button" tabindex="0"
       data-type="${type}" ${id != null ? `data-id="${id}"` : ''} ${name != null ? `data-name="${escapeHtml(name)}"` : ''}
       ${indent ? `style="padding-left:${indent}rem"` : ''}>
    <span class="lib-icon">${icon}</span>
    <span class="lib-label">${escapeHtml(label)}</span>
    ${count !== undefined ? `<span class="lib-count">${count}</span>` : ''}
    ${del ? `<button class="lib-del" data-del-folder="${id}" title="Delete folder">×</button>` : ''}
  </div>`;

export function renderLibrary() {
  const v = state.view;
  const byParent = {};
  state.folders.forEach((f) => {
    (byParent[f.parent_id || 0] = byParent[f.parent_id || 0] || []).push(f);
  });
  const tree = (parentId, depth) =>
    (byParent[parentId || 0] || [])
      .map(
        (f) =>
          item({
            active: v.type === 'folder' && v.id === f.id,
            type: 'folder', id: f.id, icon: '📁', label: f.name,
            del: true, indent: 0.55 + depth * 0.8,
          }) + tree(f.id, depth + 1)
      )
      .join('');

  $('#library-nav').innerHTML = `
    <div class="lib-section">
      ${item({ active: v.type === 'all', type: 'all', icon: '📋', label: 'All notes' })}
      ${item({ active: v.type === 'unfiled', type: 'unfiled', icon: '🏠', label: 'Unfiled' })}
    </div>
    <div class="lib-section">
      <div class="lib-section-title">Folders</div>
      ${tree(null, 0)}
      <button class="lib-add" data-action="new-folder">+ New folder</button>
    </div>
    <div class="lib-section">
      <div class="lib-section-title">Tags</div>
      ${state.tags.map((t) =>
        item({
          active: v.type === 'tag' && v.name === t.name,
          type: 'tag', name: t.name, icon: '#', label: t.name, count: t.note_count,
        })
      ).join('') || '<p class="hint">Tag notes from the editor.</p>'}
    </div>
    <div class="lib-section">
      <div class="lib-section-title">Claude</div>
      <div class="lib-item ${v.type === 'pushed' ? 'active' : ''}" role="button" tabindex="0" data-type="pushed">
        <span class="lib-icon">🤖</span><span class="lib-label">From Claude</span>
        <span class="badge">${state.pushedUnread || ''}</span>
      </div>
      ${item({ active: v.type === 'outbox', type: 'outbox', icon: '✉', label: 'For Claude' })}
    </div>
    <div class="lib-section">
      ${item({ active: v.type === 'archive', type: 'archive', icon: '🗄', label: 'Archive' })}
    </div>
  `;
}

export function initLibrary() {
  const nav = $('#library-nav');
  nav.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del-folder]');
    if (del) {
      e.stopPropagation();
      if (!confirm('Delete folder? Notes inside will be unfiled.')) return;
      const id = Number(del.dataset.delFolder);
      await api('/folders/' + id, { method: 'DELETE' });
      await loadFolders();
      if (state.view.type === 'folder' && state.view.id === id) {
        setView({ type: 'all' }); // re-renders library + list
      } else {
        renderLibrary();
        emit('refresh-list');
      }
      return;
    }
    if (e.target.closest('[data-action="new-folder"]')) {
      const name = prompt('Folder name?');
      if (!name) return;
      const parent_id = state.view.type === 'folder' ? state.view.id : null;
      await api('/folders', { method: 'POST', body: { name, parent_id } });
      await loadFolders();
      renderLibrary();
      return;
    }
    const el = e.target.closest('.lib-item');
    if (!el) return;
    const { type } = el.dataset;
    if (type === 'folder') setView({ type, id: Number(el.dataset.id) });
    else if (type === 'tag') setView({ type, name: el.dataset.name });
    else setView({ type });
  });
}
