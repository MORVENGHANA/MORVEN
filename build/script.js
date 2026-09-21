const menuButton = document.querySelector('.menu-button');
const mobileNav = document.querySelector('.mobile-nav');

if (localStorage.getItem('morvenUser')) {
  document.querySelectorAll('.account-actions').forEach((actions) => {
    actions.querySelector('.auth-link')?.remove();
    actions.querySelector('.auth-button')?.remove();
    const cartLink = actions.querySelector('.cart-link');
    if (cartLink) cartLink.style.display = 'inline-flex';
  });
}

menuButton?.addEventListener('click', () => {
  const isOpen = mobileNav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.mobile-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    mobileNav.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  });
});

const revealItems = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('visible');
    observer.unobserve(entry.target);
  });
}, { threshold: 0.12 });
revealItems.forEach((item) => revealObserver.observe(item));

document.querySelector('#verify-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#code');
  const result = document.querySelector('#verify-result');
  const code = input.value.replace(/\s/g, '').toUpperCase();
  const apiUrl = window.MORVEN_API_URL;

  result.className = 'verify-result';
  result.textContent = 'Checking the MORVEN archive...';

  try {
    if (apiUrl) {
      const response = await fetch(`${apiUrl}/api/verify`, {
        body: JSON.stringify({ code }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data = await response.json();
      result.classList.add(data.status === 'authentic' ? 'valid' : 'invalid');
      result.textContent = data.status === 'authentic' ? `Authentic MORVEN piece — ${data.product}` : data.message;
      return;
    }

    const isAuthentic = code === 'MVN24001';
    result.classList.add(isAuthentic ? 'valid' : 'invalid');
    result.textContent = isAuthentic ? 'Authentic MORVEN piece — Studio Overshirt' : 'We could not confirm this code. Check the tag and try again.';
  } catch {
    result.classList.add('invalid');
    result.textContent = 'Verification is temporarily unavailable. Please try again.';
  }
});
