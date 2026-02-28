import { db } from './src/firebase.js';
const FIRESTORE_MODULE_URL =
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const ADMIN_PIN = '1234';
const SESSION_KEY = 'itziks-admin-pin-ok';

const STATUS_LABELS = {
  new: 'חדש',
  in_progress: 'בהכנה',
  ready: 'מוכן',
  delivered: 'נמסר',
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

function addonsToText(addons) {
  if (!Array.isArray(addons) || addons.length === 0) return '';
  const translated = addons.map((addon) => {
    if (addon === 'extra_shot') return 'שוט נוסף';
    if (addon === 'vanilla') return 'וניל';
    return addon;
  });
  return translated.join(', ');
}

function formatModifiers(modifiers) {
  if (!modifiers || typeof modifiers !== 'object') return '';

  const parts = [];
  if (modifiers.size) parts.push(`גודל: ${modifiers.size}`);
  if (modifiers.milk) parts.push(`חלב: ${modifiers.milk}`);
  const addonsText = addonsToText(modifiers.addons);
  if (addonsText) parts.push(`תוספות: ${addonsText}`);
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

function renderOrders(orders) {
  ordersList.innerHTML = '';
  const hasOrders = orders.length > 0;
  emptyState.hidden = hasOrders;

  if (!hasOrders) return;

  orders.forEach((order) => {
    const card = document.createElement('article');
    card.className = 'order-card';
    card.innerHTML = `
      <div class="order-head">
        <div>
          <h3>הזמנה #${escapeHtml(order.id.slice(0, 8))}</h3>
          <span class="status-pill ${escapeHtml(order.status)}">${escapeHtml(STATUS_LABELS[order.status] || order.status)}</span>
        </div>
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

  new Notification('העגלה של איציק', {
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
  const ordersQuery = fs.query(
    fs.collection(firestoreDb, 'orders'),
    fs.orderBy('createdAt', 'desc'),
  );

  unsubscribeOrders = fs.onSnapshot(
    ordersQuery,
    (snapshot) => {
      handleIncomingNewOrders(snapshot);
      const orders = snapshot.docs.map((orderDoc) => ({
        id: orderDoc.id,
        status: 'new',
        ...orderDoc.data(),
      }));

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

function unlockDashboard() {
  sessionStorage.setItem(SESSION_KEY, '1');
  pinGate.hidden = true;
  dashboard.hidden = false;
  updateNotificationsButton();
  startRealtimeOrders().catch((error) => {
    showFatalError(error);
  });
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

  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    unlockDashboard();
  }

  window.addEventListener('beforeunload', () => {
    if (typeof unsubscribeOrders === 'function') {
      unsubscribeOrders();
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
