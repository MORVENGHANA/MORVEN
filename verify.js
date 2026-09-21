const form = document.querySelector('#verify-form');
const input = document.querySelector('#code');
const result = document.querySelector('#verify-result');
const apiUrl = window.MORVEN_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin);

async function verifyCode(code) {
  result.className = 'verify-result';
  result.textContent = 'Checking the MORVEN archive...';
  try {
    const response = await fetch(`${apiUrl}/api/verify`, { body: JSON.stringify({ code }), headers: { 'Content-Type': 'application/json' }, method: 'POST' });
    const data = await response.json();
    result.classList.add(data.status === 'authentic' ? 'valid' : 'invalid');
    result.textContent = data.status === 'authentic' ? `Authentic MORVEN piece - ${data.product}` : data.message;
  } catch {
    result.classList.add('invalid');
    result.textContent = 'Verification is temporarily unavailable. Please try again.';
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  verifyCode(input.value.replace(/\s/g, '').toUpperCase());
});

const scannedCode = new URLSearchParams(window.location.search).get('code');
if (scannedCode) {
  input.value = scannedCode;
  verifyCode(scannedCode.replace(/\s/g, '').toUpperCase());
}
