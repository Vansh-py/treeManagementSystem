/* =========================================================
   Forest Dashboard — frontend
   ========================================================= */

// ---------- Theme ----------
const THEME_KEY = 'forest-theme';
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}
function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(stored || prefers);
}
initTheme();

document.getElementById('themeToggle').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
});

// ---------- Toasts ----------
function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = message;
  document.getElementById('toastContainer').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

// ---------- Confirm modal ----------
const modalBackdrop = document.getElementById('modalBackdrop');
const modalTitle    = document.getElementById('modalTitle');
const modalMessage  = document.getElementById('modalMessage');
const modalConfirm  = document.getElementById('modalConfirm');
const modalCancel   = document.getElementById('modalCancel');

function confirmDialog(title, message) {
  return new Promise(resolve => {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalBackdrop.style.display = 'flex';

    const cleanup = () => {
      modalBackdrop.style.display = 'none';
      modalConfirm.removeEventListener('click', onYes);
      modalCancel.removeEventListener('click', onNo);
    };
    const onYes = () => { cleanup(); resolve(true); };
    const onNo  = () => { cleanup(); resolve(false); };

    modalConfirm.addEventListener('click', onYes);
    modalCancel.addEventListener('click', onNo);
  });
}

// ---------- API helper ----------
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    handleAuthError();
    throw new Error('unauthorized');
  }
  return res;
}

// ---------- Routing ----------
const screens = {
  login:     document.getElementById('screen-login'),
  register:  document.getElementById('screen-register'),
  dashboard: document.getElementById('screen-dashboard'),
};

let sessionCache = { authenticated: false, username: '', admin: false };

function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
  document.title = name === 'dashboard' ? 'Forest Dashboard'
                 : name === 'register'  ? 'Register'
                 : 'Login';
}

function goTo(name) {
  if (location.hash === '#' + name) route();
  else location.hash = name;
}

function handleAuthError() {
  sessionCache = { authenticated: false, username: '', admin: false };
  updateUserChrome();
  goTo('login');
}

async function getSession() {
  try {
    const res = await fetch('/api/whoami');
    return await res.json();
  } catch {
    return { authenticated: false };
  }
}

function updateUserChrome() {
  const { username, admin } = sessionCache;
  document.getElementById('sidebarUsername').textContent = username || 'username';

  const initials = (username || '?').trim().slice(0, 2).toUpperCase();
  document.getElementById('avatarInitials').textContent = initials || '?';
  document.getElementById('profileAvatar').textContent = initials || '?';

  document.getElementById('adminBadge').style.display = admin ? 'inline-block' : 'none';
  document.getElementById('adminNavBtn').style.display = admin ? 'flex' : 'none';
}

async function route(isFirstLoad = false) {
  let name = location.hash.slice(1);
  if (!screens[name]) name = 'login';

  if (name === 'dashboard' || (isFirstLoad && name === 'login')) {
    const session = await getSession();

    if (name === 'dashboard' && !session.authenticated) {
      name = 'login';
      history.replaceState(null, '', '#login');
    } else if (session.authenticated && name === 'login') {
      name = 'dashboard';
      history.replaceState(null, '', '#dashboard');
    }

    if (session.authenticated) {
      sessionCache = session;
      updateUserChrome();
    }
  }

  showScreen(name);
  if (name === 'dashboard') {
    // default sub-view
    const active = document.querySelector('.nav-btn.active');
    if (!active) document.querySelector('.nav-btn[data-view="dashboard"]').click();
    loadDashboardData();
    loadProfile();
  }
}

window.addEventListener('hashchange', () => route());
route(true);

// ---------- Login ----------
document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const btn = this.querySelector('button[type="submit"]');
  btn.disabled = true;

  const username = document.getElementById('loginUserId').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Login failed.', 'error'); return; }

    sessionCache = { authenticated: true, username: data.username, admin: data.admin };
    updateUserChrome();
    this.reset();
    toast('Welcome back, ' + data.username, 'success');
    goTo('dashboard');
  } catch {
    toast('Could not reach the server.', 'error');
  } finally {
    btn.disabled = false;
  }
});

