// עריכת וואטסאפ: עדכנו כאן את מספר היעד
import { addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { db } from "./src/firebase.js";

const WHATSAPP_NUMBER = '972500000000';

// עריכת שעות פעילות: 0=א', 1=ב', ... , 6=שבת
const WORKING_HOURS = {
  0: { open: '07:00', close: '17:00', label: 'יום א׳' },
  1: { open: '07:00', close: '17:00', label: 'יום ב׳' },
  2: { open: '07:00', close: '17:00', label: 'יום ג׳' },
  3: { open: '07:00', close: '17:00', label: 'יום ד׳' },
  4: { open: '07:00', close: '17:00', label: 'יום ה׳' },
  5: { open: '07:00', close: '15:00', label: 'יום ו׳' },
  6: { open: '07:00', close: '17:00', label: 'שבת' },
};

const BUSINESS_NAME = 'העגלה של איציק';
const BUSINESS_ADDRESS = 'ההדרים 178, אבן יהודה';
const PHONE = '050-0000000';
const STORAGE_KEY = 'itziks-cart-order-v2';
const SLOT_STEP_MINUTES = 15;
const PREP_TIME_MINUTES = 15;

const COFFEE_ITEM_IDS = new Set([
  'espresso',
  'double-espresso',
  'americano',
  'cappuccino',
  'latte',
  'mocha',
  'iced-americano',
  'iced-latte',
  'iced-mocha',
]);

const DEFAULT_COFFEE_OPTIONS = {
  size: 'small',
  milk: 'regular',
  extraShot: false,
  vanilla: false,
};

const COFFEE_LABELS = {
  size: { small: 'קטן', regular: 'רגיל', large: 'גדול (+₪3)' },
  milk: {
    regular: 'רגיל',
    soy: 'סויה (+₪2)',
    oat: 'שיבולת (+₪2)',
  },
};

const COFFEE_SELECT_OPTIONS = {
  size: [
    { value: 'small', label: 'קטן' },
    { value: 'regular', label: 'רגיל' },
    { value: 'large', label: 'גדול (+₪3)' },
  ],
  milk: [
    { value: 'regular', label: 'רגיל' },
    { value: 'soy', label: 'סויה (+₪2)' },
    { value: 'oat', label: 'שיבולת (+₪2)' },
  ],
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
const sendOrderButton = document.getElementById('sendOrderBtn');
const mobileCartToggle = document.getElementById('mobileCartToggle');
const mobileCartCount = document.getElementById('mobileCartCount');
const mobileCartBackdrop = document.getElementById('mobileCartBackdrop');
const mobileCartCloseButton = document.getElementById('mobileCartClose');

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
  cartLines: [],
  name: '',
  phone: '',
  notes: '',
  pickup: '',
  lastOptions: {},
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
};

let customSelectGlobalBound = false;
let toastTimeoutId = null;
let mobileCartLockedScrollY = 0;
let lastFocusedBeforeMobileCart = null;
let buildVersionMarker = null;
const BUILD_VERSION = '20260228-1';
const defaultToastMessage = toast?.textContent || '';
const MOBILE_BREAKPOINT = 900;
const mobileViewportQuery = window.matchMedia(
  `(max-width: ${MOBILE_BREAKPOINT}px)`,
);

function toShekel(value) {
  return `\u20AA${value}`;
}

function isMobileViewport() {
  return mobileViewportQuery.matches;
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
  mobileCartToggle?.setAttribute('aria-expanded', 'false');
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
  mobileCartToggle?.setAttribute('aria-expanded', 'true');
  if (mobileCartBackdrop) {
    mobileCartBackdrop.hidden = false;
    mobileCartBackdrop.classList.add('show');
  }
  lockBodyScrollForMobileCart();
  mobileCartCloseButton?.focus({ preventScroll: true });
}

function syncMobileCartLayout() {
  if (isMobileViewport()) {
    const isOpen = cartPanel.classList.contains('open');
    cartPanel.setAttribute(
      'aria-hidden',
      isOpen ? 'false' : 'true',
    );
    cartPanel.setAttribute('role', 'dialog');
    cartPanel.setAttribute('aria-modal', 'true');
    mobileCartToggle?.setAttribute(
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
  mobileCartToggle?.setAttribute('aria-expanded', 'false');
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
  return { id, name, price, node, isCoffee: COFFEE_ITEM_IDS.has(id) };
}

function isCoffeeItem(itemId) {
  return COFFEE_ITEM_IDS.has(itemId);
}

function normalizeCoffeeOptions(options) {
  const raw = options || {};
  const size = ['small', 'regular', 'large'].includes(raw.size)
    ? raw.size
    : 'small';
  const milk = ['regular', 'soy', 'oat'].includes(raw.milk)
    ? raw.milk
    : 'regular';
  return {
    size,
    milk,
    extraShot: Boolean(raw.extraShot),
    vanilla: Boolean(raw.vanilla),
  };
}

function copyOptions(options) {
  return { ...normalizeCoffeeOptions(options) };
}

function optionModifiers(options) {
  if (!options) {
    return { sizeModifier: 0, milkModifier: 0, addonModifier: 0 };
  }

  const normalized = normalizeCoffeeOptions(options);
  const sizeModifier = normalized.size === 'large' ? 3 : 0;
  const milkModifier =
    normalized.milk === 'soy' || normalized.milk === 'oat' ? 2 : 0;
  const addonModifier =
    (normalized.extraShot ? 3 : 0) + (normalized.vanilla ? 2 : 0);

  return { sizeModifier, milkModifier, addonModifier };
}

function optionsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const left = normalizeCoffeeOptions(a);
  const right = normalizeCoffeeOptions(b);
  return (
    left.size === right.size &&
    left.milk === right.milk &&
    left.extraShot === right.extraShot &&
    left.vanilla === right.vanilla
  );
}

function optionPrice(options) {
  const { sizeModifier, milkModifier, addonModifier } = optionModifiers(options);
  return sizeModifier + milkModifier + addonModifier;
}

function lineUnitPrice(line) {
  return line.basePrice + optionPrice(line.options);
}

function computeMenuItemPricing(item) {
  const options = item.isCoffee ? readCoffeeOptionsFromMenu(item.id) : null;
  const { sizeModifier, milkModifier, addonModifier } = optionModifiers(options);
  const basePrice = item.price;
  const finalPrice = basePrice + sizeModifier + milkModifier + addonModifier;
  return { basePrice, sizeModifier, milkModifier, addonModifier, finalPrice };
}

function updateMenuItemPrice(itemId) {
  const item = itemsById.get(itemId);
  if (!item) return;

  const pricing = computeMenuItemPricing(item);
  menuItemPricing.set(itemId, pricing);
  item.node.dataset.basePrice = String(pricing.basePrice);
  item.node.dataset.sizeModifier = String(pricing.sizeModifier);
  item.node.dataset.milkModifier = String(pricing.milkModifier);
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

function buildCoffeeOptionsEditor(itemId) {
  const options = copyOptions(
    state.lastOptions[itemId] || DEFAULT_COFFEE_OPTIONS,
  );

  const wrapper = document.createElement('div');
  wrapper.className = 'coffee-options';
  wrapper.dataset.itemId = itemId;
  wrapper.innerHTML = `
    <div class="size-row">
      <label class="option-label" for="coffee-size-${itemId}-trigger">גודל</label>
      <div class="select-wrap">
        ${customSelectMarkup({
          id: `coffee-size-${itemId}`,
          inputClass: 'coffee-size',
          options: COFFEE_SELECT_OPTIONS.size,
          value: options.size,
        })}
      </div>
    </div>
    <div class="milk-row">
      <label class="option-label" for="coffee-milk-${itemId}-trigger">חלב</label>
      <div class="select-wrap">
        ${customSelectMarkup({
          id: `coffee-milk-${itemId}`,
          inputClass: 'coffee-milk',
          options: COFFEE_SELECT_OPTIONS.milk,
          value: options.milk,
        })}
      </div>
    </div>
    <div class="addons-row">
      <label class="coffee-check">
        <input type="checkbox" class="coffee-shot" />
        שוט נוסף (+₪3)
      </label>
      <label class="coffee-check">
        <input type="checkbox" class="coffee-vanilla" />
        סירופ וניל (+₪2)
      </label>
    </div>
  `;

  const shotCheckbox = wrapper.querySelector('.coffee-shot');
  const vanillaCheckbox = wrapper.querySelector('.coffee-vanilla');
  shotCheckbox.checked = options.extraShot;
  vanillaCheckbox.checked = options.vanilla;
  initCustomSelects(wrapper);

  wrapper.addEventListener('change', () => {
    state.lastOptions[itemId] = readCoffeeOptionsFromMenu(itemId);
    updateMenuItemPrice(itemId);
    saveState();
  });
  shotCheckbox.addEventListener('click', () => updateMenuItemPrice(itemId));
  vanillaCheckbox.addEventListener('click', () => updateMenuItemPrice(itemId));

  return wrapper;
}

function readCoffeeOptionsFromMenu(itemId) {
  const root = menuNodeById(itemId)?.querySelector('.coffee-options');
  if (!root) return copyOptions(DEFAULT_COFFEE_OPTIONS);

  const options = {
    size: root.querySelector('.coffee-size')?.value,
    milk: root.querySelector('.coffee-milk')?.value,
    extraShot: root.querySelector('.coffee-shot')?.checked,
    vanilla: root.querySelector('.coffee-vanilla')?.checked,
  };
  return normalizeCoffeeOptions(options);
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
  actions.className = item.node.classList.contains('combo')
    ? 'combo-actions buy-row'
    : 'menu-item-actions buy-row';
  priceElement.replaceWith(actions);
  actions.append(buildQuantityControls(item), priceElement);

  if (item.isCoffee) {
    item.node.classList.add('menu-item-with-options');
    const textColumn = item.node.querySelector(':scope > span');
    if (textColumn) {
      textColumn.append(buildCoffeeOptionsEditor(item.id));
    }
  }
}

function getItemQuantity(itemId) {
  return state.cartLines
    .filter((line) => line.itemId === itemId)
    .reduce((sum, line) => sum + line.quantity, 0);
}

function findMatchingEditableLine(itemId, options) {
  return state.cartLines.find(
    (line) =>
      line.itemId === itemId &&
      line.note.trim() === '' &&
      optionsEqual(line.options, options),
  );
}

function addItemFromMenu(itemId) {
  const item = itemsById.get(itemId);
  if (!item) return;

  const options = item.isCoffee
    ? readCoffeeOptionsFromMenu(itemId)
    : null;

  if (item.isCoffee) {
    state.lastOptions[itemId] = copyOptions(options);
  }

  const existing = findMatchingEditableLine(itemId, options);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cartLines.push({
      lineId: createLineId(),
      itemId: item.id,
      name: item.name,
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
  if (item.isCoffee) {
    const selectedOptions = readCoffeeOptionsFromMenu(itemId);
    target = state.cartLines.find(
      (line) =>
        line.itemId === itemId &&
        line.note.trim() === '' &&
        optionsEqual(line.options, selectedOptions),
    );
  }

  if (!target) {
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

  return {
    lineId: typeof line.lineId === 'string' ? line.lineId : createLineId(),
    itemId: item.id,
    name: item.name,
    basePrice: item.price,
    quantity: Math.floor(quantity),
    options: item.isCoffee ? normalizeCoffeeOptions(line.options) : null,
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
        optionsEqual(candidate.options, line.options),
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
  const options = normalizeCoffeeOptions(line.options);
  const parts = [
    `גודל: ${COFFEE_LABELS.size[options.size]}`,
    `חלב: ${COFFEE_LABELS.milk[options.milk]}`,
    `שוט נוסף: ${options.extraShot ? 'כן (+₪3)' : 'לא'}`,
    `וניל: ${options.vanilla ? 'כן (+₪2)' : 'לא'}`,
  ];
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

function renderCart() {
  const entries = buildCartEntries();
  state.cartLines = entries;
  const total = totalFromEntries(entries);
  const itemCount = entries.reduce((sum, entry) => sum + entry.quantity, 0);

  menuNodes.forEach((node) => {
    const itemId = node.dataset.itemId;
    const qtyDisplay = document.getElementById(`qty-${itemId}`);
    if (qtyDisplay) qtyDisplay.textContent = String(getItemQuantity(itemId));
  });

  cartItemsElement.innerHTML = '';
  cartEmptyElement.style.display = entries.length === 0 ? 'block' : 'none';

  entries.forEach((entry) => {
    const unitPrice = lineUnitPrice(entry);
    const line = document.createElement('div');
    line.className = 'cart-item';
    line.innerHTML = `
      <div>
        <div class="cart-item-name">${escapeHtml(entry.name)}</div>
        <div class="cart-item-meta">${entry.quantity} x ${toShekel(unitPrice)}</div>
        ${
          entry.options
            ? `<div class="cart-item-options">${escapeHtml(optionsSummary(entry))}</div>`
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
  if (mobileCartCount) {
    mobileCartCount.textContent = String(itemCount);
    mobileCartCount.hidden = itemCount === 0;
  }
  if (mobileCartToggle) {
    mobileCartToggle.setAttribute(
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
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
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
  } catch {
    state.cartLines = [];
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
  const { canCheckout, slots, nextOpen } = ui.pickupStatus;

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
    pickupHint.textContent = 'זמני איסוף זמינים ב־15 דקות קדימה (עד שעתיים).';
  } else {
    pickupSelect.disabled = true;
    pickupHint.textContent = nextOpen
      ? `כרגע אנחנו מחוץ לשעות הפעילות. פתיחה הבאה: ${formatDayAndTime(nextOpen)}.`
      : 'כרגע לא ניתן להזמין.';
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
    return ui.pickupStatus.nextOpen
      ? `כרגע אין קבלת הזמנות. פתיחה הבאה: ${formatDayAndTime(ui.pickupStatus.nextOpen)}.`
      : 'כרגע לא ניתן להזמין.';
  }

  if (!state.pickup) return 'יש לבחור שעת איסוף.';
  if (!isPickupValidNow(state.pickup)) {
    refreshPickupOptions();
    return 'שעת האיסוף אינה זמינה. בחרו שעה חדשה.';
  }

  return '';
}

function lineWhatsappText(line) {
  const unit = lineUnitPrice(line);
  const base = `- ${line.name} x${line.quantity} | ${toShekel(lineTotal(line))} (${toShekel(unit)} ליחידה)`;
  const parts = [base];

  if (line.options) {
    const options = normalizeCoffeeOptions(line.options);
    parts.push(
      `  אפשרויות: גודל ${COFFEE_LABELS.size[options.size]}, חלב ${COFFEE_LABELS.milk[options.milk]}, שוט נוסף ${options.extraShot ? 'כן' : 'לא'}, וניל ${options.vanilla ? 'כן' : 'לא'}`,
    );
  }

  if (line.note.trim()) {
    parts.push(`  הערה לפריט: ${line.note.trim()}`);
  }

  return parts.join('\n');
}

function buildWhatsappMessage(entries, total) {
  const itemLines = entries.map((entry) => lineWhatsappText(entry));
  const notes = state.notes.trim() ? state.notes.trim() : 'ללא';

  return [
    `הזמנה חדשה - ${BUSINESS_NAME}`,
    `כתובת: ${BUSINESS_ADDRESS}`,
    '',
    'פריטים:',
    ...itemLines,
    '',
    `סה"כ: ${toShekel(total)}`,
    `שעת איסוף: ${selectedPickupLabel()}`,
    '',
    `שם: ${state.name.trim()}`,
    `טלפון: ${state.phone.trim()}`,
    `הערות כלליות: ${notes}`,
  ].join('\n');
}

function buildItemModifiers(line) {
  if (!line.options) return {};

  const options = normalizeCoffeeOptions(line.options);
  const addons = [];
  if (options.extraShot) addons.push('extra_shot');
  if (options.vanilla) addons.push('vanilla');

  const modifiers = {
    size: options.size,
    milk: options.milk,
  };

  if (addons.length > 0) {
    modifiers.addons = addons;
  }

  return modifiers;
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
    customer: {
      name: state.name.trim(),
      phone: state.phone.trim(),
    },
    pickup,
    items: entries.map((line) => {
      const unitPrice = lineUnitPrice(line);
      return {
        id: line.itemId,
        name: line.name,
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
      <textarea id="lineEditNote" placeholder="ללא סוכר / חם מאוד / אחר..."></textarea>
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

function openLineEditor(lineId) {
  const line = state.cartLines.find((entry) => entry.lineId === lineId);
  if (!line) return;

  ui.lineEditor.editingLineId = lineId;
  ui.lineEditor.noteInput.value = line.note;
  ui.lineEditor.content.innerHTML = '';

  if (isCoffeeItem(line.itemId)) {
    const options = normalizeCoffeeOptions(line.options);
    ui.lineEditor.content.innerHTML = `
      <div class="coffee-options-grid modal-options-grid">
        <label>
          גודל
          <div class="select-wrap">
            ${customSelectMarkup({
              id: 'lineEditSize',
              inputClass: 'select',
              options: COFFEE_SELECT_OPTIONS.size,
              value: options.size,
            })}
          </div>
        </label>
        <label>
          חלב
          <div class="select-wrap">
            ${customSelectMarkup({
              id: 'lineEditMilk',
              inputClass: 'select',
              options: COFFEE_SELECT_OPTIONS.milk,
              value: options.milk,
            })}
          </div>
        </label>
        <label class="coffee-check">
          <input type="checkbox" id="lineEditShot" />
          שוט נוסף (+₪3)
        </label>
        <label class="coffee-check">
          <input type="checkbox" id="lineEditVanilla" />
          סירופ וניל (+₪2)
        </label>
      </div>
    `;
    initCustomSelects(ui.lineEditor.content);
    ui.lineEditor.content.querySelector('#lineEditShot').checked = options.extraShot;
    ui.lineEditor.content.querySelector('#lineEditVanilla').checked = options.vanilla;
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

  if (isCoffeeItem(line.itemId)) {
    line.options = normalizeCoffeeOptions({
      size: ui.lineEditor.content.querySelector('#lineEditSize')?.value,
      milk: ui.lineEditor.content.querySelector('#lineEditMilk')?.value,
      extraShot: ui.lineEditor.content.querySelector('#lineEditShot')?.checked,
      vanilla: ui.lineEditor.content.querySelector('#lineEditVanilla')?.checked,
    });
    state.lastOptions[line.itemId] = copyOptions(line.options);
    const menuEditor = menuNodeById(line.itemId)?.querySelector('.coffee-options');
    if (menuEditor) {
      setCustomSelectValue(menuEditor.querySelector('.coffee-size'), line.options.size);
      setCustomSelectValue(menuEditor.querySelector('.coffee-milk'), line.options.milk);
      menuEditor.querySelector('.coffee-shot').checked = line.options.extraShot;
      menuEditor.querySelector('.coffee-vanilla').checked = line.options.vanilla;
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
      const optionBlock = line.options
        ? `<div class="confirm-subline">${escapeHtml(optionsSummary(line))}</div>`
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

async function sendOrderToWhatsapp() {
  const validationError = validateOrder();
  if (validationError) {
    formErrorElement.textContent = validationError;
    closeModal(ui.confirmModal.modal);
    openMobileCart();
    return;
  }

  const entries = buildCartEntries();
  const total = totalFromEntries(entries);
  const message = buildWhatsappMessage(entries, total);
  const orderPayload = buildFirestoreOrderPayload(entries, total);
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  const showWhatsappFallback = (warningMessage) => {
    formErrorElement.textContent = `${warningMessage} `;
    const link = document.createElement('a');
    link.href = whatsappUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.className = 'form-error-link';
    link.textContent = 'שליחה בוואטסאפ';
    formErrorElement.append(link);
  };

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
    await saveOrderToFirestore(orderPayload);
    formErrorElement.textContent = '';
    closeModal(ui.confirmModal.modal);
    resetCheckoutAfterSuccess();
    showToast('הזמנה נשלחה', 3000);
  } catch (error) {
    console.error('Failed to save order to Firestore', {
      error,
      message: error?.message,
      stack: error?.stack,
      payload: orderPayload,
    });
    const firebaseMessage = error?.message || 'Unknown Firebase error';
    const warningMessage = `נשלח בוואטסאפ בלבד — שגיאת Firebase: ${firebaseMessage}`;
    closeModal(ui.confirmModal.modal);
    openMobileCart();
    showWhatsappFallback(warningMessage);
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
    if (item.isCoffee && !state.lastOptions[item.id]) {
      state.lastOptions[item.id] = copyOptions(DEFAULT_COFFEE_OPTIONS);
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

  sendOrderButton.addEventListener('click', openCheckoutConfirmation);

  mobileCartToggle?.addEventListener('click', () => {
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
  ui.confirmModal.sendButton.addEventListener('click', sendOrderToWhatsapp);
}

function restoreInputs() {
  customerNameInput.value = state.name;
  customerPhoneInput.value = state.phone;
  customerNotesInput.value = state.notes;
}

function init() {
  restoreState();
  buildLineEditorModal();
  buildConfirmModal();
  initItems();
  restoreInputs();
  refreshPickupOptions();
  syncViewportUi();
  if (typeof mobileViewportQuery.addEventListener === 'function') {
    mobileViewportQuery.addEventListener('change', syncViewportUi);
  } else if (typeof mobileViewportQuery.addListener === 'function') {
    mobileViewportQuery.addListener(syncViewportUi);
  }
  bindFormEvents();
  renderCart();
  initExistingInteractions();
  saveState();
}

init();
