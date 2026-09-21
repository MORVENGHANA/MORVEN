import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  updateProfile,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';

const firebaseApp = initializeApp({
  apiKey: 'AIzaSyA55H9jGrGN5BYB619fxIZYfmFccl71jlA',
  authDomain: 'morven-1420a.firebaseapp.com',
  projectId: 'morven-1420a',
  storageBucket: 'morven-1420a.firebasestorage.app',
  messagingSenderId: '133394499575',
  appId: '1:133394499575:web:d571d789aa23d6e0c1d0f2',
});
const auth = getAuth(firebaseApp);
const authForm = document.querySelector('[data-auth]');

authForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = authForm.querySelector('button');
  const message = authForm.querySelector('.auth-message');
  const inputs = authForm.querySelectorAll('input');
  const isSignup = authForm.dataset.auth === 'signup';
  const email = inputs[isSignup ? 1 : 0].value.trim();
  const password = inputs[isSignup ? 2 : 1].value;

  button.disabled = true;
  message.textContent = 'Connecting to the MORVEN archive...';

  try {
    if (isSignup) {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: inputs[0].value.trim() });
      message.textContent = 'Account created. Welcome to the archive.';
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      message.textContent = 'Welcome back to MORVEN.';
    }
    localStorage.setItem('morvenUser', 'signed-in');
    const destination = email.toLowerCase() === 'fotsiemmanuel397@gmail.com' ? 'admin.html' : 'dashboard.html';
    setTimeout(() => { window.location.href = destination; }, 650);
  } catch (error) {
    const messages = {
      'auth/email-already-in-use': 'An account already exists with this email.',
      'auth/invalid-credential': 'The email or password is incorrect.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/weak-password': 'Use a password with at least 6 characters.',
    };
    message.textContent = messages[error.code] || 'Authentication failed. Please try again.';
    button.disabled = false;
  }
});
