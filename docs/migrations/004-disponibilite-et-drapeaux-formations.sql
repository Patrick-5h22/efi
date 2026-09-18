-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 004 — fenêtre de disponibilité des intervenants,
--                 et fin d'une perte silencieuse sur les formations
--
-- À exécuter dans l'éditeur SQL de Supabase, d'un bloc. Additive et
-- idempotente : relançable sans dommage.
--
-- ── Ce qu'elle ajoute ─────────────────────────────────────────────────────
--
--  1. planning.team_members
--       dispo_debut    date   début de disponibilité de l'intervenant (inclus)
--       dispo_fin      date   fin de disponibilité (incluse)
--     NULL des deux côtés = disponible sans limite, ce qui reproduit
--     exactement le comportement d'avant pour les équipes déjà saisies.
--
--  2. planning.formations
--       test_only      boolean  épreuve surveillée seule (AIPR) : pas de test
--                               séparé, pas de formateur
--       charge_comptee boolean  la séance entre-t-elle dans le plafond
--                               quotidien et le taux d'occupation
--
-- ── Pourquoi le point 2, qui n'était demandé par personne ─────────────────
--
-- Les RPC posées par la migration 003 n'écrivent ni ne relisent ces deux
-- drapeaux : le `jsonb_build_object` des formations n'en porte aucune trace.
-- Une formation du CATALOGUE s'en sortait par accident — `migrate()` réinjecte
-- `testOnly` pour l'AIPR qu'il connaît. Mais une formation créée à la main
-- dans l'écran Paramètres perdait son drapeau au premier aller-retour en base,
-- sans rien dire : une épreuve surveillée redevenait une formation ordinaire,
-- avec un formateur mobilisé et un test à programmer.
--
-- Le contrôle `tests/colonnes-base.test.mjs` ne couvrait que les inscriptions,
-- d'où le silence. Il couvre désormais les formations et l'équipe.
--
-- ── Après application ─────────────────────────────────────────────────────
--
--    EFI_ACCESS_CODE='…' npm run persistance
--
-- puis, dans l'application : régler une fenêtre de disponibilité sur un
-- intervenant (écran Équipe), attendre le ☁ au repos, et recharger (F5). La
-- fenêtre doit revenir.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Colonnes ────────────────────────────────────────────────────────────

alter table planning.team_members
  add column if not exists dispo_debut date,
  add column if not exists dispo_fin   date;

alter table planning.formations
  add column if not exists test_only      boolean not null default false,
  add column if not exists charge_comptee boolean not null default true;

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
    tests, capacite, position,
    -- ajoutés par cette migration
    test_only, charge_comptee)
  select f->>'code', f->>'label', f->>'reco',
         (f->>'dureeInitial')::int, (f->>'dureeRecyclage')::int,
         (f->>'tests')::boolean, (f->>'capacite')::int, ord - 1,
         -- Absents d'un état ancien : on retombe sur les valeurs par défaut de
         -- l'application (formation ordinaire, charge comptée).
         coalesce((f->>'testOnly')::boolean, false),
         coalesce((f->>'chargeComptee')::boolean, true)
  from jsonb_array_elements(coalesce(p_state->'formations', '[]'::jsonb)) with ordinality as t(f, ord);

  insert into planning.team_members (id, name, quals, position,
    -- ajoutés par cette migration
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
        -- ajoutés par cette migration
        'testOnly', test_only, 'chargeComptee', charge_comptee) order by position, code)
      from planning.formations), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'quals', quals,
        -- ajoutés par cette migration
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
    ('planning.formations.charge_comptee')
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
    if corps not like '%dispo_debut%' then absents := absents || ' dispo_debut'; end if;
    if corps not like '%test_only%'   then absents := absents || ' test_only';   end if;
  end loop;
  if absents <> '' then
    raise exception 'RPC incomplètes, champs absents :%', absents;
  end if;

  raise notice 'Migration 004 appliquée : disponibilité des intervenants et drapeaux de formation persistés.';
end $$;
