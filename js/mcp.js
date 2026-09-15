// Outils MCP à destination des commerciaux en clientèle.
//
// Logique pure, sans HTTP ni accès réseau : api/mcp.js ne fait que
// l'authentification, le transport JSON-RPC et l'accès à la base. Tout ce qui
// décide se trouve ici, et se teste donc sans serveur.
//
// Deux outils :
//   chercher_creneaux  — lecture seule, répond « voici ce qu'on peut faire »
//   pre_reserver       — pose une PRÉ-réservation, jamais une confirmation
//
// Le déroulé est rendu en français lisible : le commercial le lit au client.

import { migrate } from './store.js';
import { suggestParcours, computeSchedule } from './engine.js';
import { formationByCode } from './config.js';
import { fmtTime, fmtDateDay } from './dates.js';

const TYPES = ['Initial', 'Recyclage'];
const MAX_OPTIONS = 3;

// ---------------------------------------------------------------------------
// Définitions exposées par tools/list. Le catalogue étant paramétrable, la
// liste des codes est construite depuis l'état : un produit ajouté dans
// Paramètres devient immédiatement proposable, sans retoucher ce fichier.
// ---------------------------------------------------------------------------
export function outils(state) {
  const codes = (state.formations || []).map((f) => f.code);
  const catalogue = (state.formations || [])
    .map((f) => `${f.code} (${f.label})`).join(', ');

  const formationsSchema = {
    type: 'array',
    items: { type: 'string', enum: codes },
    minItems: 1,
    description: `Codes des catégories demandées. Catalogue : ${catalogue}.`,
  };

  return [
    {
      name: 'chercher_creneaux',
      description: 'Propose des dates de formation possibles pour un stagiaire et une ou '
        + 'plusieurs catégories, à partir d\'une date. Tient compte du planning réel : jours '
        + 'ouverts, habilitations et présence des intervenants, capacité des plateaux et de la '
        + 'salle, plafond de charge quotidien et pause déjeuner. Ne propose qu\'un déroulé '
        + 'tenable en l\'état — jamais un créneau qui créerait une anomalie. Lecture seule.',
      inputSchema: {
        type: 'object',
        properties: {
          formations: formationsSchema,
          type: { type: 'string', enum: TYPES, description: 'Initial ou Recyclage. Par défaut : Initial.' },
          a_partir_du: { type: 'string', description: 'Date au format AAAA-MM-JJ. Par défaut : dès que possible.' },
          stagiaire: { type: 'string', description: 'Nom du stagiaire, s\'il est connu.' },
          nb_options: { type: 'integer', minimum: 1, maximum: MAX_OPTIONS, description: `Nombre de dates à proposer (1 à ${MAX_OPTIONS}, 2 par défaut).` },
        },
        required: ['formations'],
      },
    },
    {
      name: 'pre_reserver',
      description: 'Pose une PRÉ-RÉSERVATION sur une des dates renvoyées par chercher_creneaux. '
        + 'Le créneau est bloqué mais l\'inscription n\'est pas confirmée : une assistante la '
        + 'validera. Repasse par le même calcul et refuse si le planning a changé depuis la '
        + 'recherche. Exige le nom du stagiaire.',
      inputSchema: {
        type: 'object',
        properties: {
          stagiaire: { type: 'string', description: 'Nom du stagiaire. Obligatoire.' },
          formations: formationsSchema,
          type: { type: 'string', enum: TYPES },
          jour: { type: 'string', description: 'Premier jour de l\'option retenue, au format AAAA-MM-JJ.' },
          entreprise: { type: 'string', description: 'Entreprise du stagiaire.' },
          siret: { type: 'string', description: 'SIRET de l\'entreprise.' },
        },
        required: ['stagiaire', 'formations', 'jour'],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// chercher_creneaux
// ---------------------------------------------------------------------------
export function chercherCreneaux(brut, args = {}) {
  const state = migrate(structuredClone(brut));
  const { formations, type } = valider(state, args);
  const stagiaire = (args.stagiaire || '').trim() || '(prospect)';
  const aPartirDu = normaliserDate(args.a_partir_du);
  const nbOptions = borner(args.nb_options, 1, MAX_OPTIONS, 2);

  const options = suggestParcours(state, {
    stagiaire, formations, type, aPartirDu, maxOptions: nbOptions,
  });

  return {
    options: options.map((o) => ({
      jour: o.jours[0],
      jours: o.jours,
      seances: o.seances,
    })),
    texte: rendreOptions(state, { formations, type, aPartirDu, options }),
  };
}

// ---------------------------------------------------------------------------
// pre_reserver — recalcule plutôt que de faire confiance à ce qu'on lui passe
// ---------------------------------------------------------------------------
export function preReserver(brut, args = {}, { par = null } = {}) {
  const state = migrate(structuredClone(brut));
  const { formations, type } = valider(state, args);

  const stagiaire = (args.stagiaire || '').trim();
  if (!stagiaire) throw erreur('Le nom du stagiaire est obligatoire pour pré-réserver.');

  const jour = normaliserDate(args.jour);
  if (!jour) throw erreur('Le jour de l’option retenue est obligatoire (format AAAA-MM-JJ).');

  const [option] = suggestParcours(state, {
    stagiaire, formations, type, aPartirDu: jour, maxOptions: 1,
  });
  if (!option) {
    throw erreur(`Plus aucun créneau disponible à partir du ${fmtDateDay(jour)}. `
      + 'Relancez la recherche : le planning a probablement changé.');
  }
  // Le recalcul doit retomber sur le jour annoncé au client. Sinon le planning
  // a bougé, et pré-réserver poserait autre chose que ce qui a été proposé.
  if (option.jours[0] !== jour) {
    throw erreur(`Le ${fmtDateDay(jour)} n’est plus disponible — le premier créneau libre est `
      + `désormais le ${fmtDateDay(option.jours[0])}. Relancez la recherche avant de pré-réserver.`);
  }

  const entreprise = (args.entreprise || '').trim() || null;
  const siret = (args.siret || '').trim() || null;

  const suivant = structuredClone(state);
  const posees = [];
  for (const ligne of option.lignes) {
    const insc = {
      ...ligne,
      id: suivant.nextId++,
      statut: 'pre',
      entreprise,
      siret,
      dossierYpareo: null,
      chiffreAffaires: null,
      // Trace de l'origine : une pré-réservation venue du terrain doit être
      // reconnaissable par l'assistante qui la confirmera.
      reservePar: par,
      reserveLe: new Date().toISOString(),
    };
    suivant.inscriptions.push(insc);
    posees.push(insc);
  }

  // Filet : on ne pose rien qui CRÉE une anomalie. On compare avant / après,
  // et non l'état d'arrivée seul : le planning partagé porte parfois déjà des
  // anomalies (une ligne à compléter par l'assistante), et ce n'est pas au
  // commercial d'en être empêché. Ce qui est interdit, c'est d'en ajouter —
  // y compris sur une autre ligne que les nôtres, une capacité dépassée se
  // lisant sur les deux.
  const avant = new Set(anomalies(state));
  const nouvelles = anomalies(suivant).filter((a) => !avant.has(a));
  if (nouvelles.length) {
    const libelles = [...new Set(nouvelles.map((a) => a.slice(a.indexOf('|') + 1)))];
    throw erreur('La pré-réservation créerait des anomalies : '
      + libelles.join(', ') + '. Rien n’a été enregistré.');
  }

  return {
    state: suivant,
    lignes: posees,
    texte: rendreReservation(state, { stagiaire, entreprise, option, par }),
  };
}

// Anomalies d'un état, sous une forme comparable d'un état à l'autre :
// « id de la ligne | libellé ». L'identifiant compte — la même anomalie sur
// deux lignes différentes fait bien deux problèmes.
function anomalies(state) {
  return computeSchedule(state).rows
    .flatMap((r) => r.errors.map((e) => `${r.insc?.id}|${e}`));
}

// ---------------------------------------------------------------------------
// Validation commune
// ---------------------------------------------------------------------------
function valider(state, args) {
  const demandees = Array.isArray(args.formations) ? args.formations : [];
  if (!demandees.length) throw erreur('Indiquez au moins une catégorie de formation.');

  const inconnues = demandees.filter((c) => !formationByCode(state.formations, c));
  if (inconnues.length) {
    const dispo = (state.formations || []).map((f) => f.code).join(', ');
    throw erreur(`Catégorie inconnue : ${inconnues.join(', ')}. Catalogue : ${dispo}.`);
  }

  const type = TYPES.includes(args.type) ? args.type : 'Initial';
  return { formations: demandees, type };
}

function normaliserDate(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function borner(v, min, max, defaut) {
  const n = Number(v);
  if (!Number.isFinite(n)) return defaut;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function erreur(message) {
  const e = new Error(message);
  e.metier = true; // distinguée d'un bug : renvoyée telle quelle au commercial
  return e;
}

// ---------------------------------------------------------------------------
// Rendu — lu à voix haute au client, donc en français et sans jargon
// ---------------------------------------------------------------------------
function libelleCategories(state, codes) {
  return codes
    .map((c) => (formationByCode(state.formations, c)?.label || c).replace(/^Pratique\s+/i, ''))
    .join(', ');
}

function rendreOptions(state, { formations, type, aPartirDu, options }) {
  const quoi = libelleCategories(state, formations);
  const depuis = aPartirDu ? ` à partir du ${fmtDateDay(aPartirDu)}` : '';

  if (!options.length) {
    return `Aucune possibilité pour ${quoi} en ${type.toLowerCase()}${depuis}.\n\n`
      + 'Le plateau est saturé, ou aucun intervenant habilité n’est présent sur la période. '
      + 'Essayez une date plus tardive, ou vérifiez avec le centre.';
  }

  const lignes = [`Possibilités pour ${quoi} — ${type.toLowerCase()}${depuis} :`];

  options.forEach((o, n) => {
    lignes.push('');
    lignes.push(options.length > 1 ? `Option ${n + 1} — ${fmtDateDay(o.jours[0])}` : fmtDateDay(o.jours[0]));
    // L'en-tête d'option porte déjà le premier jour : on ne le répète pas,
    // et on n'annonce que les journées suivantes.
    let jour = null;
    for (const s of o.seances) {
      if (s.date !== jour) {
        jour = s.date;
        if (jour !== o.jours[0]) lignes.push(`  ${fmtDateDay(jour)}`);
      }
      lignes.push(`    ${fmtTime(s.debut)} – ${fmtTime(s.fin)}  ${s.libelle}`);
    }
    if (o.jours.length > 1) {
      lignes.push(`  → ${o.jours.length} journées, du ${fmtDateDay(o.jours[0])} au ${fmtDateDay(o.jours.at(-1))}.`);
    }
  });

  lignes.push('');
  lignes.push('Rien n’est réservé à ce stade. Ces créneaux peuvent être pris par quelqu’un d’autre '
    + 'entre-temps — utilisez pre_reserver pour les bloquer.');
  return lignes.join('\n');
}

function rendreReservation(state, { stagiaire, entreprise, option, par }) {
  const lignes = [
    `Pré-réservation posée pour ${stagiaire}${entreprise ? ` (${entreprise})` : ''}.`,
    '',
  ];
  let jour = null;
  for (const s of option.seances) {
    if (s.date !== jour) { jour = s.date; lignes.push(`  ${fmtDateDay(jour)}`); }
    lignes.push(`    ${fmtTime(s.debut)} – ${fmtTime(s.fin)}  ${s.libelle}`);
  }
  lignes.push('');
  lignes.push(`${option.lignes.length} ligne(s) créée(s) au statut « pré-réservée »`
    + `${par ? `, au nom de ${par}` : ''}. Les créneaux sont bloqués.`);
  lignes.push('Une assistante doit confirmer l’inscription, compléter le n° de dossier YPAREO '
    + 'et le montant, puis passer la ligne en « confirmée ».');
  return lignes.join('\n');
}
