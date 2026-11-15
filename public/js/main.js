import { $ } from './util.js';
import { api, setUnauthorizedHandler } from './api.js';
import { state, on, emit, setView } from './state.js';
import { initNav, setPane } from './nav.js';
import { showAuth, showApp, initAuth } from './views/auth.js';
import { loadFolders, loadTags, renderLibrary, initLibrary } from './views/library.js';
import { loadList, renderNoteList, updateRow, initList } from './views/noteList.js';
import { openPushed, clearEditor, initEditor } from './views/editor.js';
import { loadPushed, refreshPushedUI } from './views/claude.js';

// ---------- cross-view wiring ----------
on('view', () => {
  renderLibrary();
  loadList();
  setPane('list');
});
on('refresh-list', loadList);
on('note-updated', updateRow);
on('open-pushed', (item) => openPushed(item));
on('clear-editor', clearEditor);
on('pushed-changed', refreshPushedUI);
on('active-changed', renderNoteList);
on('library-render', renderLibrary);
on('library', async () => {
  await loadTags();
  renderLibrary();
});

// ---------- init ----------
async function init() {
  try {
    state.user = await api('/auth/me');
  } catch {
    showAuth();
    return;
  }
  document.body.dataset.theme = state.user.theme || 'light';
  showApp();
  state.view = { type: 'all' };
  await Promise.all([loadFolders(), loadTags()]);
  renderLibrary();
  await loadList(); // desktop: auto-opens the most recent note
  await loadPushed(); // unread badge
  refreshPushedUI();
}

setUnauthorizedHandler(showAuth);
initAuth(init);
initNav();
initLibrary();
initList();
initEditor();
$('#settings-btn').addEventListener('click', () => setView({ type: 'settings' }));

init();