// ---------- Register ----------
document.getElementById('registerForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const btn = this.querySelector('button[type="submit"]');
  btn.disabled = true;

  const username = document.getElementById('regUsername').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Registration failed.', 'error'); return; }

    this.reset();
    toast(data.admin ? 'Registered as admin. Please log in.' : 'Account created. Please log in.', 'success');
    goTo('login');
  } catch {
    toast('Could not reach the server.', 'error');
  } finally {
    btn.disabled = false;
  }
});

// ---------- Nav ----------
const navButtons = document.querySelectorAll('.nav-btn');
const views      = document.querySelectorAll('.view');

navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    navButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    views.forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + btn.dataset.view);
    if (target) target.classList.add('active');

    // reset tree detail view
    if (btn.dataset.view === 'tree-detail') {
      document.getElementById('treeSearchState').style.display = 'flex';
      document.getElementById('treeResultState').style.display = 'none';
      document.getElementById('historyPanel').style.display = 'none';
      document.getElementById('treeIdInput').value = '';
    }

    if (btn.dataset.view === 'dashboard') loadDashboardData();
    if (btn.dataset.view === 'profile')   loadProfile();
    if (btn.dataset.view === 'admin')     loadAdmin();
  });
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await fetch('/api/logout', { method: 'POST' }); } catch {}
  sessionCache = { authenticated: false, username: '', admin: false };
  updateUserChrome();
  document.querySelector('.nav-btn[data-view="dashboard"]').click();
  goTo('login');
});

// ---------- Dashboard stats + charts ----------
const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D'];

function renderBarChart(el, data) {
  const max = Math.max(...data, 1);
  el.innerHTML = `
    <div class="bar-chart">
      ${data.map((v, i) => `
        <div class="bar-wrap" title="${MONTHS[i]}: ${v}">
          <div class="bar" style="height:${(v / max) * 100}%"></div>
          <span class="bar-label">${MONTHS[i]}</span>
        </div>
      `).join('')}
    </div>`;
}

function renderLineChart(el, data) {
  const max = Math.max(...data, 1);
  const w = 260, h = 150, pad = 14;
  const stepX = (w - pad * 2) / (data.length - 1);
  const yOf = v => h - pad - (v / max) * (h - pad * 2);
  const pts = data.map((v, i) => `${pad + i * stepX},${yOf(v)}`).join(' ');
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

  el.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:100%">
      <polyline points="${pts}" fill="none"
                stroke="${accent}" stroke-width="2"
                stroke-linejoin="round" stroke-linecap="round"/>
      ${data.map((v, i) =>
        `<circle cx="${pad + i * stepX}" cy="${yOf(v)}" r="3" fill="${accent}"/>`
      ).join('')}
    </svg>`;
}

async function loadDashboardData() {
  const statMonth = document.getElementById('statMonth');
  const statYear  = document.getElementById('statYear');
  statMonth.textContent = '…';
  statYear.textContent  = '…';

  try {
    const res = await apiFetch('/api/stats');
    const data = await res.json();
    if (!res.ok) return;

    statMonth.textContent = data.this_month;
    statYear.textContent  = data.this_year;
    renderBarChart(document.getElementById('barChart'), data.trees_by_month);
    renderLineChart(document.getElementById('lineChart'), data.users_by_month);
  } catch (err) {
    if (err.message !== 'unauthorized') {
      statMonth.textContent = '—';
      statYear.textContent  = '—';
    }
  }
}

// ---------- Tree detail ----------
const treeIdInput = document.getElementById('treeIdInput');
let currentTreeId = null;

function fillTreeCard(data) {
  currentTreeId = data.tree_id;
  document.getElementById('treeCardTitle').textContent   = 'TREE ID: ' + data.tree_id;
  document.getElementById('fieldName').textContent       = data.species         || '—';
  document.getElementById('fieldScientific').textContent = data.scientific_name || '—';
  document.getElementById('fieldOwner').textContent      = data.owner           || '—';
  document.getElementById('fieldLocation').textContent   = data.location        || '—';
  document.getElementById('fieldPlanted').textContent    = data.plantation_date || '—';
  document.getElementById('fieldHeight').textContent     = data.height          || '—';
  document.getElementById('fieldHealth').textContent     = data.health          || '—';
  document.getElementById('fieldWatering').textContent   = data.watering        || '—';
  document.getElementById('fieldChecked').textContent    = data.last_checked    || '—';
  document.getElementById('fieldStatus').textContent     = data.status          || '—';
}

async function runTreeSearch() {
  const id = treeIdInput.value.trim();
  if (!id) return;

  try {
    const res = await apiFetch(`/api/trees/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Tree not found.', 'error'); return; }

    fillTreeCard(data);
    document.getElementById('historyPanel').style.display = 'none';
    document.getElementById('treeSearchState').style.display = 'none';
    document.getElementById('treeResultState').style.display = 'flex';
  } catch (err) {
    if (err.message !== 'unauthorized') toast('Could not load tree.', 'error');
  }
}

treeIdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runTreeSearch();
});

document.getElementById('backToSearchBtn').addEventListener('click', () => {
  document.getElementById('treeResultState').style.display = 'none';
  document.getElementById('treeSearchState').style.display = 'flex';
  document.getElementById('treeIdInput').value = '';
  treeIdInput.focus();
});

document.getElementById('historyBtn').addEventListener('click', async () => {
  if (!currentTreeId) return;
  const panel = document.getElementById('historyPanel');

  try {
    const res = await apiFetch(`/api/trees/${currentTreeId}/maintenance`);
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Could not load history.', 'error'); return; }

    if (!data.entries.length) {
      panel.innerHTML = `<h4>Maintenance history</h4><p class="muted">No maintenance records yet.</p>`;
    } else {
      panel.innerHTML = `
        <h4>Maintenance history (${data.entries.length})</h4>
        ${data.entries.map(e => `
          <div class="history-row">
            <div>
              <strong>${e.condition || 'Unspecified'}</strong>
              <div class="meta">${e.maintenance_date || '—'} ${e.maintenance_time ? '· ' + e.maintenance_time : ''}</div>
            </div>
            <div class="meta">Height: ${e.current_height || '—'}</div>
          </div>
        `).join('')}`;
    }
    panel.style.display = 'block';
  } catch (err) {
    if (err.message !== 'unauthorized') toast('Could not load history.', 'error');
  }
});

