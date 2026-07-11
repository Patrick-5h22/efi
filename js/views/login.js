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
      <div class="login-wordmark">Cipecma<span class="login-dot">.</span></div>
      <h1 class="login-title">Connexion</h1>
      <p class="login-tagline">Heureux de vous revoir.</p>

      <button type="button" class="btn login-ms" hidden>${MS_LOGO} Continuer avec Microsoft</button>
      <div class="login-divider" hidden><span>ou avec votre identifiant</span></div>

      <label class="login-field">Email
        <input type="email" name="email" autocomplete="username" required
               placeholder="prenom.nom@cipecma.com">
      </label>
      <label class="login-field">
        <span class="login-label-row">Mot de passe
          <button type="button" class="login-forgot">Mot de passe oublié ?</button>
        </span>
        <span class="login-pass-wrap">
          <input type="password" name="password" autocomplete="current-password" required>
          <button type="button" class="login-eye" title="Afficher / masquer le mot de passe" aria-label="Afficher le mot de passe">👁</button>
        </span>
      </label>
      <label class="login-remember">
        <input type="checkbox" name="remember" checked> Se souvenir de moi
      </label>

      <p class="login-error" role="alert" hidden></p>
      <button type="submit" class="btn btn-primary login-submit">Se connecter</button>

      <p class="login-note">Pas encore de compte ? Contactez votre gestionnaire.</p>
      <p class="login-copyright">© ${new Date().getFullYear()} Cipecma — Tous droits réservés</p>
    </form>`;
  document.body.appendChild(ov);

  const form = ov.querySelector('form');
  const errEl = ov.querySelector('.login-error');
  const btn = ov.querySelector('.login-submit');
  const showMessage = (text, isInfo = false) => {
    errEl.textContent = text;
    errEl.classList.toggle('login-info', isInfo);
    errEl.hidden = false;
  };

  // Message initial (ex. retour d'un refus Microsoft via ?error=…)
  if (error) showMessage(error);

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
      showMessage('Connexion Microsoft impossible : ' + err.message);
      msBtn.disabled = false;
    }
  });

  // Afficher / masquer le mot de passe
  const passInput = form.password;
  ov.querySelector('.login-eye').addEventListener('click', () => {
    passInput.type = passInput.type === 'password' ? 'text' : 'password';
    passInput.focus();
  });

  // Le mot de passe se gère depuis EFI Placement (envoi d'email configuré là-bas)
  ov.querySelector('.login-forgot').addEventListener('click', () => {
    showMessage('Réinitialisation : utilisez « Mot de passe oublié » de l’application EFI Placement, ou demandez à un gestionnaire.', true);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) {
      showMessage('Renseignez votre email et votre mot de passe.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Connexion…';
    errEl.hidden = true;
    try {
      await onLogin(email, password, form.remember.checked);
      ov.remove();
    } catch (err) {
      // 403 = origine/configuration refusée par le serveur, pas un problème
      // d'identifiants : afficher la vraie cause.
      showMessage((err.status === 400 || err.status === 401)
        ? 'Email ou mot de passe incorrect.'
        : 'Connexion impossible : ' + err.message);
      btn.disabled = false;
      btn.textContent = 'Se connecter';
    }
  });

  form.email.focus();
}

export function hideLoginOverlay() {
  document.getElementById('login-overlay')?.remove();
}
