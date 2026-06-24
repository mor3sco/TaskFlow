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
   TEMA CLARO / ESCURO
   ============================================================ */
const THEME_KEY = 'taskflow_theme';

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

(function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    applyTheme(saved);
  } else {
    // Sem preferência salva: usa o tema do sistema
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(prefersLight ? 'light' : 'dark');
  }
})();

document.getElementById('themeToggleLogin').addEventListener('click', toggleTheme);
document.getElementById('themeToggleApp').addEventListener('click', toggleTheme);

/* ============================================================
   EXPIRAÇÃO DE SESSÃO POR INATIVIDADE
   - O token fica em sessionStorage: fechar o navegador já desloga.
   - Além disso, após INACTIVITY_LIMIT_MS sem interação, desloga
     automaticamente mesmo com a aba aberta.
   ============================================================ */
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutos
let inactivityTimer = null;

function resetInactivityTimer() {
  if (!getToken()) return; // só importa se estiver logado
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    handleSessionExpired();
  }, INACTIVITY_LIMIT_MS);
}

function startInactivityWatcher() {
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt =>
    document.addEventListener(evt, resetInactivityTimer, { passive: true })
  );
  resetInactivityTimer();
}

function stopInactivityWatcher() {
  clearTimeout(inactivityTimer);
}

function handleSessionExpired() {
  stopInactivityWatcher();
  clearToken();
  currentUser = null;
  tasks    = [];
  allTasks = [];
  document.getElementById('appScreen').style.display   = 'none';
  document.getElementById('loginScreen').style.display  = 'flex';
  loginErr.textContent = 'Sua sessão expirou por inatividade. Faça login novamente.';
}

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
function formatDateTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  const date = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return `${date} às ${time}`;
}

/* ============================================================
   API CLIENT — wrapper com token JWT automático
   ============================================================ */
function getToken() { return sessionStorage.getItem('taskflow_token'); }
function setToken(t) { sessionStorage.setItem('taskflow_token', t); }
function clearToken() { sessionStorage.removeItem('taskflow_token'); }

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
const dateLabelBtn    = document.getElementById('dateLabelBtn');
const carryBanner     = document.getElementById('carryBanner');
const carryText       = document.getElementById('carryText');
const carryBtn        = document.getElementById('carryBtn');
const newTaskInput    = document.getElementById('newTaskInput');
const newTaskPriority = document.getElementById('newTaskPriority');

// Modal de edição
const editModalOverlay = document.getElementById('editModalOverlay');
const editText         = document.getElementById('editText');
const editPriority     = document.getElementById('editPriority');
const editCreatedAt    = document.getElementById('editCreatedAt');
const editCompletedAt  = document.getElementById('editCompletedAt');
const editErr          = document.getElementById('editErr');
const editSaveBtn      = document.getElementById('editSaveBtn');
const editCancelBtn    = document.getElementById('editCancelBtn');
let editingTaskId = null;

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

function updateAvatarUI(user) {
  const letter = document.getElementById('avatarLetter');
  const img    = document.getElementById('avatarImg');
  if (user.avatarUrl) {
    img.src              = user.avatarUrl;
    img.style.display    = 'inline-block';
    letter.style.display = 'none';
  } else {
    img.style.display     = 'none';
    letter.style.display  = 'flex';
    letter.textContent    = (user.username || user.email).charAt(0).toUpperCase();
  }
  document.getElementById('userLabel').textContent = user.username || user.email.split('@')[0];
}

function afterLogin(data) {
  if (data.token) setToken(data.token);
  currentUser = data.user;

  loginScreen.style.display = 'none';
  appScreen.style.display   = 'block';

  updateAvatarUI(currentUser);
  document.getElementById('footerYear').textContent = new Date().getFullYear();

  currentDate = todayISO();
  loadAll();
  startInactivityWatcher();
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await api('POST', '/auth/logout'); } catch {}
  stopInactivityWatcher();
  clearToken();
  currentUser           = null;
  tasks                 = [];
  allTasks              = [];
  appScreen.style.display   = 'none';
  loginScreen.style.display = 'flex';
  loginEmail.value = ''; loginPass.value = ''; loginErr.textContent = '';
});

