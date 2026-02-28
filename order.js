import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { db } from './src/firebase.js';

const WHATSAPP_NUMBER = '972500000000';
const STATUS_FLOW = ['new', 'in_progress', 'ready', 'delivered'];
const DELIVERED_STATUS = 'delivered';
const DELIVERED_CONFIRMED_PREFIX = 'deliveredConfirmed_';
const DELIVERED_DENIED_PREFIX = 'deliveredDenied_';

const STATUS_META = {
  new: { label: 'חדש', className: 'new' },
  in_progress: { label: 'בהכנה', className: 'in_progress' },
  ready: { label: 'מוכן', className: 'ready' },
  delivered: { label: 'נמסר', className: 'delivered' },
  cancelled: { label: 'בוטל', className: 'cancelled' },
};

const ui = {
  loadingCard: document.getElementById('loadingCard'),
  notFoundCard: document.getElementById('notFoundCard'),
  notFoundMessage: document.getElementById('notFoundMessage'),
  orderContent: document.getElementById('orderContent'),
  orderNumber: document.getElementById('orderNumber'),
  orderStatusBadge: document.getElementById('orderStatusBadge'),
  cancelledNote: document.getElementById('cancelledNote'),
  statusTimeline: document.getElementById('statusTimeline'),
  pickupText: document.getElementById('pickupText'),
  customerName: document.getElementById('customerName'),
  customerPhone: document.getElementById('customerPhone'),
  customerNotes: document.getElementById('customerNotes'),
  orderItems: document.getElementById('orderItems'),
  orderTotal: document.getElementById('orderTotal'),
  businessRepliesSection: document.getElementById('businessRepliesSection'),
  businessRepliesEmpty: document.getElementById('businessRepliesEmpty'),
  businessRepliesList: document.getElementById('businessRepliesList'),
  newReplyToast: document.getElementById('newReplyToast'),
  showReplySectionBtn: document.getElementById('showReplySectionBtn'),
  deliveredWarning: document.getElementById('deliveredWarning'),
  deliveredWarningWhatsapp: document.getElementById('deliveredWarningWhatsapp'),
  deliveredModalBackdrop: document.getElementById('deliveredModalBackdrop'),
  deliveredConfirmModal: document.getElementById('deliveredConfirmModal'),
  deliveredYesBtn: document.getElementById('deliveredYesBtn'),
  deliveredNoBtn: document.getElementById('deliveredNoBtn'),
  orderToast: document.getElementById('orderToast'),
};

let unsubscribeOrder = null;
let currentOrderId = '';
let currentOrderRef = null;
let currentOrderData = null;
let isDeliveredModalOpen = false;
let lastFocusedBeforeModal = null;
let modalLockedScrollY = 0;
let toastTimer = null;
let decisionInFlight = false;
let knownReplyCount = null;

const shekelFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMoney(value) {
  const number = Number(value);
  return shekelFormatter.format(Number.isFinite(number) ? number : 0);
}

