import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

const ADMIN_EMAIL = 'fotsiemmanuel397@gmail.com';
const firebaseApp = initializeApp({
  apiKey: 'AIzaSyA55HjGrGN5BYB619fxIZYfmFccl71A',
  authDomain: 'morven-1420a.firebaseapp.com',
  projectId: 'morven-1420a',
  storageBucket: 'morven-1420a.firebasestorage.app',
  messagingSenderId: '133394499575',
  appId: '1:133394499575:web:d571d789aa23d6e0c1d0f2',
});
const auth = getAuth(firebaseApp);
let logoutButton;

function setAccountControls(user) {
  document.querySelectorAll('.account-actions').forEach((actions) => {
    const login = actions.querySelector('.auth-link');
    const signup = actions.querySelector('.auth-button');
    const cart = actions.querySelector('.cart-link');
    if (login) login.hidden = Boolean(user);
    if (signup) signup.hidden = Boolean(user);
    if (cart) cart.style.display = 'inline-flex';
  });
  if (!user) {
    logoutButton?.remove();
    logoutButton = null;
    return;
  }
  if (!logoutButton) {
    logoutButton = document.createElement('button');
    logoutButton.className = 'logout-button';
    logoutButton.type = 'button';
    logoutButton.setAttribute('aria-label', 'Log out of MORVEN');
    logoutButton.innerHTML = '<span>Log out</span><b aria-hidden="true">↗</b>';
    document.body.append(logoutButton);
    logoutButton.addEventListener('click', async () => {
      logoutButton.disabled = true;
      await signOut(auth);
      window.location.href = 'dashboard.html';
    });
  }
  if (user.email?.toLowerCase() === ADMIN_EMAIL) {
    document.querySelectorAll('.account-actions').forEach((actions) => {
      if (actions.querySelector('.admin-link')) return;
      const link = document.createElement('a');
      link.className = 'admin-link';
      link.href = 'admin.html';
      link.textContent = 'Admin';
      actions.insertBefore(link, actions.querySelector('.cart-link'));
    });
  }
}

onAuthStateChanged(auth, setAccountControls);
