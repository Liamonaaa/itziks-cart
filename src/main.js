// עריכת וואטסאפ: עדכנו כאן את מספר היעד
const WHATSAPP_NUMBER = '972500000000';

// עריכת שעות פעילות: 0=א', 1=ב', ... , 6=שבת
const WORKING_HOURS = {
  0: { open: '07:00', close: '13:00', label: 'יום א׳' },
  1: { open: '07:00', close: '13:00', label: 'יום ב׳' },
  2: { open: '07:00', close: '13:00', label: 'יום ג׳' },
  3: { open: '07:00', close: '13:00', label: 'יום ד׳' },
  4: { open: '07:00', close: '13:00', label: 'יום ה׳' },
  5: { open: '07:00', close: '12:00', label: 'יום ו׳' },
  6: null,
};

const BUSINESS_NAME = 'העגלה של איציק';
const BUSINESS_ADDRESS = 'ההדרים 178, אבן יהודה';
const PHONE = '050-0000000';
const STORAGE_KEY = 'itziks-cart-order-v1';
const SLOT_STEP_MINUTES = 15;

const menuNodes = Array.from(document.querySelectorAll('#menu [data-item-id]'));
const itemsById = new Map();

const cartPanel = document.getElementById('cartPanel');
const cartItemsElement = document.getElementById('cartItems');
const cartEmptyElement = document.getElementById('cartEmpty');
const cartTotalElement = document.getElementById('cartTotal');
const cartTotalInline = document.getElementById('cartTotalInline');
const clearCartButton = document.getElementById('clearCartBtn');
const sendOrderButton = document.getElementById('sendOrderBtn');
const mobileCartToggle = document.getElementById('mobileCartToggle');
const mobileWhatsappButton = document.getElementById('mobileWhatsappBtn');

const pickupSelect = document.getElementById('pickupTime');
const pickupHint = document.getElementById('pickupHint');
const customerNameInput = document.getElementById('customerName');
const customerPhoneInput = document.getElementById('customerPhone');
const customerNotesInput = document.getElementById('customerNotes');
const formErrorElement = document.getElementById('formError');

const backToTop = document.getElementById('backToTop');
const toast = document.getElementById('toast');
const copyPhone = document.getElementById('copyPhone');

const state = {
  cart: {},
  name: '',
  phone: '',
  notes: '',
  pickup: '',
};

function toShekel(value) {
  return `₪${value}`;
}

function parseItemData(node) {
  const id = node.dataset.itemId;
  const name = node.dataset.itemName;
  const price = Number(node.dataset.itemPrice || 0);
  if (!id || !name || Number.isNaN(price)) return null;
  return { id, name, price, node };
}

function buildQuantityControls(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'order-controls';

  const plusButton = document.createElement('button');
  plusButton.type = 'button';
  plusButton.className = 'qty-btn';
  plusButton.textContent = '+';
  plusButton.setAttribute('aria-label', `הוסף ${item.name}`);

  const qtyDisplay = document.createElement('span');
  qtyDisplay.className = 'qty-display';
  qtyDisplay.id = `qty-${item.id}`;
  qtyDisplay.textContent = '0';

  const minusButton = document.createElement('button');
  minusButton.type = 'button';
  minusButton.className = 'qty-btn';
  minusButton.textContent = '-';
  minusButton.setAttribute('aria-label', `הסר ${item.name}`);

  plusButton.addEventListener('click', () =>
    setItemQuantity(item.id, getItemQuantity(item.id) + 1),
  );
  minusButton.addEventListener('click', () =>
    setItemQuantity(item.id, getItemQuantity(item.id) - 1),
  );

  wrapper.append(plusButton, qtyDisplay, minusButton);
  return wrapper;
}

function attachControlsToMenuItem(item) {
  const priceElement = item.node.querySelector('.price');
  if (!priceElement) return;

  const actions = document.createElement('div');
  actions.className = item.node.classList.contains('combo')
    ? 'combo-actions'
    : 'menu-item-actions';
  priceElement.replaceWith(actions);
  actions.append(priceElement, buildQuantityControls(item));
}

function getItemQuantity(itemId) {
  return Number(state.cart[itemId] || 0);
}

function setItemQuantity(itemId, quantity) {
  if (quantity <= 0) {
    delete state.cart[itemId];
  } else {
    state.cart[itemId] = quantity;
  }
  saveState();
  renderCart();
}

function buildCartEntries() {
  return Object.entries(state.cart)
    .map(([id, quantity]) => {
      const item = itemsById.get(id);
      if (!item) return null;
      return {
        id,
        quantity,
        name: item.name,
        price: item.price,
        lineTotal: item.price * quantity,
      };
    })
    .filter(Boolean);
}

function totalFromEntries(entries) {
  return entries.reduce((sum, entry) => sum + entry.lineTotal, 0);
}

