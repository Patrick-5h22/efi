// Écran de connexion (mode API) : recouvre l'application tant que
// l'utilisateur n'est pas authentifié via Better Auth. Les comptes sont les
// mêmes que ceux de l'application EFI Placement (base partagée).

export function showLoginOverlay({ onLogin }) {
  if (document.getElementById('login-overlay')) return;

  const ov = document.createElement('div');
  ov.id = 'login-overlay';
  ov.innerHTML = `
    <form class="login-card" novalidate>
      <div class="login-brand">
        <span class="brand-icon">📅</span>
        <div>
          <div class="brand-title">EFI Planning</div>
          <div class="brand-sub">Formations & tests 2026</div>
        </div>
      </div>
      <p class="login-sub">Connectez-vous avec votre compte EFI
        (le même que l'application de placement).</p>
      <label class="login-field">Email
        <input type="email" name="email" autocomplete="username" required
               placeholder="prenom.nom@cipecma.com">
      </label>
      <label class="login-field">Mot de passe
        <input type="password" name="password" autocomplete="current-password" required>
      </label>
      <p class="login-error" role="alert" hidden></p>
      <button type="submit" class="btn btn-primary login-submit">Se connecter</button>
    </form>`;
  document.body.appendChild(ov);

  const form = ov.querySelector('form');
  const errEl = ov.querySelector('.login-error');
  const btn = ov.querySelector('.login-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) {
      errEl.textContent = 'Renseignez votre email et votre mot de passe.';
      errEl.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Connexion…';
    errEl.hidden = true;
    try {
      await onLogin(email, password);
      ov.remove();
    } catch (err) {
      errEl.textContent = (err.status === 400 || err.status === 401 || err.status === 403)
        ? 'Email ou mot de passe incorrect.'
        : 'Connexion impossible : ' + err.message;
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Se connecter';
    }
  });

  form.email.focus();
}

export function hideLoginOverlay() {
  document.getElementById('login-overlay')?.remove();
}