/* Auto-login se token salvo (válido só dentro da mesma aba/sessão) */
(async function tryAutoLogin() {
  if (!getToken()) return;
  try {
    const data = await api('GET', '/auth/me');
    afterLogin({ user: data.user }); // token já está salvo nesta sessão
  } catch {
    clearToken(); // token expirado ou inválido
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
  textDiv.title       = 'Clique para editar';
  textDiv.addEventListener('click', () => openEditModal(t));
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

  const edit = makeIconBtn('✎', 'Editar');
  edit.addEventListener('click', () => openEditModal(t));
  actions.appendChild(edit);

  const del = makeIconBtn('✕', 'Excluir', 'del');
  del.addEventListener('click', () => deleteTask(t.id));
  actions.appendChild(del);

  meta.appendChild(actions);
  card.appendChild(meta);

  // Datas de criação e conclusão
  const stamps = document.createElement('div');
  stamps.className = 'card-timestamps';
  let stampsHtml = `Criada: ${formatDateTime(t.createdAt)}`;
  if (t.completedAt) {
    stampsHtml += `<br>Concluída: ${formatDateTime(t.completedAt)}`;
  }
  stamps.innerHTML = stampsHtml;
  card.appendChild(stamps);

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
  const oldStatus      = t.status;
  const oldCompletedAt = t.completedAt;
  t.status = newStatus;
  if (newStatus === 'DONE' && oldStatus !== 'DONE') {
    t.completedAt = new Date().toISOString();
  } else if (newStatus !== 'DONE' && oldStatus === 'DONE') {
    t.completedAt = null;
  }
  render();

  try {
    await api('PUT', `/tasks/${t.id}`, { status: newStatus });
  } catch (err) {
    // Reverte em caso de erro
    t.status      = oldStatus;
    t.completedAt = oldCompletedAt;
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

/* ============================================================
   MODAL DE EDIÇÃO DE TAREFA
   ============================================================ */

function openEditModal(t) {
  editingTaskId = t.id;
  editText.value     = t.text;
  editPriority.value = t.priority || 'MEDIA';
  editCreatedAt.textContent   = formatDateTime(t.createdAt);
  editCompletedAt.textContent = t.completedAt ? formatDateTime(t.completedAt) : 'Ainda não concluída';
  editErr.textContent = '';
  editModalOverlay.style.display = 'flex';
  setTimeout(() => editText.focus(), 0);
}

function closeEditModal() {
  editModalOverlay.style.display = 'none';
  editingTaskId = null;
}

editCancelBtn.addEventListener('click', closeEditModal);
editModalOverlay.addEventListener('click', e => {
  if (e.target === editModalOverlay) closeEditModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (editModalOverlay.style.display === 'flex')      closeEditModal();
    if (calendarModalOverlay?.style.display === 'flex') closeCalendarModal();
    if (dashboardModalOverlay?.style.display === 'flex') closeDashboardModal();
    if (profileModalOverlay?.style.display === 'flex')  closeProfileModal();
  }
});

editSaveBtn.addEventListener('click', async () => {
  const text     = editText.value.trim();
  const priority = editPriority.value;

  if (!text) {
    editErr.textContent = 'A descrição não pode ficar vazia.';
    return;
  }

  const t = tasks.find(x => x.id === editingTaskId) || allTasks.find(x => x.id === editingTaskId);
  if (!t) { closeEditModal(); return; }

  editSaveBtn.disabled    = true;
  editSaveBtn.textContent = 'Salvando...';

  try {
    const data = await api('PUT', `/tasks/${editingTaskId}`, { text, priority });
    t.text     = data.task.text;
    t.priority = data.task.priority;
    render();
    closeEditModal();
  } catch (err) {
    editErr.textContent = err.message;
  } finally {
    editSaveBtn.disabled    = false;
    editSaveBtn.textContent = 'Salvar alterações';
  }
});

/* ============================================================
   MINI CALENDÁRIO (abre ao clicar na data atual do board)
   ============================================================ */

let calViewYear  = null; // ano sendo exibido no calendário
let calViewMonth = null; // mês sendo exibido (0-11)
let calTaskDates = new Set(); // datas (YYYY-MM-DD) que têm pelo menos 1 tarefa, no mês visível

const calendarModalOverlay = document.getElementById('calendarModalOverlay');
const calMonthLabel        = document.getElementById('calMonthLabel');
const calendarGrid         = document.getElementById('calendarGrid');

const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function openCalendarModal() {
  const d = isoToDate(currentDate);
  calViewYear  = d.getFullYear();
  calViewMonth = d.getMonth();
  calendarModalOverlay.style.display = 'flex';
  renderCalendar();
}

function closeCalendarModal() {
  calendarModalOverlay.style.display = 'none';
}

async function renderCalendar() {
  calMonthLabel.textContent = `${MONTHS_FULL[calViewMonth]} de ${calViewYear}`;

  // Busca quais dias do mês têm tarefas (para mostrar o indicador)
  const from = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const to = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  calTaskDates = new Set();
  try {
    const data = await api('GET', `/tasks/range?from=${from}&to=${to}`);
    data.tasks.forEach(t => calTaskDates.add(t.date));
  } catch {
    // Se falhar, exibe o calendário sem os indicadores
  }

  calendarGrid.innerHTML = '';

  const firstWeekday = new Date(calViewYear, calViewMonth, 1).getDay(); // 0=domingo
  const totalDays     = new Date(calViewYear, calViewMonth + 1, 0).getDate();

  // Espaços vazios antes do dia 1
  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'calendar-day empty';
    calendarGrid.appendChild(empty);
  }

  for (let day = 1; day <= totalDays; day++) {
    const iso = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const btn = document.createElement('button');
    btn.className   = 'calendar-day';
    btn.textContent = day;
    btn.type        = 'button';

    if (iso === todayISO())    btn.classList.add('today');
    if (iso === currentDate)   btn.classList.add('selected');
    if (calTaskDates.has(iso)) btn.classList.add('has-tasks');

    btn.addEventListener('click', () => {
      currentDate = iso;
      loadDay();
      closeCalendarModal();
    });
    calendarGrid.appendChild(btn);
  }
}

dateLabelBtn.addEventListener('click', openCalendarModal);
document.getElementById('calCancelBtn').addEventListener('click', closeCalendarModal);
calendarModalOverlay.addEventListener('click', e => { if (e.target === calendarModalOverlay) closeCalendarModal(); });

document.getElementById('calPrevMonth').addEventListener('click', () => {
  calViewMonth--;
  if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
  renderCalendar();
});
document.getElementById('calNextMonth').addEventListener('click', () => {
  calViewMonth++;
  if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
  renderCalendar();
});

/* ============================================================
   DASHBOARD (estatísticas mensais com filtros)
   ============================================================ */

const dashboardModalOverlay = document.getElementById('dashboardModalOverlay');
const dashMonth    = document.getElementById('dashMonth');
const dashPriority = document.getElementById('dashPriority');
const dashStatus   = document.getElementById('dashStatus');
const dashboardList = document.getElementById('dashboardList');

function openDashboardModal() {
  const now = new Date();
  dashMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  dashPriority.value = '';
  dashStatus.value   = '';
  dashboardModalOverlay.style.display = 'flex';
  loadDashboardData();
}

function closeDashboardModal() {
  dashboardModalOverlay.style.display = 'none';
}

async function loadDashboardData() {
  const monthValue = dashMonth.value; // 'YYYY-MM'
  if (!monthValue) return;

  const [year, month] = monthValue.split('-').map(Number);
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const params = new URLSearchParams({ from, to });
  if (dashPriority.value) params.set('priority', dashPriority.value);
  if (dashStatus.value)   params.set('status', dashStatus.value);

  dashboardList.innerHTML = '<div class="dashboard-empty">Carregando...</div>';

  try {
    const data = await api('GET', `/tasks/range?${params.toString()}`);
    renderDashboard(data.tasks);
  } catch (err) {
    dashboardList.innerHTML = `<div class="dashboard-empty">Erro ao carregar: ${err.message}</div>`;
  }
}

function renderDashboard(taskList) {
  const total = taskList.length;
  const done  = taskList.filter(t => t.status === 'DONE').length;
  const doing = taskList.filter(t => t.status === 'DOING').length;
  const todo  = taskList.filter(t => t.status === 'TODO').length;
  const rate  = total > 0 ? Math.round((done / total) * 100) : 0;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDone').textContent  = done;
  document.getElementById('statDoing').textContent = doing;
  document.getElementById('statTodo').textContent  = todo;
  document.getElementById('statRate').textContent  = `${rate}%`;
  document.getElementById('statRateBar').style.width = `${rate}%`;

  dashboardList.innerHTML = '';

  if (taskList.length === 0) {
    dashboardList.innerHTML = '<div class="dashboard-empty">Nenhuma tarefa encontrada para esse filtro.</div>';
    return;
  }

  // Mostra as mais recentes primeiro
  const sorted = [...taskList].sort((a, b) => (a.date < b.date ? 1 : -1));

  sorted.forEach(t => {
    const item = document.createElement('div');
    item.className = 'dashboard-list-item';

    const statusDot = { TODO: 'todo', DOING: 'doing', DONE: 'done' }[t.status];

    const textEl = document.createElement('span');
    textEl.className = 'dashboard-list-item-text';
    textEl.innerHTML = `<span class="dot ${statusDot}" style="margin-right:8px;"></span>${t.text}`;

    const dateEl = document.createElement('span');
    dateEl.className = 'dashboard-list-item-date';
    dateEl.textContent = formatShort(t.date);

    item.appendChild(textEl);
    item.appendChild(dateEl);
    dashboardList.appendChild(item);
  });
}

document.getElementById('dashboardBtn').addEventListener('click', openDashboardModal);
document.getElementById('dashboardCloseBtn').addEventListener('click', closeDashboardModal);
dashboardModalOverlay.addEventListener('click', e => { if (e.target === dashboardModalOverlay) closeDashboardModal(); });
dashMonth.addEventListener('change', loadDashboardData);
dashPriority.addEventListener('change', loadDashboardData);
dashStatus.addEventListener('change', loadDashboardData);

/* ============================================================
   PERFIL (editar nome, foto e senha)
   ============================================================ */

const profileModalOverlay     = document.getElementById('profileModalOverlay');
const profileAvatarUrl        = document.getElementById('profileAvatarUrl');
const profileUsername         = document.getElementById('profileUsername');
const profileEmail            = document.getElementById('profileEmail');
const profileCurrentPassword  = document.getElementById('profileCurrentPassword');
const profileCurrentPassField = document.getElementById('profileCurrentPassField');
const profileNewPassword      = document.getElementById('profileNewPassword');
const profileErr              = document.getElementById('profileErr');
const profileSuccess          = document.getElementById('profileSuccess');
const profileSaveBtn          = document.getElementById('profileSaveBtn');

function updateProfilePreview() {
  const img    = document.getElementById('profileAvatarPreview');
  const letter = document.getElementById('profileAvatarLetterLg');
  const url    = profileAvatarUrl.value.trim();

  if (url) {
    img.src           = url;
    img.style.display = 'block';
    letter.style.display = 'none';
  } else {
    img.style.display    = 'none';
    letter.style.display = 'flex';
    letter.textContent   = (profileUsername.value || currentUser.email).charAt(0).toUpperCase();
  }
}

function openProfileModal() {
  profileAvatarUrl.value       = currentUser.avatarUrl || '';
  profileUsername.value        = currentUser.username || '';
  profileEmail.value           = currentUser.email || '';
  profileCurrentPassword.value = '';
  profileNewPassword.value     = '';
  profileErr.textContent       = '';
  profileSuccess.textContent   = '';

  // Conta Google sem senha local não precisa pedir "senha atual"
  profileCurrentPassField.style.display = currentUser.hasPassword === false ? 'none' : 'block';

  updateProfilePreview();
  profileModalOverlay.style.display = 'flex';
}

function closeProfileModal() {
  profileModalOverlay.style.display = 'none';
}

document.getElementById('userPill').addEventListener('click', (e) => {
  // Não abre o modal se o clique foi no botão "Sair"
  if (e.target.closest('#logoutBtn')) return;
  openProfileModal();
});
document.getElementById('profileCancelBtn').addEventListener('click', closeProfileModal);
profileModalOverlay.addEventListener('click', e => { if (e.target === profileModalOverlay) closeProfileModal(); });
profileAvatarUrl.addEventListener('input', updateProfilePreview);

profileSaveBtn.addEventListener('click', async () => {
  profileErr.textContent     = '';
  profileSuccess.textContent = '';

  const payload = {
    username:  profileUsername.value.trim(),
    avatarUrl: profileAvatarUrl.value.trim(),
  };

  if (profileNewPassword.value) {
    payload.newPassword     = profileNewPassword.value;
    payload.currentPassword = profileCurrentPassword.value;
  }

  profileSaveBtn.disabled    = true;
  profileSaveBtn.textContent = 'Salvando...';

  try {
    const data = await api('PUT', '/auth/profile', payload);
    currentUser = { ...currentUser, ...data.user };
    updateAvatarUI(currentUser);
    profileSuccess.textContent   = 'Perfil atualizado com sucesso!';
    profileCurrentPassword.value = '';
    profileNewPassword.value     = '';
  } catch (err) {
    profileErr.textContent = err.message;
  } finally {
    profileSaveBtn.disabled    = false;
    profileSaveBtn.textContent = 'Salvar alterações';
  }
});
