import { $ } from './util.js';

// Mobile drill-down: the list pane is the base layer; "library" slides in from
// the left, "editor" from the right. On desktop all three panes are visible
// and data-pane has no visual effect.
//
// On mobile the pane state is mirrored into the history stack ("list" is the
// base entry; library/editor are one entry deep) so the hardware/gesture back
// button closes the overlay pane instead of leaving the app.
const mq = window.matchMedia('(max-width: 760px)');

export const isMobile = () => mq.matches;

function applyPane(pane) {
  $('#app').dataset.pane = pane;
}

export function setPane(pane) {
  const current = $('#app').dataset.pane;
  if (pane === current) return;
  if (!isMobile()) {
    applyPane(pane);
    return;
  }
  if (pane === 'list') {
    // Prefer unwinding the history entry the overlay pane pushed, so the
    // stack doesn't grow; popstate applies the pane.
    if (history.state && history.state.pane && history.state.pane !== 'list') {
      history.back();
    } else {
      applyPane('list');
    }
    return;
  }
  // library/editor: one level deep. Jumping between them (rare) replaces
  // instead of stacking.
  if (history.state && history.state.pane && history.state.pane !== 'list') {
    history.replaceState({ pane }, '');
  } else {
    history.pushState({ pane }, '');
  }
  applyPane(pane);
}

// Swipe gestures (mobile): right from list → library, right from editor →
// list, left from library → list. Trigger-at-release only, so vertical
// scrolling and taps are unaffected.
function initSwipe() {
  const app = $('#app');
  let sx = 0, sy = 0, tracking = false;
  app.addEventListener('touchstart', (e) => {
    tracking = isMobile() && e.touches.length === 1;
    if (!tracking) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  app.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return;
    const pane = app.dataset.pane;
    if (dx > 0) {
      if (pane === 'editor') setPane('list');
      else if (pane === 'list') setPane('library');
    } else if (pane === 'library') {
      setPane('list');
    }
  }, { passive: true });
}

export function initNav() {
  history.replaceState({ pane: 'list' }, '');
  window.addEventListener('popstate', (e) => {
    applyPane((e.state && e.state.pane) || 'list');
  });
  $('#back-to-library').addEventListener('click', () => setPane('library'));
  $('#back-to-list').addEventListener('click', () => setPane('list'));
  $('#scrim').addEventListener('click', () => setPane('list'));
  initSwipe();
}
