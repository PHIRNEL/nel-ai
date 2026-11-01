export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  const { fixtureId } = req.body || {};
  const apiKey = process.env.API_FOOTBALL_KEY?.trim();
  if (!apiKey) return res.status(500).json({ error: 'Variable API_FOOTBALL_KEY absente sur Vercel.' });
  if (!fixtureId || !/^\d+$/.test(String(fixtureId))) return res.status(400).json({ error: 'Identifiant du match (fixtureId) manquant ou invalide.' });

  try {
    const response = await fetch(`https://v3.football.api-sports.io/predictions?fixture=${encodeURIComponent(fixtureId)}`, {
      headers: { 'x-apisports-key': apiKey }
    });
    const raw = await response.text();
    let payload;
    try { payload = JSON.parse(raw); } catch { return res.status(502).json({ error: 'Réponse invalide du fournisseur de données.' }); }
    if (!response.ok || (payload.errors && Object.keys(payload.errors).length)) {
      return res.status(response.status || 502).json({ error: 'Erreur API-Football.', details: payload.errors || payload.message || null });
    }
    const item = payload.response?.[0];
    if (!item) return res.status(422).json({ error: 'Aucune analyse fournisseur disponible pour cette rencontre. Aucun pronostic générique ne sera inventé.' });

    const number = value => {
      if (value === null || value === undefined || value === '') return null;
      const n = Number(String(value).replace('%', '').replace(',', '.').trim());
      return Number.isFinite(n) ? n : null;
    };
    const percent = item.predictions?.percent || {};
    const homeWin = number(percent.home), draw = number(percent.draw), awayWin = number(percent.away);
    if ([homeWin, draw, awayWin].some(v => v === null)) {
      return res.status(422).json({ error: 'Le fournisseur ne donne pas les trois probabilités 1X2. Analyse indisponible pour ce match.' });
    }

    const home = item.teams?.home?.league?.goals;
    const away = item.teams?.away?.league?.goals;
    const avg = (v1, v2) => {
      const a = number(v1), b = number(v2);
      if (a === null && b === null) return null;
      if (a === null) return b;
      if (b === null) return a;
      return (a + b) / 2;
    };
    const xgHome = avg(home?.for?.average?.home, away?.against?.average?.away);
    const xgAway = avg(away?.for?.average?.away, home?.against?.average?.home);
    return res.status(200).json({
      homeWin, draw, awayWin,
      ...(xgHome !== null ? { xgHome: Math.max(0.1, Math.min(5, xgHome)) } : {}),
      ...(xgAway !== null ? { xgAway: Math.max(0.1, Math.min(5, xgAway)) } : {}),
      source: 'API-Football',
      note: 'Probabilités 1X2 fournies par API-Football. Les scores exacts sont calculés séparément à partir des buts attendus disponibles.'
    });
  } catch (error) {
    return res.status(502).json({ error: `Impossible de joindre API-Football : ${error.message}` });
  }
}
