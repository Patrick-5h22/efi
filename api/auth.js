// Point d'entrée Better Auth : toutes les routes /api/auth/* (get-session,
// sign-in/email, sign-out, …) arrivent ici via la réécriture de vercel.json
// (le routage « attrape-tout » [...all].js n'est pas fiable hors Next.js).
// La fonction reçoit l'URL d'origine : better-auth route lui-même dessus.

import { toNodeHandler } from 'better-auth/node';
import { auth } from './_auth.js';

// better-auth lit lui-même le corps de la requête : on désactive le parseur
// de Vercel pour lui laisser le flux brut.
export const config = { api: { bodyParser: false } };

export default toNodeHandler(auth);
