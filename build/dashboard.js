const storedCart = JSON.parse(localStorage.getItem('morvenCart') || '[]');
const cart = storedCart.reduce((items, item) => {
  const existing = items.find((entry) => entry.product === item.product && Number(entry.price) === Number(item.price));
  if (existing) existing.quantity += Number(item.quantity) || 1;
  else items.push({ product: item.product, price: item.price, quantity: Number(item.quantity) || 1 });
  return items;
}, []);
const cartCounts = document.querySelectorAll('.cart-count');
const cartItems = document.querySelector('.cart-items');
const cartTotal = document.querySelector('.cart-total strong');
const cartPanel = document.querySelector('.cart-panel');
const cartToggle = document.querySelector('.cart-link');
const cartClose = document.querySelector('.cart-close');
const checkoutButton = document.querySelector('.checkout-button');
const checkoutEmail = document.querySelector('.checkout-email-input');
const checkoutStatus = document.querySelector('.checkout-status');
const apiUrl = window.MORVEN_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin);
let suppressCartToggleClick = false;
const deliveryFields = {
  name: document.querySelector('#delivery-name'),
  city: document.querySelector('#delivery-city'),
  streetAddress: document.querySelector('#delivery-street'),
  houseAddress: document.querySelector('#delivery-house'),
  phone: document.querySelector('#delivery-phone'),
  comment: document.querySelector('#delivery-comment'),
};
function renderCart() {
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  cartCounts.forEach((counter) => { counter.textContent = count; });
  if (!cartItems || !cartTotal) return;
  if (!count) {
    cartItems.innerHTML = '<p>Your cart is empty.</p>';
    cartTotal.textContent = 'GH₵0';
    if (checkoutButton) checkoutButton.disabled = true;
    return;
  }
  cartItems.innerHTML = cart.map((item, index) => `<div class="cart-item"><div class="cart-item-info"><span>${item.product}</span><strong>GH₵${Number(item.price) * item.quantity}</strong></div><div class="cart-item-controls"><button type="button" class="cart-decrease" data-cart-index="${index}" aria-label="Decrease ${item.product}">−</button><b>${item.quantity}</b><button type="button" class="cart-increase" data-cart-index="${index}" aria-label="Increase ${item.product}">+</button><button type="button" class="cart-remove" data-cart-index="${index}" aria-label="Remove ${item.product}">⌫</button></div></div>`).join('');
  cartTotal.textContent = `GH₵${cart.reduce((total, item) => total + Number(item.price) * item.quantity, 0)}`;
  if (checkoutButton) checkoutButton.disabled = false;
}

function setCartOpen(isOpen) {
  cartPanel?.classList.toggle('open', isOpen);
  cartPanel?.setAttribute('aria-hidden', String(!isOpen));
  cartToggle?.setAttribute('aria-expanded', String(isOpen));
}

cartToggle?.addEventListener('click', () => {
  if (suppressCartToggleClick) {
    suppressCartToggleClick = false;
    return;
  }
  setCartOpen(!cartPanel?.classList.contains('open'));
});
cartClose?.addEventListener('click', () => setCartOpen(false));
document.addEventListener('click', (event) => {
  if (cartPanel?.classList.contains('open') && !cartPanel.contains(event.target) && !cartToggle?.contains(event.target)) setCartOpen(false);
});
cartItems?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-cart-index]');
  if (!button) return;
  event.stopPropagation();
  const index = Number(button.dataset.cartIndex);
  if (button.classList.contains('cart-increase')) cart[index].quantity += 1;
  if (button.classList.contains('cart-decrease')) cart[index].quantity = Math.max(0, cart[index].quantity - 1);
  if (button.classList.contains('cart-remove')) cart[index].quantity = 0;
  for (let itemIndex = cart.length - 1; itemIndex >= 0; itemIndex -= 1) if (cart[itemIndex].quantity === 0) cart.splice(itemIndex, 1);
  localStorage.setItem('morvenCart', JSON.stringify(cart));
  renderCart();
});

