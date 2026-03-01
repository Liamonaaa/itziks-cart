import { db } from "./src/firebase.js";
const FIRESTORE_MODULE_URL =
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const ADMIN_PIN = '1234';
const AUTH_STORAGE_KEY = 'itziks-admin-pin-ok';
const DELETE_CONFIRM_PHRASE = 'מחק';
const DELETE_BATCH_SIZE = 200;
const HISTORY_PAGE_SIZE = 50;
const ORDER_MESSAGE_MAX_CHARS = 500;
const SUPPORT_CHAT_MAX_CHARS = 500;

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
let liveBoardView = null;
let historyView = null;
let lastSync = null;
let countNew = null;
let countInProgress = null;
let countReady = null;
let ordersList = null;
let emptyState = null;
let historyOrdersList = null;
let historyEmptyState = null;
let historyLoadMoreBtn = null;
let openHistoryViewBtn = null;
let closeHistoryViewBtn = null;
let openSupportChatsViewBtn = null;
let closeSupportChatsViewBtn = null;
let supportChatsView = null;
let supportChatsList = null;
let supportChatsEmptyState = null;
let supportChatPanel = null;
let supportChatPanelEmpty = null;
let supportChatPanelBody = null;
let supportChatPanelTitle = null;
let supportChatPanelMeta = null;
let supportChatPanelStatus = null;
let supportChatMessages = null;
let supportChatComposeForm = null;
let supportChatInput = null;
let supportChatCharCount = null;
let supportChatSendBtn = null;
let supportChatError = null;
let closeSupportChatBtn = null;
let historySearchInput = null;
let historyRangeButtons = null;
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
let onlyDeniedDeliveryToggle = null;

const currencyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});

let toastTimer = null;
let initializedSnapshot = false;
let audioContext = null;
let unsubscribeOrders = null;
let unsubscribeSupportChats = null;
let unsubscribeSupportChatMessages = null;
let firestoreApi = null;
let firebaseInitPromise = null;
let latestOrders = [];
let latestSupportChats = [];
let deleteMode = 'all';
let deletionInFlight = false;
let isDeleteModalOpen = false;
let showOnlyDeniedDelivery = false;
let isHistoryView = false;
let isSupportChatsView = false;
let historySearchTerm = '';
let historyDateRange = 'all';
let historyVisibleCount = HISTORY_PAGE_SIZE;
const selectedOrderIds = new Set();
let isAdminSessionUnlocked = false;
const orderChatStateById = new Map();
let supportChatsInitializedSnapshot = false;
let supportActiveChatId = '';
let supportActiveMessages = [];
let supportChatSendInFlight = false;
let supportChatMarkReadInFlight = false;
const supportUnreadCountByChatId = new Map();
const DEFAULT_ADMIN_TITLE = document.title || 'Admin - Shawarma Hezi';

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
    // Production note: use Firebase Auth for real admin security.
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

function toMillis(value) {
  if (value?.toMillis) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value);
  const millis = parsed.getTime();
  return Number.isNaN(millis) ? 0 : millis;
}

function formatMillis(millis) {
  if (!Number.isFinite(millis) || millis <= 0) return '--';
  return new Date(millis).toLocaleString('he-IL', {
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
        createdAtMs: Number.isFinite(reply.createdAtMs) ? reply.createdAtMs : replyTimestampMillis(reply),
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

function renderAdminRepliesListHtml(replies) {
  const normalizedReplies = normalizeAdminReplies(replies);
  if (normalizedReplies.length === 0) {
    return '<li class="order-reply-empty">אין עדיין הודעות מהעסק.</li>';
  }

  return normalizedReplies
    .map(
      (reply) => `
        <li class="order-reply-item">
          <p class="order-reply-text">${escapeHtml(reply.text)}</p>
          <div class="order-reply-meta">
            <span>${escapeHtml(reply.author === 'staff' ? 'צוות' : reply.author)}</span>
            <span>${escapeHtml(formatReplyTimestamp(reply.createdAt || reply.createdAtMs))}</span>
          </div>
        </li>
      `,
    )
    .join('');
}

async function setOrderStatus(orderId, nextStatus) {
  try {
    const { firestoreApi: fs, db: firestoreDb } = await ensureFirebaseReady();
    const updatePayload = { status: nextStatus };
    if (nextStatus === 'delivered') {
      updatePayload.deliveryConfirmed = null;
      updatePayload.deliveryConfirmedAt = null;
      updatePayload.deliveryConfirmNote = '';
    }
    await fs.updateDoc(fs.doc(firestoreDb, 'orders', orderId), updatePayload);
  } catch (error) {
    console.error('Failed to update order status', error);
    showToast('שגיאה בעדכון סטטוס ההזמנה');
  }
}

function cleanupOrderChatState(orderId) {
  const state = orderChatStateById.get(orderId);
  if (state?.unsubscribe) {
    state.unsubscribe();
  }
  orderChatStateById.delete(orderId);
}

function cleanupAllOrderChats() {
  for (const orderId of orderChatStateById.keys()) {
    cleanupOrderChatState(orderId);
  }
}

function normalizeOrderMessage(messageDoc) {
  const data = messageDoc.data() || {};
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) return null;

  return {
    id: messageDoc.id,
    ref: messageDoc.ref,
    sender: data.sender === 'customer' ? 'customer' : 'business',
    text,
    createdAt: data.createdAt || null,
    readByBusiness: data.readByBusiness === true,
    readByCustomer: data.readByCustomer === true,
  };
}

function renderOrderMessagesListHtml(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return '<li class="order-reply-empty">אין עדיין הודעות בצ׳אט.</li>';
  }

  return messages
    .map(
      (message) => `
        <li class="order-reply-item ${escapeHtml(message.sender)}">
          <p class="order-reply-text">${escapeHtml(message.text)}</p>
          <div class="order-reply-meta">
            <span>${message.sender === 'customer' ? 'לקוח' : 'עסק'}</span>
            <span>${escapeHtml(formatReplyTimestamp(message.createdAt))}</span>
          </div>
        </li>
      `,
    )
    .join('');
}

async function sendBusinessMessage(orderId, text) {
  if (!isAdminSessionUnlocked || dashboard?.hidden) {
    throw new Error('UNAUTHORIZED_ADMIN_SESSION');
  }

  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    throw new Error('MESSAGE_EMPTY');
  }

  if (normalizedText.length > ORDER_MESSAGE_MAX_CHARS) {
    throw new Error('MESSAGE_TOO_LONG');
  }

  const { firestoreApi: fs, db: firestoreDb } = await ensureFirebaseReady();
  const orderRef = fs.doc(firestoreDb, 'orders', orderId);
  const messagesCollection = fs.collection(firestoreDb, 'orders', orderId, 'messages');
  const messageRef = fs.doc(messagesCollection);
  const batch = fs.writeBatch(firestoreDb);

  batch.set(messageRef, {
    sender: 'business',
    text: normalizedText,
    createdAt: fs.serverTimestamp(),
    readByBusiness: true,
    readByCustomer: false,
  });
  batch.update(orderRef, {
    lastMessageAt: fs.serverTimestamp(),
    lastMessagePreview: normalizedText.slice(0, 120),
    unreadForCustomerCount: fs.increment(1),
  });
  await batch.commit();
}

