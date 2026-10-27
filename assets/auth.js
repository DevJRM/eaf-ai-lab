// Shared password gate for bizView, marketsView, and the WAL Wedge module.
const EAF_CORRECT_HASH = '4d5552e83562426e627146467a476e2abe25d5f6feea8e4a53ad8cf1dafd85c8';
const EAF_SESSION_KEY = 'eaf_restricted_authenticated';

async function eafSha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function eafHideOverlay() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.style.display = 'none';
    document.documentElement.classList.add('eaf-authed');
}

if (sessionStorage.getItem(EAF_SESSION_KEY) === 'true') {
    eafHideOverlay();
}

async function checkPassword() {
    const input = document.getElementById('password-input');
    const error = document.getElementById('auth-error');
    const password = input.value;

    if (!password) {
        error.textContent = '⚠️ Please enter a password.';
        error.style.display = 'block';
        return;
    }

    const enteredHash = await eafSha256(password);

    if (enteredHash === EAF_CORRECT_HASH) {
        sessionStorage.setItem(EAF_SESSION_KEY, 'true');
        eafHideOverlay();
        error.style.display = 'none';
        input.value = '';
    } else {
        error.textContent = '❌ Incorrect password. Please try again.';
        error.style.display = 'block';
        input.value = '';
        input.focus();
    }
}

(function () {
    const input = document.getElementById('password-input');
    if (input) {
        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') checkPassword();
        });
    }
})();