if (cartToggle && window.matchMedia('(max-width: 760px)').matches) {
  let dragging = false;
  let moved = false;
  let offsetX = 0;
  let offsetY = 0;
  cartToggle.addEventListener('pointerdown', (event) => {
    dragging = true;
    moved = false;
    const bounds = cartToggle.getBoundingClientRect();
    offsetX = event.clientX - bounds.left;
    offsetY = event.clientY - bounds.top;
    cartToggle.setPointerCapture(event.pointerId);
  });
  cartToggle.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const nextLeft = Math.max(8, Math.min(window.innerWidth - cartToggle.offsetWidth - 8, event.clientX - offsetX));
    const nextTop = Math.max(8, Math.min(window.innerHeight - cartToggle.offsetHeight - 8, event.clientY - offsetY));
    if (Math.abs(event.movementX) > 1 || Math.abs(event.movementY) > 1) moved = true;
    cartToggle.style.left = `${nextLeft}px`;
    cartToggle.style.top = `${nextTop}px`;
    cartToggle.style.right = 'auto';
    cartToggle.style.bottom = 'auto';
  });
  const stopDragging = (event) => {
    if (!dragging) return;
    dragging = false;
    if (moved) suppressCartToggleClick = true;
    if (cartToggle.hasPointerCapture(event.pointerId)) cartToggle.releasePointerCapture(event.pointerId);
  };
  cartToggle.addEventListener('pointerup', stopDragging);
  cartToggle.addEventListener('pointercancel', stopDragging);
}
checkoutButton?.addEventListener('click', async () => {
  const email = checkoutEmail?.value.trim();
  if (!email || !checkoutEmail.checkValidity()) {
    checkoutStatus.textContent = 'Enter a valid receipt email before continuing to Paystack.';
    checkoutEmail?.focus();
    return;
  }
  const delivery = Object.fromEntries(Object.entries(deliveryFields).map(([key, field]) => [key, field?.value.trim() || '']));
  const requiredDelivery = ['name', 'city', 'streetAddress', 'houseAddress', 'phone'];
  const missingDelivery = requiredDelivery.find((field) => !delivery[field]);
  if (missingDelivery) {
    checkoutStatus.textContent = 'Complete all delivery details before continuing to Paystack.';
    deliveryFields[missingDelivery]?.focus();
    return;
  }
  checkoutButton.disabled = true;
  checkoutButton.innerHTML = 'Proceeding to Paystack...';
  checkoutStatus.textContent = '';
  try {
    const user = await window.morvenAuthReady;
    if (!user) throw new Error('Your session has expired. Please sign in again.');
    const response = await fetch(`${apiUrl}/api/payments/paystack/initialize`, {
      body: JSON.stringify({ delivery, email, items: cart }),
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const responseText = await response.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(`Payment service returned an invalid response (${response.status}).`);
    }
    if (!response.ok) throw new Error(data.message || 'Could not start payment.');
    const accessCode = data.accessCode || data.access_code;
    const authorizationUrl = data.authorizationUrl || data.authorization_url;
    if (authorizationUrl) {
      window.location.href = authorizationUrl;
    } else if (accessCode && window.PaystackPop) {
      const popup = new window.PaystackPop();
      popup.resumeTransaction(accessCode);
    } else {
      throw new Error(data.message || 'Paystack did not return a checkout link.');
    }
  } catch (error) {
    checkoutStatus.textContent = error.message;
    checkoutButton.disabled = false;
    checkoutButton.innerHTML = 'Pay securely with Paystack <span>↗</span>';
  }
});

function bindAddButtons() {
  document.querySelectorAll('.add-button').forEach((button) => {
    if (button.dataset.cartBound) return;
    button.dataset.cartBound = 'true';
    button.addEventListener('click', () => {
      const existing = cart.find((item) => item.product === button.dataset.product && Number(item.price) === Number(button.dataset.price));
      if (existing) existing.quantity += 1;
      else cart.push({ product: button.dataset.product, price: button.dataset.price, quantity: 1 });
      localStorage.setItem('morvenCart', JSON.stringify(cart));
      button.textContent = 'Added to cart ✓';
      renderCart();
    });
  });
}

bindAddButtons();
document.addEventListener('catalog:updated', bindAddButtons);
renderCart();

