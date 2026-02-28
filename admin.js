import { db } from "./src/firebase.js";
const FIRESTORE_MODULE_URL =
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const ADMIN_PIN = '1234';
const AUTH_STORAGE_KEY = 'itziks-admin-pin-ok';
const DELETE_CONFIRM_PHRASE = 'מחק';
const DELETE_BATCH_SIZE = 200;

const STATUS_LABELS = {
  new: 'חדש',
  in_progress: 'בהכנה',
  ready: 'מוכן',
  delivered: 'נמסר',
  cancelled: 'בוטל',
};
const DELETE_STATUS_LABELS = {
  delivered: 'נמסר',
  ready: 'מוכן',
  cancelled: 'בוטל',
};

const STATUS_BUTTONS = ['new', 'in_progress', 'ready', 'delivered', 'cancelled'];

let pinGate = null;
let pinInput = null;
let pinSubmit = null;
let pinError = null;
let dashboard = null;
let lastSync = null;
let countNew = null;
let countInProgress = null;
let countReady = null;
let ordersList = null;
let emptyState = null;
let adminToast = null;
let enableNotificationsBtn = null;
let logoutBtn = null;
let openDeleteOrdersBtn = null;
let deleteOrdersBackdrop = null;
let deleteOrdersModal = null;
let closeDeleteOrdersModalBtn = null;
let cancelDeleteOrdersBtn = null;
let executeDeleteOrdersBtn = null;
let deleteConfirmInput = null;
let deleteModalError = null;
let deleteMatchCount = null;
let statusFilterGroup = null;
let selectionModeNote = null;
let selectionToolbar = null;
let selectionToolbarInfo = null;
let selectAllOrdersBtn = null;
let clearAllOrdersBtn = null;
let deleteSelectedOrdersBtn = null;

const currencyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});

let toastTimer = null;
let initializedSnapshot = false;
let audioContext = null;
let unsubscribeOrders = null;
let firestoreApi = null;
let firebaseInitPromise = null;
let latestOrders = [];
let deleteMode = 'all';
let deletionInFlight = false;
let isDeleteModalOpen = false;
const selectedOrderIds = new Set();

function showToast(message, timeoutMs = 2600) {
  if (!adminToast) return;

  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  adminToast.textContent = message;
  adminToast.classList.add('show');

  toastTimer = setTimeout(() => {
    adminToast.classList.remove('show');
    toastTimer = null;
  }, timeoutMs);
}

function showFatalError(error) {
  console.error('Admin runtime error:', error);
  const detail = error?.message ? ` ${error.message}` : '';
  const message = `שגיאה בטעינת מערכת המנהל. פתח קונסול.${detail}`;

  let errorNode = document.getElementById('adminFatalError');
  if (!errorNode) {
    errorNode = document.createElement('p');
    errorNode.id = 'adminFatalError';
    errorNode.style.margin = '0.75rem auto';
    errorNode.style.maxWidth = '1200px';
    errorNode.style.background = '#fae1e1';
    errorNode.style.border = '1px solid #ce4c4c';
    errorNode.style.color = '#831d1d';
    errorNode.style.padding = '0.65rem 0.85rem';
    errorNode.style.borderRadius = '10px';
    document.body.prepend(errorNode);
  }
  errorNode.textContent = message;

  if (pinError) {
    pinError.textContent = message;
  }
}

