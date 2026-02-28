import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { db } from "./src/firebase.js";

// עריכת שעות פעילות: 0=א', 1=ב', ... , 6=שבת
const WORKING_HOURS = {
  0: { open: '12:00', close: '00:00', label: 'יום א׳' },
  1: { open: '12:00', close: '00:00', label: 'יום ב׳' },
  2: { open: '12:00', close: '00:00', label: 'יום ג׳' },
  3: { open: '12:00', close: '00:00', label: 'יום ד׳' },
  4: { open: '12:00', close: '00:00', label: 'יום ה׳' },
  5: { open: '12:00', close: '00:00', label: 'יום ו׳' },
  6: { open: '12:00', close: '00:00', label: 'שבת' },
};

const BUSINESS_NAME = 'חזי בצומת';
const BUSINESS_ADDRESS = 'צומת אבן יהודה';
const PHONE = '050-0000000';
const STORAGE_KEY = 'itziks-cart-order-v2';
const LAST_ORDER_ID_KEY = 'itziks-cart-last-order-id';
const SLOT_STEP_MINUTES = 15;
const PREP_TIME_MINUTES = 15;
const ORDERING_HOURS_LABEL = 'פתוחים כל יום 12:00–00:00';
const CLOSED_ORDERING_MESSAGE = 'ההזמנות זמינות בין 12:00 ל-00:00';

const SANDWICH_ITEM_IDS = new Set([
  'pita-veal',
  'pita-turkey',
  'laffa-veal',
  'laffa-turkey',
]);
const DRINK_ITEM_IDS = new Set([
  'drink-can',
  'drink-bottle-05',
  'drink-bottle-15',
]);
const DRINK_CATEGORY_LABEL = 'שתייה';
const DRINK_TYPE_OPTIONS = [
  'קוקה קולה',
  'קוקה קולה זירו',
  'קוקה קולה דיאט',
  'ספרייט',
  'ספרייט זירו',
  'פאנטה תפוזים',
  'פאנטה ענבים',
  'קינלי טוניק',
  'קינלי סודה',
  'קינלי ג׳ינג׳ר אייל',
  'פיוז טי אפרסק',
  'פיוז טי לימון',
  'נסטי אפרסק',
  'נסטי לימון',
  'מים מינרליים',
  'מים מינרליים מוגזים',
  'פריגת/מיץ תפוזים',
  'פריגת/מיץ ענבים',
  'פריגת/מיץ תפוחים',
  'XL',
  'XL זירו',
  'רדבול',
  'בירה שחורה (מאלטי)',
  'שוקו',
  'לימונדה',
  'קפה קר',
  'טרופית',
  'ענבים סחוט',
  'תפוזים סחוט',
  'לימונענע',
  'סיידר תפוחים',
  'יוגורט לשתייה',
];
const DRINK_TYPE_SET = new Set(DRINK_TYPE_OPTIONS);

const SALAD_OPTIONS = [
  'עגבנייה',
  'מלפפון',
  'בצל',
  'כרוב',
  'חציל',
  'פטרוזיליה',
  'סלט חריף',
  'סלט ירוק',
];

const SAUCE_OPTIONS = [
  'טחינה',
  'עמבה',
  'שום',
  'חריף',
  'ברביקיו',
  'מיונז',
];

const PICKLE_OPTIONS = [
  'מלפפון חמוץ',
  'לפת',
  'זיתים',
  'פלפל חריף',
];
const SALAD_OPTION_SET = new Set(SALAD_OPTIONS);
const SAUCE_OPTION_SET = new Set(SAUCE_OPTIONS);
const PICKLE_OPTION_SET = new Set(PICKLE_OPTIONS);

const PAID_ADDONS = [
  { id: 'hummus', label: 'חומוס', price: 6 },
  { id: 'egg', label: 'ביצה קשה', price: 5 },
  { id: 'double-meat', label: 'בשר כפול', price: 18 },
];
const PAID_ADDON_IDS = new Set(PAID_ADDONS.map((addon) => addon.id));
const PAID_ADDON_BY_ID = new Map(PAID_ADDONS.map((addon) => [addon.id, addon]));

const DEFAULT_SANDWICH_OPTIONS = {
  salads: [],
  sauces: [],
  pickles: [],
  paidAddons: [],
};

const menuNodes = Array.from(document.querySelectorAll('#menu [data-item-id]'));
const itemsById = new Map();
const menuItemPricing = new Map();

const cartPanel = document.getElementById('cartPanel');
const cartItemsElement = document.getElementById('cartItems');
const cartEmptyElement = document.getElementById('cartEmpty');
const cartTotalElement = document.getElementById('cartTotal');
const cartTotalInline = document.getElementById('cartTotalInline');
const clearCartButton = document.getElementById('clearCartBtn');
const resetAllButton = document.getElementById('resetAllBtn');
const sendOrderButton = document.getElementById('sendOrderBtn');
let mobileCartButton = document.getElementById('mobileCartBtn');
let mobileCartBadge = document.getElementById('mobileCartBadge');
let mobileCartBackdrop = document.getElementById('mobileCartBackdrop');
const mobileCartCloseButton = document.getElementById('mobileCartClose');

const pickupSelect = document.getElementById('pickupTime');
const pickupHint = document.getElementById('pickupHint');
const customerNameInput = document.getElementById('customerName');
const customerPhoneInput = document.getElementById('customerPhone');
const customerNotesInput = document.getElementById('customerNotes');
const formErrorElement = document.getElementById('formError');
const lastOrderLink = document.getElementById('lastOrderLink');

const backToTop = document.getElementById('backToTop');
const toast = document.getElementById('toast');
const copyPhone = document.getElementById('copyPhone');

const state = {
  cartLines: [],
  name: '',
  phone: '',
  notes: '',
  pickup: '',
  lastOptions: {},
  lastDrinkType: {},
};

const ui = {
  pickupStatus: { canCheckout: false, nextOpen: null, slots: [] },
  lineEditor: {
    modal: null,
    content: null,
    noteInput: null,
    cancelButton: null,
    saveButton: null,
    editingLineId: null,
  },
  confirmModal: {
    modal: null,
    content: null,
    backButton: null,
    sendButton: null,
  },
  resetModal: {
    modal: null,
    cancelButton: null,
    confirmButton: null,
  },
  drinkChangeModal: {
    modal: null,
    cancelButton: null,
    confirmButton: null,
    pending: null,
  },
};

let customSelectGlobalBound = false;
let toastTimeoutId = null;
let mobileCartLockedScrollY = 0;
let lastFocusedBeforeMobileCart = null;
let buildVersionMarker = null;
const BUILD_VERSION = '20260228-13';
const defaultToastMessage = toast?.textContent || '';
const MOBILE_BREAKPOINT = 900;
const mobileViewportQuery = window.matchMedia(
  `(max-width: ${MOBILE_BREAKPOINT}px)`,
);
const mobileTouchQuery = window.matchMedia('(hover: none) and (pointer: coarse)');

function toShekel(value) {
  return `\u20AA${value}`;
}

function isMobileViewport() {
  return mobileViewportQuery.matches || mobileTouchQuery.matches;
}

function ensureMobileCartElements() {
  if (!mobileCartButton) {
    console.warn('[mobile cart] #mobileCartBtn missing, creating fallback');
    mobileCartButton = document.createElement('button');
    mobileCartButton.id = 'mobileCartBtn';
    mobileCartButton.className = 'mobile-cart-btn';
    mobileCartButton.type = 'button';
    mobileCartButton.setAttribute('aria-label', 'עגלה');
    mobileCartButton.innerHTML = `
      <span class="mobile-cart-icon" aria-hidden="true">\u{1F6D2}</span>
      <span id="mobileCartBadge" class="mobile-cart-badge" aria-hidden="true" hidden>0</span>
    `;
    document.body.append(mobileCartButton);
  }

  if (!mobileCartBadge) {
    console.warn('[mobile cart] #mobileCartBadge missing, creating fallback');
    mobileCartBadge = document.createElement('span');
    mobileCartBadge.id = 'mobileCartBadge';
    mobileCartBadge.className = 'mobile-cart-badge';
    mobileCartBadge.setAttribute('aria-hidden', 'true');
    mobileCartBadge.hidden = true;
    mobileCartBadge.textContent = '0';
    mobileCartButton.append(mobileCartBadge);
  }

  if (!mobileCartBackdrop) {
    console.warn('[mobile cart] #mobileCartBackdrop missing, creating fallback');
    mobileCartBackdrop = document.createElement('div');
    mobileCartBackdrop.id = 'mobileCartBackdrop';
    mobileCartBackdrop.className = 'mobile-cart-backdrop';
    mobileCartBackdrop.hidden = true;
    document.body.append(mobileCartBackdrop);
  }

  mobileCartButton.setAttribute('aria-controls', 'cartPanel');
  mobileCartButton.setAttribute('aria-haspopup', 'dialog');
  mobileCartButton.setAttribute('aria-expanded', 'false');
}

