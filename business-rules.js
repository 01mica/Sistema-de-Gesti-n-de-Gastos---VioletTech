'use strict';

/*
 * VioletTech - reglas de negocio del Sprint 3.
 * Este archivo se carga después de app.js y extiende el MVP sin reemplazar
 * sus funciones de autenticación, categorías, validaciones ni almacenamiento base.
 * Los datos siguen siendo locales al navegador (prototipo académico).
 */

const VT_KEYS = {
  movements: 'violettech.movements.shared.v2',
  previousMovements: 'violettech.movements.shared.v1',
  audit: 'violettech.audit.v2'
};
const VT_CLINICS = [
  { id: 'sede-1', name: 'Sede 1' },
  { id: 'sede-2', name: 'Sede 2' },
  { id: 'sede-3', name: 'Sede 3' }
];
const VT_MAX_FILE_SIZE = 2 * 1024 * 1024;
const VT_LEGACY_CLINICS_KEY = 'violettech.clinics.v1';
const VT_LEGACY_AUDIT_KEY = 'violettech.audit.v1';
const VT_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'];
const VT_PAGE_IDS = ['homePage', 'movementsPage', 'formPage', 'clinicsPage', 'reportsPage', 'auditPage'];
const vtBaseSetActiveUser = setActiveUser;
const vtBaseShowAuth = showAuth;
const vtBasePrepareMovementForm = prepareMovementForm;
let vtSelectedClinicId = null;
let vtReceiptPreviewUrl = null;
let vtReportCache = [];

function vtRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (error) {
    console.warn(`No se pudo leer ${key}`, error);
    return fallback;
  }
}
function vtWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`No se pudo guardar ${key}`, error);
    showToast('No se pudieron guardar los datos', 'El almacenamiento local podría estar lleno. Probá con un archivo más pequeño.', 'error');
    return false;
  }
}
function vtRole(user = activeUser) {
  return ['admin', 'loader', 'doctor'].includes(user?.role) ? user.role : 'loader';
}
function vtRoleName(role = vtRole()) {
  return ({ admin: 'Administradora', loader: 'Encargada', doctor: 'Médico' })[role] || 'Usuario';
}
function vtClinicName(id) {
  return VT_CLINICS.find((clinic) => clinic.id === id)?.name || 'Sede sin asignar';
}
function vtNormalizeClinicId(id, fallback = 'sede-1') {
  if (VT_CLINICS.some((clinic) => clinic.id === id)) return id;
  if (id === 'sede-central' || id === 'clinica-central') return 'sede-1';
  if (id === 'sede-norte' || id === 'clinica-norte') return 'sede-2';
  if (id === 'sede-sur' || id === 'clinica-sur') return 'sede-3';
  // Si la versión previa tenía sedes con nombres personalizados, conservar su
  // correspondencia por orden al migrar al esquema fijo de tres sedes.
  const legacyClinics = vtRead(VT_LEGACY_CLINICS_KEY, []);
  if (Array.isArray(legacyClinics)) {
    const legacyIndex = legacyClinics.findIndex((clinic) => clinic?.id === id);
    if (legacyIndex >= 0 && VT_CLINICS[legacyIndex]) return VT_CLINICS[legacyIndex].id;
  }
  return fallback;
}
function vtNormalizeUsers() {
  const users = getUsers();
  let changed = false;
  let adminAssigned = false;
  users.forEach((user, index) => {
    if (!['admin', 'loader', 'doctor'].includes(user.role)) {
      user.role = index === 0 && !adminAssigned ? 'admin' : 'loader';
      changed = true;
    }
    if (user.role === 'admin') {
      if (adminAssigned) {
        user.role = 'loader';
        changed = true;
      } else {
        adminAssigned = true;
        if (user.clinicId) {
          delete user.clinicId;
          changed = true;
        }
      }
    }
    if (user.role === 'loader' || user.role === 'doctor') {
      const clinicId = vtNormalizeClinicId(user.clinicId, 'sede-1');
      if (user.clinicId !== clinicId) {
        user.clinicId = clinicId;
        changed = true;
      }
    }
  });
  if (changed) setUsers(users);
  return users;
}
function vtAdminExists() {
  return vtNormalizeUsers().some((user) => user.role === 'admin');
}
function vtGetMovements() {
  const list = vtRead(VT_KEYS.movements, []);
  return Array.isArray(list) ? list : [];
}
function vtSaveMovements(list) {
  return vtWrite(VT_KEYS.movements, list);
}
function vtGetAudit() {
  const list = vtRead(VT_KEYS.audit, []);
  return Array.isArray(list) ? list : [];
}
function vtSaveAudit(list) {
  // Los registros nuevos se insertan al principio: conservar los 1000 más recientes.
  return vtWrite(VT_KEYS.audit, list.slice(0, 1000));
}
function vtLog(action, description, movementId = '', clinicId = '') {
  const log = {
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    user: activeUser?.name || activeUser?.username || 'Usuario',
    email: activeUser?.email || '',
    role: vtRole(),
    action,
    description,
    movementId,
    clinicId,
    clinicName: clinicId ? vtClinicName(clinicId) : '',
    date: new Date().toISOString()
  };
  const list = vtGetAudit();
  list.unshift(log);
  vtSaveAudit(list);
}
function vtMigrateLegacyData() {
  const users = vtNormalizeUsers();
  const currentShared = vtGetMovements();
  const oldShared = vtRead(VT_KEYS.previousMovements, []);
  let list = [];

  users.forEach((user) => {
    getMovements(user).forEach((movement) => {
      list.push({
        ...movement,
        clinicId: vtNormalizeClinicId(movement.clinicId, user.clinicId || 'sede-1'),
        createdBy: movement.createdBy || user.name || user.username || user.email,
        createdByEmail: movement.createdByEmail || userStorageId(user),
        status: movement.status || 'Cargado',
        observations: Array.isArray(movement.observations) ? movement.observations : []
      });
    });
  });
  if (Array.isArray(oldShared)) list = list.concat(oldShared);
  // La versión compartida más nueva tiene prioridad sobre copias locales antiguas.
  list = list.concat(currentShared);

  const unique = new Map();
  list.forEach((movement) => {
    if (!movement || !movement.id) return;
    const owner = users.find((user) => userStorageId(user) === movement.createdByEmail);
    const clinicId = vtNormalizeClinicId(movement.clinicId, owner?.clinicId || 'sede-1');
    unique.set(String(movement.id), {
      ...movement,
      clinicId,
      status: ['Cargado', 'En revisión', 'Validado'].includes(movement.status) ? movement.status : 'Cargado',
      createdBy: movement.createdBy || owner?.name || owner?.username || 'Usuario',
      createdByEmail: movement.createdByEmail || userStorageId(owner),
      observations: Array.isArray(movement.observations) ? movement.observations : []
    });
  });
  vtSaveMovements([...unique.values()]);
}
function vtMigrateLegacyAudit() {
  const legacy = vtRead(VT_LEGACY_AUDIT_KEY, []);
  const current = vtGetAudit();
  if (!Array.isArray(legacy) || !legacy.length) return;
  const byId = new Map();
  [...legacy, ...current].forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const id = entry.id || `legacy-audit-${entry.date || 'sin-fecha'}-${index}`;
    const clinicId = entry.clinicId ? vtNormalizeClinicId(entry.clinicId) : '';
    byId.set(String(id), {
      ...entry,
      id: String(id),
      clinicId,
      clinicName: clinicId ? vtClinicName(clinicId) : (entry.clinicName || '')
    });
  });
  vtSaveAudit([...byId.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))));
}
function vtMovementIsAccessible(movement) {
  if (!movement || !activeUser) return false;
  if (vtRole() === 'admin') return true;
  return movement.clinicId === vtNormalizeClinicId(activeUser.clinicId, 'sede-1');
}

