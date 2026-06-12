/**
 * TaskFlow — app.js (Frontend)
 * Integrado com API REST (Node.js + Express + PostgreSQL)
 * Evandro Moresco · Oggi Sec · https://oggisec.com
 */

'use strict';

/* ============================================================
   CONFIGURAÇÃO
   Troque pela URL do seu backend no Railway após o deploy
   ============================================================ */
const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:4000/api'
  : 'https://taskflow-production-cedc.up.railway.app/api';

const GOOGLE_CLIENT_ID = '1005936981166-tean42kh9rg9j9ibgogqpkaqlf2st79a.apps.googleusercontent.com';

/* ============================================================
   DATE HELPERS
   ============================================================ */
function fmtISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function isoToDate(iso) { const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d); }
function addDays(iso, n) { const d=isoToDate(iso); d.setDate(d.getDate()+n); return fmtISO(d); }
function todayISO() { return fmtISO(new Date()); }

const WEEKDAYS = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const MONTHS   = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function formatDateLabel(iso) {
  const d = isoToDate(iso);
  return { wd: WEEKDAYS[d.getDay()], human: `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}` };
}
function formatShort(iso) {
  const d = isoToDate(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

/* ============================================================
   API CLIENT — wrapper com token JWT automático
   ============================================================ */
function getToken() { return localStorage.getItem('taskflow_token'); }
function setToken(t) { localStorage.setItem('taskflow_token', t); }
function clearToken() { localStorage.removeItem('taskflow_token'); }

async function api(method, path, body) {
  const opts = {
    method,
    headers:     { 'Content-Type': 'application/json' },
    credentials: 'include', // envia cookie httpOnly também
  };
  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body)  opts.body = JSON.stringify(body);

  const res  = await fetch(API_URL + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

/* ============================================================
   STATE
   ============================================================ */
let currentUser = null;
let currentDate = todayISO();
let tasks       = []; // cache local do dia atual
let allTasks    = []; // cache geral para carry-over
let dragId      = null;

/* ============================================================
   DOM REFS
   ============================================================ */
const loginScreen     = document.getElementById('loginScreen');
const appScreen       = document.getElementById('appScreen');
const loginEmail      = document.getElementById('loginEmail');
const loginPass       = document.getElementById('loginPass');
const loginUsername   = document.getElementById('loginUsername');
const usernameField   = document.getElementById('usernameField');
const loginErr        = document.getElementById('loginErr');
const loginBtn        = document.getElementById('loginBtn');
const toggleLink      = document.getElementById('toggleLink');
const toggleText      = document.getElementById('toggleText');
const loginSub        = document.getElementById('loginSub');
const dateLabel       = document.getElementById('dateLabel');
const carryBanner     = document.getElementById('carryBanner');
const carryText       = document.getElementById('carryText');
const carryBtn        = document.getElementById('carryBtn');
const newTaskInput    = document.getElementById('newTaskInput');
const newTaskPriority = document.getElementById('newTaskPriority');

/* ============================================================
   GOOGLE OAUTH — inicializa o botão
   ============================================================ */
window.addEventListener('load', () => {
  if (typeof google === 'undefined') return;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback:  handleGoogleCredential,
  });
  google.accounts.id.renderButton(
    document.getElementById('googleSignInBtn'),
    { theme: 'filled_black', size: 'large', width: 300, text: 'signin_with' }
  );
});

async function handleGoogleCredential(response) {
  try {
    loginErr.textContent = '';
    const data = await api('POST', '/auth/google', { idToken: response.credential });
    afterLogin(data);
  } catch (err) {
    loginErr.textContent = err.message;
  }
}

/* ============================================================
   AUTH — Login / Registro
   ============================================================ */
let authMode = 'login';

toggleLink.addEventListener('click', () => {
  authMode = authMode === 'login' ? 'register' : 'login';
  if (authMode === 'register') {
    loginBtn.textContent       = 'Criar conta';
    toggleText.textContent     = 'Já tem conta?';
    toggleLink.textContent     = 'Entrar';
    loginSub.textContent       = 'Crie sua conta para começar';
    usernameField.style.display = 'block';
  } else {
    loginBtn.textContent       = 'Entrar';
    toggleText.textContent     = 'Ainda não tem conta?';
    toggleLink.textContent     = 'Criar conta';
    loginSub.textContent       = 'Entre para organizar suas tarefas diárias';
    usernameField.style.display = 'none';
  }
  loginErr.textContent = '';
});

loginBtn.addEventListener('click', handleAuth);
[loginEmail, loginPass, loginUsername].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') handleAuth(); })
);

