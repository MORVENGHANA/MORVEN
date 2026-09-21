import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  getAuth,
  browserLocalPersistence,
  setPersistence,
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

const persistenceReady = setPersistence(auth, browserLocalPersistence);

authForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = authForm.querySelector('button');
  const message = authForm.querySelector('.auth-message');
  const inputs = authForm.querySelectorAll('input');
  const isSignup = authForm.dataset.auth === 'signup';
  const email = inputs[isSignup ? 2 : 0].value.trim();
  const password = inputs[isSignup ? 3 : 1].value;

  button.disabled = true;
  message.textContent = 'Connecting to the MORVEN archive...';

  try {
    await persistenceReady;
    if (isSignup) {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: inputs[0].value.trim() });
      const apiUrl = window.MORVEN_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin);
      const profileResponse = await fetch(`${apiUrl}/api/profile`, {
        body: JSON.stringify({ phone: inputs[1].value.trim() }),
        headers: { Authorization: `Bearer ${await credential.user.getIdToken()}`, 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (!profileResponse.ok) throw new Error('Could not save your phone number.');
      message.textContent = 'Account created. Welcome to the archive.';
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      message.textContent = 'Welcome back to MORVEN.';
    }
    await auth.authStateReady();
    await auth.currentUser?.getIdToken(true);
    localStorage.setItem('morvenUser', 'signed-in');
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 650);
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