function lockBodyScrollForMobileCart() {
  if (document.body.classList.contains('mobile-cart-open')) return;
  mobileCartLockedScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.style.top = `-${mobileCartLockedScrollY}px`;
  document.body.classList.add('mobile-cart-open');
}

function unlockBodyScrollForMobileCart() {
  if (!document.body.classList.contains('mobile-cart-open')) return;
  document.body.classList.remove('mobile-cart-open');
  document.body.style.top = '';
  window.scrollTo(0, mobileCartLockedScrollY);
}

function closeMobileCart(options = {}) {
  const { restoreFocus = true } = options;
  cartPanel.classList.remove('open');
  if (isMobileViewport()) {
    cartPanel.setAttribute('aria-hidden', 'true');
  }
  mobileCartButton?.setAttribute('aria-expanded', 'false');
  if (mobileCartBackdrop) {
    mobileCartBackdrop.classList.remove('show');
    mobileCartBackdrop.hidden = true;
  }
  unlockBodyScrollForMobileCart();
  if (restoreFocus && isMobileViewport() && lastFocusedBeforeMobileCart) {
    lastFocusedBeforeMobileCart.focus({ preventScroll: true });
  }
  lastFocusedBeforeMobileCart = null;
}

function openMobileCart() {
  if (!isMobileViewport()) return;
  lastFocusedBeforeMobileCart =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  cartPanel.classList.add('open');
  cartPanel.setAttribute('aria-hidden', 'false');
  cartPanel.setAttribute('role', 'dialog');
  cartPanel.setAttribute('aria-modal', 'true');
  mobileCartButton?.setAttribute('aria-expanded', 'true');
  if (mobileCartBackdrop) {
    mobileCartBackdrop.hidden = false;
    mobileCartBackdrop.classList.add('show');
  }
  lockBodyScrollForMobileCart();
  mobileCartCloseButton?.focus({ preventScroll: true });
}

function syncMobileCartLayout() {
  if (mobileCartButton) {
    mobileCartButton.style.display = isMobileViewport() ? 'flex' : 'none';
  }

  if (isMobileViewport()) {
    const isOpen = cartPanel.classList.contains('open');
    cartPanel.setAttribute(
      'aria-hidden',
      isOpen ? 'false' : 'true',
    );
    cartPanel.setAttribute('role', 'dialog');
    cartPanel.setAttribute('aria-modal', 'true');
    mobileCartButton?.setAttribute(
      'aria-expanded',
      isOpen ? 'true' : 'false',
    );
    if (!isOpen) {
      unlockBodyScrollForMobileCart();
    }
    return;
  }

  closeMobileCart({ restoreFocus: false });
  cartPanel.removeAttribute('aria-hidden');
  cartPanel.removeAttribute('role');
  cartPanel.removeAttribute('aria-modal');
  mobileCartButton?.setAttribute('aria-expanded', 'false');
  if (mobileCartBackdrop) {
    mobileCartBackdrop.classList.remove('show');
    mobileCartBackdrop.hidden = true;
  }
}

function ensureBuildVersionMarker() {
  if (buildVersionMarker) return buildVersionMarker;

  const marker = document.createElement('div');
  marker.id = 'buildVersionMarker';
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = `v: ${BUILD_VERSION}`;
  Object.assign(marker.style, {
    position: 'fixed',
    left: '0.45rem',
    bottom: 'calc(0.35rem + env(safe-area-inset-bottom))',
    padding: '0.12rem 0.35rem',
    borderRadius: '6px',
    background: 'rgba(43, 32, 24, 0.65)',
    color: '#fff',
    fontSize: '10px',
    lineHeight: '1.2',
    letterSpacing: '0.01em',
    fontFamily: 'monospace',
    zIndex: '69',
    pointerEvents: 'none',
  });
  marker.hidden = true;
  document.body.append(marker);
  buildVersionMarker = marker;
  return marker;
}

function syncBuildVersionMarker() {
  const marker = ensureBuildVersionMarker();
  marker.hidden = !isMobileViewport();
}

function syncViewportUi() {
  syncMobileCartLayout();
  syncBuildVersionMarker();
}

function showToast(message, timeoutMs = 2000) {
  if (!toast) return;
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }

  toast.textContent = message;
  toast.classList.add('show');

  toastTimeoutId = setTimeout(() => {
    toast.classList.remove('show');
    toast.textContent = defaultToastMessage;
    toastTimeoutId = null;
  }, timeoutMs);
}

function parseItemData(node) {
  const id = node.dataset.itemId;
  const name = node.dataset.itemName;
  const price = Number(node.dataset.itemPrice || 0);
  if (!id || !name || Number.isNaN(price)) return null;
  return {
    id,
    name,
    price,
    node,
    isSandwich: SANDWICH_ITEM_IDS.has(id),
    isDrink: DRINK_ITEM_IDS.has(id),
  };
}

function isSandwichItem(itemId) {
  return SANDWICH_ITEM_IDS.has(itemId);
}

function isDrinkItem(itemId) {
  return DRINK_ITEM_IDS.has(itemId);
}

function sanitizeDrinkType(value) {
  const safeValue = String(value || '').trim();
  return DRINK_TYPE_SET.has(safeValue) ? safeValue : '';
}

function readDrinkTypeFromMenu(itemId) {
  const select = menuNodeById(itemId)?.querySelector('.drink-type-select');
  return sanitizeDrinkType(select?.value || '');
}

function setDrinkError(itemId, message = '') {
  const errorNode = menuNodeById(itemId)?.querySelector('.drink-type-error');
  if (!errorNode) return;
  errorNode.textContent = message;
  errorNode.hidden = !message;
}

function clearDrinkError(itemId) {
  setDrinkError(itemId, '');
}

function sanitizeSelection(values, allowedValues) {
  if (!Array.isArray(values)) return [];
  const normalized = [];
  values.forEach((value) => {
    const safeValue = String(value);
    if (allowedValues.has(safeValue) && !normalized.includes(safeValue)) {
      normalized.push(safeValue);
    }
  });
  return normalized;
}

function normalizeSandwichOptions(options) {
  const raw = options || {};
  const salads = sanitizeSelection(raw.salads, SALAD_OPTION_SET);
  const sauces = sanitizeSelection(raw.sauces, SAUCE_OPTION_SET);
  const pickles = sanitizeSelection(raw.pickles, PICKLE_OPTION_SET);
  const paidAddons = sanitizeSelection(raw.paidAddons, PAID_ADDON_IDS);
  return {
    salads,
    sauces,
    pickles,
    paidAddons,
  };
}

function copyOptions(options) {
  const normalized = normalizeSandwichOptions(options);
  return {
    salads: [...normalized.salads],
    sauces: [...normalized.sauces],
    pickles: [...normalized.pickles],
    paidAddons: [...normalized.paidAddons],
  };
}

function optionModifiers(options) {
  if (!options) {
    return { addonModifier: 0 };
  }

  const normalized = normalizeSandwichOptions(options);
  const addonModifier = normalized.paidAddons.reduce((sum, addonId) => {
    const addon = PAID_ADDON_BY_ID.get(addonId);
    return sum + (addon ? addon.price : 0);
  }, 0);
  return { addonModifier };
}

function optionsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const left = normalizeSandwichOptions(a);
  const right = normalizeSandwichOptions(b);
  return (
    left.salads.join('|') === right.salads.join('|') &&
    left.sauces.join('|') === right.sauces.join('|') &&
    left.pickles.join('|') === right.pickles.join('|') &&
    left.paidAddons.join('|') === right.paidAddons.join('|')
  );
}

function optionPrice(options) {
  const { addonModifier } = optionModifiers(options);
  return addonModifier;
}

