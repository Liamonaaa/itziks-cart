import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { db } from './src/firebase.js';

const STATUS_FLOW = ['new', 'in_progress', 'ready', 'delivered'];
const DELIVERED_STATUS = 'delivered';
const DELIVERED_DISMISS_PREFIX = 'deliveredDismissed_';
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
  deliveredBanner: document.getElementById('deliveredBanner'),
  dismissDeliveredBannerBtn: document.getElementById('dismissDeliveredBannerBtn'),
};

let unsubscribeOrder = null;
let currentOrderId = '';
let lastStatus = null;

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

function deliveredDismissKey(orderId) {
  return `${DELIVERED_DISMISS_PREFIX}${orderId}`;
}

function isDeliveredDismissed(orderId) {
  try {
    return localStorage.getItem(deliveredDismissKey(orderId)) === 'true';
  } catch (error) {
    console.error('Failed to read delivered dismiss state', error);
    return false;
  }
}

function setDeliveredDismissed(orderId) {
  if (!orderId) return;
  try {
    localStorage.setItem(deliveredDismissKey(orderId), 'true');
  } catch (error) {
    console.error('Failed to store delivered dismiss state', error);
  }
}

function showDeliveredBanner() {
  if (!ui.deliveredBanner) return;
  ui.deliveredBanner.hidden = false;
  requestAnimationFrame(() => {
    ui.deliveredBanner.classList.add('show');
  });
  document.body.classList.add('delivered-banner-open');
}

function hideDeliveredBanner() {
  if (!ui.deliveredBanner) return;
  ui.deliveredBanner.classList.remove('show');
  document.body.classList.remove('delivered-banner-open');
  window.setTimeout(() => {
    if (!ui.deliveredBanner.classList.contains('show')) {
      ui.deliveredBanner.hidden = true;
    }
  }, 230);
}

function syncDeliveredNotice(orderId, status) {
  if (!ui.deliveredBanner) {
    lastStatus = status;
    return;
  }

  const isDelivered = status === DELIVERED_STATUS;
  const wasDelivered = lastStatus === DELIVERED_STATUS;
  const transitionedToDelivered = !wasDelivered && isDelivered;
  const dismissed = isDeliveredDismissed(orderId);

  if (isDelivered && !dismissed) {
    if (transitionedToDelivered || ui.deliveredBanner.hidden) {
      showDeliveredBanner();
    }
  } else if (isDelivered && dismissed) {
    hideDeliveredBanner();
  } else if (!isDelivered) {
    hideDeliveredBanner();
  }

  lastStatus = status;
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

function shortOrderNumber(orderId) {
  return orderId.slice(-6).toUpperCase();
}

function showNotFound(message) {
  ui.loadingCard.hidden = true;
  ui.orderContent.hidden = true;
  ui.notFoundCard.hidden = false;
  hideDeliveredBanner();
  if (message) {
    ui.notFoundMessage.textContent = message;
  } else {
    ui.notFoundMessage.textContent = 'לא הצלחנו למצוא את ההזמנה המבוקשת.';
  }
}

function showOrderContent() {
  ui.loadingCard.hidden = true;
  ui.notFoundCard.hidden = true;
  ui.orderContent.hidden = false;
}

function renderOrder(orderId, orderData) {
  const status = typeof orderData.status === 'string' ? orderData.status : 'new';
  const statusMeta = STATUS_META[status] || STATUS_META.new;
  syncDeliveredNotice(orderId, status);

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

function initOrderPage() {
  const orderId = new URLSearchParams(window.location.search).get('id')?.trim();
  if (!orderId) {
    showNotFound('הזמנה לא נמצאה');
    return;
  }

  currentOrderId = orderId;
  lastStatus = null;

  if (ui.dismissDeliveredBannerBtn) {
    ui.dismissDeliveredBannerBtn.addEventListener('click', () => {
      setDeliveredDismissed(currentOrderId);
      hideDeliveredBanner();
    });
  }

  if (!db) {
    showNotFound('שגיאה בחיבור למסד הנתונים');
    return;
  }

  const orderRef = doc(db, 'orders', orderId);
  unsubscribeOrder = onSnapshot(
    orderRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        showNotFound('הזמנה לא נמצאה');
        return;
      }
      showOrderContent();
      renderOrder(orderId, snapshot.data());
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
