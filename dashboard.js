const cart = JSON.parse(localStorage.getItem('morvenCart') || '[]');
const cartCount = document.querySelector('.cart-count');
const cartItems = document.querySelector('.cart-items');
const cartTotal = document.querySelector('.cart-total strong');

function renderCart() {
  const count = cart.length;
  if (cartCount) cartCount.textContent = count;
  if (!cartItems || !cartTotal) return;
  if (!count) {
    cartItems.innerHTML = '<p>Your cart is waiting for its first piece.</p>';
    cartTotal.textContent = '$0';
    return;
  }
  cartItems.innerHTML = cart.map((item) => `<p>${item.product} <span>$${item.price}</span></p>`).join('');
  cartTotal.textContent = `$${cart.reduce((total, item) => total + Number(item.price), 0)}`;
}

document.querySelectorAll('.add-button').forEach((button) => {
  button.addEventListener('click', () => {
    cart.push({ product: button.dataset.product, price: button.dataset.price });
    localStorage.setItem('morvenCart', JSON.stringify(cart));
    button.textContent = 'Added to cart ✓';
    renderCart();
  });
});

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
    window.location.href = 'login.html';
  }
});
