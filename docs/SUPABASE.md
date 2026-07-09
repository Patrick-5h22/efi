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

## Utilisation

1. Ouvrir l'application, cliquer sur le bouton **☁** (barre latérale).
2. Saisir le code d'accès : le planning distant remplace l'état local et
   chaque modification est ensuite sauvegardée automatiquement
   (indicateur : ☁✓ synchronisé, ☁… en cours, ☁⚠ erreur).
3. Re-cliquer sur ☁ pour se déconnecter (retour au mode local).

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
