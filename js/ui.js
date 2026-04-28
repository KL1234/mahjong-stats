import { login, logout, getUser, onAuthChange } from './auth.js';

export async function initAuthArea() {
  const area = document.getElementById('auth-area');
  if (!area) return;

  function render(user) {
    if (user) {
      const name = user.email.split('@')[0];
      area.innerHTML = `
        <span class="user-name">👤 ${escapeHtml(name)}</span>
        <button id="logout-btn" class="btn-secondary">登出</button>
      `;
      document.getElementById('logout-btn').onclick = () => logout();
      document.querySelectorAll('.auth-only').forEach(el => el.hidden = false);
    } else {
      area.innerHTML = `<button id="login-btn" class="btn-primary">登入</button>`;
      document.getElementById('login-btn').onclick = openLoginModal;
      document.querySelectorAll('.auth-only').forEach(el => el.hidden = true);
    }
  }

  const user = await getUser();
  render(user);
  onAuthChange(render);

  setupLoginModal();
}

function openLoginModal() {
  const modal = document.getElementById('login-modal');
  if (modal) {
    modal.hidden = false;
    document.getElementById('login-id')?.focus();
  }
}

function setupLoginModal() {
  const modal = document.getElementById('login-modal');
  if (!modal) return;

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');

  form.onsubmit = async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    const id = document.getElementById('login-id').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      await login(id, password);
      modal.hidden = true;
      form.reset();
    } catch (err) {
      errorEl.textContent = '登入失敗：帳號或密碼錯誤';
      console.error(err);
    }
  };

  setupModalClose(modal);
}

export function setupModalClose(modal) {
  modal.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.onclick = () => { modal.hidden = true; };
  });
  modal.onclick = (e) => {
    if (e.target === modal) modal.hidden = true;
  };
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
