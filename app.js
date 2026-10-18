'use strict';

const STORAGE_KEYS = {
  users: 'violettech.users.v1',
  session: 'violettech.session.v1',
  theme: 'violettech.theme.v1',
  movementsPrefix: 'violettech.movements.v1:'
};
const CATEGORY_OPTIONS = {
  Ingreso: ['Salario', 'Ventas', 'Servicios', 'Honorarios', 'Otros ingresos'],
  Egreso: ['Alquiler', 'Servicios', 'Insumos', 'Transporte', 'Mantenimiento', 'Comida', 'Otros egresos']
};
const CATEGORY_SYMBOLS = {
  Salario: '＄', Ventas: '↗', Servicios: '⌁', Honorarios: '＄', 'Otros ingresos': '＋',
  Alquiler: '⌂', Insumos: '▤', Transporte: '↗', Mantenimiento: '⚙', Comida: '◇', 'Otros egresos': '−'
};
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const authView = $('#authView');
const appView = $('#appView');
const toastRegion = $('#toastRegion');
let activeUser = null;
let currentPage = 'home';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (error) {
    console.warn(`No se pudo leer ${key}`, error);
    return fallback;
  }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (error) { console.warn(`No se pudo guardar ${key}`, error); showToast('No se pudieron guardar los datos', 'El almacenamiento local podría estar lleno o deshabilitado.', 'error'); return false; }
}
function getUsers() { const value = readJSON(STORAGE_KEYS.users, []); return Array.isArray(value) ? value : []; }
function setUsers(users) { return writeJSON(STORAGE_KEYS.users, users); }
function userStorageId(user) { return String(user?.email || '').trim().toLowerCase(); }
function findUser(identifier) {
  const value = String(identifier || '').trim().toLocaleLowerCase('es-AR');
  return getUsers().find((user) => userStorageId(user) === value || String(user.username || '').toLocaleLowerCase('es-AR') === value) || null;
}
function movementStorageKey(user = activeUser) { return `${STORAGE_KEYS.movementsPrefix}${userStorageId(user)}`; }
function getMovements(user = activeUser) {
  if (!user) return [];
  const value = readJSON(movementStorageKey(user), []);
  return Array.isArray(value) ? value : [];
}
function setMovements(movements, user = activeUser) { return user ? writeJSON(movementStorageKey(user), movements) : false; }
function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function formatDate(value) {
  if (!value) return '—';
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return escapeHTML(value);
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(parts[0], parts[1] - 1, parts[2]));
}
function formatCurrency(value) { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(value) || 0); }
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  if (window.crypto?.subtle) {
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  // Compatibilidad para el prototipo: no usar este fallback en una aplicación productiva.
  let hash = 2166136261;
  for (const byte of data) hash = Math.imul(hash ^ byte, 16777619);
  return `local-fallback-${(hash >>> 0).toString(16)}`;
}
function passwordRules(password) {
  return {
    length: password.length >= 8,
    upper: /[A-ZÁÉÍÓÚÜÑ]/.test(password),
    lower: /[a-záéíóúüñ]/.test(password),
    digit: /\d/.test(password),
    special: /[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/.test(password)
  };
}
function passwordIsValid(password) { return Object.values(passwordRules(password)).every(Boolean); }
function showToast(title, message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast${type === 'error' ? ' error' : ''}`;
  toast.innerHTML = `<span class="toast-icon" aria-hidden="true">${type === 'error' ? '!' : '✓'}</span><div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(message)}</p></div>`;
  toastRegion.appendChild(toast);
  window.setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-7px)'; window.setTimeout(() => toast.remove(), 220); }, 3400);
}
function clearErrors() {
  $$('.form-error, .field-error').forEach((element) => { element.textContent = ''; });
  $$('[aria-invalid="true"]').forEach((element) => element.removeAttribute('aria-invalid'));
}
function setFieldError(id, errorId, message) {
  const field = document.getElementById(id);
  const error = document.getElementById(errorId);
  if (field) field.setAttribute('aria-invalid', 'true');
  if (error) error.textContent = message;
}
function showAuthPanel(panel) {
  clearErrors();
  const panels = { login: '#loginPanel', register: '#registerPanel', reset: '#resetPanel' };
  Object.entries(panels).forEach(([name, selector]) => { $(selector).hidden = name !== panel; });
  const firstField = { login: '#loginIdentifier', register: '#registerName', reset: '#resetIdentifier' }[panel];
  if (firstField) $(firstField).focus({ preventScroll: true });
}
function showAuth() {
  activeUser = null;
  appView.hidden = true;
  authView.hidden = false;
  $('#loginForm').reset();
  $('#registerForm').reset();
  $('#resetForm').reset();
  updatePasswordRuleDisplay('', 'passwordRules', 'data-rule');
  updatePasswordRuleDisplay('', 'resetPasswordRules', 'data-reset-rule');
  showAuthPanel('login');
}
function setTheme(theme, announce = false) {
  const safeTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = safeTheme;
  document.documentElement.dataset.theme = safeTheme;
  try { localStorage.setItem(STORAGE_KEYS.theme, safeTheme); } catch (error) { /* El tema sigue aplicado durante esta sesión. */ }
  const dark = safeTheme === 'dark';
  $('#themeIcon').textContent = dark ? '☾' : '☼';
  $('#themeToggle').setAttribute('aria-label', dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
  $('#themeToggle').title = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  if (announce) showToast('Tema actualizado', dark ? 'Activaste el tema oscuro.' : 'Activaste el tema claro.');
}
function initials(value) {
  const parts = String(value).trim().split(/[\s.@_-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || 'V').slice(0, 2)).toUpperCase();
}
function setActiveUser(user) {
  activeUser = user;
  try { localStorage.setItem(STORAGE_KEYS.session, userStorageId(user)); } catch (error) { /* Puede seguir en esta pestaña. */ }
  authView.hidden = true;
  appView.hidden = false;
  $('#welcomeName').textContent = user.name || user.username || 'Usuario';
  $('#sidebarName').textContent = user.name || user.username || 'Usuario';
  $('#sidebarEmail').textContent = user.email;
  $('#sidebarAvatar').textContent = initials(user.name || user.username || user.email);
  $('#topbarAvatar').textContent = initials(user.name || user.username || user.email);
  $('#todayLabel').textContent = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
  renderAll();
  navigateTo('home');
}
function navigateTo(page) {
  currentPage = ['home', 'movements', 'form'].includes(page) ? page : 'home';
  $('#homePage').hidden = currentPage !== 'home';
  $('#movementsPage').hidden = currentPage !== 'movements';
  $('#formPage').hidden = currentPage !== 'form';
  $$('.nav-item[data-route]').forEach((button) => button.classList.toggle('active', button.dataset.route === (currentPage === 'form' ? 'movements' : currentPage)));
  $('#topbarTitle').textContent = currentPage === 'home' ? 'Inicio' : currentPage === 'form' ? 'Registrar movimiento' : 'Movimientos';
  $('#sidebar').classList.remove('open');
  if (currentPage === 'form') prepareMovementForm();
  if (currentPage === 'movements') renderAllMovements();
  if (currentPage === 'home') renderRecentMovements();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderAll() { renderRecentMovements(); renderAllMovements(); }
function emptyState() {
  return `<div class="empty-state"><div class="empty-state-icon" aria-hidden="true">＋</div><h3>Todavía no hay movimientos</h3><p>Cuando registres un ingreso o egreso, aparecerá acá para que puedas consultarlo fácilmente.</p><button type="button" class="button button-primary" data-action="new-movement">Registrar primer movimiento</button></div>`;
}
function sortMovements(movements) { return [...movements].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0)); }
function renderMovementTable(movements, limit = null) {
  const selected = limit ? movements.slice(0, limit) : movements;
  if (!selected.length) return emptyState();
  const rows = selected.map((movement) => {
    const isIncome = movement.type === 'Ingreso';
    const icon = CATEGORY_SYMBOLS[movement.category] || (isIncome ? '↗' : '↘');
    return `<tr><td class="movement-date">${formatDate(movement.date)}</td><td><span class="type-pill ${isIncome ? 'income' : 'expense'}">${isIncome ? '↑' : '↓'} ${escapeHTML(movement.type)}</span></td><td><span class="movement-category"><span class="category-icon" aria-hidden="true">${escapeHTML(icon)}</span>${escapeHTML(movement.category)}</span></td><td class="table-description">${movement.details ? escapeHTML(movement.details) : '—'}</td><td class="${isIncome ? 'amount-income' : 'amount-expense'}">${isIncome ? '+' : '−'} ${formatCurrency(movement.amount)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="movements-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Detalle</th><th>Monto</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderRecentMovements() {
  const container = $('#recentMovements');
  if (container && activeUser) container.innerHTML = renderMovementTable(sortMovements(getMovements()), 5);
}
function renderAllMovements() {
  const container = $('#allMovements');
  if (!container || !activeUser) return;
  const query = ($('#movementSearch')?.value || '').trim().toLocaleLowerCase('es-AR');
  const type = $('#typeFilter')?.value || 'all';
  let movements = sortMovements(getMovements());
  if (type !== 'all') movements = movements.filter((movement) => movement.type === type);
  if (query) movements = movements.filter((movement) => [movement.date, formatDate(movement.date), movement.type, movement.category, movement.details].some((value) => String(value || '').toLocaleLowerCase('es-AR').includes(query)));
  container.innerHTML = renderMovementTable(movements);
  if (getMovements().length && !movements.length) container.innerHTML = `<div class="empty-state"><div class="empty-state-icon" aria-hidden="true">⌕</div><h3>No encontramos resultados</h3><p>Probá con otra palabra o cambiá el filtro seleccionado.</p><button type="button" class="button button-secondary" data-action="clear-filters">Limpiar filtros</button></div>`;
}
function setCategoryOptions(type, selectedValue = '') {
  const select = $('#movementCategory');
  const categories = CATEGORY_OPTIONS[type] || [];
  select.innerHTML = '<option value="">Seleccionar categoría</option>' + categories.map((category) => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');
  if (categories.includes(selectedValue)) select.value = selectedValue;
}
function currentMovementType() { return $('input[name="movementType"]:checked')?.value || 'Ingreso'; }
function updateTypeChoiceStyle() {
  const type = currentMovementType();
  $('#incomeOption').classList.toggle('selected', type === 'Ingreso');
  $('#expenseOption').classList.toggle('selected', type === 'Egreso');
  setCategoryOptions(type, $('#movementCategory').value);
}
function prepareMovementForm() {
  $('#movementForm').reset();
  $('#movementDate').max = localDateString();
  $('#movementDate').value = localDateString();
  $('#detailsCounter').textContent = '0/180';
  clearErrors();
  $('#movementFormError').textContent = '';
  setCategoryOptions(currentMovementType());
  updateTypeChoiceStyle();
}
function validateMovementForm() {
  clearErrors();
  const type = currentMovementType();
  const amountText = $('#movementAmount').value.trim();
  const amount = Number(amountText);
  const category = $('#movementCategory').value;
  const date = $('#movementDate').value;
  let valid = true;
  if (!amountText || !Number.isFinite(amount) || amount <= 0) { setFieldError('movementAmount', 'amountError', 'Ingresá un monto válido mayor que cero.'); valid = false; }
  if (!category || !(CATEGORY_OPTIONS[type] || []).includes(category)) { setFieldError('movementCategory', 'categoryError', 'Seleccioná una categoría válida.'); valid = false; }
  if (!date) { setFieldError('movementDate', 'dateError', 'Seleccioná una fecha.'); valid = false; }
  else if (date > localDateString()) { setFieldError('movementDate', 'dateError', 'La fecha no puede ser posterior al día de hoy.'); valid = false; }
  return { valid, type, amount, category, date };
}
function updatePasswordRuleDisplay(password, containerId = 'passwordRules', attribute = 'data-rule') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rules = passwordRules(password);
  $$(`[${attribute}]`, container).forEach((item) => {
    const valid = rules[item.getAttribute(attribute)];
    item.classList.toggle('valid', valid);
    const icon = $('i', item);
    if (icon) icon.textContent = valid ? '✓' : '○';
  });
}
function restoreLocalSession() {
  let email = null;
  try { email = localStorage.getItem(STORAGE_KEYS.session); } catch (error) { /* Sin almacenamiento, queda en login. */ }
  if (!email) return false;
  const user = getUsers().find((item) => userStorageId(item) === email);
  if (!user) return false;
  setActiveUser(user);
  return true;
}

// Navegación entre inicio de sesión, registro y recuperación de contraseña.
$$('[data-auth-switch]').forEach((button) => button.addEventListener('click', () => {
  const target = button.dataset.authSwitch;
  if (target === 'reset') {
    $('#resetForm').reset();
    $('#resetIdentifier').value = $('#loginIdentifier').value.trim();
    updatePasswordRuleDisplay('', 'resetPasswordRules', 'data-reset-rule');
  }
  showAuthPanel(target);
}));
$$('[data-toggle-password]').forEach((button) => button.addEventListener('click', () => {
  const field = document.getElementById(button.dataset.togglePassword);
  if (!field) return;
  const show = field.type === 'password';
  field.type = show ? 'text' : 'password';
  button.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  button.title = show ? 'Ocultar contraseña' : 'Mostrar contraseña';
  button.classList.toggle('is-visible', show);
}));
$('#registerPassword').addEventListener('input', (event) => updatePasswordRuleDisplay(event.target.value));
$('#resetPassword').addEventListener('input', (event) => updatePasswordRuleDisplay(event.target.value, 'resetPasswordRules', 'data-reset-rule'));

$('#registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  const name = $('#registerName').value.trim();
  const email = $('#registerEmail').value.trim().toLowerCase();
  const password = $('#registerPassword').value;
  const confirm = $('#registerConfirm').value;
  let valid = true;
  if (name.length < 2) { setFieldError('registerName', 'registerError', 'Ingresá un nombre de usuario de al menos 2 caracteres.'); valid = false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError('registerEmail', 'registerError', 'Ingresá un email válido.'); valid = false; }
  if (!passwordIsValid(password)) { $('#registerError').textContent = 'La contraseña todavía no cumple todos los requisitos.'; $('#registerPassword').setAttribute('aria-invalid', 'true'); valid = false; }
  if (password !== confirm) { $('#registerError').textContent = 'Las contraseñas no coinciden.'; $('#registerConfirm').setAttribute('aria-invalid', 'true'); valid = false; }
  if (!valid) return;
  const users = getUsers();
  if (users.some((user) => userStorageId(user) === email || String(user.username || '').toLocaleLowerCase('es-AR') === name.toLocaleLowerCase('es-AR'))) {
    $('#registerError').textContent = 'Ya existe una cuenta con ese email o nombre de usuario.';
    $('#registerEmail').setAttribute('aria-invalid', 'true');
    return;
  }
  const user = { name, username: name, email, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
  users.push(user);
  if (!setUsers(users)) return;

  // Registro y acceso son pasos separados: no iniciar sesión automáticamente.
  $('#registerForm').reset();
  updatePasswordRuleDisplay('');
  $('#loginForm').reset();
  $('#loginIdentifier').value = email;
  showAuthPanel('login');
  showToast('¡Cuenta creada!', 'Ahora iniciá sesión con tu usuario o email y la contraseña que elegiste.');
});

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  const identifier = $('#loginIdentifier').value.trim();
  const password = $('#loginPassword').value;
  if (!identifier || !password) { $('#loginError').textContent = 'Completá el usuario o email y la contraseña.'; return; }
  const user = findUser(identifier);
  const passwordHash = await hashPassword(password);
  if (!user || user.passwordHash !== passwordHash) {
    $('#loginError').textContent = 'El usuario o la contraseña no son correctos.';
    $('#loginPassword').setAttribute('aria-invalid', 'true');
    return;
  }
  setActiveUser(user);
  showToast('¡Bienvenido/a!', 'Iniciaste sesión correctamente.');
});

