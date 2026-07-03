// ============================================================
// GameZone — lógica principal (estado en localStorage)
// Login por nombre. "pato" = admin (infinitas veces).
// Nombres únicos por dispositivo. Juegos con aprobación.
// ============================================================

const ADMIN_NICK = 'pato';
const ADMIN_PASSWORD = 'pato2026';

const DB = {
  get users() { return JSON.parse(localStorage.getItem('gz_users') || '[]'); },
  set users(v) { localStorage.setItem('gz_users', JSON.stringify(v)); },
  get games() { return JSON.parse(localStorage.getItem('gz_games') || '[]'); },
  set games(v) { localStorage.setItem('gz_games', JSON.stringify(v)); },
  get session() { return JSON.parse(localStorage.getItem('gz_session') || 'null'); },
  set session(v) { localStorage.setItem('gz_session', JSON.stringify(v)); },
};

let activeCleanup = null;   // teardown for the running built-in game
let pendingGame = null;     // game waiting for a built-in pick

// ---------- AUTH ----------
function currentUser() {
  const s = DB.session;
  if (!s) return null;
  return DB.users.find(u => u.id === s.userId) || null;
}

function loginByNick(rawNick, password = '') {
  const nick = rawNick.trim();
  if (!nick) throw new Error('Escribe un nombre.');

  const users = DB.users;

  // Admin: el nombre "pato" pide contraseña y entra como admin (infinitas veces).
  if (nick.toLowerCase() === ADMIN_NICK) {
    if (password !== ADMIN_PASSWORD) throw new Error('Contraseña incorrecta.');
    let admin = users.find(u => u.username.toLowerCase() === ADMIN_NICK);
    if (!admin) {
      admin = { id: 'u_admin', username: 'pato', role: 'admin', createdAt: Date.now() };
      users.push(admin); DB.users = users;
    }
    DB.session = { userId: admin.id };
    return admin;
  }

  // Nombre normal: si ya existe en este dispositivo, vuelves a entrar a esa cuenta.
  const existing = users.find(u => u.username.toLowerCase() === nick.toLowerCase());
  if (existing) {
    DB.session = { userId: existing.id };
    return existing;
  }

  // Nombre nuevo: se crea (queda reservado en este dispositivo).
  const newUser = { id: 'u_' + Date.now(), username: nick, role: 'user', createdAt: Date.now() };
  users.push(newUser); DB.users = users;
  DB.session = { userId: newUser.id };
  return newUser;
}

function logout() {
  DB.session = null;
  cleanupGame();
  showLogin();
}

// ---------- VIEWS ----------
function showLogin() {
  document.getElementById('view-login').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  const f = document.getElementById('form-login');
  if (f) f.reset();
  document.getElementById('admin-pass-wrap')?.classList.add('hidden');
}

function defaultRouteFor(role) {
  return 'dashboard'; // todos empiezan en la experiencia normal
}

function applyRoleNav(role) {
  document.querySelectorAll('.nav-link').forEach(link => {
    const roles = (link.dataset.roles || '').split(',');
    link.style.display = roles.includes(role) ? '' : 'none';
  });
}

