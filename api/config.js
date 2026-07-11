// Drapeaux de configuration publics (aucune donnée sensible) : permet à
// l'écran de connexion de savoir quelles méthodes d'authentification sont
// disponibles sur ce déploiement.

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Méthode non autorisée.' });
  }
  return res.status(200).json({
    microsoftAuth: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
  });
}
