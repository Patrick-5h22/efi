-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 006 — sites, zones d'évolution et matériels partagés
--
-- À exécuter dans l'éditeur SQL de Supabase, d'un bloc. Additive et
-- idempotente : relançable sans dommage.
--
-- Elle REPREND les colonnes des migrations 004 et 005 (`add column if not
-- exists`) et réécrit les deux RPC au complet : l'appliquer seule suffit.
--
-- ── Ce qu'elle ajoute ─────────────────────────────────────────────────────
--
--  planning.sites       un lieu : Périgny, Périgny II, Saintes
--    id, label, pole, position
--
--  planning.zones       un emplacement d'évolution dans un site
--    id, site_id, label, dispositifs, recos, sessions, position
--
--  planning.ressources  un matériel partagé entre zones (le porte-engin)
--    id, site_id, label, capacite, dispositifs, recos, position
--
-- ── Pourquoi « dispositifs » et « recos » en jsonb ────────────────────────
--
-- Ce sont des LISTES de codes, et deux tables de liaison (zone × dispositif,
-- ressource × dispositif) coûteraient quatre jointures aux deux RPC pour
-- reconstruire exactement les tableaux que l'application manipule. Le jsonb
-- rend le tableau tel quel. Ces listes ne sont jamais interrogées par leur
-- contenu côté base : c'est le moteur, dans le navigateur, qui décide quelle
-- zone admet quel dispositif.
--
-- Les deux listes ne font pas doublon :
--   « dispositifs » nomme des codes du catalogue un par un ;
--   « recos » admet une recommandation entière.
-- Les zones de Périgny II admettent la R482 par recommandation : elles
-- fonctionneront le jour où les catégories R482 seront créées, sans qu'il
-- faille y revenir.
--
-- ── Pourquoi « pole » est une colonne, et non une table ───────────────────
--
-- Un pôle n'a aujourd'hui aucun attribut propre — ni horaire, ni adresse, ni
-- responsable. Une table de pôles n'ajouterait qu'une jointure pour rendre la
-- chaîne qu'on vient d'y écrire. Le jour où un pôle portera quelque chose, la
-- table se crée et la colonne devient une clé étrangère.
--
-- ── Après application ─────────────────────────────────────────────────────
--
--    EFI_ACCESS_CODE='…' npm run persistance
--
-- puis, dans l'application : ouvrir Paramètres, renommer une zone ou changer
-- son nombre de sessions, attendre le ☁ au repos, et recharger (F5). La
-- modification doit revenir.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Colonnes reprises des migrations précédentes ────────────────────────

alter table planning.team_members
  add column if not exists dispo_debut date,
  add column if not exists dispo_fin   date;

alter table planning.formations
  add column if not exists test_only      boolean not null default false,
  add column if not exists charge_comptee boolean not null default true,
  add column if not exists duree_test     integer,
  add column if not exists test_surveille boolean not null default false;

-- ── 2. Tables nouvelles ────────────────────────────────────────────────────

create table if not exists planning.sites (
  id       text primary key,
  label    text not null,
  pole     text not null,
  position integer
);

create table if not exists planning.zones (
  id          text primary key,
  site_id     text not null,
  label       text not null,
  dispositifs jsonb not null default '[]'::jsonb,
  recos       jsonb not null default '[]'::jsonb,
  sessions    integer not null default 1,
  position    integer
);

create table if not exists planning.ressources (
  id          text primary key,
  site_id     text,
  label       text not null,
  capacite    integer not null default 1,
  dispositifs jsonb not null default '[]'::jsonb,
  recos       jsonb not null default '[]'::jsonb,
  position    integer
);

-- Même régime que les autres tables du schéma : RLS active, aucune politique.
-- L'accès ne passe que par les deux fonctions SECURITY DEFINER — la clé anon
-- ne lit rien directement.
alter table planning.sites      enable row level security;
alter table planning.zones      enable row level security;
alter table planning.ressources enable row level security;

