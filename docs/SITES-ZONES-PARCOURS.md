# Sites, zones et parcours — spécification consolidée

> **Pourquoi ce document.** La spécification est arrivée en deux courriels
> d'Emmanuel Neau (16 et 18/09/2026) qui se contredisaient sur deux points, plus
> un fil de questions-réponses. Un seul document de référence vaut mieux que
> trois sources dont on ne sait plus laquelle fait foi. Les contradictions sont
> **tranchées** ci-dessous, avec la décision retenue et sa date.
>
> Rien de ce qui suit n'est implémenté. C'est la cible.

**Sources** — courriel « contraintes de sites et de zones à intégrer »
(16/09/2026), courriel « complément suite à réunion » (18/09/2026), réponses
d'Emmanuel du 18/09/2026.

---

## 1. Vocabulaire

Les mots sont utilisés ici dans un sens précis, parce que trois d'entre eux
désignaient la même chose dans les échanges.

| Terme | Sens | Exemple |
|---|---|---|
| **Recommandation** | Le référentiel CNAM | `R489` |
| **Catégorie** | Une déclinaison d'une recommandation | `Cat 3` |
| **Dispositif** | Recommandation + catégorie — l'unité d'habilitation et de durée | `R489 Cat 3` |
| **Parcours** | Ce qu'un stagiaire achète : une recommandation + un ou plusieurs dispositifs | `R489 1A + 3 + 5` |
| **Séance** | Ce qui se planifie : une date, une heure, un intervenant, une zone | pratique Cat 3, jeudi 09:30 |
| **Site** | Un lieu géographique | Périgny II |
| **Zone** | Un emplacement d'évolution dans un site | Zone R489 Cat 3/5 #1 |
| **Ressource** | Un matériel partagé entre zones | le porte-engin |

Distinction qui porte tout le modèle : **le parcours est un objet commercial et
administratif, la séance est le seul objet planifiable.** Un parcours n'a ni
heure ni zone ; ses séances, oui. Ne pas les fusionner.

## 2. Sites et zones

Trois sites. Le choix du site précède toute programmation : il détermine les
formations proposables et les zones disponibles.

### Périgny

| Zone | Dispositifs admis | Sessions simultanées |
|---|---|---|
| R485 / R489 1A-1B (mutualisée) | `R485 Cat 1`, `R485 Cat 2`, `R489 Cat 1A`, `R489 Cat 1B` | 1 |
| R489 Cat 3/5 **#1** | `R489 Cat 3`, `R489 Cat 5` | 1 |
| R489 Cat 3/5 **#2** | `R489 Cat 3`, `R489 Cat 5` | 1 |
| R486 | `R486 Cat A`, `R486 Cat B` | 1 |
| AIPR | `AIPR` | 1 |
| Habilitation électrique | `HAB ELEC` | 1 |

### Périgny II

**Site dédié exclusivement à la R482.** Aucune autre formation.

| Zone | Dispositifs admis | Sessions simultanées |
|---|---|---|
| R482 #1 | toutes catégories R482 | 1 |
| R482 #2 | toutes catégories R482 | 1 |

### Saintes

| Zone | Dispositifs admis | Sessions simultanées |
|---|---|---|
| AIPR | `AIPR` | 1 |
| Habilitation électrique | `HAB ELEC` | 1 |

### Un seul mécanisme, deux règles gratuites

La zone porte la liste des dispositifs qu'elle admet et son nombre de sessions
simultanées. Les deux « règles » du premier courriel n'ont alors pas besoin
d'exister :

- **Mutualisation R485 / R489 1A-1B** : une seule zone qui admet les quatre
  dispositifs, une session à la fois. L'impossibilité de programmer une R485 et
  une R489 Cat 1A en même temps **découle** du modèle.
- **Deux zones Cat 3/5 en parallèle** : deux zones à une session, chacune
  admettant Cat 3 et Cat 5. Le « 2 en parallèle sur 3 et/ou 5 indifféremment »
  découle aussi.