function formatPickupText(pickup) {
  if (!pickup || typeof pickup !== 'object') return '--';
  if (pickup.dayLabel) return pickup.dayLabel;
  if (!pickup.time) return '--';

  const date = new Date(pickup.time);
  if (Number.isNaN(date.getTime())) return String(pickup.time);
  return date.toLocaleString('he-IL', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatModifiers(modifiers) {
  if (!modifiers || typeof modifiers !== 'object') return [];
  const lines = [];

  if (Array.isArray(modifiers.salads) && modifiers.salads.length > 0) {
    lines.push(`סלטים: ${modifiers.salads.join(', ')}`);
  }
  if (Array.isArray(modifiers.sauces) && modifiers.sauces.length > 0) {
    lines.push(`רטבים: ${modifiers.sauces.join(', ')}`);
  }
  if (Array.isArray(modifiers.pickles) && modifiers.pickles.length > 0) {
    lines.push(`חמוצים: ${modifiers.pickles.join(', ')}`);
  }
  if (Array.isArray(modifiers.paidAddons) && modifiers.paidAddons.length > 0) {
    const paidText = modifiers.paidAddons
      .map((addon) => {
        if (!addon) return '';
        if (typeof addon === 'string') return addon;
        const label = addon.label || addon.id || 'תוספת';
        const price = Number(addon.price);
        if (!Number.isFinite(price)) return label;
        return `${label} (+${formatMoney(price)})`;
      })
      .filter(Boolean)
      .join(', ');
    if (paidText) lines.push(`תוספות בתשלום: ${paidText}`);
  }

  if (modifiers.size) lines.push(`גודל: ${modifiers.size}`);
  if (modifiers.milk) lines.push(`חלב: ${modifiers.milk}`);
  if (Array.isArray(modifiers.addons) && modifiers.addons.length > 0) {
    lines.push(`תוספות: ${modifiers.addons.join(', ')}`);
  }

  return lines;
}

function toMillis(value) {
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value);
  const millis = parsed.getTime();
  return Number.isNaN(millis) ? 0 : millis;
}

function replyTimestampMillis(reply) {
  if (!reply || typeof reply !== 'object') return 0;
  if (Number.isFinite(reply.createdAtMs)) return reply.createdAtMs;
  return toMillis(reply.createdAt);
}

function formatReplyTimestamp(value) {
  const millis = toMillis(value);
  if (!millis) return '--';
  return new Date(millis).toLocaleString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function normalizeAdminReplies(replies) {
  if (!Array.isArray(replies) || replies.length === 0) return [];

  return replies
    .map((reply) => {
      if (!reply || typeof reply !== 'object') return null;
      const text = typeof reply.text === 'string' ? reply.text.trim() : '';
      if (!text) return null;
      return {
        text,
        author: typeof reply.author === 'string' ? reply.author : 'staff',
        createdAt: reply.createdAt || null,
        createdAtMs: replyTimestampMillis(reply),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.createdAtMs !== right.createdAtMs) {
        return left.createdAtMs - right.createdAtMs;
      }
      return left.text.localeCompare(right.text, 'he');
    });
}

function shortOrderNumber(orderId) {
  return orderId.slice(-6).toUpperCase();
}

function deliveredConfirmedKey(orderId) {
  return `${DELIVERED_CONFIRMED_PREFIX}${orderId}`;
}

function deliveredDeniedKey(orderId) {
  return `${DELIVERED_DENIED_PREFIX}${orderId}`;
}

function getStoredFlag(key) {
  try {
    return localStorage.getItem(key) === 'true';
  } catch (error) {
    console.error('Failed to read localStorage flag', error);
    return false;
  }
}

function setStoredFlag(key) {
  try {
    localStorage.setItem(key, 'true');
  } catch (error) {
    console.error('Failed to write localStorage flag', error);
  }
}

function removeStoredFlag(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Failed to remove localStorage flag', error);
  }
}

function isDeliveredConfirmed(orderId) {
  return getStoredFlag(deliveredConfirmedKey(orderId));
}

function isDeliveredDenied(orderId) {
  return getStoredFlag(deliveredDeniedKey(orderId));
}

function persistLocalDeliveryDecision(orderId, decision) {
  if (!orderId) return;
  const confirmedKey = deliveredConfirmedKey(orderId);
  const deniedKey = deliveredDeniedKey(orderId);
  if (decision === true) {
    setStoredFlag(confirmedKey);
    removeStoredFlag(deniedKey);
    return;
  }
  setStoredFlag(deniedKey);
  removeStoredFlag(confirmedKey);
}

function showOrderToast(message, timeoutMs = 2400) {
  if (!ui.orderToast) return;

  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  ui.orderToast.textContent = message;
  ui.orderToast.classList.add('show');
  toastTimer = window.setTimeout(() => {
    ui.orderToast.classList.remove('show');
    toastTimer = null;
  }, timeoutMs);
}

function hideNewReplyToast() {
  if (!ui.newReplyToast) return;
  ui.newReplyToast.classList.remove('show');
  window.setTimeout(() => {
    if (!ui.newReplyToast.classList.contains('show')) {
      ui.newReplyToast.hidden = true;
    }
  }, 220);
}

function showNewReplyToast() {
  if (!ui.newReplyToast) return;
  ui.newReplyToast.hidden = false;
  requestAnimationFrame(() => {
    ui.newReplyToast.classList.add('show');
  });
}

function focusRepliesSection() {
  if (!ui.businessRepliesSection) return;
  ui.businessRepliesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  ui.businessRepliesSection.focus({ preventScroll: true });
}

function setDeliveryDecisionButtonsDisabled(disabled) {
  if (ui.deliveredYesBtn) ui.deliveredYesBtn.disabled = disabled;
  if (ui.deliveredNoBtn) ui.deliveredNoBtn.disabled = disabled;
}

function lockBodyScrollForModal() {
  if (document.body.classList.contains('order-modal-open')) return;
  modalLockedScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.style.top = `-${modalLockedScrollY}px`;
  document.body.classList.add('order-modal-open');
}

function unlockBodyScrollForModal() {
  if (!document.body.classList.contains('order-modal-open')) return;
  document.body.classList.remove('order-modal-open');
  document.body.style.top = '';
  window.scrollTo(0, modalLockedScrollY);
}

function getModalFocusableElements() {
  if (!ui.deliveredConfirmModal) return [];
  return Array.from(
    ui.deliveredConfirmModal.querySelectorAll(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled'));
}

function openDeliveredModal() {
  if (isDeliveredModalOpen) return;
  if (!ui.deliveredConfirmModal || !ui.deliveredModalBackdrop) return;

  isDeliveredModalOpen = true;
  lastFocusedBeforeModal =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  ui.deliveredModalBackdrop.hidden = false;
  ui.deliveredConfirmModal.hidden = false;
  requestAnimationFrame(() => {
    ui.deliveredModalBackdrop.classList.add('show');
    ui.deliveredConfirmModal.classList.add('show');
  });
  lockBodyScrollForModal();
  ui.deliveredYesBtn?.focus({ preventScroll: true });
}

function closeDeliveredModal({ restoreFocus = true } = {}) {
  if (!ui.deliveredConfirmModal || !ui.deliveredModalBackdrop) return;

  isDeliveredModalOpen = false;
  ui.deliveredModalBackdrop.classList.remove('show');
  ui.deliveredConfirmModal.classList.remove('show');
  unlockBodyScrollForModal();
  window.setTimeout(() => {
    if (!isDeliveredModalOpen) {
      ui.deliveredModalBackdrop.hidden = true;
      ui.deliveredConfirmModal.hidden = true;
    }
  }, 230);

  if (restoreFocus && lastFocusedBeforeModal) {
    lastFocusedBeforeModal.focus({ preventScroll: true });
  }
  lastFocusedBeforeModal = null;
}

function hideDeniedWarning() {
  if (!ui.deliveredWarning) return;
  ui.deliveredWarning.hidden = true;
}

function showDeniedWarning(orderId) {
  if (!ui.deliveredWarning) return;
  ui.deliveredWarning.hidden = false;
  if (ui.deliveredWarningWhatsapp) {
    const text = `היי, עדיין לא קיבלתי את ההזמנה #${shortOrderNumber(orderId)}`;
    ui.deliveredWarningWhatsapp.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
  }
}

function syncDeliveryDecisionUi(orderId, status) {
  const isDelivered = status === DELIVERED_STATUS;
  if (!isDelivered) {
    closeDeliveredModal({ restoreFocus: false });
    hideDeniedWarning();
    return;
  }

  const confirmed = isDeliveredConfirmed(orderId);
  const denied = isDeliveredDenied(orderId);
  const firestoreConfirmed = currentOrderData?.deliveryConfirmed === true;
  const firestoreDenied = currentOrderData?.deliveryConfirmed === false;

  if (firestoreDenied || denied) {
    showDeniedWarning(orderId);
  } else {
    hideDeniedWarning();
  }

  if (!(firestoreConfirmed || firestoreDenied || confirmed || denied)) {
    openDeliveredModal();
  } else {
    closeDeliveredModal({ restoreFocus: false });
  }
}

function handleModalKeydown(event) {
  if (!isDeliveredModalOpen) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (event.key !== 'Tab') return;
  const focusables = getModalFocusableElements();
  if (focusables.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (!focusables.includes(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function renderTimeline(status) {
  if (!ui.statusTimeline) return;
  const stepElements = Array.from(ui.statusTimeline.querySelectorAll('li'));
  const currentIndex = STATUS_FLOW.indexOf(status);

  stepElements.forEach((element) => {
    element.classList.remove('is-current', 'is-complete');
  });

  if (status === 'cancelled') return;
  if (currentIndex === -1) return;

  stepElements.forEach((element, index) => {
    if (index < currentIndex) {
      element.classList.add('is-complete');
    } else if (index === currentIndex) {
      element.classList.add('is-current');
    }
  });
}

function renderItems(items) {
  ui.orderItems.innerHTML = '';
  if (!Array.isArray(items) || items.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'item-row';
    emptyItem.textContent = 'אין פריטים בהזמנה';
    ui.orderItems.append(emptyItem);
    return;
  }

  items.forEach((item) => {
    const qty = Number(item.qty) || 0;
    const lineTotal = Number(item.lineTotal) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const modifierLines = formatModifiers(item.modifiers);
    const modifiersHtml = modifierLines
      .map((line) => `<div class="item-sub">${escapeHtml(line)}</div>`)
      .join('');

    const itemElement = document.createElement('li');
    itemElement.className = 'item-row';
    itemElement.innerHTML = `
      <div class="item-top">
        <strong>${escapeHtml(item.name || 'פריט')}</strong>
        <strong>${formatMoney(lineTotal)}</strong>
      </div>
      <div class="item-sub">כמות: ${qty} | מחיר יחידה: ${formatMoney(unitPrice)}</div>
      ${modifiersHtml}
    `;
    ui.orderItems.append(itemElement);
  });
}

function renderBusinessReplies(replies, { shouldNotify = false } = {}) {
  if (!ui.businessRepliesList || !ui.businessRepliesEmpty) return;

  const normalizedReplies = normalizeAdminReplies(replies);
  ui.businessRepliesList.innerHTML = '';

  if (normalizedReplies.length === 0) {
    ui.businessRepliesEmpty.hidden = false;
  } else {
    ui.businessRepliesEmpty.hidden = true;
    normalizedReplies.forEach((reply) => {
      const replyElement = document.createElement('li');
      replyElement.className = 'business-reply-item';
      replyElement.innerHTML = `
        <p class="business-reply-text">${escapeHtml(reply.text)}</p>
        <div class="business-reply-meta">
          <span>${escapeHtml(reply.author === 'staff' ? 'צוות' : reply.author)}</span>
          <span>${escapeHtml(formatReplyTimestamp(reply.createdAt || reply.createdAtMs))}</span>
        </div>
      `;
      ui.businessRepliesList.append(replyElement);
    });
  }

  if (knownReplyCount === null) {
    knownReplyCount = normalizedReplies.length;
    return;
  }

  if (shouldNotify && normalizedReplies.length > knownReplyCount) {
    showNewReplyToast();
  }
  knownReplyCount = normalizedReplies.length;
}

function showNotFound(message) {
  ui.loadingCard.hidden = true;
  ui.orderContent.hidden = true;
  ui.notFoundCard.hidden = false;
  closeDeliveredModal({ restoreFocus: false });
  hideDeniedWarning();
  ui.notFoundMessage.textContent = message || 'לא הצלחנו למצוא את ההזמנה המבוקשת.';
  currentOrderData = null;
  knownReplyCount = null;
  hideNewReplyToast();
}

function showOrderContent() {
  ui.loadingCard.hidden = true;
  ui.notFoundCard.hidden = true;
  ui.orderContent.hidden = false;
}

function renderOrder(orderId, orderData, { notifyOnNewReply = false } = {}) {
  const status = typeof orderData.status === 'string' ? orderData.status : 'new';
  const statusMeta = STATUS_META[status] || STATUS_META.new;

  syncDeliveryDecisionUi(orderId, status);
  ui.orderNumber.textContent = `#${shortOrderNumber(orderId)}`;
  ui.orderStatusBadge.textContent = statusMeta.label;
  ui.orderStatusBadge.className = `status-badge ${statusMeta.className}`;
  ui.cancelledNote.hidden = status !== 'cancelled';
  renderTimeline(status);

  ui.pickupText.textContent = formatPickupText(orderData.pickup);
  ui.customerName.textContent = orderData.customer?.name || '--';
  ui.customerPhone.textContent = orderData.customer?.phone || '--';
  ui.customerNotes.textContent = orderData.notes || 'ללא';

  renderItems(orderData.items);
  ui.orderTotal.textContent = formatMoney(orderData.total);
  renderBusinessReplies(orderData.adminReplies, { shouldNotify: notifyOnNewReply });
}

async function submitDeliveryDecision(decision) {
  if (decisionInFlight) return false;
  if (!currentOrderRef || !currentOrderId) return false;

  decisionInFlight = true;
  setDeliveryDecisionButtonsDisabled(true);

  try {
    const snapshot = await getDoc(currentOrderRef);
    if (!snapshot.exists()) {
      showOrderToast('ההזמנה לא נמצאה', 2600);
      return false;
    }

    const liveOrder = snapshot.data() || {};
    if (liveOrder.status !== DELIVERED_STATUS) {
      showOrderToast('ההזמנה עדיין לא סומנה כנמסרה', 2600);
      return false;
    }

    await updateDoc(currentOrderRef, {
      deliveryConfirmed: decision,
      deliveryConfirmedAt: serverTimestamp(),
      deliveryConfirmNote: decision ? 'customer_confirmed' : 'customer_denied',
    });

    persistLocalDeliveryDecision(currentOrderId, decision);
    return true;
  } catch (error) {
    console.error('Failed to update delivery decision', error);
    showOrderToast('שגיאה בעדכון אישור המסירה', 2800);
    return false;
  } finally {
    decisionInFlight = false;
    setDeliveryDecisionButtonsDisabled(false);
  }
}

function bindDeliveryDecisionEvents() {
  if (ui.deliveredYesBtn) {
    ui.deliveredYesBtn.addEventListener('click', async () => {
      if (!currentOrderId) return;
      const success = await submitDeliveryDecision(true);
      if (!success) return;
      closeDeliveredModal();
      hideDeniedWarning();
      showOrderToast('מעולה ✅ בתיאבון!');
    });
  }

  if (ui.deliveredNoBtn) {
    ui.deliveredNoBtn.addEventListener('click', async () => {
      if (!currentOrderId) return;
      const success = await submitDeliveryDecision(false);
      if (!success) return;
      closeDeliveredModal();
      showDeniedWarning(currentOrderId);
    });
  }

  document.addEventListener('keydown', handleModalKeydown);

  if (ui.showReplySectionBtn) {
    ui.showReplySectionBtn.addEventListener('click', () => {
      hideNewReplyToast();
      focusRepliesSection();
    });
  }
}

function initOrderPage() {
  const orderId = new URLSearchParams(window.location.search).get('id')?.trim();
  if (!orderId) {
    showNotFound('הזמנה לא נמצאה');
    return;
  }

  currentOrderId = orderId;
  currentOrderData = null;
  knownReplyCount = null;
  bindDeliveryDecisionEvents();

  if (!db) {
    showNotFound('שגיאה בחיבור למסד הנתונים');
    return;
  }

  const orderRef = doc(db, 'orders', orderId);
  currentOrderRef = orderRef;
  unsubscribeOrder = onSnapshot(
    orderRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        showNotFound('הזמנה לא נמצאה');
        return;
      }
      const shouldNotify = currentOrderData !== null;
      currentOrderData = snapshot.data() || null;
      showOrderContent();
      renderOrder(orderId, currentOrderData, { notifyOnNewReply: shouldNotify });
    },
    (error) => {
      console.error('Failed to load order status', error);
      showNotFound('שגיאה בטעינת ההזמנה');
    },
  );
}

window.addEventListener('beforeunload', () => {
  if (typeof unsubscribeOrder === 'function') {
    unsubscribeOrder();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOrderPage, { once: true });
} else {
  initOrderPage();
}
