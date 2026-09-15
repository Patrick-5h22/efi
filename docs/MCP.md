# Serveur MCP — planning EFI

Permet à un commercial, en clientèle, de demander à un assistant ce qu'il est
possible de proposer, et de bloquer un créneau sans engager l'inscription.

    POST https://efi-rho.vercel.app/api/mcp

Transport « Streamable HTTP » sans session : chaque requête est autonome et
authentifiée par son propre jeton. Pas de flux SSE — aucun des deux outils
n'en a besoin.

Deux authentifications cohabitent le temps de la bascule :

| | |
|---|---|
| **OAuth 2.1** | l'utilisateur se connecte avec son compte Microsoft CIPECMA. Administrable depuis une organisation Claude Team. |
| **Jeton statique** | un jeton nominatif déclaré sur Vercel. Ce qui tourne aujourd'hui. |

L'OAuth est essayé en premier, le jeton statique sert de repli. Rien ne casse
tant que la bascule n'est pas faite.

## Mise en service — jetons statiques

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

## Mise en service — OAuth 2.1

Ce mode remplace les jetons partagés par les comptes Microsoft de chacun.
L'utilisateur se connecte comme sur l'application ; les groupes Entra
autorisés et les rôles s'appliquent de la même façon, et un départ coupe
l'accès MCP sans intervention.

### L'ordre compte, et il n'est pas rattrapable à chaud

> **Le SQL d'abord, la variable ensuite.**
>
> Better Auth contrôle le schéma au démarrage et lève une exception **non
> capturée** si une table manque. `api/_auth.js` étant importé par
> `/api/state`, `/api/prefs` et `/api/auth`, mettre `MCP_OAUTH` à `1` avant
> d'avoir appliqué la migration ne casserait pas seulement le MCP : **ça
> couperait l'authentification de toute l'application**.

1. Appliquer `docs/migrations/001-planning-auth.sql` sur le Postgres Supabase.
   Huit tables dans un schéma `planning_auth` séparé ; aucune table partagée
   avec efi-placement n'est touchée.
2. Vérifier que les tables sont là.
3. Seulement alors, poser `MCP_OAUTH=1` sur Vercel et redéployer.

### Vérifier que la découverte répond

```bash
D=https://efi-rho.vercel.app
curl -s $D/.well-known/oauth-protected-resource/api/mcp | head -c 200
curl -s $D/.well-known/oauth-authorization-server/api/auth | head -c 200
curl -sI -X POST $D/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping"}' | grep -i www-authenticate
```

Les deux premières doivent renvoyer du JSON, la troisième un en-tête
`Bearer resource_metadata="…/.well-known/oauth-protected-resource/api/mcp"`.
C'est cet en-tête qui dit au client où commencer : **sans lui, le client
abandonne l'autorisation sans message exploitable.**

### Côté Claude Team

L'administrateur ajoute un connecteur personnalisé pointant sur
`https://efi-rho.vercel.app/api/mcp`. Rien d'autre à saisir : le client
s'enregistre tout seul (enregistrement dynamique, RFC 7591), puis chaque
utilisateur se connecte avec son compte CIPECMA et accorde l'accès sur
l'écran `/consent`.

Entra ID ne pouvait pas tenir ce rôle directement : le flux de Claude exige
l'enregistrement dynamique de client, qu'Entra ne propose pas publiquement.
Better Auth est donc le serveur d'autorisation, avec Entra en amont.

### Deux pièges à connaître

- **Ne tournez pas `BETTER_AUTH_SECRET`.** La clé privée de signature des
  jetons est chiffrée avec ce secret. Le changer rend les clés illisibles et
  l'émission de jetons tombe en 500. Si c'est inévitable, vider la table
  `planning_auth.jwks` dans la foulée : une nouvelle clé sera générée, et les
  jetons déjà émis seront invalidés.
- **Une URL de rappel en `http` n'est admise que pour un client « native ».**
  Un client « web » exige `https`. Claude est en `https`, donc non concerné.

### Retirer les jetons statiques

Une fois la bascule vérifiée avec au moins un commercial, supprimer
`MCP_TOKENS` de Vercel et redéployer. La route continue de fonctionner en
OAuth seul, et la traçabilité ne dépend plus de la discipline de distribution.

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

Atténuation en place (`relireSiModifie`) : avant d'enregistrer, le serveur
relit l'état et compare l'**empreinte du contenu persisté**. Si le planning a
bougé, il ne l'écrase pas — il recalcule la pré-réservation sur la version
fraîche, et `preReserver` refuse de lui-même si le jour annoncé au client n'est
plus tenable. Deux collisions de suite font un refus explicite. La modification
de l'assistante est ainsi préservée, et le commercial obtient tout de même son
créneau quand il reste libre.

> **Pourquoi pas `savedAt`.** C'était la première version, et elle refusait
> *toute* pré-réservation en production. La RPC `efi_load_state` régénère cet
> horodatage **à chaque lecture** : deux lectures consécutives n'en portent
> jamais le même, si bien que la garde voyait un conflit là où rien n'avait
> changé. Le simulacre Supabase des tests, lui, le supposait stable — c'est ce
> qui a laissé passer la panne. Il rend maintenant un horodatage neuf à chaque
> lecture, comme la vraie base.
>
> Le synchroniseur du navigateur (`js/db.js`) avait le même défaut, avec un
> autre symptôme : il croyait voir une modification venue d'un autre poste à
> chaque tour d'interrogation, et rechargeait le planning toutes les
> 45 secondes. Il compare lui aussi l'empreinte du contenu, et `savedAt` n'est
> plus utilisé nulle part pour détecter un changement.

Ce n'est pas une vraie transaction. La supprimer demanderait une écriture
conditionnelle ou un ajout incrémental côté Supabase, hors de portée de ce
dépôt.

## Ce qui n'est pas couvert

- **Pas de tarification** : `pre_reserver` laisse le chiffre d'affaires vide.
  Aucune grille tarifaire par produit n'existe à ce jour.
- **Pas de péremption automatique** des pré-réservations : une ligne oubliée
  bloque son créneau jusqu'à ce qu'on l'annule à la main.
- **Jetons partagés, pas de comptes nominatifs** — *résolu par l'OAuth, tant
  qu'il est activé.* En jeton statique, la traçabilité vaut ce que vaut la
  discipline de distribution : `reservePar` porte l'étiquette du jeton. En
  OAuth, il porte l'identité réelle, et un départ coupe l'accès par Entra.
  Cette limite ne disparaît vraiment qu'une fois `MCP_TOKENS` retiré.