async function ensureFirebaseReady() {
  if (firestoreApi && db) return { firestoreApi, db };

  if (!firebaseInitPromise) {
    firebaseInitPromise = import(FIRESTORE_MODULE_URL)
      .then((firestoreModule) => {
        firestoreApi = firestoreModule;

        if (!db) {
          throw new Error('Firestore db import failed from ./src/firebase.js');
        }

        return { firestoreApi, db };
      })
      .catch((error) => {
        firebaseInitPromise = null;
        throw error;
      });
  }

  return firebaseInitPromise;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMoney(amount) {
  const normalized = Number.isFinite(amount) ? amount : 0;
  return currencyFormatter.format(normalized);
}

function formatTimestamp(value) {
  if (!value?.toDate) return '--';
  const date = value.toDate();
  return date.toLocaleString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function formatPickupText(pickup) {
  if (!pickup || typeof pickup !== 'object') return '--';
  if (pickup.dayLabel) return pickup.dayLabel;

  if (pickup.time) {
    const date = new Date(pickup.time);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString('he-IL', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return String(pickup.time);
  }

  return '--';
}

function formatModifiers(modifiers) {
  if (!modifiers || typeof modifiers !== 'object') return '';

  const parts = [];
  if (Array.isArray(modifiers.salads) && modifiers.salads.length > 0) {
    parts.push(`סלטים: ${modifiers.salads.join(', ')}`);
  }
  if (Array.isArray(modifiers.sauces) && modifiers.sauces.length > 0) {
    parts.push(`רטבים: ${modifiers.sauces.join(', ')}`);
  }
  if (Array.isArray(modifiers.pickles) && modifiers.pickles.length > 0) {
    parts.push(`חמוצים: ${modifiers.pickles.join(', ')}`);
  }

  if (Array.isArray(modifiers.paidAddons) && modifiers.paidAddons.length > 0) {
    const paidText = modifiers.paidAddons
      .map((addon) => {
        if (!addon) return '';
        if (typeof addon === 'string') return addon;
        const label = addon.label || addon.id || 'תוספת';
        const price = Number(addon.price);
        return Number.isFinite(price) ? `${label} (+${formatMoney(price)})` : label;
      })
      .filter(Boolean)
      .join(', ');
    if (paidText) parts.push(`תוספות בתשלום: ${paidText}`);
  }

  // Backward compatibility with older coffee orders.
  if (modifiers.size) parts.push(`גודל: ${modifiers.size}`);
  if (modifiers.milk) parts.push(`חלב: ${modifiers.milk}`);
  if (Array.isArray(modifiers.addons) && modifiers.addons.length > 0) {
    parts.push(`תוספות: ${modifiers.addons.join(', ')}`);
  }

  return parts.join(' | ');
}

async function setOrderStatus(orderId, nextStatus) {
  try {
    const { firestoreApi: fs, db: firestoreDb } = await ensureFirebaseReady();
    await fs.updateDoc(fs.doc(firestoreDb, 'orders', orderId), {
      status: nextStatus,
    });
  } catch (error) {
    console.error('Failed to update order status', error);
    showToast('שגיאה בעדכון סטטוס ההזמנה');
  }
}

function buildStatusButtons(order) {
  const wrap = document.createElement('div');
  wrap.className = 'status-buttons';

  STATUS_BUTTONS.forEach((status) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = STATUS_LABELS[status] || status;
    button.classList.toggle('active', order.status === status);
    button.disabled = order.status === status;
    button.addEventListener('click', () => setOrderStatus(order.id, status));
    wrap.append(button);
  });

  return wrap;
}

function renderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<li>אין פריטים בהזמנה</li>';
  }

  return items
    .map((item) => {
      const qty = Number(item.qty) || 0;
      const lineTotal = Number(item.lineTotal) || 0;
      const modifiersText = formatModifiers(item.modifiers);

      return `
        <li>
          <div class="item-line">
            <strong>${escapeHtml(item.name || 'פריט')}</strong>
            <span>${formatMoney(lineTotal)}</span>
          </div>
          <div class="item-sub">כמות: ${qty} | מחיר יחידה: ${formatMoney(Number(item.unitPrice) || 0)}</div>
          ${modifiersText ? `<div class="item-sub">${escapeHtml(modifiersText)}</div>` : ''}
        </li>
      `;
    })
    .join('');
}

