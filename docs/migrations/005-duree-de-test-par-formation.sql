-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 005 — durée de test par formation, et modalité « formation +
--                 épreuve surveillée » (seconde modalité AIPR)
--
-- À exécuter dans l'éditeur SQL de Supabase, d'un bloc. Additive et
-- idempotente : relançable sans dommage.
--
-- Elle REPREND les colonnes de la 004 (`add column if not exists`) et réécrit
-- les deux RPC au complet : l'appliquer seule suffit, même si la 004 ne l'a
-- pas été.
--
-- ── Ce qu'elle ajoute ─────────────────────────────────────────────────────
--
--  planning.formations
--    duree_test      integer  durée du test pratique, en minutes, POUR CETTE
--                             formation. NULL = prendre le paramètre global
--                             `practicalTestDuration`, qui reste le défaut.
--    test_surveille  boolean  le créneau de test est une épreuve que l'on
--                             SURVEILLE (QCM AIPR) et non un test que l'on
--                             fait passer : il n'occupe pas le testeur et ne
--                             pèse ni dans le plafond quotidien ni dans le
--                             taux d'occupation.
--
-- ── Pourquoi ──────────────────────────────────────────────────────────────
--
-- `practicalTestDuration` était un paramètre GLOBAL alors que la durée dépend
-- du dispositif : le QCM AIPR tient 2h00 là où un test R489 tient 1h00. Sans
-- `duree_test`, l'AIPR « formation + épreuve » se planifierait avec un créneau
-- d'épreuve d'une heure — ou il faudrait fausser le paramètre global pour tout
-- le monde.
--
-- NULL n'est pas 0 : vide signifie « prendre la durée générale », ce qu'un 0
-- ne dirait pas — il dirait « test de durée nulle ». La colonne est donc
-- nullable et sans valeur par défaut.
--
-- ── Après application ─────────────────────────────────────────────────────
--
--    EFI_ACCESS_CODE='…' npm run persistance
--
-- puis, dans l'application : ouvrir Paramètres, régler « Durée test » sur une
-- formation, attendre le ☁ au repos, et recharger (F5). La durée doit revenir.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Colonnes ────────────────────────────────────────────────────────────

alter table planning.team_members
  add column if not exists dispo_debut date,
  add column if not exists dispo_fin   date;

alter table planning.formations
  add column if not exists test_only      boolean not null default false,
  add column if not exists charge_comptee boolean not null default true,
  -- ajoutées par cette migration
  add column if not exists duree_test     integer,
  add column if not exists test_surveille boolean not null default false;

-- ── 2. Écriture ────────────────────────────────────────────────────────────

