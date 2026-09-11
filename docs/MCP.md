# Serveur MCP — planning EFI

Permet à un commercial, en clientèle, de demander à un assistant ce qu'il est
possible de proposer, et de bloquer un créneau sans engager l'inscription.

    POST https://efi-rho.vercel.app/api/mcp

Transport « Streamable HTTP » sans session : chaque requête est autonome et
authentifiée par son propre jeton. Pas de flux SSE — aucun des deux outils
n'en a besoin.

## Mise en service

Un jeton par commercial, déclaré **côté serveur uniquement**, dans les
variables d'environnement du projet Vercel :

    MCP_TOKENS="Jean Dupont=<jeton1>,Marie Martin=<jeton2>"

- Nommer chaque jeton sert à tracer qui a pré-réservé et à en révoquer un seul
  sans couper tout le monde.
- Générer des jetons longs et aléatoires (`openssl rand -base64 32`).
- **Ne jamais les committer** : ni dans ce dépôt, ni dans un fichier de
  configuration versionné.
- Tant que `MCP_TOKENS` n'est pas renseigné, **la route est fermée** (503).
  Un déploiement sans configuration n'ouvre pas le planning.

Le code d'accès Supabase (`EFI_ACCESS_CODE`) reste côté serveur : le serveur
MCP passe par le même module que l'application (`api/_planning.js`).

Côté client, déclarer un serveur MCP distant avec l'en-tête
`Authorization: Bearer <jeton>`.

## Les deux outils

### `chercher_creneaux` — lecture seule

Paramètres : `formations` (codes du catalogue, obligatoire), `type`
(Initial / Recyclage), `a_partir_du` (AAAA-MM-JJ), `stagiaire`, `nb_options`
(1 à 3, 2 par défaut).

Renvoie un déroulé en français, prêt à être lu au client. Tient compte du
planning réel : jours ouverts, habilitations et présence des intervenants,
capacité des plateaux et de la salle, plafond de charge quotidien, pause
déjeuner, et mutualisation de la théorie par recommandation.

**Ne propose qu'un déroulé sans aucune anomalie.** S'il ne trouve rien de
tenable, il le dit plutôt que de proposer un créneau bancal.

La liste des catégories exposée dans le schéma est construite depuis le
catalogue : un produit ajouté dans Paramètres devient proposable sans
retoucher le code.

### `pre_reserver` — écrit

Paramètres : `stagiaire` (obligatoire), `formations`, `jour` (premier jour de
l'option retenue), `type`, `entreprise`, `siret`.

Crée une ligne par catégorie au statut **pré-réservée**. Les créneaux sont
bloqués, l'inscription n'est pas confirmée : une assistante la valide,
complète le n° de dossier YPAREO et le montant, puis la passe en
« confirmée ». Chaque ligne porte `reservePar` et `reserveLe`.

L'outil **recalcule** le parcours au lieu de faire confiance à ce qu'on lui
passe, et refuse si le résultat ne retombe pas sur le jour annoncé au client.
Un créneau pris entre-temps produit donc un refus explicite, jamais un
décalage silencieux.

## Limite connue : concurrence d'écriture

`efi_save_state` **remplace l'état entier**, sans écriture conditionnelle.
Deux écrivains simultanés s'écrasent donc l'un l'autre.

Atténuation en place (`gardeSavedAt`) : avant d'enregistrer, le serveur relit
l'état et refuse si l'horodatage `savedAt` a changé depuis sa lecture. La
fenêtre de collision se réduit à la durée d'une sauvegarde, et le cas courant
— une assistante qui modifie le planning pendant qu'un commercial
pré-réserve — est attrapé et signalé.

Ce n'est pas une vraie transaction. La supprimer demanderait une écriture
conditionnelle ou un ajout incrémental côté Supabase, hors de portée de ce
dépôt.

## Ce qui n'est pas couvert

- **Pas de tarification** : `pre_reserver` laisse le chiffre d'affaires vide.
  Aucune grille tarifaire par produit n'existe à ce jour.
- **Pas de péremption automatique** des pré-réservations : une ligne oubliée
  bloque son créneau jusqu'à ce qu'on l'annule à la main.
- **Jetons partagés, pas de comptes nominatifs** : la traçabilité vaut ce que
  vaut la discipline de distribution des jetons. Un rattachement aux comptes
  Entra de l'application serait plus solide.