function lineUnitPrice(line) {
  return line.basePrice + optionPrice(line.options);
}

function computeMenuItemPricing(item) {
  const options = item.isSandwich ? readSandwichOptionsFromMenu(item.id) : null;
  const { addonModifier } = optionModifiers(options);
  const basePrice = item.price;
  const finalPrice = basePrice + addonModifier;
  return { basePrice, addonModifier, finalPrice };
}

function updateMenuItemPrice(itemId) {
  const item = itemsById.get(itemId);
  if (!item) return;

  const pricing = computeMenuItemPricing(item);
  menuItemPricing.set(itemId, pricing);
  item.node.dataset.basePrice = String(pricing.basePrice);
  item.node.dataset.addonModifier = String(pricing.addonModifier);

  const priceElement = item.node.querySelector('.price-badge');
  if (priceElement) priceElement.textContent = toShekel(pricing.finalPrice);
}

function lineTotal(line) {
  return line.quantity * lineUnitPrice(line);
}

function createLineId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function menuNodeById(itemId) {
  return document.querySelector(`#menu [data-item-id="${itemId}"]`);
}

function customSelectMarkup({ id, inputClass, options, value }) {
  const selectedValue = options.some((option) => option.value === value)
    ? value
    : options[0].value;
  const selectedLabel =
    options.find((option) => option.value === selectedValue)?.label || '';
  const listId = `${id}-listbox`;
  const triggerId = `${id}-trigger`;
  const optionsMarkup = options
    .map((option, index) => {
      const isSelected = option.value === selectedValue;
      const optionId = `${listId}-opt-${index}`;
      return `
        <li
          id="${optionId}"
          class="custom-select-option${isSelected ? ' is-selected' : ''}"
          role="option"
          data-value="${option.value}"
          aria-selected="${isSelected ? 'true' : 'false'}"
          tabindex="-1"
        >
          ${option.label}
        </li>
      `;
    })
    .join('');

  return `
    <div class="custom-select" data-custom-select>
      <input type="hidden" id="${id}" class="${inputClass}" value="${selectedValue}" />
      <button
        type="button"
        class="custom-select-trigger"
        id="${triggerId}"
        role="combobox"
        aria-expanded="false"
        aria-haspopup="listbox"
        aria-controls="${listId}"
      >
        <span class="custom-select-value">${selectedLabel}</span>
        <span class="custom-select-arrow" aria-hidden="true">▾</span>
      </button>
      <ul
        id="${listId}"
        class="custom-select-list"
        role="listbox"
        aria-labelledby="${triggerId}"
        hidden
      >
        ${optionsMarkup}
      </ul>
    </div>
  `;
}

function closeCustomSelect(root, focusTrigger = false) {
  if (!root) return;
  const trigger = root.querySelector('.custom-select-trigger');
  const list = root.querySelector('.custom-select-list');
  root.classList.remove('open');
  if (trigger) {
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
  }
  if (list) list.hidden = true;
  if (focusTrigger && trigger) trigger.focus();
}

function openCustomSelect(root) {
  if (!root) return;
  document.querySelectorAll('[data-custom-select].open').forEach((node) => {
    if (node !== root) closeCustomSelect(node);
  });

  const trigger = root.querySelector('.custom-select-trigger');
  const list = root.querySelector('.custom-select-list');
  root.classList.add('open');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  if (list) list.hidden = false;
}

function initCustomSelect(root) {
  if (!root || root.dataset.customSelectReady === 'true') return;

  const hiddenInput = root.querySelector('input[type="hidden"]');
  const trigger = root.querySelector('.custom-select-trigger');
  const valueNode = root.querySelector('.custom-select-value');
  const list = root.querySelector('.custom-select-list');
  const optionNodes = Array.from(root.querySelectorAll('.custom-select-option'));
  if (!hiddenInput || !trigger || !valueNode || !list || optionNodes.length === 0) {
    return;
  }

  root.dataset.customSelectReady = 'true';
  let activeIndex = 0;

  const setActiveIndex = (nextIndex) => {
    if (optionNodes.length === 0) return;
    activeIndex = Math.max(0, Math.min(nextIndex, optionNodes.length - 1));
    optionNodes.forEach((node, index) => {
      node.classList.toggle('is-active', index === activeIndex);
    });
    const activeNode = optionNodes[activeIndex];
    if (activeNode?.id) trigger.setAttribute('aria-activedescendant', activeNode.id);
    activeNode?.scrollIntoView({ block: 'nearest' });
  };

  const applySelection = (nextIndex, emitChange = true) => {
    const selectedNode = optionNodes[nextIndex];
    if (!selectedNode) return;
    hiddenInput.value = selectedNode.dataset.value || '';
    valueNode.textContent = selectedNode.textContent?.trim() || '';
    optionNodes.forEach((node, index) => {
      const selected = index === nextIndex;
      node.setAttribute('aria-selected', selected ? 'true' : 'false');
      node.classList.toggle('is-selected', selected);
    });
    setActiveIndex(nextIndex);
    if (emitChange) {
      hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  root._setCustomSelectValue = (value, emitChange = false) => {
    const nextIndex = optionNodes.findIndex((node) => node.dataset.value === value);
    if (nextIndex >= 0) applySelection(nextIndex, emitChange);
  };

  const initialIndex = Math.max(
    0,
    optionNodes.findIndex((node) => node.dataset.value === hiddenInput.value),
  );
  applySelection(initialIndex, false);
  closeCustomSelect(root);

  trigger.addEventListener('click', () => {
    if (root.classList.contains('open')) {
      closeCustomSelect(root);
    } else {
      openCustomSelect(root);
      setActiveIndex(activeIndex);
    }
  });

  trigger.addEventListener('keydown', (event) => {
    const isOpen = root.classList.contains('open');
    const handledKeys = ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Escape'];
    if (handledKeys.includes(event.key)) event.preventDefault();

    if (event.key === 'Enter' || event.key === ' ') {
      if (!isOpen) {
        openCustomSelect(root);
        setActiveIndex(activeIndex);
      } else {
        applySelection(activeIndex, true);
        closeCustomSelect(root, true);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      if (!isOpen) openCustomSelect(root);
      setActiveIndex(activeIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      if (!isOpen) openCustomSelect(root);
      setActiveIndex(activeIndex - 1);
      return;
    }

    if (event.key === 'Escape') {
      closeCustomSelect(root, true);
      return;
    }

    if (event.key === 'Tab') {
      closeCustomSelect(root);
    }
  });

  list.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });

  list.addEventListener('mousemove', (event) => {
    const option = event.target.closest('.custom-select-option');
    if (!option) return;
    const nextIndex = optionNodes.indexOf(option);
    if (nextIndex >= 0) setActiveIndex(nextIndex);
  });

  list.addEventListener('click', (event) => {
    const option = event.target.closest('.custom-select-option');
    if (!option) return;
    const nextIndex = optionNodes.indexOf(option);
    if (nextIndex >= 0) {
      applySelection(nextIndex, true);
      closeCustomSelect(root, true);
    }
  });

  if (!customSelectGlobalBound) {
    customSelectGlobalBound = true;
    document.addEventListener('click', (event) => {
      document.querySelectorAll('[data-custom-select].open').forEach((node) => {
        if (!node.contains(event.target)) closeCustomSelect(node);
      });
    });
  }
}

function initCustomSelects(scope) {
  if (!scope) return;
  scope.querySelectorAll('[data-custom-select]').forEach((node) => initCustomSelect(node));
}

function setCustomSelectValue(inputNode, value, emitChange = false) {
  const root = inputNode?.closest?.('[data-custom-select]');
  if (!root) return;
  if (typeof root._setCustomSelectValue === 'function') {
    root._setCustomSelectValue(value, emitChange);
    return;
  }
  const hiddenInput = root.querySelector('input[type="hidden"]');
  if (hiddenInput) hiddenInput.value = value;
}

function renderOptionChecks(
  groupKey,
  groupClass,
  options,
  selectedValues,
  withPrice = false,
  includeAllOption = false,
) {
  const selectedSet = new Set(selectedValues);
  const optionMarkup = options
    .map((option) => {
      const value = typeof option === 'string' ? option : option.id;
      const label = typeof option === 'string' ? option : option.label;
      const suffix =
        withPrice && typeof option !== 'string' ? ` (+${toShekel(option.price)})` : '';
      const checked = selectedSet.has(value) ? 'checked' : '';
      const addonData =
        withPrice && typeof option !== 'string'
          ? ` data-addon-id="${option.id}" data-addon-price="${option.price}"`
          : '';
      return `
        <label class="shawarma-chip">
          <input type="checkbox" class="${groupClass} group-choice chip-input" data-group="${groupKey}" value="${value}"${addonData} ${checked} />
          <span class="chip-label">${label}${suffix}</span>
        </label>
      `;
    })
    .join('');

  if (!includeAllOption) return optionMarkup;

  const allSelected =
    options.length > 0 &&
    options.every((option) => {
      const value = typeof option === 'string' ? option : option.id;
      return selectedSet.has(value);
    });
  const allChecked = allSelected ? 'checked' : '';
  return `
    <label class="shawarma-chip">
      <input type="checkbox" class="group-all-toggle chip-input" data-group="${groupKey}" ${allChecked} />
      <span class="chip-label">הכול</span>
    </label>
    ${optionMarkup}
  `;
}

function renderOptionGroup({
  title,
  hint,
  groupKey,
  groupClass,
  options,
  selectedValues,
  withPrice = false,
  includeAllOption = false,
}) {
  return `
    <div class="shawarma-group">
      <div class="shawarma-group-head">
        <div class="option-label">${title}</div>
        <div class="option-hint">${hint}</div>
      </div>
      <div class="checks-wrap">
        ${renderOptionChecks(
          groupKey,
          groupClass,
          options,
          selectedValues,
          withPrice,
          includeAllOption,
        )}
      </div>
    </div>
  `;
}

function syncGroupAllToggle(root, groupKey) {
  if (!root) return;
  const allToggle = root.querySelector(`.group-all-toggle[data-group="${groupKey}"]`);
  if (!allToggle) return;
  const itemInputs = Array.from(
    root.querySelectorAll(`.group-choice[data-group="${groupKey}"]`),
  );
  allToggle.checked =
    itemInputs.length > 0 && itemInputs.every((input) => input.checked);
}

function syncAllGroupToggles(root) {
  if (!root) return;
  ['salads', 'sauces', 'pickles'].forEach((groupKey) =>
    syncGroupAllToggle(root, groupKey),
  );
}

function initGroupAllBehavior(root) {
  if (!root || root.dataset.groupAllReady === 'true') return;
  root.dataset.groupAllReady = 'true';

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const groupKey = target.dataset.group;
    if (!groupKey) return;

    if (target.classList.contains('group-all-toggle')) {
      root
        .querySelectorAll(`.group-choice[data-group="${groupKey}"]`)
        .forEach((input) => {
          input.checked = target.checked;
        });
    }

    syncGroupAllToggle(root, groupKey);
  });

  syncAllGroupToggles(root);
}