async function markCustomerMessagesAsRead(orderId) {
  const state = orderChatStateById.get(orderId);
  if (!state || state.markingRead) return;

  const order = latestOrders.find((entry) => entry.id === orderId) || null;
  const unreadDocs = state.messages.filter(
    (message) =>
      message.sender === 'customer' &&
      message.readByBusiness !== true &&
      message.ref,
  );
  if (unreadDocs.length === 0 && Number(order?.unreadForBusinessCount || 0) <= 0) return;

  state.markingRead = true;
  try {
    const { firestoreApi: fs, db: firestoreDb } = await ensureFirebaseReady();
    const orderRef = fs.doc(firestoreDb, 'orders', orderId);
    const batch = fs.writeBatch(firestoreDb);
    unreadDocs.forEach((message) => {
      batch.update(message.ref, { readByBusiness: true });
    });
    batch.update(orderRef, { unreadForBusinessCount: 0 });
    await batch.commit();
  } catch (error) {
    console.error('Failed to mark customer messages as read', error);
  } finally {
    state.markingRead = false;
  }
}

function bindOrderChat(card, order) {
  const toggleBtn = card.querySelector('.reply-toggle-btn');
  const composer = card.querySelector('.order-reply-compose');
  const textarea = card.querySelector('.order-reply-input');
  const charCount = card.querySelector('.order-reply-char-count');
  const errorNode = card.querySelector('.order-reply-error');
  const successNode = card.querySelector('.order-reply-success');
  const sendBtn = card.querySelector('.order-reply-send');
  const cancelBtn = card.querySelector('.order-reply-cancel');
  const repliesList = card.querySelector('.order-replies-list');
  const repliesCount = card.querySelector('.order-replies-count');
  const unreadBadge = card.querySelector('.order-chat-unread');

  if (!toggleBtn || !composer || !textarea || !charCount || !errorNode || !sendBtn || !cancelBtn || !repliesList) {
    return;
  }

  cleanupOrderChatState(order.id);
  const state = {
    orderId: order.id,
    messages: [],
    unsubscribe: null,
    markingRead: false,
    sending: false,
  };
  orderChatStateById.set(order.id, state);

  const setUnreadBadge = (count) => {
    if (!unreadBadge) return;
    const hasUnread = Number(count) > 0;
    unreadBadge.hidden = !hasUnread;
    unreadBadge.textContent = hasUnread ? 'חדש' : '';
  };

  const updateCountLabel = () => {
    if (!repliesCount) return;
    repliesCount.textContent = state.messages.length > 0 ? `(${state.messages.length})` : '';
  };

  const updateCharCount = () => {
    const remaining = ORDER_MESSAGE_MAX_CHARS - textarea.value.length;
    charCount.textContent = `נותרו ${remaining} תווים`;
    charCount.classList.toggle('is-limit', remaining <= 30);
  };

  const resetComposer = () => {
    textarea.value = '';
    errorNode.textContent = '';
    if (successNode) {
      successNode.hidden = true;
    }
    updateCharCount();
  };

  const setComposeOpen = (isOpen) => {
    composer.hidden = !isOpen;
    toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggleBtn.classList.toggle('is-open', isOpen);
    if (isOpen) {
      textarea.focus();
      markCustomerMessagesAsRead(order.id);
    } else {
      resetComposer();
    }
  };

  toggleBtn.addEventListener('click', () => {
    if (dashboard?.hidden || !isAdminSessionUnlocked) return;
    setComposeOpen(composer.hidden);
  });

  cancelBtn.addEventListener('click', () => {
    setComposeOpen(false);
  });

  textarea.addEventListener('input', () => {
    if (textarea.value.length > ORDER_MESSAGE_MAX_CHARS) {
      textarea.value = textarea.value.slice(0, ORDER_MESSAGE_MAX_CHARS);
    }
    errorNode.textContent = '';
    if (successNode) {
      successNode.hidden = true;
    }
    updateCharCount();
  });

  sendBtn.addEventListener('click', async () => {
    if (state.sending) return;
    if (dashboard?.hidden || !isAdminSessionUnlocked) {
      errorNode.textContent = 'יש לבצע כניסת מנהל לפני שליחה.';
      return;
    }

    const text = textarea.value.trim();
    if (!text) {
      errorNode.textContent = 'יש להזין הודעה לפני שליחה.';
      return;
    }

    if (text.length > ORDER_MESSAGE_MAX_CHARS) {
      errorNode.textContent = `מקסימום ${ORDER_MESSAGE_MAX_CHARS} תווים.`;
      return;
    }

    state.sending = true;
    sendBtn.disabled = true;
    cancelBtn.disabled = true;
    errorNode.textContent = '';

    try {
      await sendBusinessMessage(order.id, text);
      textarea.value = '';
      updateCharCount();
      if (successNode) {
        successNode.hidden = false;
      }
      showToast('נשלח ללקוח');
      window.setTimeout(() => {
        if (successNode) {
          successNode.hidden = true;
        }
      }, 1700);
    } catch (error) {
      console.error('Failed to send business message', error);
      if (error?.message === 'MESSAGE_EMPTY') {
        errorNode.textContent = 'יש להזין הודעה לפני שליחה.';
      } else if (error?.message === 'MESSAGE_TOO_LONG') {
        errorNode.textContent = `מקסימום ${ORDER_MESSAGE_MAX_CHARS} תווים.`;
      } else if (error?.message === 'UNAUTHORIZED_ADMIN_SESSION') {
        errorNode.textContent = 'הגישה נחסמה. בצעו כניסה מחדש.';
      } else {
        errorNode.textContent = 'שגיאה בשליחת ההודעה. נסו שוב.';
      }
    } finally {
      state.sending = false;
      sendBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });

  setUnreadBadge(Number(order.unreadForBusinessCount) || 0);
  repliesList.innerHTML = renderOrderMessagesListHtml([]);
  updateCountLabel();
  updateCharCount();

  ensureFirebaseReady()
    .then(({ firestoreApi: fs, db: firestoreDb }) => {
      const messagesQuery = fs.query(
        fs.collection(firestoreDb, 'orders', order.id, 'messages'),
        fs.orderBy('createdAt', 'asc'),
      );

      state.unsubscribe = fs.onSnapshot(
        messagesQuery,
        (snapshot) => {
          if (!orderChatStateById.has(order.id)) return;
          state.messages = snapshot.docs
            .map((messageDoc) => normalizeOrderMessage(messageDoc))
            .filter(Boolean);

          repliesList.innerHTML = renderOrderMessagesListHtml(state.messages);
          updateCountLabel();
          const unreadCustomerCount = state.messages.filter(
            (message) =>
              message.sender === 'customer' &&
              message.readByBusiness !== true,
          ).length;
          setUnreadBadge(unreadCustomerCount);
          if (!composer.hidden && unreadCustomerCount > 0) {
            markCustomerMessagesAsRead(order.id);
          }
        },
        (error) => {
          console.error('Failed to listen to order messages', error);
          errorNode.textContent = 'שגיאה בטעינת הודעות ההזמנה.';
        },
      );
    })
    .catch((error) => {
      console.error('Failed to initialize order chat listener', error);
      errorNode.textContent = 'שגיאה בחיבור הצ׳אט למסד הנתונים.';
    });
}

function normalizeSupportChat(chatDoc) {
  const data = chatDoc.data() || {};
  return {
    id: chatDoc.id,
    ref: chatDoc.ref,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || data.createdAt || null,
    status: data.status === 'closed' ? 'closed' : 'open',
    customerName: typeof data.customerName === 'string' ? data.customerName : 'לקוח',
    customerPhone: typeof data.customerPhone === 'string' ? data.customerPhone : '--',
    customerDeviceId:
      typeof data.customerDeviceId === 'string' ? data.customerDeviceId : '',
    lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : '',
    unreadForAdmin: Number(data.unreadForAdmin) || 0,
    unreadForCustomer: Number(data.unreadForCustomer) || 0,
  };
}

function normalizeSupportChatMessage(messageDoc) {
  const data = messageDoc.data() || {};
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!text) return null;
  return {
    id: messageDoc.id,
    ref: messageDoc.ref,
    sender: data.sender === 'customer' ? 'customer' : 'admin',
    text,
    createdAt: data.createdAt || null,
    readByAdminAt: data.readByAdminAt || null,
    readByCustomerAt: data.readByCustomerAt || null,
  };
}

