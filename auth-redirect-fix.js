(() => {
  'use strict';

  const PRODUCTION_URL = 'https://cornflakessssss.github.io/e-ramp-otban-x/';
  let attempts = 0;

  function showAuthNotice(text, isError = false) {
    const element = document.getElementById('authMessage');
    if (!element) return;
    element.textContent = text;
    element.className = `notice ${isError ? 'error' : 'success'}`;
  }

  function installRedirectFix() {
    attempts += 1;
    if (typeof db === 'undefined' || !db?.auth?.signUp || !db?.auth?.resend) {
      if (attempts < 40) window.setTimeout(installRedirectFix, 100);
      return;
    }

    if (!db.auth.__erampRedirectFixed) {
      const originalSignUp = db.auth.signUp.bind(db.auth);
      db.auth.signUp = (credentials = {}) => originalSignUp({
        ...credentials,
        options: {
          ...(credentials.options || {}),
          emailRedirectTo: PRODUCTION_URL
        }
      });
      db.auth.__erampRedirectFixed = true;
    }

    const registerForm = document.getElementById('registerForm');
    const registerEmail = document.getElementById('registerEmail');
    if (registerForm && registerEmail && !document.getElementById('resendConfirmationBtn')) {
      const resendButton = document.createElement('button');
      resendButton.id = 'resendConfirmationBtn';
      resendButton.type = 'button';
      resendButton.className = 'btn secondary';
      resendButton.textContent = 'Kirim ulang email konfirmasi';
      resendButton.addEventListener('click', async () => {
        const email = registerEmail.value.trim();
        if (!email) {
          showAuthNotice('Isi alamat email pada formulir daftar terlebih dahulu.', true);
          registerEmail.focus();
          return;
        }
        resendButton.disabled = true;
        try {
          const { error } = await db.auth.resend({
            type: 'signup',
            email,
            options: { emailRedirectTo: PRODUCTION_URL }
          });
          if (error) throw error;
          showAuthNotice('Email konfirmasi baru sudah dikirim. Gunakan email terbaru; tautan lama yang menuju localhost tidak berlaku untuk perbaikan ini.');
        } catch (error) {
          showAuthNotice(error?.message || 'Email konfirmasi belum dapat dikirim ulang.', true);
        } finally {
          resendButton.disabled = false;
        }
      });
      registerForm.appendChild(resendButton);

      const help = document.createElement('p');
      help.style.cssText = 'font-size:12px;color:#68758a;margin:8px 0 0;line-height:1.45';
      help.textContent = 'Tautan konfirmasi baru akan kembali ke website E-RAMP, bukan ke localhost.';
      registerForm.appendChild(help);
    }

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    const errorDescription = hash.get('error_description') || query.get('error_description');
    if (errorDescription) showAuthNotice(decodeURIComponent(errorDescription), true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installRedirectFix, { once: true });
  } else {
    installRedirectFix();
  }
})();