function getDeleteModeValue() {
  if (!deleteOrdersModal) return 'all';
  const checked = deleteOrdersModal.querySelector('input[name="deleteMode"]:checked');
  return checked?.value || 'all';
}

function setDeleteModeValue(mode) {
  if (!deleteOrdersModal) return;
  const nextMode = mode || 'all';
  const input = deleteOrdersModal.querySelector(
    `input[name="deleteMode"][value="${nextMode}"]`,
  );
  if (input) {
    input.checked = true;
  }
}

function getSelectedStatusFilters() {
  if (!deleteOrdersModal) return [];
  return Array.from(
    deleteOrdersModal.querySelectorAll('.status-delete-filter:checked'),
  ).map((input) => input.value);
}

function pruneSelectedOrderIds() {
  const existingIds = new Set(latestOrders.map((order) => order.id));
  for (const orderId of selectedOrderIds) {
    if (!existingIds.has(orderId)) {
      selectedOrderIds.delete(orderId);
    }
  }
}

function getMatchedOrderIds(mode = deleteMode) {
  pruneSelectedOrderIds();

  if (mode === 'all') {
    return latestOrders.map((order) => order.id);
  }

  if (mode === 'status') {
    const selectedStatuses = new Set(getSelectedStatusFilters());
    if (selectedStatuses.size === 0) return [];
    return latestOrders
      .filter((order) => selectedStatuses.has(order.status))
      .map((order) => order.id);
  }

  if (mode === 'selection') {
    return Array.from(selectedOrderIds);
  }

  return [];
}

function getDeleteOptionLabel(mode = deleteMode) {
  if (mode === 'all') return 'מחק הכול';

  if (mode === 'status') {
    const labels = getSelectedStatusFilters()
      .map((status) => DELETE_STATUS_LABELS[status] || status)
      .join(', ');
    return labels ? `מחק לפי סטטוס: ${labels}` : 'מחק לפי סטטוס';
  }

  return 'מחק לפי בחירה';
}

function updateSelectionToolbar() {
  if (!selectionToolbar || !selectionToolbarInfo || !deleteSelectedOrdersBtn) return;

  const selectionModeEnabled = deleteMode === 'selection' && !dashboard.hidden;
  selectionToolbar.hidden = !selectionModeEnabled;
  document.body.classList.toggle('selection-mode', selectionModeEnabled);

  const selectedCount = getMatchedOrderIds('selection').length;
  selectionToolbarInfo.textContent = `נבחרו ${selectedCount} הזמנות למחיקה`;
  deleteSelectedOrdersBtn.textContent = `מחק נבחרים (${selectedCount})`;
  deleteSelectedOrdersBtn.disabled = selectedCount === 0 || deletionInFlight;
}

function updateDeleteUiState() {
  deleteMode = getDeleteModeValue();
  const isStatusMode = deleteMode === 'status';
  const isSelectionMode = deleteMode === 'selection';

  if (statusFilterGroup) {
    statusFilterGroup.hidden = !isStatusMode;
  }
  if (selectionModeNote) {
    selectionModeNote.hidden = !isSelectionMode;
  }

  if (!isSelectionMode) {
    selectedOrderIds.clear();
  }
  updateSelectionToolbar();

  const matchedCount = getMatchedOrderIds(deleteMode).length;
  if (deleteMatchCount) {
    deleteMatchCount.textContent = `נמצאו ${matchedCount} הזמנות למחיקה.`;
  }

  const phraseMatches = deleteConfirmInput?.value === DELETE_CONFIRM_PHRASE;
  if (executeDeleteOrdersBtn) {
    executeDeleteOrdersBtn.disabled = !phraseMatches || matchedCount === 0 || deletionInFlight;
    executeDeleteOrdersBtn.textContent = deletionInFlight ? 'מוחק...' : 'מחק';
  }
}