function renderCart() {
  const entries = buildCartEntries();
  const total = totalFromEntries(entries);

  menuNodes.forEach((node) => {
    const itemId = node.dataset.itemId;
    const qtyDisplay = document.getElementById(`qty-${itemId}`);
    if (qtyDisplay) qtyDisplay.textContent = String(getItemQuantity(itemId));
  });

  cartItemsElement.innerHTML = '';
  cartEmptyElement.style.display = entries.length === 0 ? 'block' : 'none';

  entries.forEach((entry) => {
    const line = document.createElement('div');
    line.className = 'cart-item';
    line.innerHTML = `
      <div>
        <div class="cart-item-name">${entry.name}</div>
        <div class="cart-item-meta">${entry.quantity} x ${toShekel(entry.price)}</div>
      </div>
      <div class="cart-line-total">${toShekel(entry.lineTotal)}</div>
    `;
    cartItemsElement.append(line);
  });

  const totalLabel = toShekel(total);
  cartTotalElement.textContent = totalLabel;
  cartTotalInline.textContent = totalLabel;
  const mobilePrefix = cartPanel.classList.contains('open')
    ? 'סגור עגלה'
    : 'פתח עגלה';
  mobileCartToggle.textContent = `${mobilePrefix} (${totalLabel})`;
}

function saveState() {
  const snapshot = {
    cart: state.cart,
    name: state.name,
    phone: state.phone,
    notes: state.notes,
    pickup: state.pickup,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function restoreState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    state.cart =
      parsed.cart && typeof parsed.cart === 'object' ? parsed.cart : {};
    state.name = typeof parsed.name === 'string' ? parsed.name : '';
    state.phone = typeof parsed.phone === 'string' ? parsed.phone : '';
    state.notes = typeof parsed.notes === 'string' ? parsed.notes : '';
    state.pickup = typeof parsed.pickup === 'string' ? parsed.pickup : '';
  } catch {
    state.cart = {};
  }
}

function normalizePhone(phone) {
  return phone.replace(/[\s\-()]/g, '');
}

function isValidIsraeliPhone(phone) {
  const normalized = normalizePhone(phone);
  return (
    /^(?:\+972|972|0)(?:[2-4]|[8-9])\d{7}$/.test(normalized) ||
    /^(?:\+972|972|0)5\d{8}$/.test(normalized)
  );
}

function quarterHour(date) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();
  const remainder = minutes % SLOT_STEP_MINUTES;
  if (remainder !== 0) {
    rounded.setMinutes(minutes + (SLOT_STEP_MINUTES - remainder));
  }
  return rounded;
}

function hoursForDate(date) {
  const def = WORKING_HOURS[date.getDay()];
  if (!def) return null;

  const [openHour, openMinute] = def.open.split(':').map(Number);
  const [closeHour, closeMinute] = def.close.split(':').map(Number);

  const openTime = new Date(date);
  openTime.setHours(openHour, openMinute, 0, 0);

  const closeTime = new Date(date);
  closeTime.setHours(closeHour, closeMinute, 0, 0);

  return { ...def, openTime, closeTime };
}

function formatTime(date) {
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDayAndTime(date) {
  const weekdays = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];
  return `${weekdays[date.getDay()]} ${formatTime(date)}`;
}

function nextOpeningDate(fromDate) {
  const base = new Date(fromDate);

  for (let offset = 0; offset < 8; offset += 1) {
    const day = new Date(base);
    day.setDate(base.getDate() + offset);
    const schedule = hoursForDate(day);
    if (!schedule) continue;

    if (offset === 0 && fromDate < schedule.openTime) {
      return schedule.openTime;
    }

    if (offset > 0) {
      return schedule.openTime;
    }
  }

  return null;
}

function generateSlots(startDate, endDate) {
  const slots = [];
  let cursor = quarterHour(startDate);

  while (cursor <= endDate) {
    const schedule = hoursForDate(cursor);
    if (
      schedule &&
      cursor >= schedule.openTime &&
      cursor <= schedule.closeTime
    ) {
      slots.push(new Date(cursor));
    }
    cursor = new Date(cursor.getTime() + SLOT_STEP_MINUTES * 60 * 1000);
  }

  return slots;
}

