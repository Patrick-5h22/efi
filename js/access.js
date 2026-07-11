// Auto-connexion à la base partagée — GABARIT.
// Sur le site déployé, l'accès passe par l'authentification Better Auth
// (le code d'accès reste côté serveur, variable Vercel EFI_ACCESS_CODE).
// Pour un hébergement statique privé SANS fonctions serverless, on peut
// renseigner ici le code d'accès pour une auto-connexion sans saisie.
// Ne JAMAIS mettre le vrai code dans un dépôt public.
globalThis.EFI_ACCESS_CODE = globalThis.EFI_ACCESS_CODE ?? null;