function openDeleteOrdersModal(mode = deleteMode) {
  if (dashboard.hidden) return;
  if (!deleteOrdersModal || !deleteOrdersBackdrop) return;

  setDeleteModeValue(mode);
  deleteMode = getDeleteModeValue();
  isDeleteModalOpen = true;
  deleteOrdersModal.hidden = false;
  deleteOrdersBackdrop.hidden = false;
  deleteModalError.textContent = '';
  deleteConfirmInput.value = '';
  updateDeleteUiState();
  deleteConfirmInput.focus();
}

function closeDeleteOrdersModal() {
  if (!deleteOrdersModal || !deleteOrdersBackdrop) return;

  isDeleteModalOpen = false;
  deleteOrdersModal.hidden = true;
  deleteOrdersBackdrop.hidden = true;
  deleteModalError.textContent = '';
  deleteConfirmInput.value = '';
  updateDeleteUiState();
}

function renderOrders(orders) {
  latestOrders = Array.isArray(orders) ? orders : [];
  pruneSelectedOrderIds();
  ordersList.innerHTML = '';
  const hasOrders = latestOrders.length > 0;
  emptyState.hidden = hasOrders;
  updateSelectionToolbar();
  updateDeleteUiState();

  if (!hasOrders) return;

  latestOrders.forEach((order) => {
    const isChecked = selectedOrderIds.has(order.id);
    const card = document.createElement('article');
    card.className = 'order-card';
    card.innerHTML = `
      <div class="order-head">
        <div class="order-head-main">
          <h3>הזמנה #${escapeHtml(order.id.slice(0, 8))}</h3>
          <span class="status-pill ${escapeHtml(order.status)}">${escapeHtml(STATUS_LABELS[order.status] || order.status)}</span>
        </div>
        <label class="order-select-control">
          <input type="checkbox" class="order-select-checkbox" data-order-id="${escapeHtml(order.id)}" ${isChecked ? 'checked' : ''} />
          <span>בחר</span>
        </label>
        <div><strong>${formatMoney(order.total)}</strong></div>
      </div>
      <div class="order-meta">
        <div><strong>התקבל:</strong> ${escapeHtml(formatTimestamp(order.createdAt))}</div>
        <div><strong>איסוף:</strong> ${escapeHtml(formatPickupText(order.pickup))}</div>
        <div><strong>לקוח:</strong> ${escapeHtml(order.customer?.name || '--')} | ${escapeHtml(order.customer?.phone || '--')}</div>
        <div><strong>הערות:</strong> ${escapeHtml(order.notes || 'ללא')}</div>
      </div>
      <ul class="order-items">${renderItems(order.items)}</ul>
      <div class="order-foot">
        <strong>סה"כ: ${formatMoney(order.total)}</strong>
      </div>
    `;

    const selectionCheckbox = card.querySelector('.order-select-checkbox');
    if (selectionCheckbox) {
      selectionCheckbox.addEventListener('change', (event) => {
        const checkbox = event.currentTarget;
        const orderId = checkbox.dataset.orderId;
        if (!orderId) return;
        if (checkbox.checked) {
          selectedOrderIds.add(orderId);
        } else {
          selectedOrderIds.delete(orderId);
        }
        updateSelectionToolbar();
        updateDeleteUiState();
      });
    }

    card.querySelector('.order-foot').append(buildStatusButtons(order));
    ordersList.append(card);
  });
}

function updateCounters(orders) {
  const counts = orders.reduce(
    (acc, order) => {
      if (order.status === 'new') acc.new += 1;
      if (order.status === 'in_progress') acc.inProgress += 1;
      if (order.status === 'ready') acc.ready += 1;
      return acc;
    },
    { new: 0, inProgress: 0, ready: 0 },
  );

  countNew.textContent = String(counts.new);
  countInProgress.textContent = String(counts.inProgress);
  countReady.textContent = String(counts.ready);
}

function playNewOrderSound() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  if (!audioContext) {
    audioContext = new AudioCtx();
  }

  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.24);
}

