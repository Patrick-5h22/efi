-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 010 — retrait des anciennes colonnes de montant
--
-- À exécuter dans l'éditeur SQL de Supabase, d'un bloc. Idempotente :
-- relançable sans dommage.
--
-- Elle REPREND tout ce qu'ajoutent les migrations 004 à 009 et réécrit les
-- deux RPC au complet : l'appliquer seule suffit.
--
-- ── Ce qu'elle retire ─────────────────────────────────────────────────────
--
--  planning.inscriptions.dossier_ypareo
--  planning.inscriptions.chiffre_affaires
--
-- Ces deux colonnes ont été remplacées par planning.parcours à la migration
-- 009 — une vente, un montant. Depuis, plus rien ne les écrit ni ne les relit.
-- Elles avaient été laissées en place volontairement, le temps de constater la
-- reprise en production.
--
-- ── Le filet, et pourquoi il n'est pas décoratif ──────────────────────────
--
-- La reprise se fait CÔTÉ APPLICATION (migrate() donne un parcours à chaque
-- ligne). Elle n'a donc lieu qu'au premier chargement suivant la 009 — et rien
-- ne garantit qu'il ait eu lieu avant qu'on lance celle-ci.
--
-- Supprimer les colonnes sans vérifier détruirait alors des montants qu'aucune
-- table ne porterait encore. Cette migration REFAIT donc la reprise en SQL,
-- juste avant de supprimer : toute ligne qui porte encore un montant ou un
-- dossier sans parcours reçoit le sien. Elle est ainsi sûre quel que soit
-- l'ordre des opérations, y compris si la 009 vient d'être appliquée à
-- l'instant et que personne n'a rouvert l'application.
--
-- Le nombre de reprises effectuées est annoncé en NOTICE. Zéro est le cas
-- normal : cela veut dire que l'application avait déjà fait son travail.
--
-- ── Après application ─────────────────────────────────────────────────────
--
--    EFI_ACCESS_CODE='…' npm run persistance
--
-- Les champs « dossierYpareo » et « chiffreAffaires » doivent apparaître dans
-- la section « Champs des parcours », et nulle part ailleurs.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Parcours ───────────────────────────────────────────────────────────────

create table if not exists planning.parcours (
  id               integer primary key,
  dossier_ypareo   text,
  chiffre_affaires numeric,
  position         integer
);

alter table planning.inscriptions
  add column if not exists parcours_id integer;

-- Même régime que les autres tables du schéma : RLS active, aucune politique.
alter table planning.parcours enable row level security;

-- ── Filet : reprise des montants restés sur les lignes ─────────────────────

do $$
declare
  reprises int := 0;
  base_id  int;
begin
  -- Si les colonnes n'existent plus, la 010 a déjà tourné : rien à reprendre.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'planning' and table_name = 'inscriptions'
      and column_name = 'chiffre_affaires'
  ) then
    raise notice 'Colonnes déjà retirées : rien à reprendre.';
  else
    select coalesce(max(id), 0) into base_id from planning.parcours;

    -- Un parcours par ligne qui porte encore un montant ou un dossier sans en
    -- avoir un. Un pour un, comme la reprise côté application : regrouper
    -- d'office les lignes d'un même stagiaire serait une interprétation.
    execute $sql$
      with orphelines as (
        select id,
               row_number() over (order by id) as rang,
               dossier_ypareo,
               chiffre_affaires
        from planning.inscriptions
        where parcours_id is null
          and (chiffre_affaires is not null or nullif(dossier_ypareo, '') is not null)
      ), creees as (
        insert into planning.parcours (id, dossier_ypareo, chiffre_affaires, position)
        select $1 + rang, nullif(dossier_ypareo, ''), chiffre_affaires, $1 + rang
        from orphelines
        returning id
      )
      update planning.inscriptions i
      set parcours_id = $1 + o.rang
      from orphelines o
      where i.id = o.id
    $sql$ using base_id;

    get diagnostics reprises = row_count;
    if reprises > 0 then
      raise notice 'Reprise de secours : % ligne(s) portaient encore un montant sans parcours.', reprises;
    else
      raise notice 'Aucune reprise nécessaire : l''application avait déjà fait son travail.';
    end if;
  end if;
end $$;

-- ── Suppression ────────────────────────────────────────────────────────────

alter table planning.inscriptions
  drop column if exists dossier_ypareo,
  drop column if exists chiffre_affaires;

-- ── Jours d'ouverture : (jour, site) ───────────────────────────────────────

alter table planning.open_days
  add column if not exists site_id text;

do $$
begin
  -- Reprise : un jour ouvert « tout court » devient ouvert sur chaque site.
  if exists (select 1 from planning.sites) then
    -- La clé primaire porte encore sur le seul jour : la dupliquer par site
    -- exige de la retirer d'abord.
    alter table planning.open_days drop constraint if exists open_days_pkey;

    insert into planning.open_days (day, site_id)
    select o.day, s.id
    from (select distinct day from planning.open_days where site_id is null) o
    cross join planning.sites s
    on conflict do nothing;

    delete from planning.open_days where site_id is null;

    alter table planning.open_days alter column site_id set not null;
    if not exists (
      select 1 from pg_constraint where conname = 'open_days_pkey'
        and conrelid = 'planning.open_days'::regclass
    ) then
      alter table planning.open_days add constraint open_days_pkey primary key (day, site_id);
    end if;
  else
    raise notice 'Aucun site enregistré : les jours d''ouverture sont laissés tels quels. '
      'La première sauvegarde de l''application les réécrira par site.';
  end if;
