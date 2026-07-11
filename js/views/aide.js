// Mode d'emploi intégré — adapté de l'onglet « Mode d'emploi » du classeur.

import { app } from '../app.js';
import { fmtTime, fmtDateShort } from '../dates.js';

export function renderAide(main) {
  const p = app.state.params;
  main.innerHTML = `
    <div class="page-header">
      <h1>Mode d'emploi</h1>
      <span class="sub">Prise de rendez-vous — formations pratiques & tests (${fmtDateShort(p.periodStart)} → ${fmtDateShort(p.periodEnd)})</span>
    </div>

    <div class="card">
      <h2>Principe</h2>
      <ul>
        <li><b>1 ligne = 1 stagiaire × 1 catégorie pratique</b> (+ son test pratique). Un stagiaire passant plusieurs catégories occupe plusieurs lignes.</li>
        <li>Deux ressources gérées en parallèle : le <b>FORMATEUR</b> (formations pratiques) et le <b>TESTEUR</b> (test théorique + tests pratiques).</li>
        <li>Plage ${fmtTime(p.dayStart)} – ${fmtTime(p.dayEnd)}, créneaux de ${p.slotMinutes} min. Week-ends et fériés exclus (11/11 et 25/12).</li>
      </ul>
    </div>

    <div class="card">
      <h2>Saisie (page Inscriptions)</h2>
      <ol>
        <li>Saisir le nom, choisir la <b>formation</b> et le <b>type</b> (Initial / Recyclage) → durée automatique (R489 : 1h30 / 1h00 ; R486 et Hab. élec : 2h00).</li>
        <li>Choisir <b>date + heure de début</b> de la pratique → fin calculée automatiquement.</li>
        <li><b>Tests obligatoires pour R489 / R486</b> :
          <ul>
            <li>Test pratique (1h00) : par catégorie, donc sur chaque ligne (date + heure de début).</li>
            <li>Test théorique (1h00) : créneau unique et identique pour tous les candidats du jour (${fmtTime(p.theoryTime)} par défaut).
              La théorie d'une recommandation est <b>commune</b> à toutes ses catégories : un seul créneau par stagiaire et par recommandation —
              le renseigner sur une seule de ses lignes ; le contrôle le reconnaît automatiquement sur les autres.</li>
          </ul>
        </li>
        <li>Un candidat peut faire sa formation et ses tests le même jour en décalant les horaires : seuls les chevauchements réels sont signalés.</li>
      </ol>
      <p class="muted">Astuce : sur une grille de semaine, cliquer sur un créneau vert préremplit directement le formulaire d'inscription.</p>
    </div>

    <div class="card">
      <h2>Contrôles automatiques (colonne STATUT)</h2>
      <ul>
        <li><b>Formateur</b> : jamais 2 catégories différentes en même temps ; 2 candidats simultanés autorisés uniquement si la capacité de la formation le permet (R489 Cat 3 : 2 chariots, réglable dans Paramètres).</li>
        <li><b>Testeur</b> : jamais 2 tests pratiques en même temps (sauf testeurs différents — testing croisé), ni test pratique pendant le créneau théorie.</li>
        <li><b>Charge</b> : total des heures de formation pratique ≤ ${fmtTime(p.maxDailyLoad).replace(':', 'h')} par jour et par formateur (paramétrable).</li>
        <li>Plage ${fmtTime(p.dayStart)}-${fmtTime(p.dayEnd)} respectée ; tests manquants signalés ; chevauchement des créneaux d'un même stagiaire.</li>
        <li><b>Formateur ≠ testeur du même candidat</b> : le formateur du jour de pratique ne peut être le testeur du candidat (théorie ou test pratique).</li>
        <li><b>Habilitations</b> : un intervenant affecté hors de ses habilitations F/T est signalé.</li>
        <li><b>Jours EFI</b> : toute inscription sur un jour non ouvert est signalée.</li>
      </ul>
    </div>

    <div class="card">
      <h2>Affectation automatique & testing croisé</h2>
      <ul>
        <li>Champs Formateur/Testeur <b>vides = affectation automatique</b> : l'outil choisit un intervenant habilité et libre sur le créneau
          (priorité à l'intervenant du jour, sinon premier disponible de l'équipe, dans l'ordre de la liste).</li>
        <li>Si personne n'est disponible/habilité, le STATUT signale « Aucun formateur/testeur disponible ».</li>
        <li><b>Testing croisé</b> : renseigner Formateur/Testeur par candidat pour faire travailler 2 formateurs en parallèle —
          A forme le stagiaire 1, B le stagiaire 2, puis A teste le candidat de B et inversement. Deux tests pratiques
          peuvent se chevaucher uniquement si les testeurs effectifs sont différents.</li>
      </ul>
    </div>

    <div class="card">
      <h2>Plannings & synthèse</h2>
      <ul>
        <li><b>Grilles semaine</b> : vert = disponible (cliquer pour inscrire), rouge = occupé, jaune = théorie, gris = fermé.</li>
        <li><b>Synthèse semaine</b> : déroulé chronologique imprimable — à remettre au formateur et au testeur du jour.</li>
        <li><b>Plannings formateur / testeur</b> : vue globale des 86 jours (1 ligne/jour, 1 colonne/créneau de 30 min).</li>
      </ul>
    </div>

    <div class="card">
      <h2>Outils pratiques</h2>
      <ul>
        <li><b>💡 Proposer des créneaux</b> (formulaire d'inscription) : trouve la première combinaison pratique + test + théorie sans conflit.</li>
        <li><b>Annuler / Rétablir</b> : Ctrl+Z / Ctrl+Y (ou les boutons ↩ ↪ de la barre latérale), 50 niveaux.</li>
        <li><b>Exports</b> : sauvegarde JSON complète (barre latérale), CSV des inscriptions, calendrier .ics (Outlook / Google Agenda).</li>
        <li><b>Import CSV</b> (page Inscriptions) : reprend un export CSV de l'onglet « Inscriptions » du classeur Excel —
          en-têtes reconnues automatiquement, formations et intervenants résolus par libellé, lignes invalides ignorées avec raison.</li>
        <li><b>Import JSON</b> : restaure une sauvegarde complète (paramètres, équipe, jours, inscriptions).</li>
        <li><b>🔥 Heatmap</b> (tableau de bord) : occupation de chaque jour de la période en un coup d'œil
          (plus le bleu est foncé, plus le jour est chargé ; liseré rouge = anomalie ; cliquer ouvre la semaine).</li>
        <li><b>🗂 Dossiers</b> : chaque inscription porte une entreprise/SIRET et un statut —
          🕐 pré-réservée, ✓ confirmée, ✕ annulée (avec motif). Une ligne annulée libère immédiatement
          ses créneaux et sort des contrôles, tout en restant visible dans les listes.</li>
        <li><b>🎨 Thèmes</b> : bouton palette de la barre latérale — 10 presets de couleur (dont « Néon »
          pour le mode sombre) et modes clair / sombre / système, mémorisés sur le poste.</li>
        <li><b>☁ Base partagée (connexion permanente)</b> : l'application reste connectée en continu —
          les modifications des autres postes apparaissent automatiquement (toutes les 45 s), la reconnexion
          après coupure est automatique, et la sauvegarde est forcée à la fermeture de l'onglet
          (☁✓ synchronisé, ☁… sauvegarde, ☁⚠ erreur). Sur le site déployé, connexion par
          <b>compte nominatif</b> (le même que l'application EFI Placement, bouton ⏻ pour se
          déconnecter) ; en local, premier clic sur le nuage + code, mémorisé ensuite.</li>
      </ul>
    </div>

    <div class="card">
      <h2>Remarques</h2>
      <ul>
        <li>La théorie e-learning en autonomie (3h, tablettes) ne mobilise ni formateur ni testeur : elle n'est pas planifiée dans cet outil.</li>
        <li>R485 non intégré pour l'instant (accord préalable du service FC requis) — ajout possible dans Paramètres.</li>
        <li>⚠ Les inscriptions préchargées sont des <b>exemples</b> à supprimer avant utilisation réelle.</li>
      </ul>
    </div>
  `;
}