function populatePickupOptions() {
  const now = new Date();
  const minimum = quarterHour(
    new Date(now.getTime() + SLOT_STEP_MINUTES * 60 * 1000),
  );
  const maxWindow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const scheduleNow = hoursForDate(now);
  const isOpenNow =
    scheduleNow && now >= scheduleNow.openTime && now <= scheduleNow.closeTime;
  const nextOpen = nextOpeningDate(now);

  let slots = generateSlots(minimum, maxWindow);
  let hint = 'בחרו זמן איסוף בטווח של 15 דקות.';

  if (!isOpenNow && nextOpen) {
    hint = `כרגע אנחנו מחוץ לשעות הפעילות. פתיחה הבאה: ${formatDayAndTime(nextOpen)}.`;
  }

  if (slots.length === 0) {
    if (nextOpen) {
      const fallbackEnd = new Date(nextOpen.getTime() + 2 * 60 * 60 * 1000);
      slots = generateSlots(nextOpen, fallbackEnd);
    } else {
      hint = 'לא נמצאה שעה פנויה כרגע.';
    }
  }

  pickupSelect.innerHTML = '<option value="">בחרו שעה</option>';
  slots.forEach((slot) => {
    const option = document.createElement('option');
    option.value = slot.toISOString();
    option.textContent = formatDayAndTime(slot);
    pickupSelect.append(option);
  });

  if (
    state.pickup &&
    slots.some((slot) => slot.toISOString() === state.pickup)
  ) {
    pickupSelect.value = state.pickup;
  } else {
    state.pickup = '';
  }

  pickupHint.textContent = hint;
  saveState();
}

function selectedPickupLabel() {
  const option = pickupSelect.selectedOptions[0];
  return option ? option.textContent : '';
}

function validateOrder() {
  const entries = buildCartEntries();
  if (entries.length === 0) return 'העגלה ריקה. הוסיפו לפחות פריט אחד.';

  if (!state.name.trim()) return 'יש להזין שם.';
  if (!isValidIsraeliPhone(state.phone))
    return 'יש להזין מספר טלפון ישראלי תקין.';
  if (!state.pickup) return 'יש לבחור שעת איסוף.';

  return '';
}

function buildWhatsappMessage(entries, total) {
  const lines = entries.map(
    (entry) =>
      `- ${entry.name} x${entry.quantity} | ${toShekel(entry.lineTotal)}`,
  );
  const notes = state.notes.trim() ? state.notes.trim() : 'ללא';

  return [
    `הזמנה חדשה - ${BUSINESS_NAME}`,
    `כתובת: ${BUSINESS_ADDRESS}`,
    '',
    'פריטים:',
    ...lines,
    '',
    `סה"כ: ${toShekel(total)}`,
    `שעת איסוף: ${selectedPickupLabel()}`,
    '',
    `שם: ${state.name.trim()}`,
    `טלפון: ${state.phone.trim()}`,
    `הערות: ${notes}`,
  ].join('\n');
}

function sendOrderToWhatsapp() {
  formErrorElement.textContent = '';

  const validationError = validateOrder();
  if (validationError) {
    formErrorElement.textContent = validationError;
    cartPanel.classList.add('open');
    return;
  }

  const entries = buildCartEntries();
  const total = totalFromEntries(entries);
  const message = buildWhatsappMessage(entries, total);
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener');
}

function initExistingInteractions() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const targetId = link.getAttribute('href');
      if (!targetId || targetId.length === 1) return;
      const target = document.querySelector(targetId);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      backToTop.classList.add('show');
    } else {
      backToTop.classList.remove('show');
    }
  });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  copyPhone.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(PHONE);
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1600);
    } catch {
      toast.textContent = 'העתקה נכשלה';
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        toast.textContent = 'המספר הועתק';
      }, 1600);
    }
  });
}

function initItems() {
  menuNodes.forEach((node) => {
    const item = parseItemData(node);
    if (!item) return;
    itemsById.set(item.id, item);
    attachControlsToMenuItem(item);
  });
}

function bindFormEvents() {
  pickupSelect.addEventListener('change', () => {
    state.pickup = pickupSelect.value;
    formErrorElement.textContent = '';
    saveState();
  });

  customerNameInput.addEventListener('input', () => {
    state.name = customerNameInput.value;
    saveState();
  });

  customerPhoneInput.addEventListener('input', () => {
    state.phone = customerPhoneInput.value;
    saveState();
  });

  customerNotesInput.addEventListener('input', () => {
    state.notes = customerNotesInput.value;
    saveState();
  });

  clearCartButton.addEventListener('click', () => {
    state.cart = {};
    formErrorElement.textContent = '';
    saveState();
    renderCart();
  });

  sendOrderButton.addEventListener('click', sendOrderToWhatsapp);
  mobileWhatsappButton.addEventListener('click', sendOrderToWhatsapp);

  mobileCartToggle.addEventListener('click', () => {
    cartPanel.classList.toggle('open');
    renderCart();
  });
}

function restoreInputs() {
  customerNameInput.value = state.name;
  customerPhoneInput.value = state.phone;
  customerNotesInput.value = state.notes;
}

function init() {
  restoreState();
  initItems();
  restoreInputs();
  populatePickupOptions();
  bindFormEvents();
  renderCart();
  initExistingInteractions();
}

init();
