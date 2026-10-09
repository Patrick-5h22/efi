# Sites, zones et parcours — spécification consolidée

> **Pourquoi ce document.** La spécification est arrivée en deux courriels
> d'Emmanuel Neau (16 et 18/09/2026) qui se contredisaient sur deux points, plus
> un fil de questions-réponses. Un seul document de référence vaut mieux que
> trois sources dont on ne sait plus laquelle fait foi. Les contradictions sont
> **tranchées** ci-dessous, avec la décision retenue et sa date.
>
> **État d'avancement.** Ce document reste la cible. Tout ce qu'il décrit est
> désormais en place, à l'exception de ce que les §§ marquent comme ouvert :
> la fenêtre de disponibilité et les jours d'ouverture par site (§ 7), les deux
> modalités AIPR et la durée de test par dispositif (§ 6 et § 8), les sites,
> zones et matériels partagés (§ 2 à 4), et les **parcours** (§ 5). Ce qui
> reste tient aux réponses attendues d'Emmanuel, listées au § 9.

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

> **Fait.** `sites`, `zones` et `ressources` existent dans l'état, sont
> persistés (migrations 006 et 007) et se règlent dans l'écran Paramètres
> (§ 1 bis). Le moteur affecte une zone à chaque séance, refuse celles qui ne
> tiennent pas — « toutes les zones … sont occupées à cette heure », en les
> nommant — et applique la règle de pôle du § 3. Une zone peut être imposée à
> la main sur une inscription (`zoneId` / `zoneTestId`), comme un intervenant ;
> vide, c'est automatique. La zone retenue s'affiche dans la liste des
> inscriptions et dans l'infobulle des grilles.
>
> **Deux points à connaître.** Une séance ne compte pour une session de zone
> qu'une fois : deux candidats, même dispositif, même intervenant, même heure
> de début sont une seule séance — c'est la Cat 3 et ses deux chariots. Et une
> **épreuve surveillée** (AIPR) reçoit une zone, donc un site, mais ne consomme
> pas de session : un QCM se tient dans une salle dont l'outil ne modélise pas
> les places, comme il ne modélise déjà ni le temps du surveillant ni sa charge.
>
> **Pas fait :** les jours d'ouverture restent une liste plate, et la saisie ne
> demande pas le site — elle propose les plateaux, site nommé.

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

> **Fait.** L'anomalie nomme la personne et les deux lieux : « MEDAN Dominique :
> deux sites trop éloignés le même jour (Périgny et Saintes) ». Elle porte sur
> **toutes** les séances de la journée, car c'est la journée qui ne tient pas,
> pas l'une des séances.
>
> Le pôle déjà engagé dans la journée n'est pas une préférence de
> l'affectation automatique mais une **borne**. Traité en préférence, le repli
> envoyait le second candidat à Saintes dès que la zone de Périgny était
> prise : l'affectation créait elle-même le déplacement qu'elle est censée
> interdire, puis le signalait. Mieux vaut annoncer « toutes les zones sont
> occupées » — c'est la vérité, et c'est réparable.
>
> La théorie (test théorique, e-learning en centre, présentiel) n'entre pas
> dans la règle : ces séances n'ont pas de zone, donc pas de site.

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

### La contrainte est à la JOURNÉE, pas au créneau

Précision décisive, obtenue le 06/10/2026 :

> « La seule contrainte c'est de ne pas avoir le même jour une formation +
> tests cat A et une autre formation + tests catégorie F. » — Benoit
>
> « Il ne faut pas de caces R482 A et F le même jour, **ni le matin ni
> l'après-midi**. » — Benoit, 09/10/2026, en réponse à une demande de
> confirmation explicite

Un matériel partagé ordinaire interdit deux séances **qui se chevauchent**.
Une Cat A le matin et une Cat F l'après-midi ne se chevauchent pas, et sont
pourtant interdites : le porte-engin ne se reconfigure pas d'une catégorie à
l'autre dans la journée. C'est une contrainte **physique**, pas un conflit
d'agenda — et le modèle, qui ne connaissait que le créneau, était trop
permissif sans que rien ne le dise.

