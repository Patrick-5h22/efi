-- 003 — Rendre réellement persistants les champs perdus
--
-- ────────────────────────────────────────────────────────────────────────────
--  CE QUE CETTE MIGRATION RÉPARE
--
--  Un aller-retour sauvegarde → lecture, joué contre une réplique fidèle du
--  schéma et les fonctions de production telles quelles, perd dix choses :
--
--    dayPresence                          (le champ entier : ni table, ni
--                                          insertion, ni lecture)
--    inscriptions[].dossierYpareo         n° de dossier YPAREO
--    inscriptions[].chiffreAffaires       montant facturé
--    inscriptions[].modeTheorie           distance | centre | presentiel
--    inscriptions[].dateTheorieFormation  théorie de la formation : date
--    inscriptions[].debutTheorieFormation … heure de début
--    inscriptions[].dureeTheorieCentre    … durée en centre
--    inscriptions[].formateurTheorieId    … formateur de la session
--    inscriptions[].reservePar            commercial auteur (serveur MCP)
--    inscriptions[].reserveLe             … horodatage
--
--  Après application, le même aller-retour ne perd plus rien. C'est vérifié,
--  pas supposé.
-- ────────────────────────────────────────────────────────────────────────────
--
--  Elle est SUFFISANTE À ELLE SEULE : elle reprend les colonnes de la 002
--  (« if not exists »), donc l'appliquer sans avoir appliqué la 002 fonctionne.
--  Elle est IDEMPOTENTE : la rejouer ne fait rien de plus.
--
--  Elle est en revanche à LIRE avant d'être appliquée : elle remplace les deux
--  fonctions d'accès. Le corps ci-dessous est celui de production, auquel
--  s'ajoutent les champs manquants — rien d'autre n'a été touché, hormis
--  « savedAt », signalé plus bas.
--
--  Retour en arrière : réappliquer les définitions actuelles des deux
--  fonctions (à conserver avant d'appliquer ceci), puis
--    drop table if exists planning.day_presence;
--  Les colonnes ajoutées peuvent rester : elles ne gênent personne.

-- ── 1. Colonnes manquantes de planning.inscriptions ────────────────────────

alter table planning.inscriptions
  add column if not exists dossier_ypareo           text,
  add column if not exists chiffre_affaires         numeric(12, 2),
  add column if not exists mode_theorie             text,
  add column if not exists date_theorie_formation   date,
  add column if not exists debut_theorie_formation  integer,
  add column if not exists duree_theorie_centre     integer,
  add column if not exists formateur_theorie_id     text,
  add column if not exists reserve_par              text,
  add column if not exists reserve_le               timestamptz;

-- ── 2. Présence des intervenants par jour ──────────────────────────────────
--
-- Stockée en JSONB dans une table à une seule ligne, comme planning.params,
-- et NON en relationnel (day, person_id). La raison est une nuance de sens :
-- une journée présente dans l'objet avec une liste VIDE signifie « personne
-- ce jour-là », tandis qu'une journée absente signifie « tout le monde ».
-- Une table de couples perdrait la première — aucune ligne à écrire — et la
-- retournerait en « tout le monde présent », c'est-à-dire exactement le
-- contraire. Le moteur choisit les intervenants là-dessus.

create table if not exists planning.day_presence (
  id         boolean primary key default true,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz,
  constraint day_presence_une_ligne check (id)
);

-- Même régime que les autres tables : RLS active, aucune politique. L'accès
-- ne passe que par les fonctions SECURITY DEFINER.
alter table planning.day_presence enable row level security;

-- ── 3. Sauvegarde ──────────────────────────────────────────────────────────

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

  -- Présence par jour : l'objet est enregistré tel quel, listes vides
  -- comprises (voir la note du point 2).
  insert into planning.day_presence (id, data, updated_at)
  values (true, coalesce(p_state->'dayPresence', '{}'::jsonb), now())
  on conflict (id) do update set data = excluded.data, updated_at = now();

  delete from planning.day_assignments where true;
  delete from planning.inscriptions where true;
  delete from planning.open_days where true;
  delete from planning.team_members where true;
  delete from planning.formations where true;

  insert into planning.formations (code, label, reco, duree_initial, duree_recyclage, tests, capacite, position)
  select f->>'code', f->>'label', f->>'reco',
         (f->>'dureeInitial')::int, (f->>'dureeRecyclage')::int,
         (f->>'tests')::boolean, (f->>'capacite')::int, ord - 1
  from jsonb_array_elements(coalesce(p_state->'formations', '[]'::jsonb)) with ordinality as t(f, ord);

  insert into planning.team_members (id, name, quals, position)
  select m->>'id', m->>'name', coalesce(m->'quals', '{}'::jsonb), ord - 1
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
    -- ajoutés par cette migration
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
        'tests', tests, 'capacite', capacite) order by position, code)
      from planning.formations), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'quals', quals) order by position, id)
      from planning.team_members), '[]'::jsonb),
    'openDays', coalesce((
      select jsonb_agg(to_char(day, 'YYYY-MM-DD') order by day) from planning.open_days), '[]'::jsonb),
    'dayAssignments', coalesce((
      select jsonb_object_agg(to_char(day, 'YYYY-MM-DD'),
        jsonb_build_object('formateur', formateur_id, 'testeur', testeur_id))
      from planning.day_assignments), '{}'::jsonb),
    -- ajouté par cette migration
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
        -- ajoutés par cette migration
        'dossierYpareo', dossier_ypareo,
        -- Rendu en NOMBRE et non en texte : le navigateur compare et additionne
        -- ces montants (page Chiffre d'affaires).
        'chiffreAffaires', chiffre_affaires::float8,
        'modeTheorie', mode_theorie,
        'dateTheorieFormation', to_char(date_theorie_formation, 'YYYY-MM-DD'),
        'debutTheorieFormation', debut_theorie_formation,
        'dureeTheorieCentre', duree_theorie_centre,
        'formateurTheorieId', formateur_theorie_id,
        'reservePar', reserve_par,
        -- Même format que ce que le navigateur envoie (toISOString).
        'reserveLe', to_char(reserve_le at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ) order by id)
      from planning.inscriptions), '[]'::jsonb),
    'nextId', coalesce((select max(id) + 1 from planning.inscriptions), 1),
    -- « savedAt » rendait now() : deux lectures consécutives n'en portaient
    -- donc JAMAIS le même, et la garde d'écriture du serveur MCP y voyait un
    -- conflit permanent — plus aucune pré-réservation ne pouvait aboutir
    -- (corrigé côté application, qui compare désormais le contenu). On rend
    -- ici l'horodatage de la dernière écriture, qui est ce que le nom promet.
    'savedAt', coalesce((select updated_at from planning.params where id), now())
  ) into result;
  return result;
end;
$function$;

-- ── 5. Contrôle ────────────────────────────────────────────────────────────

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

  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'planning' and table_name = 'day_presence'
  ) then
    raise exception 'planning.day_presence absente';
  end if;

  raise notice 'Migration 003 appliquée. Vérifiez par : EFI_ACCESS_CODE=… npm run persistance';
end $$;