-- ── 3. Écriture ────────────────────────────────────────────────────────────

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
  -- ajoutées par cette migration
  delete from planning.zones where true;
  delete from planning.ressources where true;
  delete from planning.sites where true;

  insert into planning.formations (code, label, reco, duree_initial, duree_recyclage,
    tests, capacite, position, test_only, charge_comptee, duree_test, test_surveille)
  select f->>'code', f->>'label', f->>'reco',
         (f->>'dureeInitial')::int, (f->>'dureeRecyclage')::int,
         (f->>'tests')::boolean, (f->>'capacite')::int, ord - 1,
         coalesce((f->>'testOnly')::boolean, false),
         coalesce((f->>'chargeComptee')::boolean, true),
         (nullif(f->>'dureeTest', ''))::int,
         coalesce((f->>'testSurveille')::boolean, false)
  from jsonb_array_elements(coalesce(p_state->'formations', '[]'::jsonb)) with ordinality as t(f, ord);

  -- ── Sites, zones et matériels partagés (cette migration) ────────────────
  insert into planning.sites (id, label, pole, position)
  select s->>'id', s->>'label',
         -- Un pôle absent vaut le site lui-même : isolé, donc jamais
         -- enchaînable avec un autre. C'est l'hypothèse prudente.
         coalesce(nullif(s->>'pole', ''), s->>'id'), ord - 1
  from jsonb_array_elements(coalesce(p_state->'sites', '[]'::jsonb)) with ordinality as t(s, ord);

  insert into planning.zones (id, site_id, label, dispositifs, recos, sessions, position)
  select z->>'id', z->>'siteId', z->>'label',
         coalesce(z->'dispositifs', '[]'::jsonb),
         coalesce(z->'recos', '[]'::jsonb),
         coalesce((z->>'sessions')::int, 1), ord - 1
  from jsonb_array_elements(coalesce(p_state->'zones', '[]'::jsonb)) with ordinality as t(z, ord);

  insert into planning.ressources (id, site_id, label, capacite, dispositifs, recos, position)
  select r->>'id', nullif(r->>'siteId', ''), r->>'label',
         coalesce((r->>'capacite')::int, 1),
         coalesce(r->'dispositifs', '[]'::jsonb),
         coalesce(r->'recos', '[]'::jsonb), ord - 1
  from jsonb_array_elements(coalesce(p_state->'ressources', '[]'::jsonb)) with ordinality as t(r, ord);

  insert into planning.team_members (id, name, quals, position, dispo_debut, dispo_fin)
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

-- ── 4. Lecture ─────────────────────────────────────────────────────────────

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
        'dureeTest', duree_test, 'testSurveille', test_surveille) order by position, code)
      from planning.formations), '[]'::jsonb),
    -- ajoutés par cette migration
    'sites', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'pole', pole)
        order by position, id)
      from planning.sites), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'siteId', site_id, 'label', label,
        'dispositifs', dispositifs, 'recos', recos, 'sessions', sessions)
        order by position, id)
      from planning.zones), '[]'::jsonb),
    'ressources', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'siteId', site_id, 'label', label,
        'capacite', capacite, 'dispositifs', dispositifs, 'recos', recos)
        order by position, id)
      from planning.ressources), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'quals', quals,
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

-- ── 5. Contrôle ────────────────────────────────────────────────────────────
-- Échoue bruyamment si une table, une colonne ou un champ de RPC manque.

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
    ('planning.formations.test_surveille'),
    ('planning.sites.pole'),
    ('planning.zones.dispositifs'),
    ('planning.zones.sessions'),
    ('planning.ressources.capacite')
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
    if corps not like '%duree_test%'     then absents := absents || ' duree_test';     end if;
    if corps not like '%test_surveille%' then absents := absents || ' test_surveille'; end if;
    if corps not like '%planning.zones%' then absents := absents || ' zones';          end if;
    if corps not like '%planning.sites%' then absents := absents || ' sites';          end if;
    if corps not like '%ressources%'     then absents := absents || ' ressources';     end if;
  end loop;
  if absents <> '' then
    raise exception 'RPC incomplètes, champs absents :%', absents;
  end if;

  raise notice 'Migration 006 appliquée : sites, zones et matériels partagés persistés.';
end $$;