function vtScopedMovements() {
  let list = vtGetMovements();
  const role = vtRole();
  if (role === 'loader' || role === 'doctor') {
    const assignedClinic = vtNormalizeClinicId(activeUser?.clinicId, 'sede-1');
    list = list.filter((movement) => movement.clinicId === assignedClinic);
  } else if (vtSelectedClinicId && vtSelectedClinicId !== 'all') {
    list = list.filter((movement) => movement.clinicId === vtSelectedClinicId);
  }
  return sortMovements(list);
}
function vtIsAllowed(page) {
  const role = vtRole();
  if (role === 'admin') return ['home', 'clinics', 'movements', 'form', 'reports', 'audit'].includes(page);
  if (role === 'loader') return ['movements', 'form'].includes(page);
  return page === 'movements';
}
function vtSetRoleVisibility() {
  const role = vtRole();
  $$('[data-role-visible]').forEach((element) => {
    element.hidden = element.dataset.roleVisible !== role;
  });
  const roleLabel = $('#activeRoleLabel');
  if (roleLabel) roleLabel.textContent = vtRoleName(role);
  const homeNav = $('[data-route="home"]');
  if (homeNav) homeNav.hidden = role !== 'admin';
  const clinicNav = $('[data-extension-route="clinics"]');
  if (clinicNav) clinicNav.hidden = role !== 'admin';
  const reportNav = $('[data-extension-route="reports"]');
  if (reportNav) reportNav.hidden = role !== 'admin';
  const auditNav = $('[data-extension-route="audit"]');
  if (auditNav) auditNav.hidden = role !== 'admin';
  const registerButton = $('#movementRegisterButton');
  if (registerButton) registerButton.hidden = role === 'doctor';
  const registerWelcome = $('#homePage [data-action="new-movement"]');
  if (registerWelcome) registerWelcome.hidden = role === 'doctor';
}
function vtRenderClinicCards() {
  const markup = VT_CLINICS.map((clinic) => `
    <button type="button" class="clinic-card" data-select-clinic="${clinic.id}">
      <span class="clinic-card-icon" aria-hidden="true">▦</span>
      <span class="clinic-card-copy"><strong>${clinic.name}</strong><small>Abrir movimientos de esta sede</small></span>
      <span class="clinic-card-arrow" aria-hidden="true">→</span>
    </button>`).join('');
  const homeCards = $('#homeClinicCards');
  const pageCards = $('#clinicPageCards');
  if (homeCards) homeCards.innerHTML = markup;
  if (pageCards) pageCards.innerHTML = markup;
}
function vtPageTitle(page) {
  return ({ home: 'Inicio', clinics: 'Clínicas', movements: 'Movimientos', form: 'Registrar movimiento', reports: 'Métricas y balances', audit: 'Auditoría' })[page] || 'Inicio';
}
function vtNavigate(page) {
  if (!activeUser) return;
  // El logotipo lleva a la pantalla principal del rol; para no-admin esa pantalla es Movimientos.
  if (page === 'home' && vtRole() !== 'admin') page = 'movements';
  if (!vtIsAllowed(page)) {
    showToast('Acceso no disponible', 'Esta opción no está habilitada para el rol de tu cuenta.', 'error');
    page = vtRole() === 'admin' ? 'home' : 'movements';
  }
  if (page === 'form' && vtRole() === 'doctor') page = 'movements';

  currentPage = page;
  VT_PAGE_IDS.forEach((id) => {
    const section = document.getElementById(id);
    if (section) section.hidden = id !== `${page}Page`;
  });
  $$('.nav-item').forEach((button) => {
    const isActive = button.dataset.route === page || button.dataset.extensionRoute === page;
    button.classList.toggle('active', Boolean(isActive));
  });
  $('#topbarTitle').textContent = vtPageTitle(page);
  $('#sidebar')?.classList.remove('open');
  vtSetRoleVisibility();

  if (page === 'home') renderRecentMovements();
  if (page === 'reports') {
    const reportClinic = $('#reportClinicFilter');
    if (reportClinic) reportClinic.value = vtSelectedClinicId && vtSelectedClinicId !== 'all' ? vtSelectedClinicId : 'all';
  }
  if (page === 'movements') {
    renderAllMovements();
    vtUpdateMovementsHeading();
  }
  if (page === 'form') vtPrepareMovementForm();
  if (page === 'clinics') vtRenderClinicCards();
  if (page === 'reports') vtRenderReports();
  if (page === 'audit') vtRenderAudit();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function vtUpdateMovementsHeading() {
  const role = vtRole();
  const title = $('#movementsHeading');
  const subtitle = $('#movementsSubtitle');
  const exitButton = $('#clinicExitButton');
  const banner = $('#currentClinicBanner');
  const scopedName = vtSelectedClinicId && vtSelectedClinicId !== 'all' ? vtClinicName(vtSelectedClinicId) : '';
  if (title) title.textContent = scopedName ? `Movimientos · ${scopedName}` : 'Movimientos';
  if (subtitle) {
    subtitle.textContent = role === 'doctor'
      ? `Consulta de solo lectura · ${vtClinicName(activeUser?.clinicId)}`
      : role === 'loader'
        ? `Movimientos registrados en ${vtClinicName(activeUser?.clinicId)}.`
        : scopedName ? `Registros correspondientes a ${scopedName}.` : 'Consultá los movimientos de todas las sedes.';
  }
  if (exitButton) exitButton.hidden = !(role === 'admin' && scopedName);
  if (banner) {
    banner.hidden = !scopedName;
    banner.textContent = scopedName ? `Estás consultando ${scopedName}. Los movimientos y reportes se limitarán a esta sede.` : '';
  }
  const pdfButton = $('#movementsPdfButton');
  if (pdfButton) pdfButton.hidden = role === 'doctor';
}
function vtRenderEmpty(text, subtext = '') {
  return `<div class="empty-state"><div class="empty-state-icon" aria-hidden="true">≡</div><h3>${escapeHTML(text)}</h3><p>${escapeHTML(subtext)}</p></div>`;
}
function vtMovementTable(movements, recent = false) {
  if (!movements.length) return vtRenderEmpty('Todavía no hay movimientos', 'Los movimientos registrados para esta sede aparecerán acá.');
  const role = vtRole();
  const rows = (recent ? movements.slice(0, 5) : movements).map((movement) => {
    const income = movement.type === 'Ingreso';
    const hasReceipt = Boolean(movement.receiptData && movement.receiptName);
    const receiptActions = hasReceipt && role !== 'doctor'
      ? `<div class="movement-file-actions"><button type="button" class="small-button" data-view-receipt="${escapeHTML(movement.id)}">Ver comprobante</button><button type="button" class="small-button" data-download-receipt="${escapeHTML(movement.id)}">Descargar</button></div>`
      : '<span class="muted-inline">—</span>';
    const clinicCell = role === 'admin' ? `<td>${escapeHTML(vtClinicName(movement.clinicId))}</td>` : '';
    return `<tr>
      <td class="movement-date">${formatDate(movement.date)}</td>
      <td><span class="type-pill ${income ? 'income' : 'expense'}">${income ? '↑' : '↓'} ${escapeHTML(movement.type)}</span></td>
      ${clinicCell}
      <td><span class="movement-category">${escapeHTML(movement.category || 'Sin categoría')}</span></td>
      <td class="table-description">${escapeHTML(movement.details || '—')}<small class="movement-creator">Registró: ${escapeHTML(movement.createdBy || 'Usuario')}</small></td>
      <td>${vtStatusBadge(movement.status)}</td>
      <td class="${income ? 'amount-income' : 'amount-expense'}">${income ? '+' : '−'} ${formatCurrency(movement.amount)}</td>
      ${role !== 'doctor' ? `<td>${receiptActions}</td>` : ''}
    </tr>`;
  }).join('');
  const clinicHeader = role === 'admin' ? '<th>Sede</th>' : '';
  const receiptHeader = role !== 'doctor' ? '<th>Comprobante</th>' : '';
  return `<div class="table-wrap"><table class="movements-table business-movements-table"><thead><tr><th>Fecha</th><th>Tipo</th>${clinicHeader}<th>Categoría</th><th>Detalle</th><th>Estado</th><th>Monto</th>${receiptHeader}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function vtStatusBadge(status) {
  const safe = ['Cargado', 'En revisión', 'Validado'].includes(status) ? status : 'Cargado';
  const cssClass = safe === 'Validado' ? 'validated' : safe === 'En revisión' ? 'review' : 'loaded';
  return `<span class="status-pill ${cssClass}">${safe}</span>`;
}
function renderRecentMovements() {
  const container = $('#recentMovements');
  if (!container || !activeUser) return;
  container.innerHTML = vtMovementTable(vtScopedMovements(), true);
  const caption = $('#recentMovementsCaption');
  if (caption) {
    caption.textContent = vtSelectedClinicId && vtSelectedClinicId !== 'all'
      ? `Últimas operaciones de ${vtClinicName(vtSelectedClinicId)}.`
      : 'Últimas operaciones de todas las sedes.';
  }
}
function renderAllMovements() {
  const container = $('#allMovements');
  if (!container || !activeUser) return;
  let movements = vtScopedMovements();
  const query = ($('#movementSearch')?.value || '').trim().toLocaleLowerCase('es-AR');
  const type = $('#typeFilter')?.value || 'all';
  if (type !== 'all') movements = movements.filter((movement) => movement.type === type);
  if (query) movements = movements.filter((movement) => [movement.date, formatDate(movement.date), movement.type, movement.category, movement.details, movement.createdBy, vtClinicName(movement.clinicId)].some((value) => String(value || '').toLocaleLowerCase('es-AR').includes(query)));
  container.innerHTML = vtMovementTable(movements);
  vtUpdateMovementsHeading();
}
function renderAll() {
  renderRecentMovements();
  renderAllMovements();
  vtRenderClinicCards();
}
function vtPrepareMovementForm() {
  if (vtRole() === 'doctor') return;
  vtBasePrepareMovementForm();
  const role = vtRole();
  const adminWrap = $('#adminMovementClinicWrap');
  const assignedWrap = $('#assignedClinicWrap');
  const clinicSelect = $('#movementClinic');
  if (adminWrap) adminWrap.hidden = role !== 'admin';
  if (assignedWrap) assignedWrap.hidden = role !== 'loader';
  if (role === 'admin' && clinicSelect) {
    clinicSelect.value = vtSelectedClinicId && vtSelectedClinicId !== 'all' ? vtSelectedClinicId : '';
  }
  if (role === 'loader') $('#assignedClinicValue').textContent = vtClinicName(activeUser?.clinicId);
  $$('input[name="receiptChoice"]').forEach((radio) => { radio.checked = radio.value === 'no'; });
  $('#receiptUploadWrap').hidden = true;
  $('#movementReceipt').value = '';
  $('#receiptError').textContent = '';
  $('#movementFormError').textContent = '';
}
function vtReceiptSelected() {
  return $('input[name="receiptChoice"]:checked')?.value === 'yes';
}
function vtReadFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}
function vtValidateFile(file) {
  if (!file) return { valid: false, message: 'Seleccioná un comprobante o elegí “No”.' };
  const extension = String(file.name.split('.').pop() || '').toLowerCase();
  const mimeOk = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].includes(file.type);
  if (!VT_ALLOWED_EXTENSIONS.includes(extension) || !mimeOk) return { valid: false, message: 'Formato no permitido. Usá JPG, PNG, WEBP o PDF.' };
  if (file.size > VT_MAX_FILE_SIZE) return { valid: false, message: 'El archivo supera el límite de 2 MB.' };
  return { valid: true, message: '' };
}
function vtCreateMovement(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!activeUser || vtRole() === 'doctor') {
    showToast('Acceso de solo lectura', 'Tu rol no permite registrar movimientos.', 'error');
    return;
  }
  const result = validateMovementForm();
  let clinicId = vtRole() === 'admin' ? $('#movementClinic').value : vtNormalizeClinicId(activeUser.clinicId);
  if (!result.valid) {
    $('#movementFormError').textContent = 'Revisá los campos señalados antes de guardar.';
    return;
  }
  if (!VT_CLINICS.some((clinic) => clinic.id === clinicId)) {
    $('#clinicError').textContent = 'Seleccioná una sede válida para este movimiento.';
    $('#movementClinic')?.setAttribute('aria-invalid', 'true');
    return;
  }
  const attach = vtReceiptSelected();
  const file = attach ? $('#movementReceipt').files[0] : null;
  if (attach) {
    const validation = vtValidateFile(file);
    if (!validation.valid) {
      $('#receiptError').textContent = validation.message;
      $('#movementReceipt').setAttribute('aria-invalid', 'true');
      return;
    }
  }
  const save = async () => {
    let receiptData = '';
    let receiptName = '';
    let receiptType = '';
    if (file) {
      try {
        receiptData = await vtReadFile(file);
        receiptName = file.name;
        receiptType = file.type;
      } catch (error) {
        $('#receiptError').textContent = error.message;
        return;
      }
    }
    const movement = {
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : `movement-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: result.type,
      amount: Math.round(result.amount * 100) / 100,
      category: result.category,
      date: result.date,
      details: $('#movementDetails').value.trim(),
      createdAt: Date.now(),
      createdBy: activeUser.name || activeUser.username || activeUser.email,
      createdByEmail: userStorageId(activeUser),
      clinicId,
      status: 'Cargado',
      observations: [],
      receiptData,
      receiptName,
      receiptType
    };
    const all = vtGetMovements();
    all.push(movement);
    if (!vtSaveMovements(all)) return;
    vtLog('Movimiento registrado', `${movement.type} de ${formatCurrency(movement.amount)} en ${vtClinicName(clinicId)}.`, movement.id, clinicId);
    $('#movementForm').reset();
    navigateTo('movements');
    renderAllMovements();
    if (currentPage === 'audit') vtRenderAudit();
    showToast('Movimiento guardado', `${movement.type} registrado en ${vtClinicName(clinicId)}.`);
  };
  save();
}
function vtSetRegistrationFields() {
  const roleSelect = $('#registerRole');
  const clinicWrap = $('#registerClinicWrap');
  const clinicSelect = $('#registerClinic');
  const hint = $('#adminRoleHint');
  if (!roleSelect || !clinicWrap || !clinicSelect || !hint) return;
  const role = roleSelect.value;
  const users = getUsers();
  const hasAdmin = vtAdminExists();
  const firstAccount = users.length === 0;
  const requiresClinic = role === 'loader' || role === 'doctor';
  clinicWrap.hidden = !requiresClinic;
  clinicSelect.required = requiresClinic;
  if (!requiresClinic) clinicSelect.value = '';
  // La cuenta inicial establece la administración del prototipo.
  [...roleSelect.options].forEach((option) => {
    if (option.value === 'loader' || option.value === 'doctor') option.disabled = firstAccount;
  });
  if (role === 'admin' && hasAdmin) {
    hint.textContent = 'Ya existe una cuenta Administradora. Elegí Encargada o Médico para crear otra cuenta.';
    hint.classList.add('role-hint-warning');
  } else if (firstAccount) {
    hint.textContent = 'La primera cuenta debe registrarse como Administradora. Después se podrán crear cuentas de Encargada y Médico.';
    hint.classList.remove('role-hint-warning');
  } else if (role === 'admin') {
    hint.textContent = 'El rol Administradora está disponible. Solo se admite una cuenta con este rol en el prototipo.';
    hint.classList.remove('role-hint-warning');
  } else {
    hint.textContent = 'Solo puede existir una cuenta Administradora en este prototipo. Si ya está registrada, no se podrá crear otra.';
    hint.classList.remove('role-hint-warning');
  }
}
async function vtRegisterUser(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  clearErrors();
  const name = $('#registerName').value.trim();
  const email = $('#registerEmail').value.trim().toLowerCase();
  const password = $('#registerPassword').value;
  const confirm = $('#registerConfirm').value;
  const role = $('#registerRole').value;
  const clinicId = $('#registerClinic').value;
  let valid = true;
  if (name.length < 2) { setFieldError('registerName', 'registerError', 'Ingresá un nombre de usuario de al menos 2 caracteres.'); valid = false; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError('registerEmail', 'registerError', 'Ingresá un email válido.'); valid = false; }
  if (!['admin', 'loader', 'doctor'].includes(role)) { $('#registerError').textContent = 'Seleccioná el rol de la cuenta.'; $('#registerRole').setAttribute('aria-invalid', 'true'); valid = false; }
  if (getUsers().length === 0 && role !== 'admin') { $('#registerError').textContent = 'La primera cuenta debe registrarse como Administradora.'; $('#registerRole').setAttribute('aria-invalid', 'true'); valid = false; }
  if ((role === 'loader' || role === 'doctor') && !VT_CLINICS.some((clinic) => clinic.id === clinicId)) { $('#registerError').textContent = 'Seleccioná la sede a la que pertenece la cuenta.'; $('#registerClinic').setAttribute('aria-invalid', 'true'); valid = false; }
  if (role === 'admin' && vtAdminExists()) { $('#registerError').textContent = 'Ya existe una cuenta Administradora. Solo puede registrarse una.'; $('#registerRole').setAttribute('aria-invalid', 'true'); vtSetRegistrationFields(); return; }
  if (!passwordIsValid(password)) { $('#registerError').textContent = 'La contraseña todavía no cumple todos los requisitos.'; $('#registerPassword').setAttribute('aria-invalid', 'true'); valid = false; }
  if (password !== confirm) { $('#registerError').textContent = 'Las contraseñas no coinciden.'; $('#registerConfirm').setAttribute('aria-invalid', 'true'); valid = false; }
  if (!valid) return;
  const users = getUsers();
  if (users.some((user) => userStorageId(user) === email || String(user.username || '').toLocaleLowerCase('es-AR') === name.toLocaleLowerCase('es-AR'))) {
    $('#registerError').textContent = 'Ya existe una cuenta con ese email o nombre de usuario.';
    $('#registerEmail').setAttribute('aria-invalid', 'true');
    return;
  }
  const user = {
    name,
    username: name,
    email,
    passwordHash: await hashPassword(password),
    role,
    ...(role === 'loader' || role === 'doctor' ? { clinicId } : {}),
    createdAt: new Date().toISOString()
  };
  users.push(user);
  if (!setUsers(users)) return;
  vtLogForRegistration(user);
  $('#registerForm').reset();
  updatePasswordRuleDisplay('');
  $('#loginForm').reset();
  $('#loginIdentifier').value = email;
  vtSetRegistrationFields();
  showAuthPanel('login');
  showToast('¡Cuenta creada!', `La cuenta quedó registrada como ${vtRoleName(role)}${clinicId ? ` de ${vtClinicName(clinicId)}` : ''}. Ahora iniciá sesión.`);
}
function vtLogForRegistration(user) {
  const record = {
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    user: user.name,
    email: user.email,
    role: user.role,
    action: 'Cuenta registrada',
    description: `Se creó una cuenta con rol ${vtRoleName(user.role)}${user.clinicId ? ` en ${vtClinicName(user.clinicId)}` : ''}.`,
    movementId: '',
    clinicId: user.clinicId || '',
    clinicName: user.clinicId ? vtClinicName(user.clinicId) : '',
    date: new Date().toISOString()
  };
  const list = vtGetAudit();
  list.unshift(record);
  vtSaveAudit(list);
}
function vtRenderReports() {
  if (vtRole() !== 'admin') return;
  const from = $('#reportDateFrom').value;
  const to = $('#reportDateTo').value;
  const clinic = $('#reportClinicFilter').value || 'all';
  let movements = vtGetMovements().filter((movement) => (!from || movement.date >= from) && (!to || movement.date <= to) && (clinic === 'all' || movement.clinicId === clinic));
  movements = sortMovements(movements);
  vtReportCache = movements;
  const income = movements.filter((movement) => movement.type === 'Ingreso').reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
  const expense = movements.filter((movement) => movement.type === 'Egreso').reduce((sum, movement) => sum + Number(movement.amount || 0), 0);
  $('#metricIncome').textContent = formatCurrency(income);
  $('#metricExpense').textContent = formatCurrency(expense);
  $('#metricBalance').textContent = formatCurrency(income - expense);
  $('#metricBalanceHint').textContent = `${movements.length} movimiento${movements.length === 1 ? '' : 's'} en el período`;
  const groups = {};
  movements.filter((movement) => movement.type === 'Egreso').forEach((movement) => {
    groups[movement.category || 'Sin categoría'] = (groups[movement.category || 'Sin categoría'] || 0) + Number(movement.amount || 0);
  });
  const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const maxValue = Math.max(1, ...entries.map((entry) => entry[1]));
  $('#expenseChart').innerHTML = entries.length ? entries.map(([category, value]) => `
    <div class="chart-row"><span class="chart-label">${escapeHTML(category)}</span><div class="chart-track"><div class="chart-bar" style="width:${Math.max(2, value / maxValue * 100)}%"></div></div><span class="chart-value">${formatCurrency(value)}</span></div>`).join('') : '<p class="chart-empty">No hay egresos para mostrar con estos filtros.</p>';

  const monthly = {};
  movements.forEach((movement) => {
    const key = String(movement.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    if (!monthly[key]) monthly[key] = { income: 0, expense: 0 };
    if (movement.type === 'Ingreso') monthly[key].income += Number(movement.amount || 0);
    else monthly[key].expense += Number(movement.amount || 0);
  });
  const monthEntries = Object.entries(monthly).sort((a, b) => a[0].localeCompare(b[0]));
  const maxMonthly = Math.max(1, ...monthEntries.flatMap(([, item]) => [item.income, item.expense]));
  $('#monthlyTrend').innerHTML = monthEntries.length ? monthEntries.map(([month, item]) => `
    <div class="trend-month"><strong>${escapeHTML(new Intl.DateTimeFormat('es-AR', { month: 'short', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`)))}</strong>
      <div class="trend-values"><span>Ingresos</span><div class="chart-track"><div class="chart-bar trend-income" style="width:${item.income / maxMonthly * 100}%"></div></div><b>${formatCurrency(item.income)}</b></div>
      <div class="trend-values"><span>Egresos</span><div class="chart-track"><div class="chart-bar trend-expense" style="width:${item.expense / maxMonthly * 100}%"></div></div><b>${formatCurrency(item.expense)}</b></div>
    </div>`).join('') : '<p class="chart-empty">Todavía no hay movimientos para comparar por mes.</p>';
}
function vtAuditStatusChange(event) {
  const select = event.target.closest('[data-audit-status]');
  if (!select || vtRole() !== 'admin') return;
  const movement = vtGetMovements().find((item) => item.id === select.dataset.auditStatus);
  if (!movement) return;
  const previous = movement.status || 'Cargado';
  const next = select.value;
  if (!['Cargado', 'En revisión', 'Validado'].includes(next)) return;
  if (previous === next) return;
  movement.status = next;
  movement.statusUpdatedAt = new Date().toISOString();
  movement.statusUpdatedBy = activeUser?.email || '';
  const all = vtGetMovements().map((item) => item.id === movement.id ? movement : item);
  if (!vtSaveMovements(all)) return;
  vtLog('Estado actualizado', `${movement.type} de ${formatCurrency(movement.amount)}: ${previous} → ${next}.`, movement.id, movement.clinicId);
  vtRenderAudit();
  renderAllMovements();
  showToast('Estado actualizado', `El movimiento ahora está ${next.toLowerCase()}.`);
}
function vtAddObservation(movementId) {
  if (vtRole() !== 'admin') return;
  const field = document.querySelector(`[data-observation-input="${CSS.escape(movementId)}"]`);
  const note = field?.value.trim() || '';
  if (!note) {
    showToast('Falta la observación', 'Escribí una nota antes de guardarla.', 'error');
    field?.focus();
    return;
  }
  const all = vtGetMovements();
  const movement = all.find((item) => item.id === movementId);
  if (!movement) return;
  if (!Array.isArray(movement.observations)) movement.observations = [];
  const observation = { text: note, user: activeUser?.name || activeUser?.email || 'Administradora', date: new Date().toISOString() };
  movement.observations.push(observation);
  if (!vtSaveMovements(all)) return;
  vtLog('Observación agregada', note, movement.id, movement.clinicId);
  vtRenderAudit();
  showToast('Observación guardada', 'La nota quedó asociada al movimiento.');
}
function vtRenderAudit() {
  if (vtRole() !== 'admin') return;
  const clinicFilter = vtSelectedClinicId && vtSelectedClinicId !== 'all' ? vtSelectedClinicId : 'all';
  const movements = sortMovements(vtGetMovements().filter((movement) => clinicFilter === 'all' || movement.clinicId === clinicFilter));
  const container = $('#auditMovements');
  if (!movements.length) {
    container.innerHTML = vtRenderEmpty('No hay movimientos para revisar', 'Los registros creados por las encargadas aparecerán en esta sección.');
  } else {
    container.innerHTML = movements.map((movement) => {
      const observations = (movement.observations || []).map((item) => `<div class="observation-entry"><strong>${escapeHTML(item.user || 'Usuario')}</strong><p>${escapeHTML(item.text)}</p><small>${escapeHTML(new Date(item.date).toLocaleString('es-AR'))}</small></div>`).join('');
      return `<article class="audit-movement-card">
        <div class="audit-movement-main"><div><span class="type-pill ${movement.type === 'Ingreso' ? 'income' : 'expense'}">${escapeHTML(movement.type)}</span><strong>${formatCurrency(movement.amount)}</strong></div><p>${escapeHTML(movement.category)} · ${formatDate(movement.date)} · ${escapeHTML(vtClinicName(movement.clinicId))}</p><small>Registró: ${escapeHTML(movement.createdBy || 'Usuario')} · ${escapeHTML(movement.createdByEmail || '')}</small>${movement.details ? `<p class="audit-detail">${escapeHTML(movement.details)}</p>` : ''}</div>
        <div class="audit-movement-controls"><label class="field-label" for="status-${escapeHTML(movement.id)}">Estado del movimiento</label><select id="status-${escapeHTML(movement.id)}" data-audit-status="${escapeHTML(movement.id)}"><option ${movement.status === 'Cargado' ? 'selected' : ''}>Cargado</option><option ${movement.status === 'En revisión' ? 'selected' : ''}>En revisión</option><option ${movement.status === 'Validado' ? 'selected' : ''}>Validado</option></select><label class="field-label" for="note-${escapeHTML(movement.id)}">Agregar observación</label><textarea id="note-${escapeHTML(movement.id)}" rows="2" maxlength="300" data-observation-input="${escapeHTML(movement.id)}" placeholder="Escribí una nota interna…"></textarea><button type="button" class="button button-secondary small-action" data-add-observation="${escapeHTML(movement.id)}">Guardar observación</button></div>
        <div class="audit-observations"><strong>Historial de observaciones</strong>${observations || '<p class="muted-inline">Todavía no hay observaciones.</p>'}</div>
      </article>`;
    }).join('');
  }
  const logs = vtGetAudit().filter((log) => clinicFilter === 'all' || !log.clinicId || log.clinicId === clinicFilter);
  $('#auditLogTable').innerHTML = logs.length ? `<div class="table-wrap"><table class="movements-table"><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>Sede</th></tr></thead><tbody>${logs.map((log) => `<tr><td>${escapeHTML(new Date(log.date).toLocaleString('es-AR'))}</td><td>${escapeHTML(log.user || 'Usuario')}<small class="movement-creator">${escapeHTML(log.email || '')}</small></td><td>${escapeHTML(log.action || '—')}</td><td>${escapeHTML(log.description || '—')}</td><td>${escapeHTML(log.clinicName || (log.clinicId ? vtClinicName(log.clinicId) : 'General'))}</td></tr>`).join('')}</tbody></table></div>` : vtRenderEmpty('Sin actividad registrada', 'Las acciones realizadas en el sistema aparecerán acá.');
}
function vtShowReceipt(movementId) {
  const movement = vtGetMovements().find((item) => item.id === movementId);
  if (!movement?.receiptData || vtRole() === 'doctor' || !vtMovementIsAccessible(movement)) return;
  $('#receiptModalTitle').textContent = movement.receiptName || 'Comprobante';
  const preview = $('#receiptPreview');
  if (movement.receiptType === 'application/pdf' || movement.receiptName.toLowerCase().endsWith('.pdf')) {
    preview.innerHTML = `<iframe title="Vista previa del comprobante" src="${movement.receiptData}"></iframe>`;
  } else {
    preview.innerHTML = `<img alt="Vista previa de ${escapeHTML(movement.receiptName)}" src="${movement.receiptData}">`;
  }
  $('#receiptDownloadLink').href = movement.receiptData;
  $('#receiptDownloadLink').download = movement.receiptName || 'comprobante';
  $('#receiptModal').hidden = false;
}
function vtExportPdf(movements, title, filters = '') {
  const role = vtRole();
  if (role === 'doctor') return;
  const income = movements.filter((item) => item.type === 'Ingreso').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expense = movements.filter((item) => item.type === 'Egreso').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const rows = movements.map((item) => `<tr><td>${escapeHTML(formatDate(item.date))}</td><td>${escapeHTML(item.type)}</td><td>${escapeHTML(vtClinicName(item.clinicId))}</td><td>${escapeHTML(item.category)}</td><td>${escapeHTML(item.details || '—')}</td><td>${escapeHTML(item.status || 'Cargado')}</td><td>${escapeHTML(formatCurrency(item.amount))}</td></tr>`).join('');
  const printWindow = window.open('', '_blank', 'width=1100,height=760');
  if (!printWindow) {
    showToast('Ventana bloqueada', 'Permití las ventanas emergentes para generar el informe PDF.', 'error');
    return;
  }
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHTML(title)}</title><style>
    *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#291b3a;padding:28px}h1{margin:0;color:#6731a8}p{color:#74677f;font-size:12px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:20px 0}.summary div{padding:14px;border:1px solid #e8def2;border-radius:10px;background:#f7f1ff}.summary strong{display:block;margin-top:6px;font-size:18px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{padding:8px;border-bottom:1px solid #e6deed;text-align:left}th{background:#f2eafa}footer{margin-top:18px;color:#81758c;font-size:9px}@media print{body{padding:0}}
    </style></head><body><h1>VioletTech · ${escapeHTML(title)}</h1><p>${escapeHTML(filters)} · Generado el ${escapeHTML(new Date().toLocaleString('es-AR'))}</p><div class="summary"><div>Ingresos<strong>${escapeHTML(formatCurrency(income))}</strong></div><div>Egresos<strong>${escapeHTML(formatCurrency(expense))}</strong></div><div>Balance<strong>${escapeHTML(formatCurrency(income - expense))}</strong></div></div><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Sede</th><th>Categoría</th><th>Detalle</th><th>Estado</th><th>Monto</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No hay movimientos.</td></tr>'}</tbody></table><footer>Prototipo académico VioletTech.</footer><script>window.addEventListener('load',()=>window.print());</script></body></html>`);
  printWindow.document.close();
  vtLog('Informe PDF generado', `${title}: ${movements.length} movimientos.`);
}
function vtExportMovementsPdf() {
  if (vtRole() === 'doctor') return;
  const query = ($('#movementSearch')?.value || '').trim().toLocaleLowerCase('es-AR');
  const type = $('#typeFilter')?.value || 'all';
  let movements = vtScopedMovements();
  if (type !== 'all') movements = movements.filter((item) => item.type === type);
  if (query) movements = movements.filter((item) => [item.date, item.type, item.category, item.details].some((value) => String(value || '').toLocaleLowerCase('es-AR').includes(query)));
  const location = vtRole() === 'admin'
    ? (vtSelectedClinicId && vtSelectedClinicId !== 'all' ? vtClinicName(vtSelectedClinicId) : 'Todas las sedes')
    : vtClinicName(activeUser.clinicId);
  vtExportPdf(movements, 'Informe de movimientos', `${location} · Filtro: ${type === 'all' ? 'Todos' : type}`);
}
function vtInitialSetup() {
  vtNormalizeUsers();
  vtMigrateLegacyData();
  vtMigrateLegacyAudit();
  vtRenderClinicCards();
  vtSetRegistrationFields();
  $('#movementDate').max = localDateString();
  const today = localDateString();
  if (!$('#reportDateFrom').value) $('#reportDateFrom').value = `${today.slice(0, 7)}-01`;
  if (!$('#reportDateTo').value) $('#reportDateTo').value = today;
  if (activeUser) {
    const current = getUsers().find((user) => userStorageId(user) === userStorageId(activeUser));
    if (current) {
      Object.assign(activeUser, current);
      vtSelectedClinicId = null;
      vtSetRoleVisibility();
      vtNavigate(vtRole() === 'admin' ? 'home' : 'movements');
    }
  }
}

