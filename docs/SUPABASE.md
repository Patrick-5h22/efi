# Base partagée Supabase

Le planning peut être synchronisé entre plusieurs postes via une base
Supabase. Sans connexion, l'application fonctionne comme avant (stockage
local du navigateur).

## Architecture

- Projet Supabase : `efi-placement` (organisation CIPECMA, eu-central-1)
- Schéma dédié **`planning`**, isolé de l'application existante du projet :
  `params`, `formations`, `team_members`, `open_days`, `day_assignments`,
  `inscriptions`, `day_presence`, `settings`, `user_prefs` (préférences par
  utilisateur, ex. portée de la carte d'occupation — servie par `/api/prefs`)
- Les tables ne sont **pas exposées** par l'API REST. La seule surface
  d'accès est constituée de deux fonctions RPC (`SECURITY DEFINER`) :
  - `public.efi_load_state(p_code)` — renvoie l'état complet (jsonb)
  - `public.efi_save_state(p_code, p_state)` — remplace l'état
    (transactionnel, last-write-wins)
- Chaque appel exige le **code d'accès** stocké côté serveur dans
  `planning.settings` (jamais dans le dépôt). RLS activé sur toutes les
  tables, sans politique : accès direct impossible, même avec la clé anon.

### ⚠ Un champ nouveau exige une colonne ET une mise à jour des RPC

Le schéma est **relationnel**, pas un document JSON : `efi_save_state` écrit
une liste de colonnes explicite et `efi_load_state` reconstruit le JSON depuis
ces colonnes. Un champ ajouté côté application est donc **accepté sans erreur
et perdu en silence** tant que la colonne n'existe pas et que les deux
fonctions ne la mentionnent pas.

Le corps des RPC ne se trouve pas dans ce dépôt, et aucun test ne peut voir ce
manque : les tests remplacent Supabase par un faux qui garde tout ce qu'on lui
donne. C'est ainsi que neuf champs ont été perdus sans bruit — dont le chiffre
d'affaires, le n° de dossier YPAREO et la traçabilité des pré-réservations —
ainsi que `dayPresence` en entier, faute de table. Réparé par
`docs/migrations/003-persister-tous-les-champs.sql`, éprouvée par un
aller-retour contre une réplique du schéma : dix pertes avant, zéro après.

`planning.day_presence` stocke la présence en JSONB, dans une table à une
seule ligne comme `params`, et non en relationnel : une journée présente avec
une liste **vide** signifie « personne ce jour-là », une journée absente
signifie « tout le monde ». Une table de couples (jour, personne) perdrait la
première et la retournerait en « tout le monde » — le contraire exact, sur
lequel le moteur choisit les intervenants.

`savedAt` rendait `now()`, donc une valeur neuve à chaque lecture : la garde
d'écriture du serveur MCP y voyait un conflit permanent. La 003 rend
l'horodatage de la dernière écriture.

**La leçon a resservi, et le garde-fou était trop étroit.** `tests/colonnes-base.test.mjs`
ne surveillait que `planning.inscriptions`. Deux champs de **formation** —
`testOnly` et `chargeComptee` — n'étaient donc écrits ni relus par les RPC de
la 003, sans que rien ne le signale. Une formation du catalogue s'en sortait
par accident : `migrate()` réinjecte le drapeau pour l'AIPR qu'il connaît. Mais
une formation créée à la main dans l'écran Paramètres perdait le sien au
premier aller-retour — une épreuve surveillée redevenait une formation
ordinaire, avec un formateur mobilisé et un test à programmer.

`docs/migrations/004-disponibilite-et-drapeaux-formations.sql` ajoute ces deux
colonnes, plus `dispo_debut` / `dispo_fin` sur `planning.team_members` (fenêtre
de disponibilité des intervenants). Mesuré sur une réplique du schéma : avec
les RPC de la 003 seule, les quatre champs revenaient **perdus** ; avec la 004,
tous reviennent, et la réappliquer ne casse rien.

Le contrôle couvre désormais les **trois** tables que les RPC reconstruisent :
inscriptions, formations et intervenants.

Il a resservi aussitôt : `dureeTest` et `testSurveille`, ajoutés pour les deux
modalités AIPR, ont fait échouer le test à la seconde où ils sont apparus dans
le catalogue — avant d'avoir pu être perdus une seule fois.
`docs/migrations/005-duree-de-test-par-formation.sql` ajoute les deux colonnes
et réécrit les deux RPC. Elle reprend les colonnes de la 004 : l'appliquer
seule suffit.

Le contrôle couvre à présent **six** collections : inscriptions, formations,
intervenants, et — depuis `docs/migrations/006-sites-zones-ressources.sql` —
sites, zones et matériels partagés.

`planning.zones` et `planning.ressources` portent `dispositifs` et `recos` en
**jsonb**, et non en tables de liaison. Ce sont des listes de codes que la base
n'interroge jamais par leur contenu : c'est le moteur, dans le navigateur, qui
décide quelle zone admet quel dispositif. Deux tables de liaison coûteraient
quatre jointures aux RPC pour reconstruire exactement les tableaux que
l'application manipule. `sites.pole` est une colonne pour la même raison : un
pôle n'a aujourd'hui aucun attribut propre.

Chaque migration reprend les colonnes des précédentes (`add column if not
exists`) et réécrit les deux RPC au complet : **appliquer la plus récente
suffit**, quel que soit l'état de la base.

**Avant d'ajouter un champ à `js/persisted.js` ou à une inscription**, vérifier
ce que la base rend réellement — en lecture seule, sans rien écrire :

```
EFI_ACCESS_CODE='…' npm run persistance
```

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

### Connexion Microsoft (Entra ID)

Un bouton « Se connecter avec Microsoft » apparaît sur l'écran de
connexion dès que l'application Azure est configurée. Un utilisateur
existant (même email vérifié) est **rattaché** à son identité Microsoft —
pas de doublon ; un membre du tenant sans compte en obtient un
automatiquement (rôle `commercial` par défaut).

Mise en place (une fois) :

1. [portal.azure.com](https://portal.azure.com) → Microsoft Entra ID →
   **App registrations** → *New registration* :
   nom « EFI Planning », comptes du **tenant seul** (single tenant),
   Redirect URI type **Web** : `https://efi-rho.vercel.app/api/auth/callback/microsoft`
2. Noter l'**Application (client) ID** et le **Directory (tenant) ID**
   (page Overview).
3. **Certificates & secrets** → *New client secret* → copier la **valeur**
   (visible une seule fois).
4. Variables d'environnement Vercel (puis *Redeploy*) :
   `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`.

Sans ces variables, le bouton n'apparaît pas et rien ne change.
Pour offrir la même connexion dans EFI Placement, ajouter une seconde
Redirect URI à la même application Azure et la même config better-auth.

### Accès et rôles par groupes Entra

Deux variables optionnelles pilotent l'accès depuis vos groupes Entra
(les changements de groupe s'appliquent à la connexion suivante, sans
redéploiement) :

| Variable | Effet |
|---|---|
| `MICROSOFT_ALLOWED_GROUPS` | ids de groupes séparés par des virgules — seuls leurs membres peuvent se connecter via Microsoft (message de refus explicite sinon) |
| `MICROSOFT_GROUP_ROLES` | `id-de-groupe:role,…` (roles : `gestionnaire`, `assistante`, `commercial`) — rôle attribué et **resynchronisé à chaque connexion** ; le plus élevé l'emporte si plusieurs groupes |

Prérequis Azure (une fois) : App registration → **Token configuration** →
*Add groups claim* → **Security groups**, format **Group ID** — sans quoi
le jeton ne contient pas les groupes. Les ids de groupes se trouvent dans
Entra ID → Groups → colonne *Object Id*.

Exemple :

```
MICROSOFT_ALLOWED_GROUPS=9f1c…-efi-utilisateurs
MICROSOFT_GROUP_ROLES=3a2b…-efi-gestionnaires:gestionnaire,7c4d…-efi-commerciaux:commercial
```

Limites : la revendication `groups` est plafonnée (~200 groupes par
utilisateur chez Microsoft) — largement suffisant ici ; un utilisateur
retiré des groupes garde sa session en cours (7 jours max) mais sera
refusé à sa prochaine connexion Microsoft. La connexion par email + mot
de passe n'est pas concernée par ces règles.

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
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_TENANT_ID` | *(optionnelles)* connexion Microsoft Entra ID — voir section dédiée |

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