async function handleAuth() {
  const email    = loginEmail.value.trim();
  const password = loginPass.value;
  const username = loginUsername.value.trim();

  if (!email || !password) { loginErr.textContent = 'Preencha e-mail e senha.'; return; }
  loginErr.textContent = '';
  loginBtn.disabled    = true;

  try {
    let data;
    if (authMode === 'register') {
      data = await api('POST', '/auth/register', { email, password, username: username || undefined });
    } else {
      data = await api('POST', '/auth/login', { email, password });
    }
    afterLogin(data);
  } catch (err) {
    loginErr.textContent = err.message;
  } finally {
    loginBtn.disabled = false;
  }
}

function afterLogin(data) {
  if (data.token) setToken(data.token);
  currentUser = data.user;

  loginScreen.style.display = 'none';
  appScreen.style.display   = 'block';

  // Avatar
  const letter = document.getElementById('avatarLetter');
  const img    = document.getElementById('avatarImg');
  if (currentUser.avatarUrl) {
    img.src              = currentUser.avatarUrl;
    img.style.display    = 'inline-block';
    letter.style.display = 'none';
  } else {
    letter.textContent   = (currentUser.username || currentUser.email).charAt(0).toUpperCase();
  }

  document.getElementById('userLabel').textContent = currentUser.username || currentUser.email.split('@')[0];
  document.getElementById('footerYear').textContent = new Date().getFullYear();

  currentDate = todayISO();
  loadAll();
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await api('POST', '/auth/logout'); } catch {}
  clearToken();
  currentUser           = null;
  tasks                 = [];
  allTasks              = [];
  appScreen.style.display   = 'none';
  loginScreen.style.display = 'flex';
  loginEmail.value = ''; loginPass.value = ''; loginErr.textContent = '';
});

/* Auto-login se token salvo */
(async function tryAutoLogin() {
  if (!getToken()) return;
  try {
    const data = await api('GET', '/auth/me');
    afterLogin({ user: data.user }); // token já está no localStorage
  } catch {
    clearToken(); // token expirado
  }
})();

/* ============================================================
   CARREGAR DADOS
   ============================================================ */

async function loadAll() {
  try {
    const [dayData, allData] = await Promise.all([
      api('GET', `/tasks/date/${currentDate}`),
      api('GET', '/tasks/all'),
    ]);
    tasks    = dayData.tasks;
    allTasks = allData.tasks;
    render();
  } catch (err) {
    console.error('Erro ao carregar tarefas:', err.message);
  }
}

async function loadDay() {
  try {
    const data = await api('GET', `/tasks/date/${currentDate}`);
    tasks = data.tasks;
    // Atualiza allTasks para a data atual
    allTasks = allTasks.filter(t => t.date !== currentDate).concat(tasks);
    render();
  } catch (err) {
    console.error('Erro ao carregar tarefas do dia:', err.message);
  }
}

/* ============================================================
   RENDER
   ============================================================ */

function render() {
  // Label da data
  const { wd, human } = formatDateLabel(currentDate);
  let prefix = '';
  if      (currentDate === todayISO())              prefix = 'Hoje · ';
  else if (currentDate === addDays(todayISO(), -1)) prefix = 'Ontem · ';
  else if (currentDate === addDays(todayISO(),  1)) prefix = 'Amanhã · ';
  dateLabel.innerHTML = prefix + wd + '<small>' + human + '</small>';

  // Banner carry-over
  const prevPending = allTasks.filter(
    t => t.date < currentDate && t.status !== 'DONE' && !t.carriedTo
  );
  if (prevPending.length > 0) {
    carryBanner.style.display = 'flex';
    carryText.textContent     = `Você tem ${prevPending.length} tarefa(s) pendente(s) de dia(s) anteriores.`;
  } else {
    carryBanner.style.display = 'none';
  }

  // Colunas
  ['TODO', 'DOING', 'DONE'].forEach(status => {
    const container = document.getElementById('cards-' + status);
    container.innerHTML = '';
    const list = tasks.filter(t => t.status === status);
    document.getElementById('count-' + status).textContent = list.length;

    if (list.length === 0) {
      const hint = document.createElement('div');
      hint.className   = 'empty-hint';
      hint.textContent = 'Sem tarefas aqui';
      container.appendChild(hint);
      return;
    }
    list.forEach(t => container.appendChild(renderCard(t)));
  });
}