function buildSandwichOptionsEditor(itemId) {
  const options = copyOptions(
    state.lastOptions[itemId] || DEFAULT_SANDWICH_OPTIONS,
  );

  const wrapper = document.createElement('div');
  wrapper.className = 'shawarma-options';
  wrapper.dataset.itemId = itemId;
  wrapper.innerHTML = `
    ${renderOptionGroup({
      title: 'סלטים',
      hint: 'בחרו כמה שתרצו',
      groupKey: 'salads',
      groupClass: 'salad-choice',
      options: SALAD_OPTIONS,
      selectedValues: options.salads,
      includeAllOption: true,
    })}
    ${renderOptionGroup({
      title: 'רטבים',
      hint: 'בחרו כמה שתרצו',
      groupKey: 'sauces',
      groupClass: 'sauce-choice',
      options: SAUCE_OPTIONS,
      selectedValues: options.sauces,
      includeAllOption: true,
    })}
    ${renderOptionGroup({
      title: 'חמוצים',
      hint: 'בחרו כמה שתרצו',
      groupKey: 'pickles',
      groupClass: 'pickle-choice',
      options: PICKLE_OPTIONS,
      selectedValues: options.pickles,
      includeAllOption: true,
    })}
    ${renderOptionGroup({
      title: 'תוספות בתשלום',
      hint: 'בחירה תשפיע על המחיר',
      groupKey: 'paidAddons',
      groupClass: 'paid-addon',
      options: PAID_ADDONS,
      selectedValues: options.paidAddons,
      withPrice: true,
    })}
  `;

  initGroupAllBehavior(wrapper);

  wrapper.addEventListener('change', () => {
    state.lastOptions[itemId] = readSandwichOptionsFromMenu(itemId);
    updateMenuItemPrice(itemId);
    saveState();
  });

  return wrapper;
}

function readSandwichOptionsFromRoot(root) {
  if (!root) return copyOptions(DEFAULT_SANDWICH_OPTIONS);
  const options = {
    salads: Array.from(root.querySelectorAll('.salad-choice:checked')).map(
      (input) => input.value,
    ),
    sauces: Array.from(root.querySelectorAll('.sauce-choice:checked')).map(
      (input) => input.value,
    ),
    pickles: Array.from(root.querySelectorAll('.pickle-choice:checked')).map(
      (input) => input.value,
    ),
    paidAddons: Array.from(root.querySelectorAll('.paid-addon:checked')).map(
      (input) => input.value,
    ),
  };
  return normalizeSandwichOptions(options);
}

function readSandwichOptionsFromMenu(itemId) {
  const root = menuNodeById(itemId)?.querySelector('.shawarma-options');
  return readSandwichOptionsFromRoot(root);
}

function applySandwichSelections(root, options) {
  if (!root) return;
  const normalized = normalizeSandwichOptions(options);
  const setValues = (selector, selectedValues) => {
    const selectedSet = new Set(selectedValues);
    root.querySelectorAll(selector).forEach((input) => {
      input.checked = selectedSet.has(input.value);
    });
  };
  setValues('.salad-choice', normalized.salads);
  setValues('.sauce-choice', normalized.sauces);
  setValues('.pickle-choice', normalized.pickles);
  setValues('.paid-addon', normalized.paidAddons);
  syncAllGroupToggles(root);
}

function cancelPendingDrinkTypeChange() {
  const pending = ui.drinkChangeModal.pending;
  if (pending?.selectNode) {
    pending.selectNode.value = pending.previousType || '';
  }
  ui.drinkChangeModal.pending = null;
  if (ui.drinkChangeModal.modal) closeModal(ui.drinkChangeModal.modal);
}

function applyPendingDrinkTypeChange() {
  const pending = ui.drinkChangeModal.pending;
  if (!pending) return;

  state.cartLines = state.cartLines.filter((line) => line.itemId !== pending.itemId);
  state.lastDrinkType[pending.itemId] = pending.nextType;
  clearDrinkError(pending.itemId);
  ui.drinkChangeModal.pending = null;
  if (ui.drinkChangeModal.modal) closeModal(ui.drinkChangeModal.modal);
  saveState();
  renderCart();
}

function openDrinkTypeChangeConfirmation(itemId, nextType, selectNode) {
  ui.drinkChangeModal.pending = {
    itemId,
    nextType,
    previousType: state.lastDrinkType[itemId] || '',
    selectNode,
  };
  openModal(ui.drinkChangeModal.modal);
}

function handleDrinkTypeSelectionChange(itemId, selectNode) {
  const nextType = sanitizeDrinkType(selectNode.value);
  const previousType = sanitizeDrinkType(state.lastDrinkType[itemId] || '');
  const itemQuantity = getItemQuantity(itemId);

  if (!nextType) {
    setDrinkError(itemId, 'חייב לבחור שתייה');
    return;
  }

  clearDrinkError(itemId);
  if (nextType === previousType) return;

  if (itemQuantity > 0) {
    openDrinkTypeChangeConfirmation(itemId, nextType, selectNode);
    return;
  }

  state.lastDrinkType[itemId] = nextType;
  saveState();
}

function buildDrinkTypeSelector(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'drink-type-wrap';

  const selectId = `drink-type-${item.id}`;
  const optionsMarkup = DRINK_TYPE_OPTIONS.map(
    (drinkType) => `<option value="${drinkType}">${drinkType}</option>`,
  ).join('');

  wrapper.innerHTML = `
    <label class="drink-type-label" for="${selectId}">בחר שתייה</label>
    <select class="drink-type-select" id="${selectId}">
      <option value="" disabled selected>בחר שתייה…</option>
      ${optionsMarkup}
    </select>
    <p class="drink-type-error" hidden>חייב לבחור שתייה</p>
  `;

  const selectNode = wrapper.querySelector('.drink-type-select');
  const current = sanitizeDrinkType(state.lastDrinkType[item.id] || '');
  selectNode.value = current || '';

  selectNode.addEventListener('change', () => {
    handleDrinkTypeSelectionChange(item.id, selectNode);
  });

  return wrapper;
}