D'où un drapeau porté par le matériel, `exclusifJour`, et non une règle
écrite en dur pour le porte-engin : le jour où un autre matériel se comporte
pareil, il se déclare. Son défaut est `false`, soit le comportement de tous
les matériels existants.

**B1 et C1 ne sont pas concernées** et tournent en parallèle d'une Cat A comme
d'une Cat F. La catégorie G ne figure pas au catalogue.

> **Fait, et effectif.** Les quatre catégories R482 sont au catalogue depuis le
> 08/10/2026 : la contrainte s'applique pour de bon. L'avertissement « sans
> effet » de l'écran Paramètres s'est éteint de lui-même, sans qu'on touche
> ni aux zones ni au matériel — c'était l'intérêt de viser une recommandation
> plutôt que d'énumérer des codes.
>
> Quand la journée est prise, l'anomalie **ne parle pas d'heure** : se
> plaindre aussi du créneau laisserait croire qu'un décalage suffirait.

## 5. Parcours

### Saisie

1. **Recommandation** d'abord (R489, R486, R485, R482, Habilitation électrique,
   AIPR).
2. **Catégories** ensuite, en **sélection multiple** : un candidat réalise
   plusieurs dispositifs d'une même recommandation en une seule programmation.

> **Fait.** Bouton **➕ Parcours** sur l'écran Inscriptions. Recommandation,
> catégories cochées, régime, date de départ — le moteur propose l'ensemble des
> séances (jusqu'à deux options de dates), et l'enregistrement pose exactement
> ce qui est affiché.
>
> Rien de nouveau dans le moteur : c'est `suggestParcours`, celui-là même qui
> sert le serveur MCP depuis le début. L'assistante n'avait pas de bouton pour
> y accéder, voilà tout. La saisie ligne par ligne reste et reste juste — elle
> sert à corriger, déplacer, imposer un formateur.
>
> Deux détails qui comptent : la liste des recommandations est **déduite du
> catalogue** (une formation créée dans Paramètres y apparaît d'elle-même,
> là où une liste séparée aurait divergé), et toute modification d'un champ
> **invalide la proposition affichée** — l'enregistrer après avoir décoché une
> catégorie poserait autre chose que ce qui est montré.

### Modèle de données

**Une ligne par dispositif, regroupées par `parcoursId`.**

| Porté par le **parcours** | Porté par la **séance** |
|---|---|
| n° de dossier YPAREO | stagiaire, entreprise, SIRET |
| **chiffre d'affaires** | date, heure de début, durée |
| | intervenant (formateur ou testeur), zone |
| | régime, statut (pré-réservé / confirmé / annulé) |

> **Fait — avec un écart assumé par rapport au tableau d'origine.** Le parcours
> ne porte QUE le montant et le n° de dossier : ce qui ne doit exister qu'une
> fois. Stagiaire, entreprise, recommandation, liste des catégories et régime
> restent sur les séances et se **déduisent**.
>
> Les stocker aussi sur le parcours aurait créé une seconde source de vérité,
> qui finit toujours par contredire la première — un parcours annoncé
> « R489 1A, 3, 5 » alors qu'une des trois lignes a été supprimée depuis.
> Déduire ne coûte rien et ne peut pas diverger. C'est d'ailleurs l'esprit du
> paragraphe ci-dessous : les mêmes bénéfices pour une fraction du coût.
>
> Le parcours se choisit dans le formulaire d'inscription : « nouveau
> parcours » par défaut, ou une vente déjà ouverte pour ce stagiaire. Retirer
> la dernière séance d'un parcours le retire avec elle — un montant sans
> séance ne serait visible nulle part tout en continuant de compter.

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

> **Fait.** Bouton **⬇ YPAREO** sur l'écran Inscriptions : une ligne par
> parcours, les séances annulées exclues, un parcours entièrement annulé omis.
> Les catégories partent en texte (« Cat. 1A, Cat. 3, Cat. 5 ») ; un dispositif
> sans catégorie — habilitation électrique, AIPR — garde son nom plutôt qu'un
> « Cat. » vide. Un parcours mêlant deux recommandations ou deux régimes les
> nomme tous les deux plutôt que d'en élire un.

### Chiffre d'affaires

**Par parcours** (décidé le 18/09/2026).

> **Fait** — migration 009. Le montant se saisit une fois pour toute la vente.
>
> Ce que cela répare : le montant était porté par la LIGNE. Un dossier couvrant
> trois catégories occupait trois lignes, et le même montant recopié sur
> chacune comptait **trois fois**. Un contrôle signalait le cas sans pouvoir le
> corriger — il ne savait pas laquelle des trois portait la vérité. Ce contrôle
> a disparu avec sa cause.
>
> **Conséquence sur la ventilation, assumée.** Un parcours « R489 Cat 1A + 3
> + 5 » vendu 900 € ne se répartit pas entre ses trois catégories : au prorata
> des durées ? à parts égales ? Aucune règle n'a été donnée, et en inventer une
> serait pire que de ne pas ventiler. L'écran CA ventile donc par
> **recommandation**, qui est ce qui se vend.
>
> **Reprise** : chaque ligne existante reçoit son propre parcours, un pour un.
> Regrouper d'office les lignes d'un même stagiaire aurait été une
> interprétation — rien ne dit que deux lignes du même candidat ont été vendues
> ensemble. Le total du chiffre d'affaires est inchangé à l'euro près.

## 6. Durées

> **Ces durées sont celles de la PRATIQUE** (confirmé le 18/09/2026). Le fil de
> discussion avait d'abord parlé de « théorie » : c'était un lapsus. Les durées
> de théorie de formation (e-learning en centre 3h30, présentiel 7h00 Initial /
> 3h30 Recyclage) et le test théorique (créneau fixe 11:00, 1h00, groupe de 12)
> sont **inchangés**.

> **Qui surveille le test théorique.** « Il faut quelqu'un pour surveiller,
> c'est le testeur qui fera passer les tests pratique l'après-midi » (Benoit,
> 09/10/2026). Le créneau de 11:00 et sa durée d'1h00 — quel que soit le
> nombre de candidats — étaient déjà ceux du modèle ; ce qui manquait, c'est
> que le surveillant et le testeur de l'après-midi soient la **même personne**.
>
> Les deux étaient choisis par des passes distinctes et pouvaient diverger.
> Avec un seul formateur dans la journée, elles tombaient d'accord par hasard ;
> avec deux sessions en parallèle — les deux plateaux de Périgny II — elles
> mobilisaient trois personnes là où une suffit. Le testeur de l'après-midi
> suit désormais le surveillant du matin, par **préférence** : s'il n'est pas
> habilité au dispositif ou déjà pris, le choix ordinaire reprend la main.

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
- ~~**La durée de test est aujourd'hui un paramètre global unique**
  (`practicalTestDuration: 60`, utilisé à cinq endroits du moteur). Elle doit
  passer dans le catalogue, par dispositif.~~ **Fait** : chaque formation porte
  sa `dureeTest` (colonne « Durée test » dans Paramètres) ; vide, le paramètre
  global s'applique et reste le défaut. Les durées R482 ci-dessus se saisissent
  donc sans toucher au code, dès que les catégories seront créées.

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

**Jours d'ouverture : par site** (confirmé le 18/09). *À préciser : la présence
d'un intervenant devient-elle elle aussi « présent à tel site », ou la règle de
pôle suffit-elle ?* La seconde option est plus simple et paraît suffisante.

> **Fait.** `openDays` est passé d'une liste plate à `{ site: [jours] }`
> (migration 008 : `planning.open_days` devient une table de couples
> `(jour, site)`). L'écran **Jours EFI** porte un onglet par site, et le
> tableau du dessous nomme, pour chaque journée, les sites qui ouvrent.
>
> Le contrôle général « jour non ouvert (EFI) » ne voit que **l'union** des
> sites — c'est la bonne mesure pour le tableau de bord, une journée où Saintes
> seul ouvre étant bien une journée d'activité. C'est précisément ce qui rend
> le contrôle par site nécessaire : sans lui, une R482 passait un mercredi où
> Périgny ouvre et Périgny II non. L'anomalie nomme les lieux qui auraient pu
> l'accueillir.
>
> L'affectation automatique en tient compte : une habilitation électrique se
> tenant à Périgny **ou** à Saintes bascule sur celui qui ouvre, au lieu
> d'échouer. Et la saisie guidée ne propose plus, pour une séance de plateau,
> les journées où aucun site du dispositif n'ouvre.
>
> La **présence** des intervenants reste par journée, pas par site : la règle
> de pôle suffit, comme pressenti ci-dessus.

## 8. AIPR — deux modalités

Aujourd'hui l'AIPR est modélisée en **épreuve seule** : la formation se fait à
distance, seul le QCM surveillé est planifié, et sa surveillance ne consomme pas
de temps d'intervenant (`testOnly`, `chargeComptee: false`).

**Fait.** Les deux modalités coexistent au catalogue et se choisissent dans une
liste unique (colonne « Séance » de l'écran Paramètres) :

| Modalité | Contenu planifié | Intervenant |
|---|---|---|
| `AIPR` — épreuve surveillée | l'épreuve seule | testeur, charge non comptée |
| `AIPR-FORM` — formation + épreuve | formation sur site, **puis** épreuve | formateur **nommé mais libre**, puis testeur (hors charge) |

La formation d'`AIPR-FORM` est elle aussi **hors charge** depuis le
09/10/2026 : « le stagiaire sera seul devant son poste — le formateur lui
donne la tablette en début de session et le laisse en autonomie dans la
salle » (Benoit). Un formateur reste donc nommé, puisque quelqu'un en répond,
mais son agenda n'est pas bloqué et ces 3h00 ne pèsent ni dans son plafond
quotidien ni dans le taux d'occupation.

Compter la charge et bloquer l'agenda sont les deux faces d'une même
question — *cette personne est-elle occupée ?* — et le moteur les traite
désormais ensemble : une séance à charge non comptée ne réserve plus son
intervenant. La surveillance d'épreuve appliquait déjà cette règle ; elle
vaut maintenant pour toute séance, quel que soit le dispositif.

*Limite assumée.* La remise de la tablette en début de séance n'est pas
modélisée : rien n'empêche le moteur de placer ce formateur ailleurs à 08h00
pile. La règle de pôle interdit déjà le saut entre sites dans la journée ; au
sein d'un même site, cela reste à l'œil de l'assistante.

Trois drapeaux (`testOnly`, `tests`, `testSurveille`) décrivaient en réalité
trois modalités, et seules trois combinaisons ont un sens. Elles sont exposées
comme un choix unique — « Formation », « Épreuve surveillée », « Formation +
épreuve surveillée » — ce qui rend inatteignable l'état incohérent d'une épreuve
seule réclamant par ailleurs un test séparé.

Deux conséquences qui découlent du modèle, et non de règles ajoutées :

- l'épreuve occupe le **créneau de test** de la ligne, avec sa propre durée
  (`dureeTest: 120`) — c'est ce qui exigeait la durée par dispositif du §6 ;
- une épreuve surveillée **est** l'examen du dispositif : aucun test théorique
  n'est réclamé à côté. L'AIPR se sanctionne par son seul QCM.

⚠️ **La durée de la partie formation n'est pas arrêtée.** 3h30 tient lieu de
valeur d'attente, alignée sur l'e-learning en centre ; elle se corrige dans
Paramètres sans toucher au code. La durée de l'**épreuve** est connue : 2h00.

## 9. Ce qui reste ouvert

Les quatre premières ont été tranchées par **Benoit** les 06 et 09/10/2026 —
elles étaient adressées à Emmanuel, qui les lui a transmises.

| # | Question | Réponse | État |
|---|---|---|---|
| 1 | Durées de **pratique** R482 (Initial / Recyclage) par catégorie | 3h00 / 3h00 partout ; test 1h30 en Cat A, 1h00 ailleurs ; 3 candidats max | **au catalogue** |
| 2 | Durée de la partie **formation** de l'AIPR « formation + épreuve » | 3h00, en autonomie — aucun intervenant mobilisé | **fait** |
| 3 | B1, C1, G utilisent-elles le **porte-engin** ? | non, A et F seulement — et l'exclusion est à la journée | **fait** |
| 4 | La liste `A, B1, C1, F, G` est-elle l'offre R482 **complète** ? | sans G : « pas de formation EFI sur cette catégorie » | **fait** |

Restent ouvertes :

| # | Question | Pour | Bloque |
|---|---|---|---|
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