function showApp() {
  const user = currentUser();
  if (!user) return showLogin();
  document.getElementById('view-login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  document.getElementById('user-name').textContent = user.username;
  document.getElementById('user-avatar').textContent = user.username[0].toUpperCase();
  const roleBadge = document.getElementById('user-role');
  const labels = { admin: 'Admin', pro: 'Pro', user: '' };
  roleBadge.textContent = labels[user.role] || '';
  roleBadge.className = 'role-badge ' + (user.role === 'admin' ? 'admin' : user.role === 'pro' ? 'pro' : 'hidden');

  applyRoleNav(user.role);

  const hashRoute = location.hash.replace('#', '');
  navigate(hashRoute || defaultRouteFor(user.role));
}

// ---------- ROUTING ----------
const ROUTE_TITLES = {
  dashboard: 'Dashboard', library: 'Mi Biblioteca', explore: 'Explorar',
  upload: 'Subir Juego', admin: 'Panel Admin',
};
const ROUTE_ROLES = {
  dashboard: ['user', 'pro', 'admin'], library: ['user', 'pro', 'admin'],
  explore: ['user', 'pro', 'admin'], upload: ['user', 'pro', 'admin'],
  admin: ['pro', 'admin'],
};

function navigate(route) {
  const user = currentUser();
  if (!user) return showLogin();
  if (!ROUTE_TITLES[route] || !ROUTE_ROLES[route].includes(user.role)) {
    route = defaultRouteFor(user.role);
  }

  document.querySelectorAll('.route').forEach(r => r.classList.add('hidden'));
  document.getElementById('route-' + route).classList.remove('hidden');
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.route === route);
  });
  document.getElementById('page-title').textContent = ROUTE_TITLES[route];
  if (location.hash !== '#' + route) history.replaceState(null, '', '#' + route);

  const search = document.getElementById('search');
  search.style.visibility = (route === 'explore') ? 'visible' : 'hidden';

  if (route === 'dashboard') renderDashboard();
  if (route === 'library') renderLibrary();
  if (route === 'explore') renderExplore(document.querySelector('.chip.active')?.dataset.cat || 'all');
  if (route === 'admin') renderAdmin();
}

// ---------- PANEL ADMIN ----------
function renderAdmin() {
  const role = currentUser().role;
  document.querySelectorAll('#route-admin .admin-block').forEach(block => {
    const roles = (block.dataset.roles || '').split(',');
    block.style.display = roles.includes(role) ? '' : 'none';
  });
  renderModeration();
  if (role === 'admin') { renderUsers(); renderAllGames(); }
}

// ---------- GAME CARD ----------
function coverHtml(game) {
  if (game.cover) return `<div class="game-cover"><img src="${escapeAttr(game.cover)}" alt="" /></div>`;
  return `<div class="game-cover placeholder">🎮</div>`;
}

function gameCard(game) {
  const card = document.createElement('div');
  card.className = 'game-card';
  card.innerHTML = `
    ${coverHtml(game)}
    <div class="game-info">
      <div class="game-title">${escapeHtml(game.title)}</div>
      <div class="game-meta">
        <span class="tag">${game.category}</span>
        <span>▶ ${game.plays || 0}</span>
        <span>· ${escapeHtml(game.ownerName || '')}</span>
        ${statusBadge(game.status)}
      </div>
    </div>
  `;
  card.onclick = () => playGame(game);
  return card;
}

function statusBadge(status) {
  if (status === 'approved') return '';
  if (status === 'pending') return '<span class="status pending">Pendiente</span>';
  if (status === 'rejected') return '<span class="status rejected">Rechazado</span>';
  return '';
}

function fillGrid(el, games, emptyMsg) {
  el.innerHTML = '';
  if (!games.length) { el.innerHTML = `<div class="empty">${emptyMsg}</div>`; return; }
  games.forEach(g => el.appendChild(gameCard(g)));
}

// ---------- RENDER: DASHBOARD ----------
function renderDashboard() {
  const games = DB.games;
  const user = currentUser();
  const approved = games.filter(g => g.status === 'approved');
  const mine = games.filter(g => g.owner === user.id);
  document.getElementById('stat-library').textContent = mine.length;
  document.getElementById('stat-published').textContent = approved.length;
  document.getElementById('stat-pending').textContent = games.filter(g => g.status === 'pending').length;
  document.getElementById('stat-users').textContent = DB.users.filter(u => u.role !== 'admin').length;

  const featured = [...approved].sort((a, b) => (b.plays || 0) - (a.plays || 0)).slice(0, 4);
  const recent = [...approved].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
  fillGrid(document.getElementById('featured-grid'), featured, 'Aún no hay juegos publicados.');
  fillGrid(document.getElementById('recent-grid'), recent, 'Aún no hay juegos publicados.');
}

