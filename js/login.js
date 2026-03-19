document.addEventListener('DOMContentLoaded', () => {
    const loginScreen = document.getElementById('loginScreen');
    const importScreen = document.getElementById('importScreen');

    if (sessionStorage.getItem('nexus_auth') === 'true') {
        // Already authenticated at some point in this session
        if (loginScreen) loginScreen.style.display = 'none';
    } else {
        // Not authenticated, show login
        if (loginScreen) {
            loginScreen.style.display = 'flex';
            // Trigger entrance animation
            requestAnimationFrame(() => {
                requestAnimationFrame(() => loginScreen.classList.add('lx-visible'));
            });
        }
        if (importScreen) importScreen.style.display = 'none';
    }
});

function handleLogin(event) {
    event.preventDefault();

    const usernameInput = document.getElementById('loginUser').value.trim();
    const passwordInput = document.getElementById('loginPass').value.trim();
    const errorBox = document.getElementById('loginError');
    const errorText = document.getElementById('loginErrorText');
    const submitBtn = document.getElementById('loginSubmitBtn');

    // Definidos de acordo com requisitos
    const validUsers = {
        'tra@2026': '8101',
        'nex@2026': '8101'
    };

    if (validUsers[usernameInput] && validUsers[usernameInput] === passwordInput) {
        // Autenticação bem-sucedida
        sessionStorage.setItem('nexus_auth', 'true');

        if (errorBox) errorBox.style.display = 'none';

        // Visual feedback: loading state on button
        if (submitBtn) {
            submitBtn.classList.add('lx-loading');
            submitBtn.disabled = true;
        }

        // Small delay for UX polish then hide login
        setTimeout(() => {
            document.getElementById('loginScreen').style.display = 'none';
            if (submitBtn) {
                submitBtn.classList.remove('lx-loading');
                submitBtn.disabled = false;
            }
            // Mostramos a tela de importação logo em seguida
            const importScreenEl = document.getElementById('importScreen');
            if (importScreenEl) importScreenEl.style.display = 'flex';
        }, 400);

        console.log('[NEXUS HUB] Acesso autorizado para:', usernameInput);

    } else {
        // Auth failed
        if (errorBox) {
            if (errorText) errorText.textContent = 'Credenciais inválidas. Tente novamente.';
            errorBox.style.display = 'flex';

            // Shake animation on the form wrap
            const formWrap = document.querySelector('.lx-form-wrap');
            if (formWrap) {
                formWrap.classList.remove('lx-shake');
                void formWrap.offsetWidth; // reflow
                formWrap.classList.add('lx-shake');
            }

            // Also flash the input borders red
            [document.getElementById('loginUser'), document.getElementById('loginPass')].forEach(el => {
                if (el) {
                    el.classList.add('lx-input-error');
                    el.addEventListener('input', () => el.classList.remove('lx-input-error'), { once: true });
                }
            });
        }
    }
}

// Toggle password visibility
function toggleLoginPass(btn) {
    const passInput = document.getElementById('loginPass');
    if (!passInput) return;
    const isPassword = passInput.type === 'password';
    passInput.type = isPassword ? 'text' : 'password';
    const ic = btn.querySelector('.lx-eye-ic');
    if (ic) ic.textContent = isPassword ? '🙈' : '👁';
    btn.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
}
