import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { browserLocalPersistence, getAuth, setPersistence } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

const firebaseApp = initializeApp({
  apiKey: 'AIzaSyA55H9jGrGN5BYB619fxIZYfmFccl71jlA',
  authDomain: 'morven-1420a.firebaseapp.com',
  projectId: 'morven-1420a',
  storageBucket: 'morven-1420a.firebasestorage.app',
  messagingSenderId: '133394499575',
  appId: '1:133394499575:web:d571d789aa23d6e0c1d0f2',
});
const auth = getAuth(firebaseApp);
const apiUrl = window.MORVEN_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin);
const status = document.querySelector('.orders-status');
const list = document.querySelector('.orders-list');
const ORDER_STATUSES = ['Pending', 'Accepted', 'Order is being Prepared', 'On its way to be Delivered', 'Delivered'];

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function dateLabel(value) {
  const timestamp = value?._seconds ? value._seconds * 1000 : value;
  const date = timestamp ? new Date(timestamp) : null;
  return date && !Number.isNaN(date.valueOf()) ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date pending';
}

function renderOrders(orders) {
  if (!orders.length) {
    list.innerHTML = '<p class="orders-empty">Your archive is waiting for its first order.</p>';
    return;
  }
  list.innerHTML = orders.map((order) => {
    const items = (order.items || []).map((item) => `${escapeHtml(item.product)} x${Number(item.quantity) || 1} / GH₵${Number(item.price) * (Number(item.quantity) || 1)}`).join('<br>');
    const statusValue = ORDER_STATUSES.includes(order.status) ? order.status : 'Pending';
    const statusClass = statusValue === 'Pending' ? 'order-status-pending' : 'order-status-progress';
    return `<article class="order-card"><div class="order-card-head"><div><h2>${escapeHtml(order.orderId || order.reference || 'Order')}</h2><p class="order-card-meta">${escapeHtml(dateLabel(order.createdAt))} · ${escapeHtml(order.reference || 'Payment reference pending')}</p></div><span class="order-status ${statusClass}">${escapeHtml(statusValue)}</span></div><div class="order-card-body"><p class="order-items">${items || 'Order details pending'}</p><p class="order-total">GH₵${Number(order.amount || 0)}</p></div></article>`;
  }).join('');
}

async function loadOrders() {
  await setPersistence(auth, browserLocalPersistence);
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    window.location.replace('login.html');
    return;
  }
  const response = await fetch(`${apiUrl}/api/orders`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Unable to load your orders.');
  renderOrders(data.orders || []);
  status.textContent = data.orders?.length ? `${data.orders.length} order${data.orders.length === 1 ? '' : 's'} in your archive.` : '';
}

loadOrders().catch((error) => {
  status.classList.add('orders-error');
  status.textContent = error.message;
});
