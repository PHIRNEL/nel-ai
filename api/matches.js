const API_BASE = "https://v3.football.api-sports.io";

function statusLabel(status) {
  const labels = {
    NS: "À venir", TBD: "Horaire à confirmer", 1H: "En direct",
    HT: "Mi-temps", 2H: "En direct", ET: "Prolongation",
    BT: "Pause prolongation", P: "Tirs au but", LIVE: "En direct",
    FT: "Terminé", AET: "Terminé après prolongation", PEN: "Terminé aux tirs au but",
    PST: "Reporté", CANC: "Annulé", ABD: "Interrompu", AWD: "Défaite technique", WO: "Forfait"
  };
  return labels[status] || status || "À confirmer";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=180, stale-while-revalidate=300");
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée." });

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return res.status(503).json({ error: "La variable API_FOOTBALL_KEY n'est pas configurée dans Vercel." });

  const date = typeof req.query.date === "string" ? req.query.date : new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Brazzaville" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Date invalide. Format AAAA-MM-JJ." });

  try {
    const url = `${API_BASE}/fixtures?date=${encodeURIComponent(date)}&timezone=Africa%2FBrazzaville`;
    const response = await fetch(url, { headers: { "x-apisports-key": apiKey } });
    const body = await response.json();

    if (!response.ok || (body.errors && Object.keys(body.errors).length)) {
      const errors = body.errors || {};
      const message = response.status === 403
        ? "Clé API invalide ou accès refusé. Vérifie la clé dans le tableau de bord API-Football."
        : response.status === 429
          ? "Limite de requêtes API atteinte. Réessaie plus tard."
          : Object.values(errors).join(" ") || "API-Football n'a pas pu fournir les matchs.";
      return res.status(response.status || 502).json({ error: message, providerStatus: response.status, providerErrors: errors });
    }

    const matches = (body.response || []).map(item => ({
      id: item.fixture?.id,
      competition: item.league?.name || "Compétition",
      competitionCode: String(item.league?.id || ""),
      country: item.league?.country || "",
      date: item.fixture?.date || null,
      time: item.fixture?.date ? new Date(item.fixture.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Brazzaville" }) : "À confirmer",
      status: item.fixture?.status?.short || "NS",
      statusLabel: statusLabel(item.fixture?.status?.short),
      homeTeam: item.teams?.home?.name || "Domicile",
      awayTeam: item.teams?.away?.name || "Extérieur",
      homeTeamId: item.teams?.home?.id || null,
      awayTeamId: item.teams?.away?.id || null,
      scoreHome: item.goals?.home ?? null,
      scoreAway: item.goals?.away ?? null
    }));

    return res.status(200).json({
      date,
      count: matches.length,
      matches,
      requestsRemaining: response.headers.get("x-ratelimit-requests-remaining")
    });
  } catch (error) {
    return res.status(502).json({ error: "Connexion à API-Football impossible. Vérifie la connexion et réessaie." });
  }
}