$('#resetForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  const identifier = $('#resetIdentifier').value.trim();
  const password = $('#resetPassword').value;
  const confirm = $('#resetConfirm').value;
  let valid = true;
  if (!identifier) { setFieldError('resetIdentifier', 'resetError', 'Ingresá tu usuario o email.'); valid = false; }
  if (!passwordIsValid(password)) { $('#resetError').textContent = 'La contraseña nueva no cumple todos los requisitos.'; $('#resetPassword').setAttribute('aria-invalid', 'true'); valid = false; }
  if (password !== confirm) { $('#resetError').textContent = 'Las contraseñas no coinciden.'; $('#resetConfirm').setAttribute('aria-invalid', 'true'); valid = false; }
  if (!valid) return;
  const users = getUsers();
  const index = users.findIndex((user) => userStorageId(user) === identifier.toLowerCase() || String(user.username || '').toLocaleLowerCase('es-AR') === identifier.toLocaleLowerCase('es-AR'));
  if (index < 0) { $('#resetError').textContent = 'No encontramos una cuenta con ese usuario o email.'; $('#resetIdentifier').setAttribute('aria-invalid', 'true'); return; }
  users[index].passwordHash = await hashPassword(password);
  users[index].passwordUpdatedAt = new Date().toISOString();
  if (!setUsers(users)) return;
  $('#resetForm').reset();
  updatePasswordRuleDisplay('', 'resetPasswordRules', 'data-reset-rule');
  $('#loginForm').reset();
  $('#loginIdentifier').value = users[index].email;
  showAuthPanel('login');
  showToast('Contraseña actualizada', 'Ya podés iniciar sesión con tu contraseña nueva.');
});