function renderLibrary() {
  const user = currentUser();
  const mine = DB.games.filter(g => g.owner === user.id).sort((a, b) => b.createdAt - a.createdAt);
  fillGrid(document.getElementById('library-grid'), mine, 'No has subido juegos todavía.');
}

function renderExplore(cat) {
  let games = DB.games.filter(g => g.status === 'approved');
  if (cat && cat !== 'all') games = games.filter(g => g.category === cat);
  const q = document.getElementById('search').value.trim().toLowerCase();
  if (q) games = games.filter(g => g.title.toLowerCase().includes(q));
  fillGrid(document.getElementById('explore-grid'), games, 'No se encontraron juegos.');
}

// ---------- RENDER: MODERATION (admin + pro) ----------
function reviewRow(game, buttons) {
  const row = document.createElement('div');
  row.className = 'review-card';
  row.innerHTML = `
    ${coverHtml(game)}
    <div class="review-info">
      <div class="game-title">${escapeHtml(game.title)} ${statusBadge(game.status)}</div>
      <div class="game-meta"><span class="tag">${game.category}</span><span>· ${escapeHtml(game.ownerName || '')}</span></div>
      <p class="review-desc">${escapeHtml(game.description || 'Sin descripción.')}</p>
    </div>
    <div class="review-actions"></div>
  `;
  const actions = row.querySelector('.review-actions');
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'btn ' + b.cls + ' small';
    btn.textContent = b.label;
    btn.onclick = b.onClick;
    actions.appendChild(btn);
  });
  return row;
}

function setGameStatus(id, status) {
  const games = DB.games;
  const g = games.find(x => x.id === id);
  if (g) { g.status = status; DB.games = games; }
}

