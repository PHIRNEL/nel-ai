const apiKey = process.env.API_FOOTBALL_KEY?.trim();

if (!apiKey) {
  return res.status(500).json({
    error: "Variable API_FOOTBALL_KEY absente sur Vercel"
  });
}

const response = await fetch(
  `https://v3.football.api-sports.io/fixtures?date=${date}`,
  {
    headers: {
      "x-apisports-key": apiKey
    }
  }
);