create or replace function public.efi_save_state(p_code text, p_state jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'planning', 'public'
as $function$
begin
  perform planning.check_access(p_code);

  insert into planning.params (id, data, updated_at)
  values (true, coalesce(p_state->'params', '{}'::jsonb), now())
  on conflict (id) do update set data = excluded.data, updated_at = now();

  insert into planning.day_presence (id, data, updated_at)
  values (true, coalesce(p_state->'dayPresence', '{}'::jsonb), now())
  on conflict (id) do update set data = excluded.data, updated_at = now();

  delete from planning.day_assignments where true;
  delete from planning.inscriptions where true;
  delete from planning.open_days where true;
  delete from planning.team_members where true;
  delete from planning.formations where true;

  insert into planning.formations (code, label, reco, duree_initial, duree_recyclage,
    tests, capacite, position, test_only, charge_comptee,
    -- ajoutés par cette migration
    duree_test, test_surveille)
  select f->>'code', f->>'label', f->>'reco',
         (f->>'dureeInitial')::int, (f->>'dureeRecyclage')::int,
         (f->>'tests')::boolean, (f->>'capacite')::int, ord - 1,
         -- Absents d'un état ancien : on retombe sur les valeurs par défaut de
         -- l'application (formation ordinaire, charge comptée).
         coalesce((f->>'testOnly')::boolean, false),
         coalesce((f->>'chargeComptee')::boolean, true),
         -- nullif avant le cast : champ absent, chaîne vide ou JSON null
         -- donnent tous NULL, c'est-à-dire « durée générale ».
         (nullif(f->>'dureeTest', ''))::int,
         coalesce((f->>'testSurveille')::boolean, false)
  from jsonb_array_elements(coalesce(p_state->'formations', '[]'::jsonb)) with ordinality as t(f, ord);

  insert into planning.team_members (id, name, quals, position,
    -- ajoutés par la migration 004
    dispo_debut, dispo_fin)
  select m->>'id', m->>'name', coalesce(m->'quals', '{}'::jsonb), ord - 1,
         (nullif(m->>'dispoDebut', ''))::date,
         (nullif(m->>'dispoFin', ''))::date
  from jsonb_array_elements(coalesce(p_state->'team', '[]'::jsonb)) with ordinality as t(m, ord);

  insert into planning.open_days (day)
  select (d#>>'{}')::date
  from jsonb_array_elements(coalesce(p_state->'openDays', '[]'::jsonb)) as t(d);

  insert into planning.day_assignments (day, formateur_id, testeur_id)
  select k::date, nullif(v->>'formateur', ''), nullif(v->>'testeur', '')
  from jsonb_each(coalesce(p_state->'dayAssignments', '{}'::jsonb)) as t(k, v)
  where nullif(v->>'formateur', '') is not null or nullif(v->>'testeur', '') is not null;

  insert into planning.inscriptions (id, stagiaire, formation, type,
    date_pratique, debut_pratique, date_theorie, date_test_pratique, debut_test_pratique,
    formateur_id, testeur_id, entreprise, siret, statut, motif_annulation,
    dossier_ypareo, chiffre_affaires, mode_theorie,
    date_theorie_formation, debut_theorie_formation, duree_theorie_centre,
    formateur_theorie_id, reserve_par, reserve_le,
    updated_at)
  select (i->>'id')::int, i->>'stagiaire', i->>'formation', coalesce(i->>'type', 'Initial'),
         (i->>'datePratique')::date, (i->>'debutPratique')::int,
         (i->>'dateTheorie')::date,
         (i->>'dateTestPratique')::date, (i->>'debutTestPratique')::int,
         nullif(i->>'formateurId', ''), nullif(i->>'testeurId', ''),
         nullif(i->>'entreprise', ''), nullif(i->>'siret', ''),
         coalesce(nullif(i->>'statut', ''), 'confirmee'),
         nullif(i->>'motifAnnulation', ''),
         nullif(i->>'dossierYpareo', ''),
         (nullif(i->>'chiffreAffaires', ''))::numeric,
         nullif(i->>'modeTheorie', ''),
         (nullif(i->>'dateTheorieFormation', ''))::date,
         (nullif(i->>'debutTheorieFormation', ''))::int,
         (nullif(i->>'dureeTheorieCentre', ''))::int,
         nullif(i->>'formateurTheorieId', ''),
         nullif(i->>'reservePar', ''),
         (nullif(i->>'reserveLe', ''))::timestamptz,
         now()
  from jsonb_array_elements(coalesce(p_state->'inscriptions', '[]'::jsonb)) as t(i);

  return jsonb_build_object('ok', true, 'savedAt', now());
end;
$function$;

-- ── 3. Lecture ─────────────────────────────────────────────────────────────

create or replace function public.efi_load_state(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'planning', 'public'
as $function$
declare
  result jsonb;
begin
  perform planning.check_access(p_code);
  select jsonb_build_object(
    'version', 1,
    'params', coalesce((select data from planning.params where id), '{}'::jsonb),
    'formations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', code, 'label', label, 'reco', reco,
        'dureeInitial', duree_initial, 'dureeRecyclage', duree_recyclage,
        'tests', tests, 'capacite', capacite,
        'testOnly', test_only, 'chargeComptee', charge_comptee,
        -- ajoutés par cette migration
        'dureeTest', duree_test, 'testSurveille', test_surveille) order by position, code)
      from planning.formations), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'quals', quals,
        -- ajoutés par la migration 004
        'dispoDebut', to_char(dispo_debut, 'YYYY-MM-DD'),
        'dispoFin', to_char(dispo_fin, 'YYYY-MM-DD')) order by position, id)
      from planning.team_members), '[]'::jsonb),
    'openDays', coalesce((
      select jsonb_agg(to_char(day, 'YYYY-MM-DD') order by day) from planning.open_days), '[]'::jsonb),
    'dayAssignments', coalesce((
      select jsonb_object_agg(to_char(day, 'YYYY-MM-DD'),
        jsonb_build_object('formateur', formateur_id, 'testeur', testeur_id))
      from planning.day_assignments), '{}'::jsonb),
    'dayPresence', coalesce((select data from planning.day_presence where id), '{}'::jsonb),
    'inscriptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'stagiaire', stagiaire, 'formation', formation, 'type', type,
        'datePratique', to_char(date_pratique, 'YYYY-MM-DD'),
        'debutPratique', debut_pratique,
        'dateTheorie', to_char(date_theorie, 'YYYY-MM-DD'),
        'dateTestPratique', to_char(date_test_pratique, 'YYYY-MM-DD'),
        'debutTestPratique', debut_test_pratique,
        'formateurId', formateur_id, 'testeurId', testeur_id,
        'entreprise', entreprise, 'siret', siret,
        'statut', statut, 'motifAnnulation', motif_annulation,
        'dossierYpareo', dossier_ypareo,
        'chiffreAffaires', chiffre_affaires::float8,
        'modeTheorie', mode_theorie,
        'dateTheorieFormation', to_char(date_theorie_formation, 'YYYY-MM-DD'),
        'debutTheorieFormation', debut_theorie_formation,
        'dureeTheorieCentre', duree_theorie_centre,
        'formateurTheorieId', formateur_theorie_id,
        'reservePar', reserve_par,
        'reserveLe', to_char(reserve_le at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ) order by id)
      from planning.inscriptions), '[]'::jsonb),
    'nextId', coalesce((select max(id) + 1 from planning.inscriptions), 1),
    'savedAt', coalesce((select updated_at from planning.params where id), now())
  ) into result;
  return result;