> Le premier courriel décrivait les zones Cat 3/5 comme **une** ligne à
> « max 2 ». Deux zones distinctes à 1 ont été retenues (confirmé le
> 18/09) : c'est la réalité physique, et cela permettra de déclarer une zone
> indisponible sans toucher à l'autre.

## 3. Pôles et déplacements dans la journée

Périgny et Périgny II sont **proches**. Saintes ne l'est pas.

| Déplacement dans la journée | Autorisé |
|---|---|
| Périgny ↔ Périgny II | **oui** |
| Périgny ou Périgny II ↔ Saintes | **non** |

Modélisation retenue : les sites sont regroupés en **pôles**, et l'ensemble des
séances d'une même personne sur une même journée doit tenir dans un seul pôle.

| Pôle | Sites |
|---|---|
| Périgny | Périgny, Périgny II |
| Saintes | Saintes |

Cette formulation évite d'avoir à modéliser des temps de trajet et des
kilomètres : une règle de pôle se vérifie par une comparaison, un temps de
trajet demanderait une matrice de distances et un paramétrage que personne ne
tiendra à jour.

**S'applique au formateur, et aussi au stagiaire** — un candidat ne peut pas
enchaîner Saintes et Périgny dans la même journée. *(à confirmer : la question
n'a été posée que pour les formateurs)*

## 4. Ressources partagées : le porte-engin

Le premier courriel présentait l'interdiction R482 « Cat A et Cat F jamais en
même temps » comme une contrainte globale au site. **Ce n'en est pas une** :

> « Un seul porte-engin accessible des 2 côtés, mais seulement une catégorie
> possible en formation ou en test. » — Emmanuel, 18/09/2026

C'est un **matériel unique partagé par les deux zones R482**. La bonne
modélisation est donc une *ressource*, pas une liste d'exclusions :

```
ressource « porte-engin »  ·  site : Périgny II  ·  capacité : 1
                              requise par : R482 Cat A, R482 Cat F
```

Pourquoi cette distinction compte : une liste d'exclusions aurait fonctionné
pour ce cas précis, puis il aurait fallu en ajouter une par matériel partagé
découvert ensuite, jusqu'à un paramétrage illisible. Une ressource se déclare,
se nomme, et s'étend sans règle nouvelle. Elle couvre aussi le fait que la
contrainte vaut **en formation comme en test** : c'est l'occupation du matériel
qui compte, pas la nature de la séance.

*À confirmer : les catégories B1, C1 et G utilisent-elles aussi le
porte-engin ?* Le premier courriel ne nommait que A et F.

## 5. Parcours

### Saisie

1. **Recommandation** d'abord (R489, R486, R485, R482, Habilitation électrique,
   AIPR).
2. **Catégories** ensuite, en **sélection multiple** : un candidat réalise
   plusieurs dispositifs d'une même recommandation en une seule programmation.

### Modèle de données

**Une ligne par dispositif, regroupées par `parcoursId`.**

| Porté par le **parcours** | Porté par la **séance** |
|---|---|
| stagiaire, entreprise, SIRET | date, heure de début, durée |
| n° de dossier YPAREO | intervenant (formateur ou testeur) |
| **chiffre d'affaires** | zone |
| recommandation, liste des catégories | statut (pré-réservé / confirmé / annulé) |
| régime (Initial / Recyclage) | |

Pourquoi ne pas faire du parcours la ligne unique : une grille affiche des
séances, et un parcours n'a pas d'heure. Faire du parcours l'objet de base
obligerait à le décomposer dans le moteur, les grilles, la synthèse, le CSV et
le MCP. Le regroupement par `parcoursId` donne les mêmes bénéfices — durées
combinées, CA, export YPAREO — pour une fraction du coût, et il est réversible.

### Export YPAREO

Le parcours est exporté **sans distinction de catégorie autrement que par un
champ texte** :

```
Formation   = R489
Commentaire = Cat. 1A, 3, 5
```

C'est une conséquence directe du regroupement : un `parcoursId` donne la
recommandation et la liste des catégories sans calcul.

### Chiffre d'affaires

