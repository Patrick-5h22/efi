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

## Connexion permanente

L'application est conçue pour rester connectée en continu :

- **Auto-connexion** : sur le site déployé, le code d'accès est injecté au
  déploiement (secret GitHub `EFI_ACCESS_CODE` → `js/access.js`, le dépôt ne
  contient qu'un gabarit vide). Aucune saisie : l'application démarre
  connectée. Sur un poste sans code injecté, premier clic sur **☁** + code,
  mémorisé ensuite.
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

## Limites connues (v1)

- Écriture « dernier sauvé gagne » : pas de fusion si deux postes
  modifient en même temps (usage prévu : un planificateur à la fois).
- Le code d'accès est partagé (pas de comptes individuels). Pour des
  comptes nominatifs et un historique par utilisateur, brancher
  Supabase Auth serait l'étape suivante.