function buildQuantityControls(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'order-controls qty';

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

  plusButton.addEventListener('click', () => addItemFromMenu(item.id));
  minusButton.addEventListener('click', () => removeItemFromMenu(item.id));

  wrapper.append(plusButton, qtyDisplay, minusButton);
  return wrapper;
}

function attachControlsToMenuItem(item) {
  const priceElement = item.node.querySelector('.price');
  if (!priceElement) return;
  priceElement.classList.add('price-badge');

  const actions = document.createElement('div');
  actions.className = 'menu-item-actions buy-row';
  priceElement.replaceWith(actions);
  actions.append(buildQuantityControls(item), priceElement);

  if (item.isSandwich) {
    item.node.classList.add('menu-item-with-options');
    const textColumn = item.node.querySelector(':scope > .menu-item-main');
    if (textColumn) {
      textColumn.append(buildSandwichOptionsEditor(item.id));
    }
  }

  if (item.isDrink) {
    item.node.classList.add('menu-item-with-options');
    const textColumn = item.node.querySelector(':scope > .menu-item-main');
    if (textColumn) {
      textColumn.append(buildDrinkTypeSelector(item));
    }
  }
}

function getItemQuantity(itemId) {
  return state.cartLines
    .filter((line) => line.itemId === itemId)
    .reduce((sum, line) => sum + line.quantity, 0);
}

function findMatchingEditableLine(itemId, options, drinkType = '') {
  return state.cartLines.find(
    (line) =>
      line.itemId === itemId &&
      line.note.trim() === '' &&
      optionsEqual(line.options, options) &&
      sanitizeDrinkType(line.drinkType) === sanitizeDrinkType(drinkType),
  );
}

function addItemFromMenu(itemId) {
  const item = itemsById.get(itemId);
  if (!item) return;

  const options = item.isSandwich
    ? readSandwichOptionsFromMenu(itemId)
    : null;
  const drinkType = item.isDrink ? readDrinkTypeFromMenu(itemId) : '';

  if (item.isDrink && !drinkType) {
    setDrinkError(itemId, 'חייב לבחור שתייה');
    return;
  }
  if (item.isDrink) {
    state.lastDrinkType[itemId] = drinkType;
    clearDrinkError(itemId);
  }

  if (item.isSandwich) {
    state.lastOptions[itemId] = copyOptions(options);
  }

  const existing = findMatchingEditableLine(itemId, options, drinkType);
  const baseName = item.name;
  const displayName = item.isDrink ? `${baseName} — ${drinkType}` : baseName;
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cartLines.push({
      lineId: createLineId(),
      itemId: item.id,
      name: displayName,
      baseName,
      displayName,
      category: item.isDrink ? DRINK_CATEGORY_LABEL : '',
      drinkType: item.isDrink ? drinkType : '',
      basePrice: item.price,
      quantity: 1,
      options,
      note: '',
    });
  }

  saveState();
  renderCart();
}

function removeItemFromMenu(itemId) {
  const item = itemsById.get(itemId);
  if (!item) return;

  if (getItemQuantity(itemId) === 0) return;

  let target = null;
  if (item.isSandwich) {
    const selectedOptions = readSandwichOptionsFromMenu(itemId);
    target = state.cartLines.find(
      (line) =>
        line.itemId === itemId &&
        line.note.trim() === '' &&
        optionsEqual(line.options, selectedOptions),
    );
  }
  if (item.isDrink) {
    const selectedDrinkType = readDrinkTypeFromMenu(itemId);
    if (!selectedDrinkType) {
      setDrinkError(itemId, 'חייב לבחור שתייה');
      return;
    }
    clearDrinkError(itemId);
    target = state.cartLines.find(
      (line) =>
        line.itemId === itemId &&
        sanitizeDrinkType(line.drinkType) === selectedDrinkType,
    );
  }

  if (!target && !item.isDrink) {
    for (let i = state.cartLines.length - 1; i >= 0; i -= 1) {
      if (state.cartLines[i].itemId === itemId) {
        target = state.cartLines[i];
        break;
      }
    }
  }

  if (!target) return;

  target.quantity -= 1;
  if (target.quantity <= 0) {
    state.cartLines = state.cartLines.filter((line) => line.lineId !== target.lineId);
  }

  saveState();
  renderCart();
}

function sanitizeCartLine(line) {
  if (!line || typeof line !== 'object') return null;

  const item = itemsById.get(line.itemId);
  if (!item) return null;

  const quantity = Number(line.quantity || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const baseName =
    typeof line.baseName === 'string' && line.baseName.trim()
      ? line.baseName.trim()
      : item.name;
  const drinkType = item.isDrink ? sanitizeDrinkType(line.drinkType) : '';
  if (item.isDrink && !drinkType) return null;
  const displayName = item.isDrink
    ? `${baseName} — ${drinkType}`
    : typeof line.displayName === 'string' && line.displayName.trim()
      ? line.displayName.trim()
      : item.name;

  return {
    lineId: typeof line.lineId === 'string' ? line.lineId : createLineId(),
    itemId: item.id,
    name: displayName,
    baseName,
    displayName,
    category: item.isDrink ? DRINK_CATEGORY_LABEL : '',
    drinkType,
    basePrice: item.price,
    quantity: Math.floor(quantity),
    options: item.isSandwich ? normalizeSandwichOptions(line.options) : null,
    note: typeof line.note === 'string' ? line.note : '',
  };
}

function mergeDuplicateLines() {
  const merged = [];
  state.cartLines.forEach((line) => {
    const duplicate = merged.find(
      (candidate) =>
        candidate.itemId === line.itemId &&
        candidate.note.trim() === line.note.trim() &&
        optionsEqual(candidate.options, line.options) &&
        sanitizeDrinkType(candidate.drinkType) === sanitizeDrinkType(line.drinkType),
    );
    if (duplicate) {
      duplicate.quantity += line.quantity;
    } else {
      merged.push({ ...line });
    }
  });
  state.cartLines = merged;
}

function buildCartEntries() {
  return state.cartLines
    .map((line) => sanitizeCartLine(line))
    .filter(Boolean);
}

function totalFromEntries(entries) {
  return entries.reduce((sum, entry) => sum + lineTotal(entry), 0);
}

function optionsSummary(line) {
  if (!line.options) return '';
  const options = normalizeSandwichOptions(line.options);
  const parts = [];
  if (options.salads.length > 0) parts.push(`סלטים: ${options.salads.join(', ')}`);
  if (options.sauces.length > 0) parts.push(`רטבים: ${options.sauces.join(', ')}`);
  if (options.pickles.length > 0) parts.push(`חמוצים: ${options.pickles.join(', ')}`);
  if (options.paidAddons.length > 0) {
    const paidText = options.paidAddons
      .map((addonId) => {
        const addon = PAID_ADDON_BY_ID.get(addonId);
        return addon ? `${addon.label} (+${toShekel(addon.price)})` : addonId;
      })
      .join(', ');
    parts.push(`תוספות בתשלום: ${paidText}`);
  }
  return parts.join(' | ');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getCartItemCount(entries = state.cartLines) {
  return entries.reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0);
}

function updateMobileBadge(itemCount, totalLabel = '') {
  if (mobileCartBadge) {
    mobileCartBadge.textContent = String(itemCount);
    mobileCartBadge.hidden = itemCount === 0;
  }

  if (mobileCartButton) {
    const priceLabel = totalLabel ? `, ${totalLabel}` : '';
    mobileCartButton.setAttribute(
      'aria-label',
      `עגלה: ${itemCount} פריטים${priceLabel}`,
    );
  }
}

function renderCart() {
  const entries = buildCartEntries();
  state.cartLines = entries;
  const total = totalFromEntries(entries);
  const itemCount = getCartItemCount(entries);

  menuNodes.forEach((node) => {
    const itemId = node.dataset.itemId;
    const qtyDisplay = document.getElementById(`qty-${itemId}`);
    if (qtyDisplay) qtyDisplay.textContent = String(getItemQuantity(itemId));
  });

  cartItemsElement.innerHTML = '';
  cartEmptyElement.style.display = entries.length === 0 ? 'block' : 'none';

  entries.forEach((entry) => {
    const unitPrice = lineUnitPrice(entry);
    const optionSummaryText = optionsSummary(entry);
    const line = document.createElement('div');
    line.className = 'cart-item';
    line.innerHTML = `
      <div>
        <div class="cart-item-name">${escapeHtml(entry.name)}</div>
        <div class="cart-item-meta">${entry.quantity} x ${toShekel(unitPrice)}</div>
        ${
          optionSummaryText
            ? `<div class="cart-item-options">${escapeHtml(optionSummaryText)}</div>`
            : ''
        }
        ${
          entry.note.trim()
            ? `<div class="cart-item-note">הערה: ${escapeHtml(entry.note.trim())}</div>`
            : ''
        }
        <button class="line-edit-btn" type="button" data-edit-line-id="${entry.lineId}">עריכה</button>
      </div>
      <div class="cart-line-total">${toShekel(lineTotal(entry))}</div>
    `;
    cartItemsElement.append(line);
  });

  const totalLabel = toShekel(total);
  cartTotalElement.textContent = totalLabel;
  cartTotalInline.textContent = totalLabel;
  updateMobileBadge(itemCount, totalLabel);
  if (mobileCartButton) {
    mobileCartButton.setAttribute(
      'aria-label',
      `עגלה: ${itemCount} פריטים, ${totalLabel}`,
    );
  }
}

function serializeState() {
  return {
    cartLines: state.cartLines,
    name: state.name,
    phone: state.phone,
    notes: state.notes,
    pickup: state.pickup,
    lastOptions: state.lastOptions,
    lastDrinkType: state.lastDrinkType,
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
}

function buildOrderStatusUrl(orderId) {
  const url = new URL('./order.html', window.location.href);
  url.searchParams.set('id', orderId);
  return url.toString();
}

function storeLastOrderId(orderId) {
  if (!orderId) return;
  try {
    localStorage.setItem(LAST_ORDER_ID_KEY, orderId);
  } catch (error) {
    console.error('Failed to store last order id', error);
  }
}

function readLastOrderId() {
  try {
    return localStorage.getItem(LAST_ORDER_ID_KEY) || '';
  } catch (error) {
    console.error('Failed to read last order id', error);
    return '';
  }
}

function syncLastOrderLink() {
  if (!lastOrderLink) return;
  const lastOrderId = readLastOrderId();
  if (!lastOrderId) {
    lastOrderLink.hidden = true;
    return;
  }
  lastOrderLink.href = buildOrderStatusUrl(lastOrderId);
  lastOrderLink.hidden = false;
}

function restoreState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    state.cartLines = Array.isArray(parsed.cartLines) ? parsed.cartLines : [];
    state.name = typeof parsed.name === 'string' ? parsed.name : '';
    state.phone = typeof parsed.phone === 'string' ? parsed.phone : '';
    state.notes = typeof parsed.notes === 'string' ? parsed.notes : '';
    state.pickup = typeof parsed.pickup === 'string' ? parsed.pickup : '';
    state.lastOptions =
      parsed.lastOptions && typeof parsed.lastOptions === 'object'
        ? parsed.lastOptions
        : {};
    state.lastDrinkType =
      parsed.lastDrinkType && typeof parsed.lastDrinkType === 'object'
        ? parsed.lastDrinkType
        : {};
  } catch {
    state.cartLines = [];
  }
}