function supportChatStatusChip(status) {
  const normalized = status === 'closed' ? 'closed' : 'open';
  return {
    className: normalized === 'closed' ? 'chat-closed' : 'chat-open',
    label: normalized === 'closed' ? 'סגור' : 'פתוח',
  };
}

function supportChatUpdatedMillis(chat) {
  return toMillis(chat.updatedAt || chat.createdAt);
}

function sortedSupportChats(chats) {
  return [...chats].sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'open' ? -1 : 1;
    }
    return supportChatUpdatedMillis(right) - supportChatUpdatedMillis(left);
  });
}

function setSupportChatError(message = '') {
  if (!supportChatError) return;
  supportChatError.textContent = message;
}

function updateSupportChatCharCounter() {
  if (!supportChatInput || !supportChatCharCount) return;
  const remaining = SUPPORT_CHAT_MAX_CHARS - supportChatInput.value.length;
  supportChatCharCount.textContent = `נותרו ${remaining} תווים`;
  supportChatCharCount.classList.toggle('is-limit', remaining <= 30);
}

function updateSupportDocumentTitle() {
  const unreadTotal = latestSupportChats.reduce(
    (sum, chat) => sum + (Number(chat.unreadForAdmin) || 0),
    0,
  );
  document.title = unreadTotal > 0 ? `(${unreadTotal}) ${DEFAULT_ADMIN_TITLE}` : DEFAULT_ADMIN_TITLE;

  if (openSupportChatsViewBtn) {
    openSupportChatsViewBtn.textContent =
      unreadTotal > 0
        ? `צ׳אט שירות לקוחות (${unreadTotal})`
        : 'צ׳אט שירות לקוחות';
  }
}

function renderSupportChatMessages() {
  if (!supportChatMessages) return;
  supportChatMessages.innerHTML = '';

  if (!supportActiveMessages.length) {
    supportChatMessages.innerHTML =
      '<p class="support-chat-empty">אין עדיין הודעות בשיחה זו.</p>';
    return;
  }

  supportActiveMessages.forEach((message) => {
    const row = document.createElement('div');
    row.className = `support-chat-message-row ${message.sender}`;
    row.innerHTML = `
      <article class="support-chat-bubble">
        <p>${escapeHtml(message.text)}</p>
        <div class="support-chat-bubble-meta">
          <span>${message.sender === 'customer' ? 'לקוח' : 'מנהל'}</span>
          <span>${escapeHtml(formatReplyTimestamp(message.createdAt))}</span>
        </div>
      </article>
    `;
    supportChatMessages.append(row);
  });
  supportChatMessages.scrollTop = supportChatMessages.scrollHeight;
}

function renderSupportChatPanel() {
  if (!supportChatPanelEmpty || !supportChatPanelBody) return;

  const activeChat = latestSupportChats.find((chat) => chat.id === supportActiveChatId) || null;
  const hasActive = !!activeChat;
  supportChatPanelEmpty.hidden = hasActive;
  supportChatPanelBody.hidden = !hasActive;
  if (!hasActive) {
    supportActiveMessages = [];
    renderSupportChatMessages();
    return;
  }

  const statusChip = supportChatStatusChip(activeChat.status);
  if (supportChatPanelTitle) {
    supportChatPanelTitle.textContent = `${activeChat.customerName} (${activeChat.customerPhone})`;
  }
  if (supportChatPanelMeta) {
    supportChatPanelMeta.textContent = `צ׳אט #${activeChat.id.slice(0, 8)} | עודכן: ${formatReplyTimestamp(activeChat.updatedAt)}`;
  }
  if (supportChatPanelStatus) {
    supportChatPanelStatus.className = `status-pill ${statusChip.className}`;
    supportChatPanelStatus.textContent = statusChip.label;
  }

  const isClosed = activeChat.status === 'closed';
  if (supportChatInput) supportChatInput.disabled = isClosed;
  if (supportChatSendBtn) supportChatSendBtn.disabled = isClosed || supportChatSendInFlight;
  if (closeSupportChatBtn) closeSupportChatBtn.disabled = isClosed;
  renderSupportChatMessages();
}