**Par parcours** (décidé le 18/09/2026). Conséquence technique à ne pas
oublier : `chiffre_affaires` est aujourd'hui une **colonne de
`planning.inscriptions`**, posée par la migration 002. La déplacer vers le
parcours demandera une nouvelle migration SQL et une reprise des RPC
`efi_save_state` / `efi_load_state`.

## 6. Durées

> **Ces durées sont celles de la PRATIQUE** (confirmé le 18/09/2026). Le fil de
> discussion avait d'abord parlé de « théorie » : c'était un lapsus. Les durées
> de théorie de formation (e-learning en centre 3h30, présentiel 7h00 Initial /
> 3h30 Recyclage) et le test théorique (créneau fixe 11:00, 1h00, groupe de 12)
> sont **inchangés**.

### R489 — une catégorie

| Régime | Durée |
|---|---|
| Initial | 1h30 |
| Recyclage | 1h00 |

### R489 — deux catégories

**Somme des durées individuelles, chacune à son propre régime.** N'importe
quelle paire parmi 1A, 1B, 3, 5.

| Paire | Initial | Recyclage |
|---|---|---|
| toute paire | 3h00 | 2h00 |

> **Contradiction tranchée.** Le premier courriel annonçait un tronc commun —
> « Cat 1A/1B ramenée à 1h si le candidat a déjà une ligne Cat 3 ou Cat 5 » —
> qui donnait 2h30 en Initial pour `1A + 3`. La règle de la somme l'emporte
> (Emmanuel, 18/09 : « 1A ou 1B + (3 ou 5) ça fait 2h en recyclage, 3h en
> initial »). **Le tronc commun à deux catégories est abandonné.**

### R489 — trois catégories

**Forfait de 3h00, identique en Initial et en Recyclage**, et réparti par zone :

| Portion | Zone | Durée |
|---|---|---|
| Cat 1A **ou** 1B | zone mutualisée R485 / R489 1A-1B | 1h00 |
| Cat 3 et Cat 5 | zone R489 Cat 3/5 | 2h00 |

Deux conséquences à ne pas « corriger » plus tard, car elles sont volontaires :

- **En Initial, la troisième catégorie est gratuite en temps de plateau** :
  `3+5` vaut 3h, `1A+3+5` vaut 3h aussi. En Recyclage elle coûte 1h de plus
  (2h → 3h). C'est un argument commercial, autant que les commerciaux le
  sachent.
- **Dans un triplet, la portion 3/5 tombe à 2h**, alors que la paire `3+5`
  seule vaut 3h en Initial. C'est l'effet du forfait, assumé.

Le cas `1A + 1B + (3 ou 5)` est « en théorie impossible, mais si la demande se
présentait, ce serait 3h ». *Répartition par zone non précisée pour ce cas ;
proposition à valider : 2h sur la zone mutualisée (1h par catégorie) + 1h sur
la zone 3/5.*

**Quatre catégories : exclu, non traité.**

### R482 — durées de test

| Catégorie | Durée de test |
|---|---|
| A | 1h30 |
| B1, C1, F, G | 1h00 |

Deux conséquences techniques :

- **La R482 n'existe pas au catalogue** aujourd'hui. Les cinq catégories sont à
  créer.
- **La durée de test est aujourd'hui un paramètre global unique**
  (`practicalTestDuration: 60`, utilisé à cinq endroits du moteur). Elle doit
  passer dans le catalogue, par dispositif.

⚠️ **Les durées de PRATIQUE de la R482 (Initial / Recyclage, par catégorie) ne
sont pas connues.** C'est le seul point qui bloque encore la mise en place de la
R482.

## 7. Disponibilité des intervenants

Deux notions à conserver côte à côte :

| Notion | État | Rôle |
|---|---|---|
| **Habilitation** par dispositif (F et/ou T) | existe (`quals`) | sur quoi la personne *peut* être positionnée |
| **Présence** jour par jour | existe (`dayPresence`) | qui est là tel jour |
| **Fenêtre de disponibilité** (date début / fin) | **à ajouter** | à partir de quand, et jusqu'à quand |

Ce qui manque est le **défaut**. Aujourd'hui l'absence se saisit et la présence
est implicite : un intervenant ajouté est disponible sur toute la période. Une
nouvelle ressource embauchée en novembre ne doit pas apparaître disponible en
septembre. La fenêtre donne le défaut, la présence quotidienne garde le dernier
mot.