document.getElementById('deleteTreeBtn').addEventListener('click', async () => {
  if (!currentTreeId) return;
  const ok = await confirmDialog('Delete tree', `Delete tree #${currentTreeId}? This removes it and all its maintenance records.`);
  if (!ok) return;

  try {
    const res = await apiFetch(`/api/trees/${currentTreeId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Could not delete.', 'error'); return; }
    toast('Tree deleted.', 'success');
    document.getElementById('treeResultState').style.display = 'none';
    document.getElementById('treeSearchState').style.display = 'flex';
    treeIdInput.value = '';
    currentTreeId = null;
    loadDashboardData();
  } catch (err) {
    if (err.message !== 'unauthorized') toast('Could not delete.', 'error');
  }
});

// ---------- Add tree ----------
document.getElementById('addTreeForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const btn = this.querySelector('button[type="submit"]');
  btn.disabled = true;

  const payload = {
    species:        document.getElementById('inputSpecies').value.trim(),
    height:         document.getElementById('inputHeight').value.trim(),
    plantationDate: document.getElementById('inputPlantationDate').value,
    location:       document.getElementById('inputLocation').value.trim(),
  };

  try {
    const res = await apiFetch('/api/trees', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Could not save tree.', 'error'); return; }

    toast(`Tree saved with ID ${data.tree_id}.`, 'success');
    this.reset();
    loadDashboardData();
  } catch (err) {
    if (err.message !== 'unauthorized') toast('Could not reach the server.', 'error');
  } finally {
    btn.disabled = false;
  }
});

// ---------- Maintenance ----------
document.getElementById('maintenanceForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const btn = this.querySelector('button[type="submit"]');
  btn.disabled = true;

  const payload = {
    treeId:          document.getElementById('maintTreeId').value.trim(),
    currentHeight:   document.getElementById('maintHeight').value.trim(),
    maintenanceDate: document.getElementById('maintDate').value,
    maintenanceTime: document.getElementById('maintTime').value,
    condition:       document.getElementById('maintCondition').value,
  };

  try {
    const res = await apiFetch('/api/maintenance', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Could not save record.', 'error'); return; }

    toast('Maintenance logged.', 'success');
    this.reset();
    loadDashboardData();
  } catch (err) {
    if (err.message !== 'unauthorized') toast('Could not reach the server.', 'error');
  } finally {
    btn.disabled = false;
  }
});

// ---------- Top search bar ----------
const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && searchInput.value.trim()) {
    document.querySelector('.nav-btn[data-view="tree-detail"]').click();
    treeIdInput.value = searchInput.value.trim();
    runTreeSearch();
    searchInput.value = '';
  }
});

// ---------- Profile ----------
async function loadProfile() {
  if (!sessionCache.authenticated) return;

  try {
    const res = await apiFetch('/api/profile');
    const data = await res.json();
    if (!res.ok) return;

    document.getElementById('profileUsername').textContent = data.username;
    document.getElementById('profileRole').textContent     = data.admin ? 'Administrator' : 'Member';
    document.getElementById('profileEmail').value          = data.email || '';
    document.getElementById('profileTreeCount').textContent  = data.tree_count;
    document.getElementById('profileMaintCount').textContent = data.maintenance_count;

    if (data.created_at) {
      const d = new Date(data.created_at.replace(' ', 'T') + 'Z');
      document.getElementById('profileCreated').textContent =
        'Member since ' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    }
  } catch {}
}

document.getElementById('emailForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  try {
    const res = await apiFetch('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ email: document.getElementById('profileEmail').value.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Could not update.', 'error'); return; }
    toast('Email updated.', 'success');
  } catch (err) {
    if (err.message !== 'unauthorized') toast('Could not reach the server.', 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const oldPassword = document.getElementById('oldPassword').value;
  const newPassword = document.getElementById('newPassword').value;

  try {
    const res = await apiFetch('/api/profile/password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Could not change password.', 'error'); return; }
    toast('Password changed.', 'success');
    e.target.reset();
  } catch (err) {
    if (err.message !== 'unauthorized') toast('Could not reach the server.', 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
  const ok = await confirmDialog(
    'Delete your account?',
    'This permanently removes your account, all your trees, and all maintenance records.'
  );
  if (!ok) return;

  try {
    const res = await apiFetch('/api/profile', { method: 'DELETE' });
    if (!res.ok) { toast('Could not delete account.', 'error'); return; }
    toast('Account deleted.', 'success');
    sessionCache = { authenticated: false, username: '', admin: false };
    updateUserChrome();
    goTo('login');
  } catch {}
});

// ---------- Admin ----------
document.querySelectorAll('.tab-btn').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

async function loadAdmin() {
  if (!sessionCache.admin) return;

  try {
    const res = await apiFetch('/api/admin/overview');
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Could not load admin data.', 'error'); return; }

    renderAdminUsers(data.users);
    renderAdminTrees(data.trees);
    renderAdminMaint(data.maintenance);
  } catch (err) {
    if (err.message !== 'unauthorized') toast('Could not load admin data.', 'error');
  }
}

function renderAdminUsers(users) {
  const table = document.getElementById('adminUsersTable');
  if (!users.length) {
    table.innerHTML = `<tbody><tr class="empty-row"><td>No users yet.</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `
    <thead><tr>
      <th>ID</th><th>Username</th><th>Email</th><th>Role</th>
      <th>Trees</th><th>Joined</th><th></th>
    </tr></thead>
    <tbody>
      ${users.map(u => `
        <tr>
          <td>${u.profile_id}</td>
          <td><strong>${escapeHtml(u.username)}</strong></td>
          <td>${escapeHtml(u.email || '—')}</td>
          <td>${u.admin ? '<span class="badge">ADMIN</span>' : 'Member'}</td>
          <td>${u.tree_count}</td>
          <td>${escapeHtml((u.created_at || '').slice(0, 10))}</td>
          <td><button class="btn-danger small" data-del-user="${u.profile_id}">Delete</button></td>
        </tr>
      `).join('')}
    </tbody>`;

  table.querySelectorAll('[data-del-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delUser;
      const ok = await confirmDialog('Delete user', `Delete user #${id} and all their data?`);
      if (!ok) return;
      try {
        const res = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
        const d = await res.json();
        if (!res.ok) { toast(d.error || 'Failed.', 'error'); return; }
        toast('User deleted.', 'success');
        loadAdmin();
      } catch {}
    });
  });
}

