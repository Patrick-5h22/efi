# Base partagée Supabase

Le planning peut être synchronisé entre plusieurs postes via une base
Supabase. Sans connexion, l'application fonctionne comme avant (stockage
local du navigateur).

## Architecture

- Projet Supabase : `efi-placement` (organisation CIPECMA, eu-central-1)
- Schéma dédié **`planning`**, isolé de l'application existante du projet :
  `params`, `formations`, `team_members`, `open_days`, `day_assignments`,
  `inscriptions`, `settings`
- Les tables ne sont **pas exposées** par l'API REST. La seule surface
  d'accès est constituée de deux fonctions RPC (`SECURITY DEFINER`) :
  - `public.efi_load_state(p_code)` — renvoie l'état complet (jsonb)
  - `public.efi_save_state(p_code, p_state)` — remplace l'état
    (transactionnel, last-write-wins)
- Chaque appel exige le **code d'accès** stocké côté serveur dans
  `planning.settings` (jamais dans le dépôt). RLS activé sur toutes les
  tables, sans politique : accès direct impossible, même avec la clé anon.

## Authentification (Better Auth)

Sur le site déployé (Vercel), l'accès au planning exige un **compte
nominatif** :

- Les comptes sont ceux de l'application **EFI Placement** — mêmes tables
  better-auth (`user`, `session`, `account`, `verification`) dans le même
  Postgres. Un compte créé dans EFI Placement fonctionne ici immédiatement
  (l'inscription est désactivée côté EFI Planning : `disableSignUp`).
- Le navigateur ne parle plus directement à Supabase : il passe par le
  proxy serverless **`/api/state`** (GET = chargement, PUT = sauvegarde),
  qui vérifie la session Better Auth puis relaie vers les RPC avec le code
  d'accès `EFI_ACCESS_CODE` conservé **côté serveur uniquement**.
- Session de 7 jours (cookie `efi-planning.*`), déconnexion par le bouton
  ⏻ de la barre latérale. Le thème préféré du compte (partagé avec EFI
  Placement) est appliqué à la première connexion.

## Déploiement (intégration Git Vercel)

Le dépôt est connecté au projet Vercel `efi` : **chaque push sur `main`
déclenche automatiquement un déploiement en production** (et chaque pull
request obtient une URL de prévisualisation). Les tests tournent en
parallèle via GitHub Actions (`tests.yml`) — un échec s'affiche en rouge
sur le commit mais ne bloque pas le déploiement Vercel.

Variables d'environnement à renseigner **directement dans Vercel**
(projet `efi` → Settings → Environment Variables, environnement
*Production* — cocher aussi *Preview* pour tester l'auth sur les PR) :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | chaîne Postgres du **pooler de session** Supabase (Dashboard → Connect → Session pooler) |
| `BETTER_AUTH_SECRET` | signature des sessions — `openssl rand -base64 32` (peut différer de celui d'EFI Placement : les comptes restent communs) |
| `EFI_ACCESS_CODE` | code d'accès aux RPC planning (reste côté serveur) |
| `BETTER_AUTH_URL` | *(optionnelle)* URL publique — déduite automatiquement du domaine de production Vercel si absente |

Sans ces variables, les fonctions d'authentification répondent en erreur
et l'application retombe en mode local : bouton ☁ + saisie manuelle du
code d'accès.

## Connexion permanente

L'application est conçue pour rester connectée en continu :

- **Auto-connexion** : sur le site déployé, la connexion s'établit dès que
  la session Better Auth est vérifiée (session de 7 jours — pas de
  re-saisie quotidienne). Sur un poste local sans API, premier clic sur
  **☁** + code, mémorisé ensuite.
- **Synchronisation continue** : la base est interrogée toutes les 45 s ;
  une modification faite sur un autre poste apparaît automatiquement
  (jamais pendant une saisie en cours — elle est appliquée juste après).
- **Reprise automatique** : après une coupure réseau, l'application se
  reconnecte seule (revenue au premier plan, retour du réseau, ou toutes
  les 20 s si une sauvegarde est en attente) ; la sauvegarde est forcée à
  la fermeture de l'onglet.
- Indicateur : ☁✓ synchronisé, ☁… sauvegarde, ☁⚠ erreur. Re-cliquer sur ☁
  pour se déconnecter (retour au mode local).

## Changer le code d'accès

Dans l'éditeur SQL de Supabase :

```sql
update planning.settings set value = 'NOUVEAU-CODE' where key = 'access_code';
```

## Limites connues

- Écriture « dernier sauvé gagne » : pas de fusion si deux postes
  modifient en même temps (usage prévu : un planificateur à la fois).
- Les rôles (`commercial`, `assistante`, `gestionnaire`) sont lus depuis le
  compte mais pas encore différenciés dans l'interface : tout utilisateur
  connecté a les mêmes droits sur le planning.
- En local (hébergement statique sans fonctions serverless), le mode
  historique par code d'accès partagé reste utilisé.
