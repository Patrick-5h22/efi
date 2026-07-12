// Client Better Auth côté navigateur : simple couche fetch au-dessus des
// routes /api/auth/* servies par les fonctions serverless (api/auth/[...all].js).
// Sur un hébergement statique sans fonctions (poste local, python -m
// http.server), detectAuth() renvoie { available: false } et l'application
// retombe sur le mode historique (code d'accès).

async function readJSON(res) {
  try { return await res.json(); } catch { return null; }
}

// Détecte la présence de l'API d'authentification et la session en cours.
//  → { available: false }                    pas d'API (hébergement statique)
//  → { available: true, session: null }      API présente, non connecté
//  → { available: true, session: {user,…} }  connecté
export async function detectAuth() {
  try {
    // Délai borné : au pire, l'application démarre en mode local plutôt
    // que de rester voilée indéfiniment
    const res = await fetch('/api/auth/get-session', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('application/json')) return { available: false };
    const data = await readJSON(res);
    return { available: true, session: data?.user ? data : null };
  } catch {
    return { available: false };
  }
}

export async function signIn(email, password, rememberMe = true) {
  const res = await fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // rememberMe: false → session limitée à l'onglet (cookie de session)
    body: JSON.stringify({ email, password, rememberMe }),
  });
  if (!res.ok) {
    const body = await readJSON(res);
    const err = new Error(body?.message || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return readJSON(res);
}

// Connexion via un fournisseur externe (Microsoft) : better-auth renvoie
// l'URL d'autorisation, on y envoie le navigateur ; au retour, le cookie de
// session est posé et l'application démarre connectée.
export async function signInSocial(provider) {
  const res = await fetch('/api/auth/sign-in/social', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, callbackURL: '/', errorCallbackURL: '/' }),
  });
  const data = await readJSON(res);
  if (!res.ok || !data?.url) {
    const err = new Error(data?.message || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  window.location.href = data.url;
}

// Méthodes d'authentification disponibles sur ce déploiement
export async function fetchAuthConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return {};
    return (await readJSON(res)) || {};
  } catch {
    return {};
  }
}

export async function signOut() {
  try {
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch { /* même hors ligne, on déconnecte localement */ }
}
