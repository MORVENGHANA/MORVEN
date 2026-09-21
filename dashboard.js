const cart = JSON.parse(localStorage.getItem('morvenCart') || '[]');
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
const deliveryFields = {
  name: document.querySelector('#delivery-name'),
  city: document.querySelector('#delivery-city'),
  streetAddress: document.querySelector('#delivery-street'),
  houseAddress: document.querySelector('#delivery-house'),
  phone: document.querySelector('#delivery-phone'),
  comment: document.querySelector('#delivery-comment'),
};
function renderCart() {
  const count = cart.length;
  cartCounts.forEach((counter) => { counter.textContent = count; });
  if (!cartItems || !cartTotal) return;
  if (!count) {
    cartItems.innerHTML = '<p>Your cart is empty.</p>';
    cartTotal.textContent = 'GH₵0';
    if (checkoutButton) checkoutButton.disabled = true;
    return;
  }
  cartItems.innerHTML = cart.map((item) => `<p><span>${item.product}</span><strong>GH₵${item.price}</strong></p>`).join('');
  cartTotal.textContent = `GH₵${cart.reduce((total, item) => total + Number(item.price), 0)}`;
  if (checkoutButton) checkoutButton.disabled = false;
}

function setCartOpen(isOpen) {
  cartPanel?.classList.toggle('open', isOpen);
  cartPanel?.setAttribute('aria-hidden', String(!isOpen));
  cartToggle?.setAttribute('aria-expanded', String(isOpen));
}

cartToggle?.addEventListener('click', () => {
  setCartOpen(!cartPanel?.classList.contains('open'));
});
cartClose?.addEventListener('click', () => setCartOpen(false));
document.addEventListener('click', (event) => {
  if (cartPanel?.classList.contains('open') && !cartPanel.contains(event.target) && !cartToggle?.contains(event.target)) setCartOpen(false);
});
checkoutButton?.addEventListener('click', async () => {
  const email = checkoutEmail?.value.trim();
  if (!email || !checkoutEmail.checkValidity()) {
    checkoutStatus.textContent = 'Enter a valid receipt email before continuing to Paystack.';
    checkoutEmail?.focus();
    return;
  }
  const delivery = Object.fromEntries(Object.entries(deliveryFields).map(([key, field]) => [key, field?.value.trim() || '']));
  checkoutButton.disabled = true;
  checkoutButton.innerHTML = 'Proceeding to Paystack...';
  checkoutStatus.textContent = '';
  try {
    const response = await fetch(`${apiUrl}/api/payments/paystack/initialize`, {
      body: JSON.stringify({ delivery, email, items: cart }),
      headers: { 'Content-Type': 'application/json' },
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
    if (accessCode && window.PaystackPop) {
      const popup = new window.PaystackPop();
      popup.resumeTransaction(accessCode);
    } else if (authorizationUrl) {
      window.location.href = authorizationUrl;
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
      cart.push({ product: button.dataset.product, price: button.dataset.price });
      localStorage.setItem('morvenCart', JSON.stringify(cart));
      button.textContent = 'Added to cart ✓';
      renderCart();
    });
  });
}

bindAddButtons();
document.addEventListener('catalog:updated', bindAddButtons);
renderCart();

