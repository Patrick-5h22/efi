-- 002 — Colonnes manquantes de planning.inscriptions
--
-- ────────────────────────────────────────────────────────────────────────────
--  DIAGNOSTIC
--
--  L'application enregistre 22 champs par inscription ; la table n'en porte
--  que 15. Les neuf suivants n'ont AUCUNE colonne : ils sont envoyés à chaque
--  sauvegarde, acceptés sans erreur, et perdus. Au rechargement suivant, la
--  saisie revient vide.
--
--    dossier_ypareo            n° de dossier YPAREO (saisi par l'assistante)
--    chiffre_affaires          montant facturé de la ligne
--    mode_theorie              distance | centre | presentiel
--    date_theorie_formation    théorie de la formation : date
--    debut_theorie_formation   … heure de début (minutes depuis minuit)
--    duree_theorie_centre      … durée en centre (minutes)
--    formateur_theorie_id      … formateur de la session présentielle
--    reserve_par               commercial auteur d'une pré-réservation (MCP)
--    reserve_le               … horodatage de la pré-réservation
--
--  Conséquences observées : le chiffre d'affaires « ne tient pas » ; la page
--  Chiffre d'affaires est vide pour quiconque recharge depuis la base ; la
--  théorie de la formation ne se conserve pas ; et la traçabilité des
--  pré-réservations posées par les commerciaux disparaît.
-- ────────────────────────────────────────────────────────────────────────────
--
--  ⚠ CETTE MIGRATION NE SUFFIT PAS À ELLE SEULE.
--
--  efi_save_state écrit une liste de colonnes explicite, et efi_load_state
--  reconstruit le JSON depuis ces colonnes. Tant que les deux fonctions ne
--  mentionnent pas ces colonnes, elles resteront vides — ajouter la colonne
--  ne fait que préparer le terrain. La migration 003 mettra les fonctions à
--  jour ; elle demande leur corps actuel, qui ne se trouve pas dans ce dépôt.
--
--  Cette migration-ci est en revanche ADDITIVE, IDEMPOTENTE et sans effet de
--  bord : que des colonnes nullables, aucune donnée touchée, aucun index,
--  aucune contrainte. Elle peut être appliquée seule, à tout moment.
--
--  Retour en arrière :
--    alter table planning.inscriptions
--      drop column if exists dossier_ypareo,
--      drop column if exists chiffre_affaires,
--      drop column if exists mode_theorie,
--      drop column if exists date_theorie_formation,
--      drop column if exists debut_theorie_formation,
--      drop column if exists duree_theorie_centre,
--      drop column if exists formateur_theorie_id,
--      drop column if exists reserve_par,
--      drop column if exists reserve_le;

alter table planning.inscriptions
  -- Gestion, saisie par l'assistante
  add column if not exists dossier_ypareo           text,
  add column if not exists chiffre_affaires         numeric(12, 2),

  -- Théorie de la formation. « mode_theorie » reste du texte libre, sans
  -- contrainte de valeurs : une contrainte transformerait l'ajout d'un mode
  -- côté application en échec d'écriture en production, alors que la valeur
  -- est déjà validée à la saisie. Les modes connus : distance (défaut),
  -- centre, presentiel.
  add column if not exists mode_theorie             text,
  add column if not exists date_theorie_formation   date,
  -- Heures en minutes depuis minuit, comme debut_pratique.
  add column if not exists debut_theorie_formation  integer,
  add column if not exists duree_theorie_centre     integer,
  add column if not exists formateur_theorie_id     text,

  -- Traçabilité des pré-réservations venues du terrain (serveur MCP)
  add column if not exists reserve_par              text,
  add column if not exists reserve_le               timestamptz;

-- Contrôle : les neuf colonnes doivent exister après application.
do $$
declare manquantes text;
begin
  select string_agg(c, ', ')
    into manquantes
    from unnest(array[
      'dossier_ypareo', 'chiffre_affaires', 'mode_theorie',
      'date_theorie_formation', 'debut_theorie_formation',
      'duree_theorie_centre', 'formateur_theorie_id',
      'reserve_par', 'reserve_le'
    ]) as c
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'planning' and table_name = 'inscriptions'
        and column_name = c
   );
  if manquantes is not null then
    raise exception 'colonnes toujours absentes : %', manquantes;
  end if;
  raise notice 'planning.inscriptions : les neuf colonnes sont en place.';
end $$;
