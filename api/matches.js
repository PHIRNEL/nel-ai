export default async function handler(req, res) {
  // 1. Extraire la date depuis la requête
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: "Le paramètre date est requis (ex: ?date=2026-10-31)." });
  }

  // 2. Récupérer et nettoyer la clé API
  const apiKey = process.env.API_FOOTBALL_KEY?.trim();

  if (!apiKey) {
    return res.status(500).json({
      error: "Variable API_FOOTBALL_KEY absente sur Vercel."
    });
  }

  try {
    // 3. Appel à l'API-Football
    const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${date}`, {
      method: "GET",
      headers: {
        "x-apisports-key": apiKey
      }
    });

    const rawText = await response.text();
    let data;

    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        error: "L'API externe a renvoyé une réponse invalide.",
        details: rawText.slice(0, 200)
      });
    }

    // 4. Gestion des erreurs renvoyées par l'API-Football
    if (!response.ok || (data.errors && Object.keys(data.errors).length > 0)) {
      const errorMsg = typeof data.errors === 'object' ? JSON.stringify(data.errors) : (data.message || 'Erreur API');
      return res.status(response.status || 400).json({ error: errorMsg });
    }

    // 5. Structure et renvoi des données au front-end
    const statusLabel = short => {
      if (['1H','2H','HT','ET','P','LIVE','BT'].includes(short)) return 'En direct';
      if (['FT','AET','PEN'].includes(short)) return 'Terminé';
      if (['NS','TBD'].includes(short)) return 'À venir';
      return short || 'À venir';
    };
    const matches = (data.response || []).map(item => ({
      id: String(item.fixture.id),
      competition: item.league.name,
      competitionLogo: item.league.logo || '',
      competitionCode: String(item.league.id || ''),
      country: item.league.country,
      time: new Date(item.fixture.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Brazzaville' }),
      status: item.fixture.status.short,
      statusLabel: statusLabel(item.fixture.status.short),
      homeTeam: item.teams.home.name,
      awayTeam: item.teams.away.name,
      homeTeamId: item.teams.home.id,
      awayTeamId: item.teams.away.id,
      homeLogo: item.teams.home.logo || '',
      awayLogo: item.teams.away.logo || '',
      scoreHome: item.goals.home,
      scoreAway: item.goals.away
    }));

    return res.status(200).json({ matches });

  } catch (error) {
    return res.status(500).json({ error: `Erreur interne du serveur : ${error.message}` });
  }
}