function renderModeration() {
  const list = document.getElementById('moderation-list');
  const pending = DB.games.filter(g => g.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  list.innerHTML = '';
  if (!pending.length) { list.innerHTML = '<div class="empty">No hay juegos pendientes. ¡Todo al día!</div>'; return; }
  pending.forEach(g => {
    list.appendChild(reviewRow(g, [
      { label: '▶ Probar', cls: 'ghost', onClick: () => playGame(g, true) },
      { label: '✔ Aceptar', cls: 'success', onClick: () => { setGameStatus(g.id, 'approved'); toast('Juego aprobado'); renderModeration(); } },
      { label: '✕ Rechazar', cls: 'danger', onClick: () => { setGameStatus(g.id, 'rejected'); toast('Juego rechazado'); renderModeration(); } },
    ]));
  });
}

// ---------- RENDER: ALL GAMES (admin) ----------
function renderAllGames() {
  const list = document.getElementById('games-list');
  const games = [...DB.games].sort((a, b) => b.createdAt - a.createdAt);
  list.innerHTML = '';
  if (!games.length) { list.innerHTML = '<div class="empty">Todavía no hay juegos.</div>'; return; }
  games.forEach(g => {
    const buttons = [{ label: '▶ Jugar', cls: 'ghost', onClick: () => playGame(g, true) }];
    if (g.status !== 'approved') buttons.push({ label: '✔ Publicar', cls: 'success', onClick: () => { setGameStatus(g.id, 'approved'); toast('Juego publicado'); renderAllGames(); } });
    if (g.status === 'approved') buttons.push({ label: '⏸ Quitar', cls: 'warning', onClick: () => { setGameStatus(g.id, 'rejected'); toast('Juego retirado'); renderAllGames(); } });
    buttons.push({ label: '🗑 Borrar', cls: 'danger', onClick: () => {
      if (confirm('¿Borrar "' + g.title + '" para siempre?')) { DB.games = DB.games.filter(x => x.id !== g.id); toast('Juego borrado'); renderAllGames(); }
    } });
    list.appendChild(reviewRow(g, buttons));
  });
}

// ---------- RENDER: USERS (admin) ----------
function renderUsers() {
  const ul = document.getElementById('users-list');
  const q = document.getElementById('user-search').value.trim().toLowerCase();
  let users = DB.users.filter(u => u.role !== 'admin');
  if (q) users = users.filter(u => u.username.toLowerCase().includes(q));
  ul.innerHTML = '';
  if (!users.length) { ul.innerHTML = '<li class="empty-row">No hay usuarios.</li>'; return; }
  users.forEach(u => {
    const li = document.createElement('li');
    const roleTag = u.role === 'pro' ? '<span class="role-badge pro">Pro</span>' : '';
    li.innerHTML = `<span class="u-name">${escapeHtml(u.username)} ${roleTag}</span>`;
    const actions = document.createElement('span');
    actions.className = 'row-actions';

    const proBtn = document.createElement('button');
    proBtn.className = 'btn small ' + (u.role === 'pro' ? 'warning' : 'ghost');
    proBtn.textContent = u.role === 'pro' ? 'Quitar Pro' : 'Hacer Pro';
    proBtn.onclick = () => {
      const users2 = DB.users;
      const target = users2.find(x => x.id === u.id);
      target.role = target.role === 'pro' ? 'user' : 'pro';
      DB.users = users2;
      toast(target.role === 'pro' ? u.username + ' ahora es Pro' : 'Pro retirado a ' + u.username);
      renderUsers();
    };

    const delBtn = document.createElement('button');
    delBtn.className = 'btn small danger';
    delBtn.textContent = 'Borrar';
    delBtn.onclick = () => {
      if (!confirm('¿Borrar al usuario "' + u.username + '"? Perderá su acceso al recargar.')) return;
      DB.users = DB.users.filter(x => x.id !== u.id);
      DB.games = DB.games.filter(g => g.owner !== u.id);
      toast('Usuario borrado');
      renderUsers();
    };

    actions.appendChild(proBtn);
    actions.appendChild(delBtn);
    li.appendChild(actions);
    ul.appendChild(li);
  });
}

// ---------- PLAY ----------
function playGame(game, isReview = false) {
  if (!isReview && game.status !== 'approved') { toast('Este juego aún no está aprobado.'); return; }

  if (!isReview) {
    const games = DB.games;
    const g = games.find(x => x.id === game.id);
    if (g) { g.plays = (g.plays || 0) + 1; DB.games = games; }
  }

  if (game.url) {
    openPlayer(game.title, `<iframe src="${escapeAttr(game.url)}" allowfullscreen></iframe>`);
  } else if (game.builtin && BuiltInGames[game.builtin]) {
    openBuiltIn(game.title, game.builtin);
  } else {
    pendingGame = game;
    document.getElementById('picker').classList.remove('hidden');
  }
}

function openPlayer(title, html) {
  cleanupGame();
  document.getElementById('player-title').textContent = title;
  document.getElementById('player-body').innerHTML = html;
  document.getElementById('player').classList.remove('hidden');
}

function openBuiltIn(title, key) {
  cleanupGame();
  document.getElementById('player-title').textContent = title;
  const body = document.getElementById('player-body');
  body.innerHTML = '';
  document.getElementById('player').classList.remove('hidden');
  activeCleanup = BuiltInGames[key](body, (score) => toast('Puntuación: ' + score + ' 🎮'));
}

function cleanupGame() {
  if (activeCleanup) { try { activeCleanup(); } catch (e) {} activeCleanup = null; }
}

function closePlayer() {
  cleanupGame();
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  document.getElementById('player').classList.add('hidden');
  document.getElementById('player-body').innerHTML = '';
}

function toggleFullscreen() {
  const el = document.querySelector('#player .modal-content');
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
}

// ---------- IMAGE HELPER ----------
function readImageResized(file, maxW = 480) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Selecciona una imagen para la portada.'));
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

// ---------- UTIL ----------
function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s = '') { return escapeHtml(s); }

let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