// Eventos de navegación del prototipo.
document.addEventListener('click', (event) => {
  const routeButton = event.target.closest('[data-route]');
  if (routeButton && activeUser) { event.preventDefault(); navigateTo(routeButton.dataset.route); return; }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === 'new-movement') navigateTo('form');
  if (action === 'cancel-movement') navigateTo('movements');
  if (action === 'logout') {
    try { localStorage.removeItem(STORAGE_KEYS.session); } catch (error) { /* Continuar a la pantalla de acceso. */ }
    showAuth();
    showToast('Sesión cerrada', 'Podés volver a ingresar cuando quieras.');
  }
  if (action === 'clear-filters') { $('#movementSearch').value = ''; $('#typeFilter').value = 'all'; renderAllMovements(); }
});
$('#themeToggle').addEventListener('click', () => setTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark', true));
$('#movementSearch').addEventListener('input', renderAllMovements);
$('#typeFilter').addEventListener('change', renderAllMovements);
$('#mobileMenuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
document.addEventListener('click', (event) => {
  const sidebar = $('#sidebar');
  if (window.innerWidth <= 760 && sidebar.classList.contains('open') && !sidebar.contains(event.target) && !event.target.closest('#mobileMenuButton')) sidebar.classList.remove('open');
});
$$('input[name="movementType"]').forEach((input) => input.addEventListener('change', updateTypeChoiceStyle));
$('#movementDetails').addEventListener('input', (event) => { $('#detailsCounter').textContent = `${event.target.value.length}/180`; });
$('#movementDate').addEventListener('change', () => {
  if ($('#movementDate').value && $('#movementDate').value > localDateString()) setFieldError('movementDate', 'dateError', 'La fecha no puede ser posterior al día de hoy.');
  else $('#dateError').textContent = '';
});
$('#movementForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!activeUser) { showAuth(); return; }
  const result = validateMovementForm();
  if (!result.valid) { $('#movementFormError').textContent = 'Revisá los campos señalados antes de guardar.'; return; }
  const movement = {
    id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `move-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: result.type, amount: Math.round(result.amount * 100) / 100, category: result.category,
    date: result.date, details: $('#movementDetails').value.trim(), createdAt: Date.now()
  };
  const movements = getMovements();
  movements.push(movement);
  if (!setMovements(movements)) return;
  navigateTo('movements');
  showToast('Movimiento guardado', `${movement.type} registrado correctamente.`);
});

(function init() {
  let theme = 'light';
  try { theme = localStorage.getItem(STORAGE_KEYS.theme) || 'light'; } catch (error) { /* Tema claro predeterminado. */ }
  setTheme(theme);
  $('#movementDate').max = localDateString();
  setCategoryOptions('Ingreso');
  if (!restoreLocalSession()) {
    try { localStorage.removeItem(STORAGE_KEYS.session); } catch (error) { /* Ignorar almacenamiento no disponible. */ }
    showAuthPanel('login');
  }
})();
