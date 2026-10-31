export default async function handler(req, res) {
  // 1. Accepter uniquement les requêtes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  // 2. Extraire les paramètres envoyés par le front-end
  const { homeTeamId, awayTeamId, home, away, competitionCode } = req.body || {};

  // 3. Récupérer et nettoyer la clé API
  const apiKey = process.env.API_FOOTBALL_KEY?.trim();

  if (!apiKey) {
    return res.status(500).json({
      error: 'Variable API_FOOTBALL_KEY absente sur Vercel.'
    });
  }

  try {
    let homeLambda = 1.45;
    let awayLambda = 1.10;
    let note = "Estimation basée sur des paramètres statistiques génériques.";

    // 4. Si nous avons les ID d'équipes, tenter d'interroger l'API-Football pour affiner les données
    if (homeTeamId && awayTeamId) {
      try {
        const response = await fetch(
          `https://v3.football.api-sports.io/predictions?fixture=${homeTeamId}`,
          {
            method: 'GET',
            headers: {
              'x-apisports-key': apiKey
            }
          }
        );

        const rawText = await response.text();
        let apiData;
        try {
          apiData = JSON.parse(rawText);
        } catch {
          // Si la réponse n'est pas du JSON, on conserve les paramètres par défaut
          apiData = null;
        }

        if (response.ok && apiData && apiData.response && apiData.response.length > 0) {
          const pred = apiData.response[0];
          if (pred.teams?.home?.league?.goals?.for?.average?.total) {
            homeLambda = parseFloat(pred.teams.home.league.goals.for.average.total) || homeLambda;
          }
          if (pred.teams?.away?.league?.goals?.for?.average?.total) {
            awayLambda = parseFloat(pred.teams.away.league.goals.for.average.total) || awayLambda;
          }
          note = "Estimation calculée à partir des statistiques récentes récoltées via API-Football.";
        }
      } catch (apiErr) {
        // En cas d'erreur de réseau ou de quota avec l'API externe, on continue avec l'algorithme interne
        console.warn('Impossible de récupérer les prédictions distantes, fallback interne:', apiErr.message);
      }
    }

    // 5. Algorithme de distribution de Poisson pour calculer les probabilités
    function poisson(lambda, k) {
      let f = 1;
      for (let i = 2; i <= k; i++) f *= i;
      return Math.exp(-lambda) * Math.pow(lambda, k) / f;
    }

    let homeWin = 0, draw = 0, awayWin = 0, over25 = 0, btts = 0;
    const scores = [];

    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const p = poisson(homeLambda, h) * poisson(awayLambda, a);
        scores.push({ home: h, away: a, p });

        if (h > a) homeWin += p;
        else if (h === a) draw += p;
        else awayWin += p;

        if (h + a >= 3) over25 += p;
        if (h > 0 && a > 0) btts += p;
      }
    }

    // Trier les scores par probabilité décroissante
    scores.sort((a, b) => b.p - a.p);
    const pct = n => Math.round(n * 1000) / 10;

    // 6. Renvoyer la réponse au format JSON propre attendu par le front-end
    return res.status(200).json({
      homeWin: pct(homeWin),
      draw: pct(draw),
      awayWin: pct(awayWin),
      over25: pct(over25),
      under25: pct(1 - over25),
      bttsYes: pct(btts),
      bttsNo: pct(1 - btts),
      scores: scores.slice(0, 5).map(s => ({
        score: `${s.home} - ${s.away}`,
        probability: pct(s.p)
      })),
      note
    });

  } catch (error) {
    return res.status(500).json({
      error: `Erreur interne lors de l'analyse : ${error.message}`
    });
  }
}
