// Écran de connexion (mode API) : recouvre l'application tant que
// l'utilisateur n'est pas authentifié via Better Auth. Les comptes sont les
// mêmes que ceux de l'application EFI Placement (base partagée).

import { fetchAuthConfig, signInSocial } from '../auth-client.js';

const MS_LOGO = `<svg width="15" height="15" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>`;

export function showLoginOverlay({ onLogin, error }) {
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
      <div class="login-divider" hidden><span>ou</span></div>
      <button type="button" class="btn login-ms" hidden>${MS_LOGO} Se connecter avec Microsoft</button>
    </form>`;
  document.body.appendChild(ov);

  // Bouton Microsoft : seulement si le déploiement a une application Entra ID
  const msBtn = ov.querySelector('.login-ms');
  fetchAuthConfig().then((cfg) => {
    if (!cfg.microsoftAuth || !ov.isConnected) return;
    ov.querySelector('.login-divider').hidden = false;
    msBtn.hidden = false;
  });
  msBtn.addEventListener('click', async () => {
    msBtn.disabled = true;
    try {
      await signInSocial('microsoft'); // redirige le navigateur
    } catch (err) {
      const errZone = ov.querySelector('.login-error');
      errZone.textContent = 'Connexion Microsoft impossible : ' + err.message;
      errZone.hidden = false;
      msBtn.disabled = false;
    }
  });

  const form = ov.querySelector('form');
  const errEl = ov.querySelector('.login-error');
  const btn = ov.querySelector('.login-submit');

  // Message initial (ex. retour d'un refus Microsoft via ?error=…)
  if (error) {
    errEl.textContent = error;
    errEl.hidden = false;
  }

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
      // 403 = origine/configuration refusée par le serveur, pas un problème
      // d'identifiants : afficher la vraie cause.
      errEl.textContent = (err.status === 400 || err.status === 401)
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
