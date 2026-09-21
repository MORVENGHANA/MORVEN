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
const ORDER_STATUSES = ['Pending', 'Accepted', 'Order is being Prepared', 'On its way to be Delivered', 'Delivered'];
const status = document.querySelector('.admin-status');
const toast = document.querySelector('.admin-toast');
const grid = document.querySelector('.admin-grid');
const productForm = document.querySelector('.product-form');
const verificationForm = document.querySelector('.verification-form');
const verificationProduct = document.querySelector('.verification-product');
const cancelEdit = document.querySelector('.admin-cancel');
let token = '';
let editingProductId = '';

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
  const responseText = response.status === 204 ? '' : await response.text();
  let data = null;
  try { data = responseText ? JSON.parse(responseText) : null; } catch { throw new Error(`Admin API returned ${response.status} HTML instead of JSON. Redeploy the latest server code.`); }
  if (!response.ok) throw new Error(data?.message || 'Admin request failed.');
  return data;
}

function cell(value) {
  const element = document.createElement('td');
  element.textContent = value || '—';
  return element;
}

function deliveryCell(delivery = {}) {
  const element = document.createElement('td');
  [['Name', 'name'], ['City', 'city'], ['Street', 'streetAddress'], ['House', 'houseAddress'], ['Phone', 'phone'], ['Comment', 'comment']].forEach(([label, key]) => {
    const line = document.createElement('div');
    line.textContent = `${label}: ${delivery[key] || '—'}`;
    element.append(line);
  });
  return element;
}

function orderStatus(value) {
  return ORDER_STATUSES.includes(value) ? value : 'Pending';
}

async function loadAdminData() {
  const [{ products }, { users }, { orders }] = await Promise.all([api('/api/admin/products'), api('/api/admin/users'), api('/api/admin/orders')]);
  const productsTable = document.querySelector('.products-table');
  productsTable.replaceChildren();
  verificationProduct.replaceChildren(new Option('Select a product', ''));
  products.forEach((product) => {
    verificationProduct.append(new Option(product.name, product.name));
    const row = document.createElement('tr');
    row.append(cell(product.name), cell(`GH₵${product.price}`));
    const action = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'product-actions';
    const edit = document.createElement('button');
    edit.className = 'table-action'; edit.textContent = 'Edit'; edit.type = 'button';
    edit.addEventListener('click', () => {
      editingProductId = product.id;
      productForm.elements.name.value = product.name;
      productForm.elements.price.value = product.price;
      productForm.elements.description.value = product.description || '';
      productForm.elements.image.value = '';
      productForm.elements.imageBack.value = '';
      productForm.elements.image.required = false;
      productForm.elements.imageBack.required = false;
      productForm.querySelector('.admin-action').innerHTML = 'Update item <span>↗</span>';
      cancelEdit.hidden = false;
      productForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const remove = document.createElement('button');
    remove.className = 'table-action'; remove.textContent = 'Bin'; remove.type = 'button'; remove.setAttribute('aria-label', `Delete ${product.name}`);
    remove.addEventListener('click', async () => { if (!window.confirm(`Delete ${product.name}?`)) return; await api(`/api/admin/products/${product.id}`, { method: 'DELETE' }); await loadAdminData(); });
    actions.append(edit, remove); action.append(actions); row.append(action); productsTable.append(row);
  });
  const usersTable = document.querySelector('.users-table'); usersTable.replaceChildren();
  users.forEach((user) => { const row = document.createElement('tr'); row.append(cell(user.name), cell(user.email), cell(user.phone)); usersTable.append(row); });
  const ordersTable = document.querySelector('.orders-table'); ordersTable.replaceChildren();
  orders.forEach((order) => {
    const row = document.createElement('tr');
    const currentStatus = orderStatus(order.status);
    row.append(cell(order.orderId || order.reference || order.id), cell(order.email), cell(`GH₵${order.amount || 0}`), deliveryCell(order.delivery));
    const select = document.createElement('select');
    select.className = 'order-status-select';
    ORDER_STATUSES.forEach((statusOption) => {
      const option = document.createElement('option');
      option.value = statusOption; option.textContent = statusOption; option.selected = statusOption === currentStatus;
      select.append(option);
    });
    select.addEventListener('change', async () => {
      try { await api(`/api/admin/orders/${encodeURIComponent(order.reference || order.id)}/status`, { method: 'PUT', body: JSON.stringify({ status: select.value }) }); showToast('Order status updated.'); }
      catch (error) { showToast(error.message, true); select.value = currentStatus; }
    });
    const statusCell = document.createElement('td');
    statusCell.append(select);
    row.append(statusCell); ordersTable.append(row);
  });
}

verificationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = verificationForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch(`${apiUrl}/api/admin/verification-codes/pdf`, { body: JSON.stringify({ product: verificationProduct.value }), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, method: 'POST' });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'Unable to generate verification codes.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'morven-verification-codes.pdf'; link.click();
    URL.revokeObjectURL(url);
    showToast('20 verification codes were generated.');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

function resetProductForm() {
  editingProductId = '';
  productForm.reset();
  productForm.elements.image.required = true;
  productForm.elements.imageBack.required = true;
  productForm.querySelector('.admin-action').innerHTML = 'Publish item <span>↗</span>';
  cancelEdit.hidden = true;
}

cancelEdit.addEventListener('click', resetProductForm);
document.querySelector('.admin-back').addEventListener('click', () => window.history.back());

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const path = editingProductId ? `/api/admin/products/${editingProductId}` : '/api/admin/products';
    const { product } = await api(path, { method: editingProductId ? 'PUT' : 'POST', body: data });
    resetProductForm();
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
