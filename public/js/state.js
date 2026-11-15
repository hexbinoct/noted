// Single shared state object + a minimal pub-sub so views can react to each
// other without importing each other (keeps the module graph acyclic).
export const state = {
  user: null,
  folders: [],
  tags: [],
  notes: [],
  pushed: [],
  pushedUnread: 0,
  outbox: [],
  // view.type: all | unfiled | folder | tag | archive | pushed | outbox | settings
  view: { type: 'all' },
  currentNote: null,
  currentPushed: null,
  authMode: 'login',
  saveTimer: null,
  retryTimer: null,
};

const listeners = {};

export function on(event, fn) {
  (listeners[event] = listeners[event] || []).push(fn);
}

export function emit(event, data) {
  (listeners[event] || []).forEach((fn) => fn(data));
}

export function setView(view) {
  state.view = view;
  emit('view');
}