function clearDraftStorage() {
  const clearFromStore = (store) => {
    try {
      store.removeItem(STORAGE_KEY);
      for (let i = store.length - 1; i >= 0; i -= 1) {
        const key = store.key(i);
        if (!key) continue;
        if (key.startsWith('itziks-cart-order-')) {
          store.removeItem(key);
        }
      }
    } catch (error) {
      console.error('Failed to clear draft storage', error);
    }
  };

  clearFromStore(localStorage);
  clearFromStore(sessionStorage);
}

function resetMenuSelectionsToDefault() {
  const menuRoot = document.getElementById('menu');
  if (menuRoot) {
    menuRoot
      .querySelectorAll('input[type="checkbox"], input[type="radio"]')
      .forEach((input) => {
        input.checked = false;
      });
    menuRoot.querySelectorAll('select').forEach((select) => {
      select.selectedIndex = 0;
    });
  }

  itemsById.forEach((item) => {
    if (item.isSandwich) {
      const defaults = copyOptions(DEFAULT_SANDWICH_OPTIONS);
      state.lastOptions[item.id] = defaults;
      const optionsRoot = menuNodeById(item.id)?.querySelector('.shawarma-options');
      applySandwichSelections(optionsRoot, defaults);
    }
    if (item.isDrink) {
      state.lastDrinkType[item.id] = '';
      const select = menuNodeById(item.id)?.querySelector('.drink-type-select');
      if (select) select.value = '';
      clearDrinkError(item.id);
    }
    updateMenuItemPrice(item.id);
  });
}

function resetAllSelections() {
  if (ui.resetModal.modal) closeModal(ui.resetModal.modal);
  if (ui.lineEditor.modal) closeModal(ui.lineEditor.modal);
  if (ui.confirmModal.modal) closeModal(ui.confirmModal.modal);
  if (ui.drinkChangeModal.modal) closeModal(ui.drinkChangeModal.modal);
  ui.drinkChangeModal.pending = null;

  state.cartLines = [];
  state.name = '';
  state.phone = '';
  state.notes = '';
  state.pickup = '';
  state.lastOptions = {};
  state.lastDrinkType = {};
  formErrorElement.textContent = '';

  resetMenuSelectionsToDefault();
  restoreInputs();
  refreshPickupOptions();
  renderCart();
  clearDraftStorage();
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

function roundUpToQuarter(date) {
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
  if (closeTime <= openTime) {
    closeTime.setDate(closeTime.getDate() + 1);
  }

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
  let cursor = new Date(startDate);
  while (cursor <= endDate) {
    slots.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + SLOT_STEP_MINUTES * 60 * 1000);
  }
  return slots;
}

function computePickupStatus() {
  const now = new Date();
  const scheduleNow = hoursForDate(now);
  const nextOpen = nextOpeningDate(now);
  const minReady = new Date(now.getTime() + PREP_TIME_MINUTES * 60 * 1000);
  const latestAllowed = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  if (!scheduleNow || now < scheduleNow.openTime || now >= scheduleNow.closeTime) {
    return { canCheckout: false, slots: [], nextOpen };
  }

  const start = roundUpToQuarter(minReady);
  const end = new Date(Math.min(latestAllowed.getTime(), scheduleNow.closeTime.getTime()));

  if (start > end) {
    return { canCheckout: false, slots: [], nextOpen: nextOpeningDate(new Date(now.getTime() + 60 * 1000)) };
  }

  const slots = generateSlots(start, end);
  return { canCheckout: slots.length > 0, slots, nextOpen };
}

function selectedPickupLabel() {
  const option = pickupSelect.selectedOptions[0];
  return option ? option.textContent : '';
}

function refreshPickupOptions() {
  ui.pickupStatus = computePickupStatus();
  const { canCheckout, slots } = ui.pickupStatus;

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

  if (canCheckout) {
    pickupSelect.disabled = false;
    pickupHint.textContent = `${ORDERING_HOURS_LABEL}. זמני איסוף זמינים ב־15 דקות קדימה (עד שעתיים).`;
  } else {
    pickupSelect.disabled = true;
    pickupHint.textContent = CLOSED_ORDERING_MESSAGE;
  }

  sendOrderButton.disabled = !canCheckout;
  saveState();
}

function isPickupValidNow(value) {
  if (!value) return false;
  const pickup = new Date(value);
  if (Number.isNaN(pickup.getTime())) return false;

  const now = new Date();
  const minReady = new Date(now.getTime() + PREP_TIME_MINUTES * 60 * 1000);
  const latestAllowed = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  if (pickup < minReady || pickup > latestAllowed) return false;

  const schedule = hoursForDate(pickup);
  if (!schedule) return false;
  return pickup >= schedule.openTime && pickup <= schedule.closeTime;
}