function renderSupportChatsList() {
  if (!supportChatsList || !supportChatsEmptyState) return;
  supportChatsList.innerHTML = '';

  const chats = sortedSupportChats(latestSupportChats);
  const hasChats = chats.length > 0;
  supportChatsEmptyState.hidden = hasChats;
  if (!hasChats) {
    supportChatsEmptyState.textContent = 'אין שיחות פעילות כרגע.';
    renderSupportChatPanel();
    return;
  }

  chats.forEach((chat) => {
    const statusChip = supportChatStatusChip(chat.status);
    const unreadCount = Number(chat.unreadForAdmin) || 0;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'support-chat-list-item';
    item.classList.toggle('active', chat.id === supportActiveChatId);
    item.dataset.chatId = chat.id;
    item.innerHTML = `
      <div class="support-chat-list-top">
        <div>
          <h4>${escapeHtml(chat.customerName)}</h4>
          <div class="support-chat-list-phone">${escapeHtml(chat.customerPhone)}</div>
        </div>
        <span class="status-pill ${statusChip.className}">${statusChip.label}</span>
      </div>
      <p class="support-chat-list-message">${escapeHtml(chat.lastMessage || 'ללא הודעות עדיין')}</p>
      <div class="support-chat-list-meta">
        <span>${escapeHtml(formatReplyTimestamp(chat.updatedAt))}</span>
        <span class="support-chat-unread-badge" ${unreadCount > 0 ? '' : 'hidden'}>${unreadCount}</span>
      </div>
    `;
    item.addEventListener('click', () => {
      openSupportChat(chat.id);
    });
    supportChatsList.append(item);
  });

  renderSupportChatPanel();
}

function stopSupportChatMessagesListener() {
  if (typeof unsubscribeSupportChatMessages === 'function') {
    unsubscribeSupportChatMessages();
  }
  unsubscribeSupportChatMessages = null;
}

function stopRealtimeSupportChats() {
  if (typeof unsubscribeSupportChats === 'function') {
    unsubscribeSupportChats();
  }
  unsubscribeSupportChats = null;
  stopSupportChatMessagesListener();
  latestSupportChats = [];
  supportUnreadCountByChatId.clear();
  supportChatsInitializedSnapshot = false;
  supportActiveChatId = '';
  supportActiveMessages = [];
  updateSupportDocumentTitle();
}

async function markSupportMessagesReadByAdmin(chatId = supportActiveChatId) {
  if (!chatId || supportChatMarkReadInFlight) return;
  const activeChat = latestSupportChats.find((chat) => chat.id === chatId) || null;
  if (!activeChat) return;

  const unreadMessages = supportActiveMessages.filter(
    (message) =>
      message.sender === 'customer' &&
      !message.readByAdminAt &&
      message.ref,
  );
  if (unreadMessages.length === 0 && Number(activeChat.unreadForAdmin) <= 0) return;

  supportChatMarkReadInFlight = true;
  try {
    const { firestoreApi: fs, db: firestoreDb } = await ensureFirebaseReady();
    const batch = fs.writeBatch(firestoreDb);
    unreadMessages.forEach((message) => {
      batch.update(message.ref, { readByAdminAt: fs.serverTimestamp() });
    });
    batch.update(fs.doc(firestoreDb, 'chats', chatId), { unreadForAdmin: 0 });
    await batch.commit();
  } catch (error) {
    console.error('Failed to mark support chat messages as read', error);
  } finally {
    supportChatMarkReadInFlight = false;
  }
}

function attachSupportChatMessagesListener(chatId) {
  stopSupportChatMessagesListener();
  if (!chatId) return;

  ensureFirebaseReady()
    .then(({ firestoreApi: fs, db: firestoreDb }) => {
      const messagesQuery = fs.query(
        fs.collection(firestoreDb, 'chats', chatId, 'messages'),
        fs.orderBy('createdAt', 'asc'),
        fs.limit(300),
      );

      unsubscribeSupportChatMessages = fs.onSnapshot(
        messagesQuery,
        (snapshot) => {
          if (chatId !== supportActiveChatId) return;
          supportActiveMessages = snapshot.docs
            .map((messageDoc) => normalizeSupportChatMessage(messageDoc))
            .filter(Boolean);
          renderSupportChatMessages();
          markSupportMessagesReadByAdmin(chatId);
        },
        (error) => {
          console.error('Support chat messages listener failed', error);
          setSupportChatError('שגיאה בטעינת הודעות הצ׳אט.');
        },
      );
    })
    .catch((error) => {
      console.error('Failed to attach support chat listener', error);
      setSupportChatError('שגיאה בחיבור הצ׳אט למסד הנתונים.');
    });
}

function openSupportChat(chatId) {
  if (!chatId) return;
  supportActiveChatId = chatId;
  supportActiveMessages = [];
  setSupportChatError('');
  renderSupportChatsList();
  attachSupportChatMessagesListener(chatId);
  markSupportMessagesReadByAdmin(chatId);
}