Emmanuel évoque aussi « voire des créneaux spécifiques » (temps partiel, demi-
journées récurrentes). *À préciser si le besoin est réel : une fenêtre de dates
est simple, un motif hebdomadaire est un autre chantier.*

**Jours d'ouverture : par site** (confirmé le 18/09). `openDays` est aujourd'hui
une liste plate ; elle devient une liste par site. *À préciser : la présence
d'un intervenant devient-elle elle aussi « présent à tel site », ou la règle de
pôle suffit-elle ?* La seconde option est plus simple et paraît suffisante.

## 8. AIPR — deux modalités

Aujourd'hui l'AIPR est modélisée en **épreuve seule** : la formation se fait à
distance, seul le QCM surveillé est planifié, et sa surveillance ne consomme pas
de temps d'intervenant (`testOnly`, `chargeComptee: false`).

Il faut que **les deux modalités coexistent et soient sélectionnables** :

| Modalité | Contenu planifié | Intervenant |
|---|---|---|
| Test seul | épreuve surveillée | testeur, charge non comptée |
| **Formation + test** | formation sur site, **puis** épreuve | formateur (charge comptée) puis testeur |

*Durée de la partie formation non précisée.*

## 9. Ce qui reste ouvert

| # | Question | Pour | Bloque |
|---|---|---|---|
| 1 | Durées de **pratique** R482 (Initial / Recyclage) par catégorie | Emmanuel | la R482 entière |
| 2 | Durée de la partie **formation** de l'AIPR « formation + test » | Emmanuel | la modalité AIPR |
| 3 | B1, C1, G utilisent-elles le **porte-engin** ? | Emmanuel | la ressource partagée |
| 4 | La liste `A, B1, C1, F, G` est-elle l'offre R482 **complète** ? | Emmanuel | le catalogue R482 |
| 5 | La règle de **pôle** s'applique-t-elle aussi aux stagiaires ? | Emmanuel | rien (défaut : oui) |
| 6 | Répartition par zone de `1A + 1B + (3 ou 5)` | Emmanuel | rien (cas théorique) |
| 7 | La **présence** devient-elle par site ? | Emmanuel | rien (défaut : non) |
| 8 | « Créneaux spécifiques » de disponibilité : besoin réel ? | Emmanuel | rien |
| 9 | Y a-t-il des règles de combinaison hors R489 (R482, R486, R485) ? | Emmanuel | rien (défaut : somme) |

## 10. Reprise des données

> « On efface tout, on est en test. » — 18/09/2026

Aucune compatibilité ascendante n'est requise : pas de site par défaut à
inventer, pas de parcours à reconstituer, pas de CA à redistribuer.

**Cette liberté a une date d'expiration** : elle vaut tant que la plateforme est
en test. Les changements structurants — parcours, sites, CA porté par le
parcours, durées par dispositif — coûtent aujourd'hui une migration jetable ;
après la mise en service, ils coûteront une reprise de données réelles, avec du
chiffre d'affaires facturé dedans. **C'est maintenant qu'il faut les faire.**

## 11. Sur l'« évolutivité »

Le dernier point du courriel demande une architecture « facilitant les
évolutions futures sans refonte majeure ». Dit ainsi, ce n'est pas vérifiable.
La version tenable, et déjà en partie vraie :

**Le paramétrage vit en base, pas dans le code.** C'est le cas aujourd'hui pour
le catalogue de formations, l'équipe, les habilitations, les jours fériés et les
horaires : tout se règle dans l'écran Paramètres sans toucher une ligne. Ce doit
l'être aussi pour les sites, les zones, les ressources partagées et les durées
combinées.

Ce qui restera du code, et qu'il ne faut pas promettre autrement : une règle
d'une **forme** nouvelle. La ressource partagée en est l'exemple — ni une zone,
ni une capacité, ni une durée. Ajouter un site, une zone, une catégorie, une
durée ou une ressource ne demandera pas de code. Inventer un type de contrainte
inédit, si.