/* Sustituye la presentación de navegación por rutas con permisos explícitos. */
navigateTo = vtNavigate;
setActiveUser = function(user) {
  vtNormalizeUsers();
  const stored = getUsers().find((item) => userStorageId(item) === userStorageId(user)) || user;
  Object.assign(user, stored);
  vtSelectedClinicId = null;
  vtBaseSetActiveUser(user);
  vtMigrateLegacyData();
  vtSetRoleVisibility();
  vtLog('Inicio de sesión', `Ingresó como ${vtRoleName(vtRole())}.`, '', user.clinicId || '');
  vtNavigate(vtRole() === 'admin' ? 'home' : 'movements');
};
showAuth = function() {
  vtSelectedClinicId = null;
  vtBaseShowAuth();
  vtSetRegistrationFields();
};
prepareMovementForm = vtPrepareMovementForm;
renderAll = function() {
  renderRecentMovements();
  renderAllMovements();
  vtRenderClinicCards();
};

/* Registro: captura temprana para guardar rol y sede antes de la lógica antigua. */
$('#registerForm').addEventListener('submit', vtRegisterUser, true);
$('#registerRole').addEventListener('change', vtSetRegistrationFields);
$('#registerClinic').addEventListener('change', () => $('#registerClinic').removeAttribute('aria-invalid'));
$('#movementForm').addEventListener('submit', vtCreateMovement, true);
$('input[name="receiptChoice"][value="yes"]').addEventListener('change', () => {
  $('#receiptUploadWrap').hidden = !vtReceiptSelected();
  $('#movementReceipt').required = vtReceiptSelected();
});
$('input[name="receiptChoice"][value="no"]').addEventListener('change', () => {
  $('#receiptUploadWrap').hidden = true;
  $('#movementReceipt').required = false;
  $('#movementReceipt').value = '';
  $('#receiptError').textContent = '';
});
$('#movementReceipt').addEventListener('change', () => {
  $('#receiptError').textContent = '';
  $('#movementReceipt').removeAttribute('aria-invalid');
  if ($('#movementReceipt').files[0]) {
    const validation = vtValidateFile($('#movementReceipt').files[0]);
    if (!validation.valid) $('#receiptError').textContent = validation.message;
  }
});
$('#movementClinic').addEventListener('change', () => {
  $('#clinicError').textContent = '';
  $('#movementClinic').removeAttribute('aria-invalid');
});

