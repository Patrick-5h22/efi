// Préférences du profil utilisateur (portée de la carte d'occupation, …),
// stockées dans planning.user_prefs — réservé aux utilisateurs authentifiés.
//
//   GET /api/prefs                     → { kpiScope }
//   PUT /api/prefs { kpiScope }        → { ok: true }

import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './_auth.js';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1, // serverless : une connexion par instance
});

const KPI_SCOPES = ['periode', 'semaine', 'mois'];

export default async function handler(req, res) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user) {
    return res.status(401).json({ message: 'Authentification requise.' });
  }

  try {
    if (req.method === 'GET') {
      const r = await pool.query(
        'select kpi_scope from planning.user_prefs where user_id = $1',
        [session.user.id],
      );
      return res.status(200).json({ kpiScope: r.rows[0]?.kpi_scope ?? null });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const kpiScope = req.body?.kpiScope;
      if (!KPI_SCOPES.includes(kpiScope)) {
        return res.status(400).json({ message: 'kpiScope invalide.' });
      }
      await pool.query(
        `insert into planning.user_prefs (user_id, kpi_scope) values ($1, $2)
         on conflict (user_id) do update set kpi_scope = excluded.kpi_scope, updated_at = now()`,
        [session.user.id, kpiScope],
      );
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ message: 'Méthode non autorisée.' });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}
