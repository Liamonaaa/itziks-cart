import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { db } from './src/firebase.js';

const WHATSAPP_NUMBER = '972500000000';
const STATUS_FLOW = ['new', 'in_progress', 'ready', 'delivered'];
const DELIVERED_STATUS = 'delivered';
const DELIVERED_CONFIRMED_PREFIX = 'deliveredConfirmed_';
const DELIVERED_DENIED_PREFIX = 'deliveredDenied_';
const CHAT_MAX_CHARS = 500;

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
  orderChatSection: document.getElementById('orderChatSection'),
  chatUnreadBadge: document.getElementById('chatUnreadBadge'),
  chatEmpty: document.getElementById('chatEmpty'),
  chatMessagesList: document.getElementById('chatMessagesList'),
  chatComposeForm: document.getElementById('chatComposeForm'),
  chatInput: document.getElementById('chatInput'),
  chatCharCount: document.getElementById('chatCharCount'),
  chatSendBtn: document.getElementById('chatSendBtn'),
  chatError: document.getElementById('chatError'),
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
let unsubscribeMessages = null;
let currentOrderId = '';
let currentOrderRef = null;
let currentOrderData = null;
let currentMessages = [];
let knownBusinessMessageCount = null;
let isDeliveredModalOpen = false;
let lastFocusedBeforeModal = null;
let modalLockedScrollY = 0;
let toastTimer = null;
let decisionInFlight = false;
let chatSendInFlight = false;
let chatReadInFlight = false;
let hasInteractedWithChat = false;

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

  if (modifiers.drinkType) {
    lines.push(`שתייה: ${modifiers.drinkType}`);
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

function formatTimestamp(value) {
  const millis = toMillis(value);
  if (!millis) return '--';
  return new Date(millis).toLocaleString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
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

function focusChatSection() {
  if (!ui.orderChatSection) return;
  ui.orderChatSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  ui.orderChatSection.focus({ preventScroll: true });
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
        <strong>${escapeHtml(item.displayName || item.name || 'פריט')}</strong>
        <strong>${formatMoney(lineTotal)}</strong>
      </div>
      <div class="item-sub">כמות: ${qty} | מחיר יחידה: ${formatMoney(unitPrice)}</div>
      ${modifiersHtml}
    `;
    ui.orderItems.append(itemElement);
  });
}

function normalizeLegacyReplies(replies) {
  if (!Array.isArray(replies) || replies.length === 0) return [];
  return replies
    .map((reply, index) => {
      const text = typeof reply?.text === 'string' ? reply.text.trim() : '';
      if (!text) return null;
      const createdAt = reply?.createdAt || null;
      return {
        id: `legacy-${index}`,
        sender: 'business',
        text,
        createdAt,
        createdAtMs: toMillis(createdAt),
        readByBusiness: true,
        readByCustomer: true,
        ref: null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
}

function normalizeMessageFromDoc(messageDoc) {
  const data = messageDoc.data() || {};
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) return null;

  const sender = data.sender === 'customer' ? 'customer' : 'business';
  const createdAt = data.createdAt || null;

  return {
    id: messageDoc.id,
    sender,
    text,
    createdAt,
    createdAtMs: toMillis(createdAt),
    readByBusiness: data.readByBusiness === true,
    readByCustomer: data.readByCustomer === true,
    ref: messageDoc.ref,
  };
}

function setUnreadBadge(unreadCount) {
  if (!ui.chatUnreadBadge) return;
  const hasUnread = unreadCount > 0;
  ui.chatUnreadBadge.hidden = !hasUnread;
  ui.chatUnreadBadge.textContent = hasUnread ? 'חדש' : '';
}

function renderChat(messages, { shouldNotify = false } = {}) {
  if (!ui.chatMessagesList || !ui.chatEmpty) return;

  const sourceMessages = messages.length
    ? messages
    : normalizeLegacyReplies(currentOrderData?.adminReplies);

  ui.chatMessagesList.innerHTML = '';

  sourceMessages.forEach((message) => {
    const item = document.createElement('li');
    item.className = `chat-message-item ${message.sender}`;
    item.innerHTML = `
      <article class="chat-message-bubble">
        <p class="chat-message-text">${escapeHtml(message.text)}</p>
        <div class="chat-message-meta">
          <span>${message.sender === 'business' ? 'העסק' : 'אתם'}</span>
          <span>${escapeHtml(formatTimestamp(message.createdAt || message.createdAtMs))}</span>
        </div>
      </article>
    `;
    ui.chatMessagesList.append(item);
  });

  const hasMessages = sourceMessages.length > 0;
  ui.chatEmpty.hidden = hasMessages;

  const unreadBusinessCount = messages.filter(
    (message) => message.sender === 'business' && message.readByCustomer !== true,
  ).length;
  setUnreadBadge(unreadBusinessCount);

  const businessCount = messages.filter((message) => message.sender === 'business').length;
  if (knownBusinessMessageCount === null) {
    knownBusinessMessageCount = businessCount;
  } else {
    if (shouldNotify && businessCount > knownBusinessMessageCount && !hasInteractedWithChat) {
      showNewReplyToast();
    }
    knownBusinessMessageCount = businessCount;
  }

  if (hasInteractedWithChat && unreadBusinessCount > 0) {
    markBusinessMessagesRead();
  }

  if (messages.length > 0) {
    ui.chatMessagesList.scrollTop = ui.chatMessagesList.scrollHeight;
  }
}

function updateChatCharCounter() {
  if (!ui.chatInput || !ui.chatCharCount) return;
  const remaining = CHAT_MAX_CHARS - ui.chatInput.value.length;
  ui.chatCharCount.textContent = `נותרו ${remaining} תווים`;
  ui.chatCharCount.classList.toggle('is-limit', remaining <= 30);
}

function clearChatError() {
  if (!ui.chatError) return;
  ui.chatError.textContent = '';
}

async function markBusinessMessagesRead() {
  if (chatReadInFlight) return;
  if (!currentOrderRef || !db) return;

  const unreadMessages = currentMessages.filter(
    (message) =>
      message.sender === 'business' &&
      message.readByCustomer !== true &&
      message.ref,
  );

  if (unreadMessages.length === 0) {
    hideNewReplyToast();
    return;
  }

  chatReadInFlight = true;
  try {
    const batch = writeBatch(db);
    unreadMessages.forEach((message) => {
      batch.update(message.ref, { readByCustomer: true });
    });
    batch.update(currentOrderRef, { unreadForCustomerCount: 0 });
    await batch.commit();
    hideNewReplyToast();
  } catch (error) {
    console.error('Failed to mark business messages as read', error);
  } finally {
    chatReadInFlight = false;
  }
}

async function sendCustomerMessage() {
  if (chatSendInFlight) return;
  if (!currentOrderId || !currentOrderRef || !db) return;
  if (!ui.chatInput || !ui.chatSendBtn) return;

  const text = ui.chatInput.value.trim();
  if (!text) {
    if (ui.chatError) {
      ui.chatError.textContent = 'יש להזין הודעה לפני שליחה.';
    }
    return;
  }

  if (text.length > CHAT_MAX_CHARS) {
    if (ui.chatError) {
      ui.chatError.textContent = `מקסימום ${CHAT_MAX_CHARS} תווים.`;
    }
    return;
  }

  chatSendInFlight = true;
  ui.chatSendBtn.disabled = true;
  clearChatError();

  try {
    await addDoc(collection(db, 'orders', currentOrderId, 'messages'), {
      sender: 'customer',
      text,
      createdAt: serverTimestamp(),
      readByBusiness: false,
      readByCustomer: true,
    });

    await updateDoc(currentOrderRef, {
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: text.slice(0, 120),
      unreadForBusinessCount: increment(1),
    });

    ui.chatInput.value = '';
    updateChatCharCounter();
    showOrderToast('ההודעה נשלחה');
    hasInteractedWithChat = true;
  } catch (error) {
    console.error('Failed to send customer message', error);
    if (ui.chatError) {
      ui.chatError.textContent = 'שגיאה בשליחת ההודעה. נסו שוב.';
    }
  } finally {
    chatSendInFlight = false;
    ui.chatSendBtn.disabled = false;
  }
}

function showNotFound(message) {
  ui.loadingCard.hidden = true;
  ui.orderContent.hidden = true;
  ui.notFoundCard.hidden = false;
  closeDeliveredModal({ restoreFocus: false });
  hideDeniedWarning();
  ui.notFoundMessage.textContent = message || 'לא הצלחנו למצוא את ההזמנה המבוקשת.';
  currentOrderData = null;
  currentMessages = [];
  knownBusinessMessageCount = null;
  hideNewReplyToast();
  renderChat([], { shouldNotify: false });
}

function showOrderContent() {
  ui.loadingCard.hidden = true;
  ui.notFoundCard.hidden = true;
  ui.orderContent.hidden = false;
}

function renderOrder(orderId, orderData) {
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
}

function bindChatEvents() {
  if (ui.chatInput) {
    ui.chatInput.addEventListener('input', () => {
      if (ui.chatInput.value.length > CHAT_MAX_CHARS) {
        ui.chatInput.value = ui.chatInput.value.slice(0, CHAT_MAX_CHARS);
      }
      clearChatError();
      updateChatCharCounter();
    });
  }

  if (ui.chatComposeForm) {
    ui.chatComposeForm.addEventListener('submit', (event) => {
      event.preventDefault();
      sendCustomerMessage();
    });
  }

  const engageChat = () => {
    hasInteractedWithChat = true;
    hideNewReplyToast();
    markBusinessMessagesRead();
  };

  if (ui.orderChatSection) {
    ui.orderChatSection.addEventListener('focusin', engageChat);
    ui.orderChatSection.addEventListener('click', engageChat);
  }

  if (ui.showReplySectionBtn) {
    ui.showReplySectionBtn.addEventListener('click', () => {
      hideNewReplyToast();
      hasInteractedWithChat = true;
      focusChatSection();
      markBusinessMessagesRead();
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && hasInteractedWithChat) {
      markBusinessMessagesRead();
    }
  });

  updateChatCharCounter();
}

function stopListeners() {
  if (typeof unsubscribeOrder === 'function') {
    unsubscribeOrder();
    unsubscribeOrder = null;
  }

  if (typeof unsubscribeMessages === 'function') {
    unsubscribeMessages();
    unsubscribeMessages = null;
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
  currentMessages = [];
  knownBusinessMessageCount = null;
  hasInteractedWithChat = false;

  bindDeliveryDecisionEvents();
  bindChatEvents();

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
      currentOrderData = snapshot.data() || null;
      showOrderContent();
      renderOrder(orderId, currentOrderData);
      if (currentMessages.length === 0) {
        renderChat(currentMessages, { shouldNotify: false });
      }
    },
    (error) => {
      console.error('Failed to load order status', error);
      showNotFound('שגיאה בטעינת ההזמנה');
    },
  );

  const messagesQuery = query(
    collection(db, 'orders', orderId, 'messages'),
    orderBy('createdAt', 'asc'),
  );

  unsubscribeMessages = onSnapshot(
    messagesQuery,
    (snapshot) => {
      const shouldNotify = knownBusinessMessageCount !== null;
      currentMessages = snapshot.docs
        .map((messageDoc) => normalizeMessageFromDoc(messageDoc))
        .filter(Boolean);
      renderChat(currentMessages, { shouldNotify });
    },
    (error) => {
      console.error('Failed to load order chat messages', error);
      if (ui.chatError) {
        ui.chatError.textContent = 'שגיאה בטעינת הודעות הצ׳אט.';
      }
    },
  );
}

window.addEventListener('beforeunload', () => {
  stopListeners();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOrderPage, { once: true });
} else {
  initOrderPage();
}
