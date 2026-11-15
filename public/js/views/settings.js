import { api } from '../api.js';
import { state } from '../state.js';
import { showAuth } from './auth.js';

export function renderSettingsPanel(body) {
  const origin = location.origin;
  body.innerHTML = `
    <div class="settings-panel">
      <div class="settings-group">
        <label>Theme</label>
        <div class="theme-grid">
          ${['light', 'dark', 'sepia', 'solarized'].map((t) => `
            <button class="theme-btn ${state.user.theme === t ? 'active' : ''}" data-theme="${t}">${t[0].toUpperCase() + t.slice(1)}</button>
          `).join('')}
        </div>
      </div>
      <div class="settings-group">
        <label>API Key</label>
        <p class="hint">Use this in <code>Authorization: Bearer …</code> when pushing notes from Claude.</p>
        <div class="api-key-row">
          <input id="api-key" readonly value="" />
          <button id="copy-key" title="Copy">Copy</button>
        </div>
        <button id="regen-key" class="danger-btn">Regenerate key</button>
      </div>
      <div class="settings-group">
        <button id="logout" class="danger-btn">Log out</button>
      </div>
      <div class="settings-group api-docs">
        <label>API quick reference</label>
        <pre id="api-docs"></pre>
      </div>
    </div>
  `;
  body.querySelector('#api-key').value = state.user.api_key;
  body.querySelector('#api-docs').textContent =
`# Push a note to your notes app
curl -X POST ${origin}/api/claude/push \\
  -H "Authorization: Bearer ${state.user.api_key}" \\
  -H "Content-Type: application/json" \\
  -d '{"topic":"…","content":"…","repo":"optional"}'

# Read notes the user left for Claude
curl ${origin}/api/claude/inbox?unread=true \\
  -H "Authorization: Bearer ${state.user.api_key}"

# Ack a note (mark as fetched)
curl -X POST ${origin}/api/claude/inbox/<id>/ack \\
  -H "Authorization: Bearer ${state.user.api_key}"`;

  body.querySelectorAll('.theme-btn').forEach((b) =>
    b.addEventListener('click', async () => {
      const theme = b.dataset.theme;
      await api('/auth/me/theme', { method: 'PUT', body: { theme } });
      state.user.theme = theme;
      document.body.dataset.theme = theme;
      renderSettingsPanel(body);
    })
  );

  body.querySelector('#copy-key').addEventListener('click', () => {
    navigator.clipboard.writeText(state.user.api_key);
    body.querySelector('#copy-key').textContent = 'Copied';
    setTimeout(() => (body.querySelector('#copy-key').textContent = 'Copy'), 1500);
  });

  body.querySelector('#regen-key').addEventListener('click', async () => {
    if (!confirm('Regenerate API key? Old key will stop working.')) return;
    const { api_key } = await api('/auth/me/regenerate-key', { method: 'POST' });
    state.user.api_key = api_key;
    renderSettingsPanel(body);
  });

  body.querySelector('#logout').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    state.user = null;
    showAuth();
  });
}
