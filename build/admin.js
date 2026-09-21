import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

const app = initializeApp({
  apiKey: 'AIzaSyA55H9jGrGN5BYB619fxIZYfmFccl71jlA',
  authDomain: 'morven-1420a.firebaseapp.com',
  projectId: 'morven-1420a',
  storageBucket: 'morven-1420a.firebasestorage.app',
  messagingSenderId: '133394499575',
  appId: '1:133394499575:web:d571d789aa23d6e0c1d0f2',
});
const auth = getAuth(app);
const apiUrl = window.MORVEN_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin);
const ADMIN_EMAIL = 'fotsiemmanuel397@gmail.com';
const status = document.querySelector('.admin-status');
const toast = document.querySelector('.admin-toast');
const grid = document.querySelector('.admin-grid');
let token = '';

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('admin-toast-error', isError);
  toast.hidden = false;
  window.setTimeout(() => { toast.hidden = true; }, 4500);
}

async function api(path, options = {}) {
  const headers = { Authorization: `Bearer ${token}`, ...options.headers };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.message || 'Admin request failed.');
  return data;
}

function cell(value) {
  const element = document.createElement('td');
  element.textContent = value || '—';
  return element;
}

async function loadAdminData() {
  const [{ products }, { users }, { orders }] = await Promise.all([api('/api/admin/products'), api('/api/admin/users'), api('/api/admin/orders')]);
  const productsTable = document.querySelector('.products-table');
  productsTable.replaceChildren();
  products.forEach((product) => {
    const row = document.createElement('tr');
    row.append(cell(product.name), cell(`GH₵${product.price}`));
    const action = document.createElement('td');
    const remove = document.createElement('button');
    remove.className = 'table-action'; remove.textContent = 'Archive'; remove.type = 'button';
    remove.addEventListener('click', async () => { await api(`/api/admin/products/${product.id}`, { method: 'DELETE' }); await loadAdminData(); });
    action.append(remove); row.append(action); productsTable.append(row);
  });
  const usersTable = document.querySelector('.users-table'); usersTable.replaceChildren();
  users.forEach((user) => { const row = document.createElement('tr'); row.append(cell(user.name), cell(user.email), cell(user.phone)); usersTable.append(row); });
  const ordersTable = document.querySelector('.orders-table'); ordersTable.replaceChildren();
  orders.forEach((order) => { const row = document.createElement('tr'); row.append(cell(order.orderId || order.reference || order.id), cell(order.email), cell(`GH₵${order.amount || 0}`), cell(order.status)); ordersTable.append(row); });
}

document.querySelector('.product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const { product } = await api('/api/admin/products', { method: 'POST', body: data });
    form.reset();
    status.textContent = `Signed in as ${auth.currentUser.email}.`;
    showToast(`${product.name} was published successfully.`);
    await loadAdminData();
  } catch (error) {
    status.textContent = error.message;
    showToast(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

document.querySelector('.admin-signout').addEventListener('click', () => signOut(auth).then(() => { window.location.href = 'login.html'; }));

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'admin-login.html'; return; }
  if (user.email?.toLowerCase() !== ADMIN_EMAIL) {
    await signOut(auth);
    window.location.href = 'admin-login.html';
    return;
  }
  document.body.classList.add('admin-authorized');
  token = await user.getIdToken();
  try {
    await loadAdminData();
    grid.hidden = false;
    status.textContent = `Signed in as ${user.email}.`;
  } catch (error) {
    status.textContent = error.message.includes('services are not configured') ? 'Admin services are not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON in Render.' : error.message.includes('Firestore') ? 'Admin data is temporarily unavailable. Enable Firestore to continue.' : error.message;
  }
});