function renderAdminTrees(trees) {
  const table = document.getElementById('adminTreesTable');
  if (!trees.length) {
    table.innerHTML = `<tbody><tr class="empty-row"><td>No trees yet.</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `
    <thead><tr>
      <th>ID</th><th>Species</th><th>Owner</th><th>Location</th>
      <th>Planted</th><th>Height</th><th></th>
    </tr></thead>
    <tbody>
      ${trees.map(t => `
        <tr>
          <td>${t.tree_id}</td>
          <td><strong>${escapeHtml(t.species)}</strong></td>
          <td>${escapeHtml(t.owner || '—')}</td>
          <td>${escapeHtml(t.location || '—')}</td>
          <td>${escapeHtml(t.plantation_date || '—')}</td>
          <td>${escapeHtml(t.height || '—')}</td>
          <td><button class="btn-danger small" data-del-tree="${t.tree_id}">Delete</button></td>
        </tr>
      `).join('')}
    </tbody>`;

  table.querySelectorAll('[data-del-tree]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delTree;
      const ok = await confirmDialog('Delete tree', `Delete tree #${id}?`);
      if (!ok) return;
      try {
        const res = await apiFetch(`/api/admin/trees/${id}`, { method: 'DELETE' });
        const d = await res.json();
        if (!res.ok) { toast(d.error || 'Failed.', 'error'); return; }
        toast('Tree deleted.', 'success');
        loadAdmin();
      } catch {}
    });
  });
}

function renderAdminMaint(entries) {
  const table = document.getElementById('adminMaintTable');
  if (!entries.length) {
    table.innerHTML = `<tbody><tr class="empty-row"><td>No maintenance records yet.</td></tr></tbody>`;
    return;
  }
  table.innerHTML = `
    <thead><tr>
      <th>ID</th><th>Tree</th><th>Species</th><th>Owner</th>
      <th>Date</th><th>Condition</th><th></th>
    </tr></thead>
    <tbody>
      ${entries.map(m => `
        <tr>
          <td>${m.maintenance_id}</td>
          <td>#${m.tree_id}</td>
          <td>${escapeHtml(m.tree_species || '—')}</td>
          <td>${escapeHtml(m.owner || '—')}</td>
          <td>${escapeHtml(m.maintenance_date || '—')}</td>
          <td>${escapeHtml(m.condition || '—')}</td>
          <td><button class="btn-danger small" data-del-m="${m.maintenance_id}">Delete</button></td>
        </tr>
      `).join('')}
    </tbody>`;

  table.querySelectorAll('[data-del-m]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delM;
      const ok = await confirmDialog('Delete record', `Delete maintenance record #${id}?`);
      if (!ok) return;
      try {
        const res = await apiFetch(`/api/admin/maintenance/${id}`, { method: 'DELETE' });
        const d = await res.json();
        if (!res.ok) { toast(d.error || 'Failed.', 'error'); return; }
        toast('Record deleted.', 'success');
        loadAdmin();
      } catch {}
    });
  });
}