function validateOrder() {
  const entries = buildCartEntries();
  if (entries.length === 0) return 'העגלה ריקה. הוסיפו לפחות פריט אחד.';

  if (!state.name.trim()) return 'יש להזין שם.';
  if (!isValidIsraeliPhone(state.phone)) return 'יש להזין מספר טלפון ישראלי תקין.';

  if (!ui.pickupStatus.canCheckout) {
    return CLOSED_ORDERING_MESSAGE;
  }

  if (!state.pickup) return 'יש לבחור שעת איסוף.';
  if (!isPickupValidNow(state.pickup)) {
    refreshPickupOptions();
    return 'שעת האיסוף אינה זמינה. בחרו שעה חדשה.';
  }

  return '';
}

function buildItemModifiers(line) {
  if (line.drinkType) {
    return { drinkType: line.drinkType };
  }
  if (!line.options) return {};

  const options = normalizeSandwichOptions(line.options);
  return {
    salads: [...options.salads],
    sauces: [...options.sauces],
    pickles: [...options.pickles],
    paidAddons: options.paidAddons
      .map((addonId) => PAID_ADDON_BY_ID.get(addonId))
      .filter(Boolean)
      .map((addon) => ({ id: addon.id, label: addon.label, price: addon.price })),
  };
}

function buildFirestoreOrderPayload(entries, total) {
  const pickup = { time: state.pickup };
  const pickupLabel = selectedPickupLabel();
  if (pickupLabel) {
    pickup.dayLabel = pickupLabel;
  }

  return {
    createdAt: serverTimestamp(),
    status: 'new',
    deliveryConfirmed: null,
    deliveryConfirmedAt: null,
    deliveryConfirmNote: '',
    adminReplies: [],
    lastAdminReplyAt: null,
    customer: {
      name: state.name.trim(),
      phone: state.phone.trim(),
    },
    pickup,
    items: entries.map((line) => {
      const unitPrice = lineUnitPrice(line);
      return {
        id: line.itemId,
        name: line.displayName || line.name,
        category: line.category || '',
        baseName: line.baseName || line.name,
        drinkType: line.drinkType || '',
        displayName: line.displayName || line.name,
        qty: line.quantity,
        basePrice: line.basePrice,
        modifiers: buildItemModifiers(line),
        unitPrice,
        lineTotal: lineTotal(line),
      };
    }),
    total,
    notes: state.notes.trim(),
  };
}

async function saveOrderToFirestore(payload) {
  if (!db) {
    throw new Error('Firebase initialization failed: Firestore db is undefined.');
  }

  const docRef = await addDoc(collection(db, 'orders'), payload);
  console.log('Order saved to Firestore with id:', docRef.id);
  return docRef;
}

function openModal(modal) {
  modal.classList.add('show');
  modal.removeAttribute('hidden');
}

function closeModal(modal) {
  modal.classList.remove('show');
  modal.setAttribute('hidden', '');
}

function buildLineEditorModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'lineEditModal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="lineEditTitle">
      <h3 id="lineEditTitle">עריכת פריט</h3>
      <div id="lineEditFields"></div>
      <label for="lineEditNote">הערה לפריט</label>
      <textarea id="lineEditNote" placeholder="בלי בצל / בלי חריף / טחינה בצד..."></textarea>
      <div class="modal-actions">
        <button type="button" class="btn secondary" id="lineEditCancel">ביטול</button>
        <button type="button" class="btn" id="lineEditSave">שמירה</button>
      </div>
    </div>
  `;
  document.body.append(modal);

  ui.lineEditor.modal = modal;
  ui.lineEditor.content = modal.querySelector('#lineEditFields');
  ui.lineEditor.noteInput = modal.querySelector('#lineEditNote');
  ui.lineEditor.cancelButton = modal.querySelector('#lineEditCancel');
  ui.lineEditor.saveButton = modal.querySelector('#lineEditSave');

  ui.lineEditor.cancelButton.addEventListener('click', () => closeModal(modal));
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal(modal);
  });
}

function buildConfirmModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'confirmModal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-card modal-card-wide" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
      <h3 id="confirmTitle">אישור הזמנה</h3>
      <div id="confirmContent"></div>
      <div class="modal-actions">
        <button type="button" class="btn secondary" id="confirmBack">חזרה לעריכה</button>
        <button type="button" class="btn" id="confirmSend">שלח הזמנה</button>
      </div>
    </div>
  `;
  document.body.append(modal);

  ui.confirmModal.modal = modal;
  ui.confirmModal.content = modal.querySelector('#confirmContent');
  ui.confirmModal.backButton = modal.querySelector('#confirmBack');
  ui.confirmModal.sendButton = modal.querySelector('#confirmSend');

  ui.confirmModal.backButton.addEventListener('click', () => closeModal(modal));
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal(modal);
  });
}

function buildResetAllModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'resetAllModal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="resetAllTitle">
      <h3 id="resetAllTitle">לאפס את כל הבחירות?</h3>
      <p class="reset-modal-text">זה ימחק את כל הפריטים והבחירות שביצעת.</p>
      <div class="modal-actions">
        <button type="button" class="btn" id="resetAllConfirm">כן, אפס</button>
        <button type="button" class="btn secondary" id="resetAllCancel">ביטול</button>
      </div>
    </div>
  `;
  document.body.append(modal);

  ui.resetModal.modal = modal;
  ui.resetModal.confirmButton = modal.querySelector('#resetAllConfirm');
  ui.resetModal.cancelButton = modal.querySelector('#resetAllCancel');

  ui.resetModal.cancelButton.addEventListener('click', () => closeModal(modal));
  ui.resetModal.confirmButton.addEventListener('click', resetAllSelections);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal(modal);
  });
}

function openResetAllConfirmation() {
  formErrorElement.textContent = '';
  openModal(ui.resetModal.modal);
}

function buildDrinkChangeModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'drinkChangeModal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="drinkChangeTitle">
      <h3 id="drinkChangeTitle">לשנות שתייה?</h3>
      <p class="reset-modal-text">יש לך כבר כמות. לשנות את הבחירה יאפס את הכמות לפריט הזה.</p>
      <div class="modal-actions">
        <button type="button" class="btn" id="drinkChangeConfirm">שנה</button>
        <button type="button" class="btn secondary" id="drinkChangeCancel">ביטול</button>
      </div>
    </div>
  `;
  document.body.append(modal);

  ui.drinkChangeModal.modal = modal;
  ui.drinkChangeModal.confirmButton = modal.querySelector('#drinkChangeConfirm');
  ui.drinkChangeModal.cancelButton = modal.querySelector('#drinkChangeCancel');

  ui.drinkChangeModal.cancelButton.addEventListener(
    'click',
    cancelPendingDrinkTypeChange,
  );
  ui.drinkChangeModal.confirmButton.addEventListener(
    'click',
    applyPendingDrinkTypeChange,
  );
  modal.addEventListener('click', (event) => {
    if (event.target === modal) cancelPendingDrinkTypeChange();
  });
}

function openLineEditor(lineId) {
  const line = state.cartLines.find((entry) => entry.lineId === lineId);
  if (!line) return;

  ui.lineEditor.editingLineId = lineId;
  ui.lineEditor.noteInput.value = line.note;
  ui.lineEditor.content.innerHTML = '';

  if (isSandwichItem(line.itemId)) {
    const options = normalizeSandwichOptions(line.options);
    ui.lineEditor.content.innerHTML = `
      <div class="shawarma-options modal-options-grid">
        ${renderOptionGroup({
          title: 'סלטים',
          hint: 'בחרו כמה שתרצו',
          groupKey: 'salads',
          groupClass: 'salad-choice',
          options: SALAD_OPTIONS,
          selectedValues: options.salads,
          includeAllOption: true,
        })}
        ${renderOptionGroup({
          title: 'רטבים',
          hint: 'בחרו כמה שתרצו',
          groupKey: 'sauces',
          groupClass: 'sauce-choice',
          options: SAUCE_OPTIONS,
          selectedValues: options.sauces,
          includeAllOption: true,
        })}
        ${renderOptionGroup({
          title: 'חמוצים',
          hint: 'בחרו כמה שתרצו',
          groupKey: 'pickles',
          groupClass: 'pickle-choice',
          options: PICKLE_OPTIONS,
          selectedValues: options.pickles,
          includeAllOption: true,
        })}
        ${renderOptionGroup({
          title: 'תוספות בתשלום',
          hint: 'בחירה תשפיע על המחיר',
          groupKey: 'paidAddons',
          groupClass: 'paid-addon',
          options: PAID_ADDONS,
          selectedValues: options.paidAddons,
          withPrice: true,
        })}
      </div>
    `;
    initGroupAllBehavior(ui.lineEditor.content.querySelector('.shawarma-options'));
  } else {
    ui.lineEditor.content.innerHTML =
      '<p class="field-hint">לפריט זה אין אפשרויות נוספות. ניתן לעדכן הערה בלבד.</p>';
  }

  openModal(ui.lineEditor.modal);
}

