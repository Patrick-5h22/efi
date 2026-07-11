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
    const res = await fetch('/api/auth/get-session', { headers: { Accept: 'application/json' } });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('application/json')) return { available: false };
    const data = await readJSON(res);
    return { available: true, session: data?.user ? data : null };
  } catch {
    return { available: false };
  }
}

export async function signIn(email, password) {
  const res = await fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await readJSON(res);
    const err = new Error(body?.message || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return readJSON(res);
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