async function sendAdminSupportMessage() {
  if (supportChatSendInFlight) return;
  if (!isAdminSessionUnlocked || dashboard?.hidden) {
    setSupportChatError('יש לבצע כניסת מנהל לפני שליחה.');
    return;
  }
  if (!supportActiveChatId) {
    setSupportChatError('בחרו שיחה לפני שליחה.');
    return;
  }

  const text = String(supportChatInput?.value || '').trim();
  if (!text) {
    setSupportChatError('יש להזין הודעה לפני שליחה.');
    return;
  }
  if (text.length > SUPPORT_CHAT_MAX_CHARS) {
    setSupportChatError(`מקסימום ${SUPPORT_CHAT_MAX_CHARS} תווים.`);
    return;
  }

  supportChatSendInFlight = true;
  if (supportChatSendBtn) supportChatSendBtn.disabled = true;
  setSupportChatError('');

  try {
    const { firestoreApi: fs, db: firestoreDb } = await ensureFirebaseReady();
    const activeChat =
      latestSupportChats.find((chat) => chat.id === supportActiveChatId) || null;
    if (!activeChat) {
      throw new Error('SUPPORT_CHAT_NOT_FOUND');
    }
    const chatRef = fs.doc(firestoreDb, 'chats', supportActiveChatId);
    const messagesRef = fs.collection(firestoreDb, 'chats', supportActiveChatId, 'messages');
    const messageRef = fs.doc(messagesRef);
    const batch = fs.writeBatch(firestoreDb);

    batch.set(messageRef, {
      createdAt: fs.serverTimestamp(),
      sender: 'admin',
      text,
      delivered: true,
      customerDeviceId: activeChat?.customerDeviceId || '',
      readByAdminAt: fs.serverTimestamp(),
      readByCustomerAt: null,
    });
    batch.update(chatRef, {
      status: 'open',
      updatedAt: fs.serverTimestamp(),
      lastMessage: text.slice(0, 180),
      unreadForCustomer: fs.increment(1),
    });
    await batch.commit();
    if (supportChatInput) {
      supportChatInput.value = '';
      updateSupportChatCharCounter();
    }
  } catch (error) {
    console.error('Failed to send admin support message', error);
    setSupportChatError('שליחה נכשלה, נסו שוב');
  } finally {
    supportChatSendInFlight = false;
    renderSupportChatPanel();
  }
}

async function closeActiveSupportChat() {
  if (!supportActiveChatId) return;
  const activeChat = latestSupportChats.find((chat) => chat.id === supportActiveChatId) || null;
  if (!activeChat || activeChat.status === 'closed') return;
  try {
    const { firestoreApi: fs, db: firestoreDb } = await ensureFirebaseReady();
    await fs.updateDoc(fs.doc(firestoreDb, 'chats', supportActiveChatId), {
      status: 'closed',
      updatedAt: fs.serverTimestamp(),
    });
    showToast('הצ׳אט נסגר');
  } catch (error) {
    console.error('Failed to close support chat', error);
    setSupportChatError('שגיאה בסגירת הצ׳אט.');
  }
}

function notifyIncomingSupportChats(snapshot, currentChats) {
  if (!supportChatsInitializedSnapshot) {
    supportChatsInitializedSnapshot = true;
    supportUnreadCountByChatId.clear();
    currentChats.forEach((chat) => {
      supportUnreadCountByChatId.set(chat.id, Number(chat.unreadForAdmin) || 0);
    });
    return;
  }

  const chatById = new Map(currentChats.map((chat) => [chat.id, chat]));
  let shouldAlert = false;
  let alertMessage = '';

  snapshot.docChanges().forEach((change) => {
    const chat = chatById.get(change.doc.id);
    if (!chat) return;

    const prevUnread = Number(supportUnreadCountByChatId.get(chat.id) || 0);
    const nextUnread = Number(chat.unreadForAdmin || 0);

    if (change.type === 'added') {
      shouldAlert = true;
      alertMessage = `נפתח צ׳אט חדש: ${chat.customerName}`;
    } else if (nextUnread > prevUnread) {
      shouldAlert = true;
      alertMessage = `הודעה חדשה בצ׳אט: ${chat.customerName}`;
    }
  });

  supportUnreadCountByChatId.clear();
  currentChats.forEach((chat) => {
    supportUnreadCountByChatId.set(chat.id, Number(chat.unreadForAdmin) || 0);
  });

  if (shouldAlert && alertMessage) {
    showToast(alertMessage, 3600);
    playNewOrderSound();
    notifyBrowser(alertMessage);
  }
}

async function startRealtimeSupportChats() {
  let firebaseRuntime = null;
  try {
    firebaseRuntime = await ensureFirebaseReady();
    if (!firebaseRuntime?.db) {
      throw new Error('Firestore DB instance is missing.');
    }
  } catch (error) {
    console.error('Failed to initialize Firebase for support chats', error);
    setSupportChatError('שגיאה בטעינת צ׳אט שירות הלקוחות.');
    return;
  }

  if (typeof unsubscribeSupportChats === 'function') {
    unsubscribeSupportChats();
  }

  const { firestoreApi: fs, db: firestoreDb } = firebaseRuntime;
  const chatsQuery = fs.query(
    fs.collection(firestoreDb, 'chats'),
    fs.orderBy('updatedAt', 'desc'),
    fs.limit(250),
  );

  unsubscribeSupportChats = fs.onSnapshot(
    chatsQuery,
    (snapshot) => {
      const chats = snapshot.docs.map((chatDoc) => normalizeSupportChat(chatDoc));
      latestSupportChats = sortedSupportChats(chats);
      notifyIncomingSupportChats(snapshot, latestSupportChats);

      if (supportActiveChatId) {
        const stillExists = latestSupportChats.some((chat) => chat.id === supportActiveChatId);
        if (!stillExists) {
          supportActiveChatId = '';
          supportActiveMessages = [];
          stopSupportChatMessagesListener();
        }
      }

      if (!supportActiveChatId && latestSupportChats.length > 0) {
        supportActiveChatId = latestSupportChats[0].id;
        attachSupportChatMessagesListener(supportActiveChatId);
      }

      updateSupportDocumentTitle();
      renderSupportChatsList();
      if (isSupportChatsView && supportActiveChatId) {
        markSupportMessagesReadByAdmin(supportActiveChatId);
      }
    },
    (error) => {
      console.error('Realtime support chats listener failed', error);
      setSupportChatError('שגיאה בעדכוני צ׳אט שירות לקוחות.');
    },
  );
}