function saveLineEditor() {
  const line = state.cartLines.find(
    (entry) => entry.lineId === ui.lineEditor.editingLineId,
  );
  if (!line) return;

  if (isSandwichItem(line.itemId)) {
    line.options = readSandwichOptionsFromRoot(ui.lineEditor.content);
    state.lastOptions[line.itemId] = copyOptions(line.options);
    const menuEditor = menuNodeById(line.itemId)?.querySelector('.shawarma-options');
    if (menuEditor) {
      applySandwichSelections(menuEditor, line.options);
      updateMenuItemPrice(line.itemId);
    }
  }

  line.note = ui.lineEditor.noteInput.value || '';
  mergeDuplicateLines();
  saveState();
  renderCart();
  closeModal(ui.lineEditor.modal);
}

function renderConfirmContent(entries, total) {
  const pickup = selectedPickupLabel();
  const customerNote = state.notes.trim() ? state.notes.trim() : 'ללא';
  const summaryRows = entries
    .map((line) => {
      const unit = lineUnitPrice(line);
      const optionSummaryText = optionsSummary(line);
      const optionBlock = optionSummaryText
        ? `<div class="confirm-subline">${escapeHtml(optionSummaryText)}</div>`
        : '';
      const noteBlock = line.note.trim()
        ? `<div class="confirm-subline">הערה לפריט: ${escapeHtml(line.note.trim())}</div>`
        : '';
      return `
        <div class="confirm-line">
          <div>
            <strong>${escapeHtml(line.name)}</strong>
            <div>${line.quantity} x ${toShekel(unit)}</div>
            ${optionBlock}
            ${noteBlock}
          </div>
          <div>${toShekel(lineTotal(line))}</div>
        </div>
      `;
    })
    .join('');

  ui.confirmModal.content.innerHTML = `
    <div class="confirm-lines">${summaryRows}</div>
    <div class="cart-summary"><span>סה"כ</span><strong>${toShekel(total)}</strong></div>
    <div class="confirm-meta">
      <div><strong>שעת איסוף:</strong> ${escapeHtml(pickup)}</div>
      <div><strong>שם:</strong> ${escapeHtml(state.name.trim())}</div>
      <div><strong>טלפון:</strong> ${escapeHtml(state.phone.trim())}</div>
      <div><strong>הערות כלליות:</strong> ${escapeHtml(customerNote)}</div>
    </div>
  `;
}

function openCheckoutConfirmation() {
  formErrorElement.textContent = '';

  const validationError = validateOrder();
  if (validationError) {
    formErrorElement.textContent = validationError;
    openMobileCart();
    return;
  }

  const entries = buildCartEntries();
  const total = totalFromEntries(entries);
  renderConfirmContent(entries, total);
  closeMobileCart();
  openModal(ui.confirmModal.modal);
}

async function submitOrderFromConfirm() {
  const validationError = validateOrder();
  if (validationError) {
    formErrorElement.textContent = validationError;
    closeModal(ui.confirmModal.modal);
    openMobileCart();
    return;
  }

  const entries = buildCartEntries();
  const total = totalFromEntries(entries);
  const orderPayload = buildFirestoreOrderPayload(entries, total);

  const resetCheckoutAfterSuccess = () => {
    state.cartLines = [];
    state.name = '';
    state.phone = '';
    state.notes = '';
    state.pickup = '';
    formErrorElement.textContent = '';
    restoreInputs();
    refreshPickupOptions();
    renderCart();
    saveState();
  };

  ui.confirmModal.sendButton.disabled = true;
  ui.confirmModal.backButton.disabled = true;
  sendOrderButton.disabled = true;

  try {
    const orderRef = await saveOrderToFirestore(orderPayload);
    const orderId = orderRef?.id;
    if (orderId) {
      storeLastOrderId(orderId);
      syncLastOrderLink();
    }
    formErrorElement.textContent = '';
    closeModal(ui.confirmModal.modal);
    resetCheckoutAfterSuccess();
    showToast('הזמנה נשלחה ✅', 1200);
    if (orderId) {
      window.setTimeout(() => {
        window.location.href = buildOrderStatusUrl(orderId);
      }, 450);
    }
  } catch (error) {
    console.error('Failed to save order to Firestore', {
      error,
      message: error?.message,
      stack: error?.stack,
      payload: orderPayload,
    });
    const warningMessage = 'שגיאה בשליחת ההזמנה. נסו שוב בעוד רגע.';
    closeModal(ui.confirmModal.modal);
    openMobileCart();
    formErrorElement.textContent = warningMessage;
    showToast(warningMessage, 4000);
  } finally {
    ui.confirmModal.sendButton.disabled = false;
    ui.confirmModal.backButton.disabled = false;
    refreshPickupOptions();
  }
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
      showToast(defaultToastMessage, 1600);
    } catch {
      showToast('ההעתקה נכשלה', 1600);
    }
  });
}

function initItems() {
  menuNodes.forEach((node) => {
    const item = parseItemData(node);
    if (!item) return;
    itemsById.set(item.id, item);
  });

  state.cartLines = state.cartLines.map((line) => sanitizeCartLine(line)).filter(Boolean);
  mergeDuplicateLines();

  itemsById.forEach((item) => {
    if (item.isSandwich && !state.lastOptions[item.id]) {
      state.lastOptions[item.id] = copyOptions(DEFAULT_SANDWICH_OPTIONS);
    }
    if (item.isDrink && typeof state.lastDrinkType[item.id] !== 'string') {
      state.lastDrinkType[item.id] = '';
    }
    attachControlsToMenuItem(item);
    updateMenuItemPrice(item.id);
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
    state.cartLines = [];
    formErrorElement.textContent = '';
    saveState();
    renderCart();
  });
  resetAllButton?.addEventListener('click', openResetAllConfirmation);

  sendOrderButton.addEventListener('click', openCheckoutConfirmation);

  mobileCartButton?.addEventListener('click', () => {
    if (cartPanel.classList.contains('open')) {
      closeMobileCart();
    } else {
      openMobileCart();
    }
  });
  mobileCartCloseButton?.addEventListener('click', () => closeMobileCart());
  mobileCartBackdrop?.addEventListener('click', closeMobileCart);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && cartPanel.classList.contains('open')) {
      closeMobileCart();
    }
  });

  cartItemsElement.addEventListener('click', (event) => {
    const button = event.target.closest('[data-edit-line-id]');
    if (!button) return;
    openLineEditor(button.dataset.editLineId);
  });

  ui.lineEditor.saveButton.addEventListener('click', saveLineEditor);
  ui.confirmModal.sendButton.addEventListener('click', submitOrderFromConfirm);
}

function restoreInputs() {
  customerNameInput.value = state.name;
  customerPhoneInput.value = state.phone;
  customerNotesInput.value = state.notes;
}

function init() {
  ensureMobileCartElements();
  if (isMobileViewport()) {
    console.log('[mobile cart] initialized', {
      matches: isMobileViewport(),
      btn: !!mobileCartButton,
    });
  }
  restoreState();
  syncLastOrderLink();
  buildLineEditorModal();
  buildConfirmModal();
  buildResetAllModal();
  buildDrinkChangeModal();
  initItems();
  restoreInputs();
  refreshPickupOptions();
  syncViewportUi();
  if (typeof mobileViewportQuery.addEventListener === 'function') {
    mobileViewportQuery.addEventListener('change', syncViewportUi);
    mobileTouchQuery.addEventListener('change', syncViewportUi);
  } else if (typeof mobileViewportQuery.addListener === 'function') {
    mobileViewportQuery.addListener(syncViewportUi);
    mobileTouchQuery.addListener(syncViewportUi);
  }
  bindFormEvents();
  renderCart();
  initExistingInteractions();
  saveState();
}

init();