function renderCard(t) {
  const card = document.createElement('div');
  card.className  = 'card' + (t.status === 'DONE' ? ' done' : '') + (t.carriedFrom ? ' carried' : '');
  card.draggable  = true;
  card.dataset.id = t.id;

  card.addEventListener('dragstart', e => {
    dragId = t.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  const textDiv       = document.createElement('div');
  textDiv.className   = 'card-text';
  textDiv.textContent = t.text;
  card.appendChild(textDiv);

  const meta     = document.createElement('div');
  meta.className = 'card-meta';

  const left = document.createElement('div');
  left.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

  const ptag       = document.createElement('span');
  ptag.className   = 'tag priority-' + (t.priority || 'MEDIA').toLowerCase();
  ptag.textContent = t.priority === 'ALTA' ? 'Alta' : t.priority === 'BAIXA' ? 'Baixa' : 'Média';
  left.appendChild(ptag);

  if (t.carriedFrom) {
    const ftag       = document.createElement('span');
    ftag.className   = 'tag from-prev';
    ftag.textContent = 'De ' + formatShort(t.carriedFrom);
    left.appendChild(ftag);
  }
  meta.appendChild(left);

  const actions     = document.createElement('div');
  actions.className = 'card-actions';
  const order       = ['TODO', 'DOING', 'DONE'];
  const idx         = order.indexOf(t.status);

  if (idx > 0) {
    const b = makeIconBtn('←', 'Mover para trás');
    b.addEventListener('click', () => updateTaskStatus(t, order[idx - 1]));
    actions.appendChild(b);
  }
  if (idx < order.length - 1) {
    const b = makeIconBtn('→', 'Mover para frente');
    b.addEventListener('click', () => updateTaskStatus(t, order[idx + 1]));
    actions.appendChild(b);
  }

  const del = makeIconBtn('✕', 'Excluir', 'del');
  del.addEventListener('click', () => deleteTask(t.id));
  actions.appendChild(del);

  meta.appendChild(actions);
  card.appendChild(meta);
  return card;
}

function makeIconBtn(symbol, title, extraClass = '') {
  const b       = document.createElement('button');
  b.className   = 'icon-btn' + (extraClass ? ' ' + extraClass : '');
  b.title       = title;
  b.textContent = symbol;
  return b;
}

/* ============================================================
   DRAG & DROP
   ============================================================ */
['TODO', 'DOING', 'DONE'].forEach(status => {
  const col = document.getElementById('col-' + status);
  col.addEventListener('dragover',  e => { e.preventDefault(); col.classList.add('dragover'); });
  col.addEventListener('dragleave', () => col.classList.remove('dragover'));
  col.addEventListener('drop', e => {
    e.preventDefault();
    col.classList.remove('dragover');
    const t = tasks.find(x => x.id === dragId);
    if (t && t.status !== status) updateTaskStatus(t, status);
    dragId = null;
  });
});

/* ============================================================
   OPERAÇÕES DE TAREFA (API)
   ============================================================ */

async function addTask() {
  const text = newTaskInput.value.trim();
  if (!text) return;
  newTaskInput.disabled = true;

  try {
    const data = await api('POST', '/tasks', {
      text,
      status:   'TODO',
      priority: newTaskPriority.value,
      date:     currentDate,
    });
    tasks.push(data.task);
    allTasks.push(data.task);
    newTaskInput.value = '';
    render();
  } catch (err) {
    alert('Erro ao adicionar tarefa: ' + err.message);
  } finally {
    newTaskInput.disabled = false;
    newTaskInput.focus();
  }
}

async function updateTaskStatus(t, newStatus) {
  // Atualiza localmente para resposta imediata (optimistic update)
  const oldStatus = t.status;
  t.status = newStatus;
  render();

  try {
    await api('PUT', `/tasks/${t.id}`, { status: newStatus });
  } catch (err) {
    // Reverte em caso de erro
    t.status = oldStatus;
    render();
    alert('Erro ao atualizar tarefa: ' + err.message);
  }
}

async function deleteTask(id) {
  // Remove localmente imediatamente
  const backup = [...tasks];
  tasks    = tasks.filter(t => t.id !== id);
  allTasks = allTasks.filter(t => t.id !== id);
  render();

  try {
    await api('DELETE', `/tasks/${id}`);
  } catch (err) {
    tasks = backup;
    render();
    alert('Erro ao excluir tarefa: ' + err.message);
  }
}

carryBtn.addEventListener('click', async () => {
  carryBtn.disabled    = true;
  carryBtn.textContent = 'Processando...';
  try {
    await api('POST', '/tasks/carry-over', { targetDate: currentDate });
    await loadAll(); // recarrega tudo do servidor
  } catch (err) {
    alert('Erro ao trazer tarefas: ' + err.message);
  } finally {
    carryBtn.disabled    = false;
    carryBtn.textContent = 'Trazer para hoje';
  }
});

/* ============================================================
   ADD TASK — eventos
   ============================================================ */
document.getElementById('addTaskBtn').addEventListener('click', addTask);
newTaskInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

/* ============================================================
   NAVEGAÇÃO POR DATA
   ============================================================ */
document.getElementById('prevDay').addEventListener('click', () => { currentDate = addDays(currentDate, -1); loadDay(); });
document.getElementById('nextDay').addEventListener('click', () => { currentDate = addDays(currentDate,  1); loadDay(); });
document.getElementById('todayBtn').addEventListener('click', () => { currentDate = todayISO();               loadDay(); });