function bindSupportChatEvents() {
  if (supportChatComposeForm) {
    supportChatComposeForm.addEventListener('submit', (event) => {
      event.preventDefault();
      sendAdminSupportMessage();
    });
  }

  if (supportChatInput) {
    supportChatInput.addEventListener('input', () => {
      if (supportChatInput.value.length > SUPPORT_CHAT_MAX_CHARS) {
        supportChatInput.value = supportChatInput.value.slice(0, SUPPORT_CHAT_MAX_CHARS);
      }
      setSupportChatError('');
      updateSupportChatCharCounter();
    });
  }

  supportChatMessages?.addEventListener('click', () => {
    markSupportMessagesReadByAdmin();
  });
  supportChatPanel?.addEventListener('focusin', () => {
    markSupportMessagesReadByAdmin();
  });

  closeSupportChatBtn?.addEventListener('click', () => {
    closeActiveSupportChat();
  });
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

function hasDeniedDelivery(order) {
  return order?.status === 'delivered' && order?.deliveryConfirmed === false;
}

function isConfirmedDelivery(order) {
  return order?.deliveryConfirmed === true;
}

function boardOrdersSource() {
  return latestOrders.filter((order) => !isConfirmedDelivery(order));
}

function currentBoardVisibleOrders() {
  const source = boardOrdersSource();
  return showOnlyDeniedDelivery ? source.filter((order) => hasDeniedDelivery(order)) : source;
}

function confirmationMillis(order) {
  const confirmedMillis = toMillis(order?.deliveryConfirmedAt);
  if (confirmedMillis > 0) return confirmedMillis;
  return toMillis(order?.createdAt);
}

function normalizeSearchValue(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesHistorySearch(order, normalizedQuery) {
  if (!normalizedQuery) return true;
  const shortId = order.id?.slice(0, 8) || '';
  const fields = [
    order.customer?.name || '',
    order.customer?.phone || '',
    order.id || '',
    shortId,
  ]
    .join(' ')
    .toLowerCase();
  return fields.includes(normalizedQuery);
}

function matchesHistoryDateRange(order, now = new Date()) {
  if (historyDateRange === 'all') return true;
  const millis = confirmationMillis(order);
  if (!millis) return false;

  const reference = new Date(millis);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(todayStart.getDate() - 1);

  if (historyDateRange === 'today') {
    return reference >= todayStart && reference < tomorrowStart;
  }

  if (historyDateRange === 'yesterday') {
    return reference >= yesterdayStart && reference < todayStart;
  }

  if (historyDateRange === '7d') {
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(todayStart.getDate() - 6);
    return reference >= sevenDaysAgo && reference < tomorrowStart;
  }

  return true;
}

function filteredHistoryOrders() {
  const normalizedQuery = normalizeSearchValue(historySearchTerm);
  return latestOrders
    .filter((order) => isConfirmedDelivery(order))
    .filter((order) => matchesHistorySearch(order, normalizedQuery))
    .filter((order) => matchesHistoryDateRange(order))
    .sort((left, right) => confirmationMillis(right) - confirmationMillis(left));
}

function deliveryStatusPresentation(order) {
  const fallback = {
    pillClass: order.status,
    pillText: STATUS_LABELS[order.status] || order.status,
    subText: '',
    subClass: '',
    alertText: '',
  };

  if (order.status !== 'delivered') return fallback;

  if (order.deliveryConfirmed === true) {
    return {
      pillClass: 'delivered-confirmed',
      pillText: 'נמסר (הלקוח אישר)',
      subText: '',
      subClass: '',
      alertText: '',
    };
  }

  if (order.deliveryConfirmed === false) {
    return {
      pillClass: 'delivered-denied',
      pillText: 'לא נמסר',
      subText: 'הלקוח סימן שלא קיבל',
      subClass: 'delivered-denied',
      alertText: '⚠️ הלקוח דיווח שלא קיבל את ההזמנה',
    };
  }

  return {
    pillClass: 'delivered-pending',
    pillText: 'נמסר (ממתין לאישור לקוח)',
    subText: '',
    subClass: '',
    alertText: '',
  };
}

function renderHistoryOrders() {
  if (!historyOrdersList || !historyEmptyState || !historyLoadMoreBtn) return;

  const historyOrders = filteredHistoryOrders();
  const visibleOrders = historyOrders.slice(0, historyVisibleCount);
  historyOrdersList.innerHTML = '';

  const hasOrders = visibleOrders.length > 0;
  historyEmptyState.hidden = hasOrders;
  if (!hasOrders) {
    historyEmptyState.textContent = 'אין הזמנות בהיסטוריה לפי הסינון הנוכחי.';
  }

  visibleOrders.forEach((order) => {
    const card = document.createElement('article');
    card.className = 'order-card';
    const confirmedAtText = formatMillis(confirmationMillis(order));

    card.innerHTML = `
      <div class="order-head">
        <div class="order-head-main">
          <h3>הזמנה #${escapeHtml(order.id.slice(0, 8))}</h3>
          <span class="status-pill delivered-confirmed">נמסר (הלקוח אישר)</span>
          <div class="status-subtext">אושר בתאריך: ${escapeHtml(confirmedAtText)}</div>
        </div>
        <div><strong>${formatMoney(order.total)}</strong></div>
      </div>
      <div class="order-meta">
        <div><strong>התקבל:</strong> ${escapeHtml(formatTimestamp(order.createdAt))}</div>
        <div><strong>לקוח:</strong> ${escapeHtml(order.customer?.name || '--')} | ${escapeHtml(order.customer?.phone || '--')}</div>
        <div><strong>איסוף:</strong> ${escapeHtml(formatPickupText(order.pickup))}</div>
        <div><strong>הערות:</strong> ${escapeHtml(order.notes || 'ללא')}</div>
      </div>
      <ul class="order-items">${renderItems(order.items)}</ul>
      <section class="order-replies">
        <h4>הודעות ללקוח</h4>
        <ul class="order-replies-list">${renderAdminRepliesListHtml(order.adminReplies)}</ul>
      </section>
      <div class="order-foot">
        <strong>סה"כ: ${formatMoney(order.total)}</strong>
      </div>
    `;

    historyOrdersList.append(card);
  });

  const hasMore = historyOrders.length > visibleOrders.length;
  historyLoadMoreBtn.hidden = !hasMore;
  historyLoadMoreBtn.disabled = !hasMore;
}

function showHistoryBoard() {
  isHistoryView = true;
  isSupportChatsView = false;
  if (liveBoardView) liveBoardView.hidden = true;
  if (historyView) historyView.hidden = false;
  if (supportChatsView) supportChatsView.hidden = true;
  if (openHistoryViewBtn) openHistoryViewBtn.hidden = true;
  if (openSupportChatsViewBtn) openSupportChatsViewBtn.hidden = false;
  updateSelectionToolbar();
  renderHistoryOrders();
}

function showLiveBoard() {
  isHistoryView = false;
  isSupportChatsView = false;
  if (historyView) historyView.hidden = true;
  if (supportChatsView) supportChatsView.hidden = true;
  if (liveBoardView) liveBoardView.hidden = false;
  if (openHistoryViewBtn) openHistoryViewBtn.hidden = false;
  if (openSupportChatsViewBtn) openSupportChatsViewBtn.hidden = false;
  updateSelectionToolbar();
}

function showSupportChatsBoard() {
  isHistoryView = false;
  isSupportChatsView = true;
  if (historyView) historyView.hidden = true;
  if (liveBoardView) liveBoardView.hidden = true;
  if (supportChatsView) supportChatsView.hidden = false;
  if (openHistoryViewBtn) openHistoryViewBtn.hidden = false;
  if (openSupportChatsViewBtn) openSupportChatsViewBtn.hidden = true;
  updateSelectionToolbar();
  renderSupportChatsList();
  if (supportActiveChatId) {
    markSupportMessagesReadByAdmin(supportActiveChatId);
  }
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

function pruneSelectedOrderIds(sourceOrders = latestOrders) {
  const existingIds = new Set(sourceOrders.map((order) => order.id));
  for (const orderId of selectedOrderIds) {
    if (!existingIds.has(orderId)) {
      selectedOrderIds.delete(orderId);
    }
  }
}

function getMatchedOrderIds(mode = deleteMode) {
  pruneSelectedOrderIds(currentBoardVisibleOrders());

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

  const selectionModeEnabled =
    deleteMode === 'selection' &&
    !dashboard.hidden &&
    !isHistoryView &&
    !isSupportChatsView;
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

function renderOrders() {
  const boardVisibleOrders = currentBoardVisibleOrders();
  pruneSelectedOrderIds(boardVisibleOrders);
  cleanupAllOrderChats();
  ordersList.innerHTML = '';
  const hasOrders = boardVisibleOrders.length > 0;
  emptyState.hidden = hasOrders;
  emptyState.textContent = showOnlyDeniedDelivery
    ? 'אין הזמנות שהלקוח סימן כלא נמסר.'
    : 'אין הזמנות להצגה כרגע.';
  updateSelectionToolbar();
  updateDeleteUiState();

  if (!hasOrders) return;

  boardVisibleOrders.forEach((order) => {
    const isChecked = selectedOrderIds.has(order.id);
    const statusView = deliveryStatusPresentation(order);
    const card = document.createElement('article');
    card.className = 'order-card';
    card.innerHTML = `
      <div class="order-head">
        <div class="order-head-main">
          <h3>הזמנה #${escapeHtml(order.id.slice(0, 8))}</h3>
          <span class="status-pill ${escapeHtml(statusView.pillClass)}">${escapeHtml(statusView.pillText)}</span>
          ${statusView.subText ? `<div class="status-subtext ${escapeHtml(statusView.subClass)}">${escapeHtml(statusView.subText)}</div>` : ''}
        </div>
        <label class="order-select-control">
          <input type="checkbox" class="order-select-checkbox" data-order-id="${escapeHtml(order.id)}" ${isChecked ? 'checked' : ''} />
          <span>בחר</span>
        </label>
        <div><strong>${formatMoney(order.total)}</strong></div>
      </div>
      ${statusView.alertText ? `<p class="delivery-alert">${escapeHtml(statusView.alertText)}</p>` : ''}
      <div class="order-meta">
        <div><strong>התקבל:</strong> ${escapeHtml(formatTimestamp(order.createdAt))}</div>
        <div><strong>איסוף:</strong> ${escapeHtml(formatPickupText(order.pickup))}</div>
        <div><strong>לקוח:</strong> ${escapeHtml(order.customer?.name || '--')} | ${escapeHtml(order.customer?.phone || '--')}</div>
        <div><strong>הערות:</strong> ${escapeHtml(order.notes || 'ללא')}</div>
      </div>
      <ul class="order-items">${renderItems(order.items)}</ul>
      <section class="order-replies">
        <div class="order-reply-head">
          <h4>הודעות להזמנה <span class="order-replies-count"></span></h4>
          <div class="order-reply-head-actions">
            <span class="order-chat-unread" ${Number(order.unreadForBusinessCount) > 0 ? '' : 'hidden'}>חדש</span>
            <button
              type="button"
              class="reply-toggle-btn"
              aria-expanded="false"
              aria-controls="replyCompose-${escapeHtml(order.id)}"
            >
              הודעות
            </button>
          </div>
        </div>
        <div class="order-reply-compose" id="replyCompose-${escapeHtml(order.id)}" hidden>
          <label for="replyInput-${escapeHtml(order.id)}">הודעה ללקוח</label>
          <textarea
            id="replyInput-${escapeHtml(order.id)}"
            class="order-reply-input"
            maxlength="${ORDER_MESSAGE_MAX_CHARS}"
            placeholder="כתבו עדכון קצר ללקוח..."
          ></textarea>
          <div class="order-reply-compose-foot">
            <span class="order-reply-char-count">נותרו ${ORDER_MESSAGE_MAX_CHARS} תווים</span>
            <div class="order-reply-actions">
              <button type="button" class="order-reply-cancel">ביטול</button>
              <button type="button" class="order-reply-send">שלח</button>
            </div>
          </div>
          <p class="order-reply-error" aria-live="polite"></p>
          <p class="order-reply-success" hidden>נשלח ללקוח</p>
        </div>
        <ul class="order-replies-list">${renderOrderMessagesListHtml([])}</ul>
      </section>
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
    bindOrderChat(card, order);
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

      latestOrders = orders;
      updateCounters(boardOrdersSource());
      renderOrders();
      renderHistoryOrders();
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
  latestSupportChats = [];
  selectedOrderIds.clear();
  cleanupAllOrderChats();
  supportActiveChatId = '';
  supportActiveMessages = [];
  supportChatSendInFlight = false;
  supportChatMarkReadInFlight = false;
  supportUnreadCountByChatId.clear();
  showOnlyDeniedDelivery = false;
  isHistoryView = false;
  isSupportChatsView = false;
  historySearchTerm = '';
  historyDateRange = 'all';
  historyVisibleCount = HISTORY_PAGE_SIZE;
  if (onlyDeniedDeliveryToggle) {
    onlyDeniedDeliveryToggle.checked = false;
  }
  if (historySearchInput) {
    historySearchInput.value = '';
  }
  if (historyRangeButtons) {
    historyRangeButtons.querySelectorAll('[data-range]').forEach((button) => {
      button.classList.toggle('active', button.dataset.range === 'all');
    });
  }
  if (historyOrdersList) historyOrdersList.innerHTML = '';
  if (historyEmptyState) historyEmptyState.hidden = false;
  if (historyLoadMoreBtn) historyLoadMoreBtn.hidden = true;
  if (historyView) historyView.hidden = true;
  if (supportChatsView) supportChatsView.hidden = true;
  if (liveBoardView) liveBoardView.hidden = false;
  if (openHistoryViewBtn) openHistoryViewBtn.hidden = false;
  if (openSupportChatsViewBtn) openSupportChatsViewBtn.hidden = false;
  if (lastSync) {
    lastSync.textContent = 'ממתין לעדכון...';
  }
  if (countNew) countNew.textContent = '0';
  if (countInProgress) countInProgress.textContent = '0';
  if (countReady) countReady.textContent = '0';
  if (ordersList) ordersList.innerHTML = '';
  if (emptyState) emptyState.hidden = false;
  if (supportChatsList) supportChatsList.innerHTML = '';
  if (supportChatsEmptyState) supportChatsEmptyState.hidden = false;
  if (supportChatInput) supportChatInput.value = '';
  updateSupportChatCharCounter();
  setSupportChatError('');
  renderSupportChatPanel();
  updateSupportDocumentTitle();
  updateSelectionToolbar();
}

function stopRealtimeOrders() {
  if (typeof unsubscribeOrders === 'function') {
    unsubscribeOrders();
  }
  unsubscribeOrders = null;
  initializedSnapshot = false;
  cleanupAllOrderChats();
  stopRealtimeSupportChats();
}

function lockDashboard({ clearStoredAuth = true, focusPin = true } = {}) {
  isAdminSessionUnlocked = false;
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
  isAdminSessionUnlocked = true;
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
  if (typeof unsubscribeSupportChats !== 'function') {
    startRealtimeSupportChats().catch((error) => {
      console.error('Failed to start support chat realtime', error);
      setSupportChatError('שגיאה בהפעלת צ׳אט שירות לקוחות.');
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
  liveBoardView = document.getElementById('liveBoardView');
  historyView = document.getElementById('historyView');
  supportChatsView = document.getElementById('supportChatsView');
  lastSync = document.getElementById('lastSync');
  countNew = document.getElementById('countNew');
  countInProgress = document.getElementById('countInProgress');
  countReady = document.getElementById('countReady');
  ordersList = document.getElementById('ordersList');
  emptyState = document.getElementById('emptyState');
  historyOrdersList = document.getElementById('historyOrdersList');
  historyEmptyState = document.getElementById('historyEmptyState');
  historyLoadMoreBtn = document.getElementById('historyLoadMoreBtn');
  openHistoryViewBtn = document.getElementById('openHistoryViewBtn');
  closeHistoryViewBtn = document.getElementById('closeHistoryViewBtn');
  openSupportChatsViewBtn = document.getElementById('openSupportChatsViewBtn');
  closeSupportChatsViewBtn = document.getElementById('closeSupportChatsViewBtn');
  supportChatsList = document.getElementById('supportChatsList');
  supportChatsEmptyState = document.getElementById('supportChatsEmptyState');
  supportChatPanel = document.getElementById('supportChatPanel');
  supportChatPanelEmpty = document.getElementById('supportChatPanelEmpty');
  supportChatPanelBody = document.getElementById('supportChatPanelBody');
  supportChatPanelTitle = document.getElementById('supportChatPanelTitle');
  supportChatPanelMeta = document.getElementById('supportChatPanelMeta');
  supportChatPanelStatus = document.getElementById('supportChatPanelStatus');
  supportChatMessages = document.getElementById('supportChatMessages');
  supportChatComposeForm = document.getElementById('supportChatComposeForm');
  supportChatInput = document.getElementById('supportChatInput');
  supportChatCharCount = document.getElementById('supportChatCharCount');
  supportChatSendBtn = document.getElementById('supportChatSendBtn');
  supportChatError = document.getElementById('supportChatError');
  closeSupportChatBtn = document.getElementById('closeSupportChatBtn');
  historySearchInput = document.getElementById('historySearchInput');
  historyRangeButtons = document.getElementById('historyRangeButtons');
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
  onlyDeniedDeliveryToggle = document.getElementById('onlyDeniedDeliveryToggle');
}

function initAdminPage() {
  document.documentElement.lang = 'he';
  document.documentElement.dir = 'rtl';
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

  if (openHistoryViewBtn) {
    openHistoryViewBtn.addEventListener('click', () => {
      showHistoryBoard();
    });
  }

  if (closeHistoryViewBtn) {
    closeHistoryViewBtn.addEventListener('click', () => {
      showLiveBoard();
    });
  }

  if (openSupportChatsViewBtn) {
    openSupportChatsViewBtn.addEventListener('click', () => {
      showSupportChatsBoard();
    });
  }

  if (closeSupportChatsViewBtn) {
    closeSupportChatsViewBtn.addEventListener('click', () => {
      showLiveBoard();
    });
  }

  if (historySearchInput) {
    historySearchInput.addEventListener('input', () => {
      historySearchTerm = historySearchInput.value || '';
      historyVisibleCount = HISTORY_PAGE_SIZE;
      renderHistoryOrders();
    });
  }

  if (historyRangeButtons) {
    historyRangeButtons.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-range]');
      if (!button) return;
      historyDateRange = button.dataset.range || 'all';
      historyVisibleCount = HISTORY_PAGE_SIZE;
      historyRangeButtons.querySelectorAll('button[data-range]').forEach((node) => {
        node.classList.toggle('active', node === button);
      });
      renderHistoryOrders();
    });
  }

  if (historyLoadMoreBtn) {
    historyLoadMoreBtn.addEventListener('click', () => {
      historyVisibleCount += HISTORY_PAGE_SIZE;
      renderHistoryOrders();
    });
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
      currentBoardVisibleOrders().forEach((order) => selectedOrderIds.add(order.id));
      renderOrders();
    });
  }

  if (clearAllOrdersBtn) {
    clearAllOrdersBtn.addEventListener('click', () => {
      selectedOrderIds.clear();
      renderOrders();
    });
  }

  if (deleteSelectedOrdersBtn) {
    deleteSelectedOrdersBtn.addEventListener('click', () => {
      openDeleteOrdersModal('selection');
    });
  }

  if (onlyDeniedDeliveryToggle) {
    onlyDeniedDeliveryToggle.checked = false;
    onlyDeniedDeliveryToggle.addEventListener('change', () => {
      showOnlyDeniedDelivery = onlyDeniedDeliveryToggle.checked;
      renderOrders();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      lockDashboard();
    });
  }

  bindSupportChatEvents();
  updateSupportChatCharCounter();
  updateSupportDocumentTitle();

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