function notifyBrowser(message) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  new Notification('חזי בצומת', {
    body: message,
  });
}

function handleIncomingNewOrders(snapshot) {
  if (!initializedSnapshot) {
    initializedSnapshot = true;
    return;
  }

  const newDocs = snapshot
    .docChanges()
    .filter((change) => change.type === 'added')
    .map((change) => ({ id: change.doc.id, ...change.doc.data() }))
    .filter((order) => (order.status || 'new') === 'new');

  if (newDocs.length === 0) return;

  const message =
    newDocs.length === 1
      ? 'הזמנה חדשה נכנסה!'
      : `נכנסו ${newDocs.length} הזמנות חדשות!`;

  showToast(message, 3600);
  playNewOrderSound();
  notifyBrowser(message);
}

function updateNotificationsButton() {
  if (!enableNotificationsBtn) return;

  if (!('Notification' in window)) {
    enableNotificationsBtn.hidden = true;
    return;
  }

  if (Notification.permission === 'granted') {
    enableNotificationsBtn.textContent = 'התראות פעילות';
    enableNotificationsBtn.disabled = true;
    return;
  }

  if (Notification.permission === 'denied') {
    enableNotificationsBtn.textContent = 'התראות חסומות בדפדפן';
    enableNotificationsBtn.disabled = true;
    return;
  }

  enableNotificationsBtn.textContent = 'אפשר התראות דפדפן';
  enableNotificationsBtn.disabled = false;
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  try {
    await Notification.requestPermission();
  } catch (error) {
    console.error('Notification permission request failed', error);
  } finally {
    updateNotificationsButton();
  }
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function deleteOrdersInBatches(buildQuery) {
  const { firestoreApi: fs, db: firestoreDb } = await ensureFirebaseReady();
  let deletedCount = 0;

  while (true) {
    const snapshot = await fs.getDocs(buildQuery(fs, firestoreDb));
    if (snapshot.empty) break;

    const batch = fs.writeBatch(firestoreDb);
    snapshot.docs.forEach((orderDoc) => {
      batch.delete(orderDoc.ref);
    });
    await batch.commit();
    deletedCount += snapshot.size;

    if (snapshot.size < DELETE_BATCH_SIZE) break;
  }

  return deletedCount;
}

async function deleteAllOrders() {
  return deleteOrdersInBatches((fs, firestoreDb) =>
    fs.query(fs.collection(firestoreDb, 'orders'), fs.limit(DELETE_BATCH_SIZE)),
  );
}

async function deleteOrdersByStatus(statuses) {
  const normalizedStatuses = Array.from(new Set(statuses.filter(Boolean)));
  if (normalizedStatuses.length === 0) return 0;

  return deleteOrdersInBatches((fs, firestoreDb) =>
    fs.query(
      fs.collection(firestoreDb, 'orders'),
      fs.where('status', 'in', normalizedStatuses),
      fs.limit(DELETE_BATCH_SIZE),
    ),
  );
}

async function deleteOrdersBySelection(orderIds) {
  const uniqueIds = Array.from(new Set(orderIds.filter(Boolean)));
  if (uniqueIds.length === 0) return 0;

  const { firestoreApi: fs, db: firestoreDb } = await ensureFirebaseReady();
  let deletedCount = 0;

  for (const idsChunk of chunkArray(uniqueIds, DELETE_BATCH_SIZE)) {
    const batch = fs.writeBatch(firestoreDb);
    idsChunk.forEach((orderId) => {
      batch.delete(fs.doc(firestoreDb, 'orders', orderId));
    });
    await batch.commit();
    deletedCount += idsChunk.length;
  }

  return deletedCount;
}

function buildFinalDeleteConfirmation(mode, matchedCount) {
  const optionLabel = getDeleteOptionLabel(mode);
  return `אישור סופי\nאפשרות: ${optionLabel}\nיימחקו ${matchedCount} הזמנות.\nלהמשיך?`;
}

async function executeDeleteOrders() {
  if (deletionInFlight) return;

  deleteMode = getDeleteModeValue();
  const matchedIds = getMatchedOrderIds(deleteMode);
  const matchedCount = matchedIds.length;

  if (deleteConfirmInput.value !== DELETE_CONFIRM_PHRASE) {
    deleteModalError.textContent = 'כדי למחוק, הקלידו בדיוק: מחק';
    updateDeleteUiState();
    return;
  }

  if (matchedCount === 0) {
    deleteModalError.textContent = 'אין הזמנות מתאימות למחיקה.';
    updateDeleteUiState();
    return;
  }

  const finalMessage = buildFinalDeleteConfirmation(deleteMode, matchedCount);
  if (!window.confirm(finalMessage)) {
    return;
  }

  deletionInFlight = true;
  deleteModalError.textContent = '';
  updateDeleteUiState();

  try {
    let deletedCount = 0;

    if (deleteMode === 'all') {
      deletedCount = await deleteAllOrders();
    } else if (deleteMode === 'status') {
      deletedCount = await deleteOrdersByStatus(getSelectedStatusFilters());
    } else {
      deletedCount = await deleteOrdersBySelection(matchedIds);
      selectedOrderIds.clear();
    }

    deleteConfirmInput.value = '';
    showToast(`נמחקו ${deletedCount} הזמנות`, 3600);
    closeDeleteOrdersModal();
  } catch (error) {
    console.error('Failed to delete orders', error);
    deleteModalError.textContent = 'שגיאה במחיקה. נסו שוב.';
  } finally {
    deletionInFlight = false;
    updateDeleteUiState();
  }
}

async function startRealtimeOrders() {
  let firebaseRuntime = null;
  try {
    firebaseRuntime = await ensureFirebaseReady();
    if (!firebaseRuntime?.db) {
      throw new Error('Firestore DB instance is missing.');
    }
  } catch (error) {
    console.error('Failed to initialize Firebase for admin dashboard', error);
    const errorMessage = error?.message || 'Unknown Firebase error';
    ordersList.innerHTML =
      `<article class="order-card"><strong>שגיאת Firebase.</strong><p>${escapeHtml(errorMessage)}</p></article>`;
    emptyState.hidden = true;
    showToast(`שגיאת Firebase: ${errorMessage}`, 3800);
    return;
  }

  if (typeof unsubscribeOrders === 'function') {
    unsubscribeOrders();
  }

  const { firestoreApi: fs, db: firestoreDb } = firebaseRuntime;
  const ordersRef = fs.collection(firestoreDb, 'orders');

  unsubscribeOrders = fs.onSnapshot(
    ordersRef,
    (snapshot) => {
      handleIncomingNewOrders(snapshot);
      const orders = snapshot.docs
        .map((orderDoc) => ({
          id: orderDoc.id,
          status: 'new',
          ...orderDoc.data(),
        }))
        .sort((left, right) => {
          const leftMillis = left.createdAt?.toMillis
            ? left.createdAt.toMillis()
            : 0;
          const rightMillis = right.createdAt?.toMillis
            ? right.createdAt.toMillis()
            : 0;
          return rightMillis - leftMillis;
        });

      updateCounters(orders);
      renderOrders(orders);
      lastSync.textContent = `עודכן: ${new Date().toLocaleTimeString('he-IL')}`;
    },
    (error) => {
      console.error('Realtime orders listener failed', error);
      showToast('שגיאה בהתחברות לעדכוני Firestore');
    },
  );
}

function setStoredAuth(isAuthenticated) {
  try {
    if (isAuthenticated) {
      localStorage.setItem(AUTH_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch (error) {
    console.error('Failed to persist admin auth state', error);
  }
}

function hasStoredAuth() {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) === '1';
  } catch (error) {
    console.error('Failed to read admin auth state', error);
    return false;
  }
}

function setPinGateVisible(isVisible) {
  if (!pinGate) return;
  pinGate.hidden = !isVisible;
  pinGate.style.display = isVisible ? 'grid' : 'none';
}

function resetDashboardView() {
  latestOrders = [];
  selectedOrderIds.clear();
  if (lastSync) {
    lastSync.textContent = 'ממתין לעדכון...';
  }
  if (countNew) countNew.textContent = '0';
  if (countInProgress) countInProgress.textContent = '0';
  if (countReady) countReady.textContent = '0';
  if (ordersList) ordersList.innerHTML = '';
  if (emptyState) emptyState.hidden = false;
  updateSelectionToolbar();
}

function stopRealtimeOrders() {
  if (typeof unsubscribeOrders === 'function') {
    unsubscribeOrders();
  }
  unsubscribeOrders = null;
  initializedSnapshot = false;
}

function lockDashboard({ clearStoredAuth = true, focusPin = true } = {}) {
  if (clearStoredAuth) {
    setStoredAuth(false);
  }

  closeDeleteOrdersModal();
  setDeleteModeValue('all');
  deleteMode = 'all';
  if (deleteOrdersModal) {
    deleteOrdersModal
      .querySelectorAll('.status-delete-filter')
      .forEach((input) => {
        input.checked = false;
      });
  }

  stopRealtimeOrders();
  resetDashboardView();
  document.body.classList.remove('selection-mode');
  document.body.classList.remove('admin-authenticated');
  dashboard.hidden = true;
  setPinGateVisible(true);

  if (pinInput) pinInput.value = '';
  if (pinError) pinError.textContent = '';
  if (focusPin && pinInput) pinInput.focus();
}

function unlockDashboard({ persist = true } = {}) {
  if (persist) {
    setStoredAuth(true);
  }

  if (pinError) pinError.textContent = '';
  setPinGateVisible(false);
  dashboard.hidden = false;
  document.body.classList.add('admin-authenticated');
  updateDeleteUiState();
  updateNotificationsButton();

  if (typeof unsubscribeOrders !== 'function') {
    startRealtimeOrders().catch((error) => {
      showFatalError(error);
    });
  }
}

function submitPin() {
  const pin = pinInput.value.trim();
  if (pin !== ADMIN_PIN) {
    pinError.textContent = 'PIN שגוי';
    return;
  }

  pinError.textContent = '';
  unlockDashboard();
}

function initDomRefs() {
  pinGate = document.getElementById('pinGate');
  pinInput = document.getElementById('pinInput');
  pinSubmit = document.getElementById('pinSubmit');
  pinError = document.getElementById('pinError');
  dashboard = document.getElementById('dashboard');
  lastSync = document.getElementById('lastSync');
  countNew = document.getElementById('countNew');
  countInProgress = document.getElementById('countInProgress');
  countReady = document.getElementById('countReady');
  ordersList = document.getElementById('ordersList');
  emptyState = document.getElementById('emptyState');
  adminToast = document.getElementById('adminToast');
  enableNotificationsBtn = document.getElementById('enableNotificationsBtn');
  logoutBtn = document.getElementById('logoutBtn');
  openDeleteOrdersBtn = document.getElementById('openDeleteOrdersBtn');
  deleteOrdersBackdrop = document.getElementById('deleteOrdersBackdrop');
  deleteOrdersModal = document.getElementById('deleteOrdersModal');
  closeDeleteOrdersModalBtn = document.getElementById('closeDeleteOrdersModalBtn');
  cancelDeleteOrdersBtn = document.getElementById('cancelDeleteOrdersBtn');
  executeDeleteOrdersBtn = document.getElementById('executeDeleteOrdersBtn');
  deleteConfirmInput = document.getElementById('deleteConfirmInput');
  deleteModalError = document.getElementById('deleteModalError');
  deleteMatchCount = document.getElementById('deleteMatchCount');
  statusFilterGroup = document.getElementById('statusFilterGroup');
  selectionModeNote = document.getElementById('selectionModeNote');
  selectionToolbar = document.getElementById('selectionToolbar');
  selectionToolbarInfo = document.getElementById('selectionToolbarInfo');
  selectAllOrdersBtn = document.getElementById('selectAllOrdersBtn');
  clearAllOrdersBtn = document.getElementById('clearAllOrdersBtn');
  deleteSelectedOrdersBtn = document.getElementById('deleteSelectedOrdersBtn');
}

function initAdminPage() {
  initDomRefs();

  if (!pinGate || !pinInput || !pinSubmit || !pinError || !dashboard) {
    throw new Error('Admin page required elements are missing.');
  }

  pinSubmit.addEventListener('click', submitPin);
  pinInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submitPin();
  });

  if (enableNotificationsBtn) {
    enableNotificationsBtn.addEventListener('click', requestNotificationPermission);
  }

  if (openDeleteOrdersBtn) {
    openDeleteOrdersBtn.addEventListener('click', () => {
      openDeleteOrdersModal();
    });
  }

  if (closeDeleteOrdersModalBtn) {
    closeDeleteOrdersModalBtn.addEventListener('click', closeDeleteOrdersModal);
  }

  if (cancelDeleteOrdersBtn) {
    cancelDeleteOrdersBtn.addEventListener('click', closeDeleteOrdersModal);
  }

  if (deleteOrdersBackdrop) {
    deleteOrdersBackdrop.addEventListener('click', closeDeleteOrdersModal);
  }

  if (deleteOrdersModal) {
    deleteOrdersModal.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.name === 'deleteMode' || target.classList.contains('status-delete-filter')) {
        deleteModalError.textContent = '';
        updateDeleteUiState();
      }
    });
  }

  if (deleteConfirmInput) {
    deleteConfirmInput.addEventListener('input', () => {
      deleteModalError.textContent = '';
      updateDeleteUiState();
    });
  }

  if (executeDeleteOrdersBtn) {
    executeDeleteOrdersBtn.addEventListener('click', () => {
      executeDeleteOrders().catch((error) => {
        console.error('Delete action failed', error);
        deleteModalError.textContent = 'שגיאה במחיקה. נסו שוב.';
        deletionInFlight = false;
        updateDeleteUiState();
      });
    });
  }

  if (selectAllOrdersBtn) {
    selectAllOrdersBtn.addEventListener('click', () => {
      latestOrders.forEach((order) => selectedOrderIds.add(order.id));
      renderOrders(latestOrders);
    });
  }

  if (clearAllOrdersBtn) {
    clearAllOrdersBtn.addEventListener('click', () => {
      selectedOrderIds.clear();
      renderOrders(latestOrders);
    });
  }

  if (deleteSelectedOrdersBtn) {
    deleteSelectedOrdersBtn.addEventListener('click', () => {
      openDeleteOrdersModal('selection');
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      lockDashboard();
    });
  }

  if (hasStoredAuth()) {
    unlockDashboard({ persist: false });
  } else {
    lockDashboard({ clearStoredAuth: false, focusPin: false });
  }

  window.addEventListener('beforeunload', () => {
    stopRealtimeOrders();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isDeleteModalOpen) {
      closeDeleteOrdersModal();
    }
  });
}

function bootAdminPage() {
  try {
    initAdminPage();
  } catch (error) {
    showFatalError(error);
  }
}

window.addEventListener('error', (event) => {
  showFatalError(event.error || event.message || new Error('Unknown runtime error'));
});

window.addEventListener('unhandledrejection', (event) => {
  showFatalError(event.reason || new Error('Unhandled promise rejection'));
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootAdminPage, { once: true });
} else {
  bootAdminPage();
}