// ============================================================
// EVENT WIRING
// ============================================================
document.addEventListener('DOMContentLoaded', () => {

  // Login — muestra el campo de contraseña solo si el nombre es "pato"
  const nickInput = document.querySelector('#form-login input[name=nick]');
  const passWrap = document.getElementById('admin-pass-wrap');
  nickInput.oninput = () => {
    const isAdmin = nickInput.value.trim().toLowerCase() === ADMIN_NICK;
    passWrap.classList.toggle('hidden', !isAdmin);
    if (!isAdmin) passWrap.querySelector('input').value = '';
  };

  document.getElementById('form-login').onsubmit = (e) => {
    e.preventDefault();
    const err = document.getElementById('login-error');
    err.classList.add('hidden');
    try {
      loginByNick(e.target.nick.value, e.target.password ? e.target.password.value : '');
      showApp();
      toast('¡Bienvenido!');
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    }
  };

  document.getElementById('btn-logout').onclick = logout;

  // Nav
  document.querySelectorAll('.nav-link').forEach(link => {
    link.onclick = (e) => { e.preventDefault(); navigate(link.dataset.route); };
  });

  // Upload — cover preview
  const coverInput = document.querySelector('#form-upload input[name=cover]');
  const previewWrap = document.getElementById('cover-preview-wrap');
  const previewImg = document.getElementById('cover-preview');
  coverInput.onchange = async () => {
    const file = coverInput.files[0];
    if (!file) { previewWrap.classList.add('hidden'); return; }
    try {
      previewImg.src = await readImageResized(file);
      previewWrap.classList.remove('hidden');
    } catch (e) { previewWrap.classList.add('hidden'); }
  };

  // Upload submit
  document.getElementById('form-upload').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const user = currentUser();
    let cover;
    try {
      cover = await readImageResized(f.cover.files[0]);
    } catch (err) {
      toast(err.message);
      return;
    }
    const game = {
      id: 'g_' + Date.now(),
      title: f.title.value.trim(),
      description: f.description.value.trim(),
      category: f.category.value,
      cover,
      url: f.url.value.trim(),
      builtin: '',
      owner: user.id,
      ownerName: user.username,
      plays: 0,
      status: 'pending',
      createdAt: Date.now(),
    };
    const games = DB.games; games.push(game); DB.games = games;
    f.reset();
    previewWrap.classList.add('hidden');
    toast('Enviado. Esperando aprobación de un moderador.');
    navigate('library');
  };

  // Explore filters
  document.querySelectorAll('.chip').forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderExplore(chip.dataset.cat);
    };
  });

  // Search (explore)
  document.getElementById('search').oninput = () => {
    renderExplore(document.querySelector('.chip.active')?.dataset.cat || 'all');
  };

  // User search (admin)
  document.getElementById('user-search').oninput = () => renderUsers();

  // Player modal
  document.getElementById('player-close').onclick = closePlayer;
  document.getElementById('player-fs').onclick = toggleFullscreen;
  document.getElementById('player').onclick = (e) => { if (e.target.id === 'player') closePlayer(); };

  // Picker modal
  document.getElementById('picker-close').onclick = () => document.getElementById('picker').classList.add('hidden');
  document.querySelectorAll('.picker-card').forEach(card => {
    card.onclick = () => {
      document.getElementById('picker').classList.add('hidden');
      if (!pendingGame) return;
      const games = DB.games;
      const g = games.find(x => x.id === pendingGame.id);
      if (g) { g.builtin = card.dataset.game; DB.games = games; }
      openBuiltIn(pendingGame.title, card.dataset.game);
      pendingGame = null;
    };
  });

  // Reset everything
  document.getElementById('btn-reset').onclick = () => {
    if (confirm('¿Seguro? Esto borra todos los usuarios y juegos.')) {
      localStorage.removeItem('gz_users');
      localStorage.removeItem('gz_games');
      localStorage.removeItem('gz_session');
      location.reload();
    }
  };

  // Boot
  if (currentUser()) showApp();
  else showLogin();
});
