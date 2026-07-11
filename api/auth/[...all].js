// Point d'entrée Better Auth : toutes les routes /api/auth/* (get-session,
// sign-in/email, sign-out, …) sont servies par le handler better-auth.

import { toNodeHandler } from 'better-auth/node';
import { auth } from '../_auth.js';

// better-auth lit lui-même le corps de la requête : on désactive le parseur
// de Vercel pour lui laisser le flux brut.
export const config = { api: { bodyParser: false } };

export default toNodeHandler(auth);
