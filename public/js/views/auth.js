import { $ } from '../util.js';
import { api } from '../api.js';
import { state } from '../state.js';

export function showAuth() {
  $('#auth-screen').classList.remove('hidden');
  $('#app').classList.add('hidden');
}

export function showApp() {
  $('#auth-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
}

export function initAuth(onSuccess) {
  $('#auth-toggle-link').addEventListener('click', (e) => {
    e.preventDefault();
    state.authMode = state.authMode === 'login' ? 'register' : 'login';
    $('#auth-submit').textContent = state.authMode === 'login' ? 'Log in' : 'Register';
    $('#auth-toggle-text').textContent = state.authMode === 'login' ? 'No account?' : 'Have an account?';
    $('#auth-toggle-link').textContent = state.authMode === 'login' ? 'Register' : 'Log in';
    $('#auth-error').textContent = '';
  });

  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    $('#auth-error').textContent = '';
    try {
      await api('/auth/' + state.authMode, {
        method: 'POST',
        body: { username: fd.get('username'), password: fd.get('password') },
      });
      await onSuccess();
    } catch (err) {
      $('#auth-error').textContent = err.message.replace(/_/g, ' ');
    }
  });
}
