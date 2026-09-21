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
const apiUrl = window.MORVEN_API_URL || 'http://localhost:4000';
const deliveryFields = {
  name: document.querySelector('#delivery-name'),
  city: document.querySelector('#delivery-city'),
  streetAddress: document.querySelector('#delivery-street'),
  houseAddress: document.querySelector('#delivery-house'),
  phone: document.querySelector('#delivery-phone'),
  comment: document.querySelector('#delivery-comment'),
};
const ADMIN_EMAIL = 'fotsiemmanuel397@gmail.com';

async function showAdminControlForAuthorizedUser() {
  const [{ initializeApp }, { getAuth, onAuthStateChanged }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js'),
  ]);
  const firebaseApp = initializeApp({
    apiKey: 'AIzaSyA55HjGrGN5BYB619fxIZYfmFccl71A',
    authDomain: 'morven-1420a.firebaseapp.com',
    projectId: 'morven-1420a',
    storageBucket: 'morven-1420a.firebasestorage.app',
    messagingSenderId: '133394499575',
    appId: '1:133394499575:web:d571d789aa23d6e0c1d0f2',
  });
  onAuthStateChanged(getAuth(firebaseApp), (user) => {
    if (user?.email?.toLowerCase() !== ADMIN_EMAIL) return;
    document.querySelectorAll('.account-actions').forEach((actions) => {
      if (actions.querySelector('.admin-link')) return;
      const link = document.createElement('a');
      link.className = 'admin-link';
      link.href = 'admin.html';
      link.textContent = 'Admin';
      actions.insertBefore(link, actions.querySelector('.cart-link'));
    });
  });
}

showAdminControlForAuthorizedUser().catch(() => {});

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
  const missingDeliveryField = Object.entries(deliveryFields).find(([key, field]) => key !== 'comment' && (!field?.value.trim() || !field.checkValidity()));
  if (missingDeliveryField) {
    checkoutStatus.textContent = 'Complete your delivery details before continuing to Paystack.';
    missingDeliveryField[1].focus();
    return;
  }
  checkoutButton.disabled = true;
  checkoutButton.innerHTML = 'Proceeding to Paystack...';
  checkoutStatus.textContent = '';
  try {
    const response = await fetch(`${apiUrl}/api/payments/paystack/initialize`, {
      body: JSON.stringify({ delivery, email, items: cart }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not start payment.');
    window.location.href = data.authorizationUrl;
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

const logoutButton = document.createElement('button');
logoutButton.className = 'logout-button';
logoutButton.type = 'button';
logoutButton.setAttribute('aria-label', 'Log out of MORVEN');
logoutButton.innerHTML = '<span>Log out</span><b aria-hidden="true">↗</b>';
document.body.append(logoutButton);

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    const [{ initializeApp }, { getAuth, signOut }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js'),
    ]);
    const firebaseApp = initializeApp({
      apiKey: 'AIzaSyA55H9jGrGN5BYB619fxIZYfmFccl71jlA',
      authDomain: 'morven-1420a.firebaseapp.com',
      projectId: 'morven-1420a',
      storageBucket: 'morven-1420a.firebasestorage.app',
      messagingSenderId: '133394499575',
      appId: '1:133394499575:web:d571d789aa23d6e0c1d0f2',
    });
    await signOut(getAuth(firebaseApp));
  } finally {
    localStorage.removeItem('morvenUser');
    window.location.href = 'dashboard.html';
  }
});