/* Navegación de módulos, sedes, visor y acciones. */
document.addEventListener('click', (event) => {
  const route = event.target.closest('[data-extension-route]');
  if (route && activeUser) {
    event.preventDefault();
    vtNavigate(route.dataset.extensionRoute);
    return;
  }
  const action = event.target.closest('[data-extension-action]');
  if (action && activeUser) {
    event.preventDefault();
    vtNavigate('form');
    return;
  }
  const clinicButton = event.target.closest('[data-select-clinic]');
  if (clinicButton && activeUser && vtRole() === 'admin') {
    const target = clinicButton.dataset.selectClinic;
    vtSelectedClinicId = target === 'all' ? 'all' : VT_CLINICS.some((clinic) => clinic.id === target) ? target : null;
    vtNavigate('movements');
    return;
  }
  const exitClinic = event.target.closest('#clinicExitButton');
  if (exitClinic && vtRole() === 'admin') {
    vtSelectedClinicId = null;
    vtNavigate('home');
    return;
  }
  const view = event.target.closest('[data-view-receipt]');
  if (view) { vtShowReceipt(view.dataset.viewReceipt); return; }
  const download = event.target.closest('[data-download-receipt]');
  if (download && vtRole() !== 'doctor') {
    const movement = vtGetMovements().find((item) => item.id === download.dataset.downloadReceipt);
    if (movement?.receiptData && vtMovementIsAccessible(movement)) {
      const link = document.createElement('a');
      link.href = movement.receiptData;
      link.download = movement.receiptName || 'comprobante';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    return;
  }
  const observation = event.target.closest('[data-add-observation]');
  if (observation) { vtAddObservation(observation.dataset.addObservation); return; }
});
$('#auditMovements').addEventListener('change', vtAuditStatusChange);
$('#movementsPdfButton').addEventListener('click', vtExportMovementsPdf);
$('#reportsPdfButton').addEventListener('click', () => {
  if (vtRole() !== 'admin') return;
  const clinic = $('#reportClinicFilter').value;
  const filterText = `${clinic === 'all' ? 'Todas las sedes' : vtClinicName(clinic)} · ${$('#reportDateFrom').value || 'Sin inicio'} al ${$('#reportDateTo').value || 'Sin cierre'}`;
  vtExportPdf(vtReportCache, 'Métricas y balances', filterText);
});
$('#reportDateFrom').addEventListener('change', vtRenderReports);
$('#reportDateTo').addEventListener('change', vtRenderReports);
$('#reportClinicFilter').addEventListener('change', vtRenderReports);
$('#resetReportFilters').addEventListener('click', () => {
  const today = localDateString();
  $('#reportDateFrom').value = `${today.slice(0, 7)}-01`;
  $('#reportDateTo').value = today;
  $('#reportClinicFilter').value = vtSelectedClinicId && vtSelectedClinicId !== 'all' ? vtSelectedClinicId : 'all';
  vtRenderReports();
});
$('#closeReceiptModal').addEventListener('click', () => { $('#receiptModal').hidden = true; $('#receiptPreview').innerHTML = ''; });
$('#receiptModal').addEventListener('click', (event) => {
  if (event.target.id === 'receiptModal') { $('#receiptModal').hidden = true; $('#receiptPreview').innerHTML = ''; }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#receiptModal').hidden) { $('#receiptModal').hidden = true; $('#receiptPreview').innerHTML = ''; }
});

/* Re-renderiza listas al cambiar filtros sin exponer funciones fuera del rol. */
$('#movementSearch').addEventListener('input', renderAllMovements);
$('#typeFilter').addEventListener('change', renderAllMovements);

vtInitialSetup();