end;
$function$;

-- ── 4. Contrôle ────────────────────────────────────────────────────────────
-- Échoue bruyamment si une colonne manque ou si une RPC ne porte pas le champ.

do $$
declare
  manquantes text;
  corps       text;
  absents     text := '';
begin
  select string_agg(attendu, ', ') into manquantes
  from (values
    ('planning.team_members.dispo_debut'),
    ('planning.team_members.dispo_fin'),
    ('planning.formations.test_only'),
    ('planning.formations.charge_comptee'),
    ('planning.formations.duree_test'),
    ('planning.formations.test_surveille')
  ) as t(attendu)
  where not exists (
    select 1 from information_schema.columns
    where table_schema = 'planning'
      and table_name   = split_part(attendu, '.', 2)
      and column_name  = split_part(attendu, '.', 3)
  );
  if manquantes is not null then
    raise exception 'Colonnes absentes : %', manquantes;
  end if;

  for corps in
    select pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('efi_save_state', 'efi_load_state')
  loop
    if corps not like '%dispo_debut%'    then absents := absents || ' dispo_debut';    end if;
    if corps not like '%test_only%'      then absents := absents || ' test_only';      end if;
    if corps not like '%duree_test%'     then absents := absents || ' duree_test';     end if;
    if corps not like '%test_surveille%' then absents := absents || ' test_surveille'; end if;
  end loop;
  if absents <> '' then
    raise exception 'RPC incomplètes, champs absents :%', absents;
  end if;

  raise notice 'Migration 005 appliquée : durée de test par formation et épreuve surveillée persistées.';
end $$;
