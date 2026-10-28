const API_BASE = "https://v3.football.api-sports.io";

function poisson(lambda, k) {
  let factorial = 1;
  for (let i = 2; i <= k; i++) factorial *= i;
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial;
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function pct(n) { return Math.round(n * 1000) / 10; }

async function recentTeamMatches(teamId, apiKey) {
  const url = `${API_BASE}/fixtures?team=${encodeURIComponent(teamId)}&last=10`;
  const response = await fetch(url, { headers: { "x-apisports-key": apiKey } });
  const data = await response.json();
  const errors = data.errors || {};
  if (!response.ok || Object.keys(errors).length) {
    const error = new Error(response.status === 403
      ? "API-Football a refusé l'accès. Vérifie ta clé et les droits de ton compte."
      : response.status === 429
        ? "La limite de requêtes API-Football est atteinte."
        : Object.values(errors).join(" ") || "Impossible de récupérer les derniers matchs de l'équipe.");
    error.status = response.status;
    throw error;
  }
  return (data.response || []).filter(item => ["FT", "AET", "PEN"].includes(item.fixture?.status?.short));
}

function teamRates(fixtures, teamId) {
  const relevant = fixtures.filter(item => {
    const hasScore = item.goals?.home != null && item.goals?.away != null;
    return hasScore && (item.teams?.home?.id === teamId || item.teams?.away?.id === teamId);
  }).slice(0, 10);
  if (!relevant.length) return null;

  let scored = 0, conceded = 0;
  for (const item of relevant) {
    const atHome = item.teams?.home?.id === teamId;
    scored += atHome ? item.goals.home : item.goals.away;
    conceded += atHome ? item.goals.away : item.goals.home;
  }
  return { scored: scored / relevant.length, conceded: conceded / relevant.length, games: relevant.length };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée." });
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return res.status(503).json({ error: "La variable API_FOOTBALL_KEY n'est pas configurée dans Vercel." });

  const homeId = Number(req.body?.homeTeamId);
  const awayId = Number(req.body?.awayTeamId);
  if (!Number.isFinite(homeId) || !Number.isFinite(awayId) || homeId <= 0 || awayId <= 0) {
    return res.status(400).json({ error: "L'API n'a pas fourni les identifiants des deux équipes." });
  }

  try {
    const [homeMatches, awayMatches] = await Promise.all([
      recentTeamMatches(homeId, apiKey),
      recentTeamMatches(awayId, apiKey)
    ]);
    const homeStats = teamRates(homeMatches, homeId);
    const awayStats = teamRates(awayMatches, awayId);
    if (!homeStats || !awayStats) {
      return res.status(422).json({ error: "Les résultats récents ne sont pas disponibles pour les deux équipes dans les données accessibles." });
    }

    const homeLambda = clamp((homeStats.scored * 0.58 + awayStats.conceded * 0.42) * 1.08, 0.15, 4.2);
    const awayLambda = clamp((awayStats.scored * 0.58 + homeStats.conceded * 0.42) * 0.94, 0.15, 4.2);
    let homeWin = 0, draw = 0, awayWin = 0, over25 = 0, btts = 0;
    const scores = [];

    for (let h = 0; h <= 8; h++) for (let a = 0; a <= 8; a++) {
      const probability = poisson(homeLambda, h) * poisson(awayLambda, a);
      scores.push({ h, a, p: probability });
      if (h > a) homeWin += probability;
      else if (h === a) draw += probability;
      else awayWin += probability;
      if (h + a >= 3) over25 += probability;
      if (h > 0 && a > 0) btts += probability;
    }
    scores.sort((a, b) => b.p - a.p);

    return res.status(200).json({
      homeWin: pct(homeWin), draw: pct(draw), awayWin: pct(awayWin),
      over25: pct(over25), under25: pct(1 - over25),
      bttsYes: pct(btts), bttsNo: pct(1 - btts),
      scores: scores.slice(0, 5).map(s => ({ score: `${s.h} - ${s.a}`, probability: pct(s.p) })),
      sample: { homeRecentMatches: homeStats.games, awayRecentMatches: awayStats.games },
      note: `Estimation calculée à partir des ${homeStats.games} et ${awayStats.games} derniers résultats accessibles via API-Football. Ce modèle simplifié n'intègre pas toutes les informations sportives. Une probabilité n'est pas une garantie de résultat.`
    });
  } catch (error) {
    const status = error.status === 403 ? 403 : error.status === 429 ? 429 : 502;
    return res.status(status).json({ error: error.message || "Erreur lors de l'analyse statistique." });
  }
}