end $$;

alter table planning.inscriptions
  -- ajoutées par cette migration
  add column if not exists zone_id      text,
  add column if not exists zone_test_id text;

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
  -- Après les inscriptions : elles portent parcours_id.
  delete from planning.parcours where true;
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

  -- openDays est désormais { site: [jours] }. Le « distinct » n'est pas une
  -- précaution de style : la clé primaire est le couple, et un même jour
  -- listé deux fois pour un site ferait échouer la sauvegarde entière.
  insert into planning.open_days (day, site_id)
  select distinct (d#>>'{}')::date, k
  from jsonb_each(coalesce(p_state->'openDays', '{}'::jsonb)) as t(k, v),
       jsonb_array_elements(v) as u(d)
  where jsonb_typeof(v) = 'array';

  insert into planning.day_assignments (day, formateur_id, testeur_id)
  select k::date, nullif(v->>'formateur', ''), nullif(v->>'testeur', '')
  from jsonb_each(coalesce(p_state->'dayAssignments', '{}'::jsonb)) as t(k, v)
  where nullif(v->>'formateur', '') is not null or nullif(v->>'testeur', '') is not null;

  insert into planning.parcours (id, dossier_ypareo, chiffre_affaires, position)
  select (p->>'id')::int,
         nullif(p->>'dossierYpareo', ''),
         (nullif(p->>'chiffreAffaires', ''))::numeric,
         ord - 1
  from jsonb_array_elements(coalesce(p_state->'parcours', '[]'::jsonb)) with ordinality as t(p, ord);

  insert into planning.inscriptions (id, stagiaire, formation, type,
    date_pratique, debut_pratique, date_theorie, date_test_pratique, debut_test_pratique,
    formateur_id, testeur_id, zone_id, zone_test_id, parcours_id,
    entreprise, siret, statut, motif_annulation,
    mode_theorie,
    date_theorie_formation, debut_theorie_formation, duree_theorie_centre,
    formateur_theorie_id, reserve_par, reserve_le,
    updated_at)
  select (i->>'id')::int, i->>'stagiaire', i->>'formation', coalesce(i->>'type', 'Initial'),
         (i->>'datePratique')::date, (i->>'debutPratique')::int,
         (i->>'dateTheorie')::date,
         (i->>'dateTestPratique')::date, (i->>'debutTestPratique')::int,
         nullif(i->>'formateurId', ''), nullif(i->>'testeurId', ''),
         nullif(i->>'zoneId', ''), nullif(i->>'zoneTestId', ''),
         (nullif(i->>'parcoursId', ''))::int,
         nullif(i->>'entreprise', ''), nullif(i->>'siret', ''),
         coalesce(nullif(i->>'statut', ''), 'confirmee'),
         nullif(i->>'motifAnnulation', ''),
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
    -- ajouté par cette migration
    'parcours', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'dossierYpareo', dossier_ypareo,
        'chiffreAffaires', chiffre_affaires::float8) order by position, id)
      from planning.parcours), '[]'::jsonb),
    'nextParcoursId', coalesce((select max(id) + 1 from planning.parcours), 1),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'quals', quals,
        'dispoDebut', to_char(dispo_debut, 'YYYY-MM-DD'),
        'dispoFin', to_char(dispo_fin, 'YYYY-MM-DD')) order by position, id)
      from planning.team_members), '[]'::jsonb),
    'openDays', coalesce((
      select jsonb_object_agg(site_id, jours)
      from (
        select site_id, jsonb_agg(to_char(day, 'YYYY-MM-DD') order by day) as jours
        from planning.open_days
        where site_id is not null
        group by site_id
      ) t), '{}'::jsonb),
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
        'zoneId', zone_id, 'zoneTestId', zone_test_id,
        'entreprise', entreprise, 'siret', siret,
        'statut', statut, 'motifAnnulation', motif_annulation,
        'parcoursId', parcours_id,
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
    ('planning.ressources.capacite'),
    ('planning.inscriptions.zone_id'),
    ('planning.inscriptions.zone_test_id'),
    ('planning.open_days.site_id'),
    ('planning.parcours.chiffre_affaires'),
    ('planning.inscriptions.parcours_id')
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
    if corps not like '%zone_test_id%'   then absents := absents || ' zone_test_id';   end if;
    if corps not like '%open_days (day, site_id)%'
       and corps not like '%site_id, jours%' then absents := absents || ' open_days.site_id'; end if;
    if corps not like '%parcours_id%' then absents := absents || ' parcours_id'; end if;
    if corps not like '%planning.parcours%' then absents := absents || ' parcours'; end if;
  end loop;
  if absents <> '' then
    raise exception 'RPC incomplètes, champs absents :%', absents;
  end if;

  -- Contrôle inverse : les anciennes colonnes doivent avoir DISPARU. Les
  -- laisser vivre après cette migration signifierait que la suppression a
  -- échoué en silence, et qu'une source de vérité morte traîne encore.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'planning' and table_name = 'inscriptions'
      and column_name in ('dossier_ypareo', 'chiffre_affaires')
  ) then
    raise exception 'Les anciennes colonnes de montant sont toujours là.';
  end if;

  -- Et rien ne doit plus porter un montant sans parcours.
  if exists (select 1 from planning.inscriptions where parcours_id is null
             and exists (select 1 from planning.parcours)) then
    raise notice 'Des lignes sans parcours subsistent : normales si elles n''ont jamais porté de montant.';
  end if;

  raise notice 'Migration 010 appliquée : anciennes colonnes de montant retirées.';
end $$;
