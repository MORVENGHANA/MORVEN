import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

const ADMIN_EMAIL = 'fotsiemmanuel397@gmail.com';
const app = initializeApp({
  apiKey: 'AIzaSyA55HjGrGN5BYB619fxIZYfmFccl71a',
  authDomain: 'morven-1420a.firebaseapp.com',
  projectId: 'morven-1420a',
  storageBucket: 'morven-1420a.firebasestorage.app',
  messagingSenderId: '133394499575',
  appId: '1:133394499575:web:d571d789aa23d6e0c1d0f2',
});
const auth = getAuth(app);
const form = document.querySelector('#admin-login-form');
const message = form.querySelector('.auth-message');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  const email = form.elements.email.value.trim().toLowerCase();
  const password = form.elements.password.value;
  button.disabled = true;
  message.textContent = 'Checking administrator access...';
  if (email !== ADMIN_EMAIL) {
    message.textContent = 'This portal is restricted to the administrator account.';
    button.disabled = false;
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = 'admin.html';
  } catch {
    message.textContent = 'The administrator email or password is incorrect.';
    button.disabled = false;
  }
});
