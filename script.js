// ================= État =================
let matches = [];
let selectedTickets = safeParse('nel_selectedTickets');
let history = safeParse('nel_history').map(item => ({ ...item, at: new Date(item.at) }));
let currentPage = 'dashboard';
const predictions = new Map();
const $ = id => document.getElementById(id);

function safeParse(key) {
  try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function saveToLocalStorage() {
  try {
    localStorage.setItem('nel_selectedTickets', JSON.stringify(selectedTickets));
    localStorage.setItem('nel_history', JSON.stringify(history));
  } catch {}
}

// ================= Utilitaires =================
const initials = name => name ? name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase() : 'FC';
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function dateToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function showNotice(message, warning = true) {
  if ($('noticeText')) $('noticeText').textContent = message;
  if ($('notice')) { $('notice').classList.remove('hidden'); $('notice').classList.toggle('warning', warning); }
}
function hideNotice() { if ($('notice')) $('notice').classList.add('hidden'); }

// ================= Logos =================
function teamLogoUrl(logo, id) {
  if (logo) return logo;
  if (id) return `https://media.api-sports.io/football/teams/${encodeURIComponent(id)}.png`;
  return '';
}
function logoHtml(url, name) {
  const ini = escapeHtml(initials(name));
  if (!url) return ini;
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${ini}'))">`;
}

// ================= Tri : matchs phares en premier =================
const TOP_LEAGUES = [
  'champions league', 'world cup', 'coupe du monde', 'europa league', 'premier league', 'la liga', 'serie a',
  'bundesliga', 'ligue 1', 'africa cup', 'afcon', 'can ', 'conference league', 'eredivisie', 'primeira liga',
  'copa libertadores', 'mls', 'euro', 'nations league'
];
const STATUS_ORDER = { 'En direct': 0, 'À venir': 1, 'Terminé': 2 };
function leagueRank(m) {
  const name = `${m.league} `.toLowerCase();
  const i = TOP_LEAGUES.findIndex(t => name.includes(t));
  return i === -1 ? 99 : i;
}
function byImportance(a, b) {
  const s = (STATUS_ORDER[a.status] ?? 1) - (STATUS_ORDER[b.status] ?? 1);
  if (s) return s;
  const l = leagueRank(a) - leagueRank(b);
  if (l) return l;
  return String(a.time).localeCompare(String(b.time));
}

// ================= Navigation =================
function setPage(page) {
  currentPage = page;
  const labels = {dashboard:'Vue générale', matches:'Matchs du jour', analysis:'Analyses IA', tickets:'Mes tickets', history:'Historique'};
  const titles = {dashboard:'Votre centre de prédiction.', matches:'Les matchs du jour.', analysis:'Analyses IA.', tickets:'Vos sélections.', history:'Vos analyses récentes.'};
  const subtitles = {dashboard:'Les données du jeu, présentées avec clarté.', matches:'Explorez les rencontres et sélectionnez celles à analyser.', analysis:'Consultez les probabilités estimées du modèle.', tickets:'Retrouvez les rencontres que vous avez sélectionnées.', history:'Retrouvez les analyses consultées récemment.'};

  document.querySelectorAll('.page-section').forEach(el => el.classList.add('hidden'));
  const section = $(page + 'Page');
  if (section) section.classList.remove('hidden');
  document.querySelectorAll('.nav-link').forEach(el => el.classList.toggle('active', el.dataset.page === page));

  if ($('breadcrumbLabel')) $('breadcrumbLabel').textContent = labels[page] || 'NEL_AI';
  if ($('pageTitle')) $('pageTitle').textContent = titles[page] || 'NEL_AI';
  if ($('pageSubtitle')) $('pageSubtitle').textContent = subtitles[page] || '';

  closeMobileMenu();
  if (page === 'tickets') renderTickets();
  if (page === 'history') renderHistory();
  if (page === 'matches') renderMatches('allMatchList', $('allMatchSearch') ? $('allMatchSearch').value : '');
}
function closeMobileMenu() {
  if ($('sidebar')) $('sidebar').classList.remove('open');
  if ($('scrim')) $('scrim').classList.remove('show');
}

// ================= Cartes de matchs =================
function matchCard(match) {
  const chosen = selectedTickets.some(m => String(m.id) === String(match.id));
  const prediction = predictions.get(match.id);
  const featured = leagueRank(match) !== 99;
  const hasScore = match.scoreHome !== null && match.scoreHome !== undefined && match.scoreHome !== '';
  const live = match.status === 'En direct';
  return `<article class="match-card ${featured ? 'featured' : ''}">
    <div class="league-row"><span class="league-badge">${match.leagueLogo ? `<img src="${escapeHtml(match.leagueLogo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('⚽'))">` : '⚽'}</span>${featured ? '<span class="star" title="Match phare">★</span>' : ''}<span>${escapeHtml(match.league)}</span><span class="league-country">${escapeHtml(match.country || '')}</span><span class="match-time ${live ? 'live' : ''}">${escapeHtml(live ? 'EN DIRECT' : (match.time || 'À venir'))}</span></div>
    <div class="match-main"><div class="teams">
      <div class="team"><div class="team-logo">${logoHtml(match.homeLogo, match.home)}</div><span class="team-name">${escapeHtml(match.home)}</span></div>
      <div class="versus">${hasScore ? `<strong>${escapeHtml(match.scoreHome)} - ${escapeHtml(match.scoreAway)}</strong>` : '<span>VS</span>'}</div>
      <div class="team"><div class="team-logo">${logoHtml(match.awayLogo, match.away)}</div><span class="team-name">${escapeHtml(match.away)}</span></div>
    </div><div class="match-actions"><button class="ticket-toggle ${chosen ? 'chosen' : ''}" data-ticket="${escapeHtml(match.id)}" title="Ajouter au ticket">${chosen ? '✓' : '＋'}</button><button class="analyze-button" data-analyze="${escapeHtml(match.id)}">Analyser <span>↗</span></button></div></div>
    ${prediction ? `<div class="inline-prediction"><span>1 <b>${prediction.homeWin}%</b></span><span>X <b>${prediction.draw}%</b></span><span>2 <b>${prediction.awayWin}%</b></span><button data-analyze="${escapeHtml(match.id)}">Détails</button></div>` : ''}
  </article>`;
}
function renderMatches(targetId = 'matchList', query = '') {
  const target = $(targetId);
  if (!target) return;
  const q = (query || '').toLowerCase();
  const filtered = matches.filter(m => `${m.home} ${m.away} ${m.league} ${m.country || ''}`.toLowerCase().includes(q));
  if (!filtered.length) {
    target.innerHTML = '<div class="empty-state"><strong>Aucun match trouvé</strong><span>Essayez une autre recherche ou une autre date.</span></div>';
    return;
  }
  target.innerHTML = filtered.map(matchCard).join('');
}
function renderAllLists() {
  if ($('matchSearch')) renderMatches('matchList', $('matchSearch').value);
  if ($('allMatchSearch')) renderMatches('allMatchList', $('allMatchSearch').value);
}
function updateStats() {
  if ($('totalMatches')) $('totalMatches').textContent = matches.length;
  if ($('liveMatches')) $('liveMatches').textContent = matches.filter(m => m.status === 'En direct').length;
  if ($('finishedMatches')) $('finishedMatches').textContent = matches.filter(m => m.status === 'Terminé').length;
  if ($('ticketStat')) $('ticketStat').textContent = selectedTickets.length;
  if ($('ticketCount')) $('ticketCount').textContent = selectedTickets.length;
  saveToLocalStorage();
}
function toggleTicket(id) {
  const match = matches.find(m => String(m.id) === String(id)) || selectedTickets.find(m => String(m.id) === String(id));
  if (!match) return;
  const index = selectedTickets.findIndex(m => String(m.id) === String(id));
  if (index >= 0) selectedTickets.splice(index, 1); else selectedTickets.push(match);
  updateStats();
  renderAllLists();
  if (currentPage === 'tickets') renderTickets();
}

// ================= Moteur de marchés (Poisson) =================
const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
const pois = (k, l) => Math.exp(-l) * Math.pow(l, k) / FACT[k];
const MAXG = 8;

function matrixFor(lh, la) {
  const cells = [];
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) cells.push({ i, j, pr: pois(i, lh) * pois(j, la) });
  const total = cells.reduce((s, c) => s + c.pr, 0);
  cells.forEach(c => c.pr /= total);
  return cells;
}
const sum = (cells, f) => cells.filter(f).reduce((s, c) => s + c.pr, 0);
const pct = x => Math.round(x * 1000) / 10;

function fitLambdas(p) {
  if (Number.isFinite(+p.xgHome) && Number.isFinite(+p.xgAway)) return { lh: +p.xgHome, la: +p.xgAway };
  const t = [p.homeWin, p.draw, p.awayWin].map(x => x / 100);
  const hasO = Number.isFinite(+p.over25);
  const to = hasO ? p.over25 / 100 : null;
  let best = { lh: 1.4, la: 1.1, err: Infinity };
  for (let lh = 0.2; lh <= 4; lh += 0.05) for (let la = 0.2; la <= 4; la += 0.05) {
    const c = matrixFor(lh, la);
    const v = [sum(c, x => x.i > x.j), sum(c, x => x.i === x.j), sum(c, x => x.i < x.j)];
    let err = v.reduce((s, val, k) => s + (val - t[k]) ** 2, 0);
    if (hasO) err += (sum(c, x => x.i + x.j > 2) - to) ** 2;
    if (err < best.err) best = { lh, la, err };
  }
  return best;
}

function buildMarkets(match, p) {
  const { lh, la } = fitLambdas(p);
  const cells = matrixFor(lh, la);
  const H = match.home, A = match.away, M = [];
  const add = (group, label, prob, why) => M.push({ group, label, prob: pct(prob), why });
  const exp = (lh + la).toFixed(1);

  add('Double chance', `${H} ou nul (1X)`, sum(cells, c => c.i >= c.j), 'Couvre la victoire à domicile et le nul.');
  add('Double chance', `${A} ou nul (X2)`, sum(cells, c => c.j >= c.i), 'Couvre la victoire extérieure et le nul.');
  add('Double chance', `${H} ou ${A} (12)`, sum(cells, c => c.i !== c.j), 'Pari sur un match avec un vainqueur.');

  const decisive = sum(cells, c => c.i !== c.j);
  const dnbH = sum(cells, c => c.i > c.j) / decisive;
  add('Remboursé si nul', `${H} (DNB)`, dnbH, 'Victoire à domicile, mise remboursée en cas de nul.');
  add('Remboursé si nul', `${A} (DNB)`, 1 - dnbH, 'Victoire extérieure, mise remboursée en cas de nul.');

  [-1.5, -0.5, 0.5, 1.5].forEach(hc => {
    add('Handicap', `${H} (${hc > 0 ? '+' : ''}${hc})`, sum(cells, c => c.i + hc > c.j),
      `${H} l'emporte en partant avec ${hc > 0 ? 'un avantage' : 'un désavantage'} de ${Math.abs(hc)} but.`);
    add('Handicap', `${A} (${hc > 0 ? '+' : ''}${hc})`, sum(cells, c => c.j + hc > c.i),
      `${A} l'emporte en partant avec ${hc > 0 ? 'un avantage' : 'un désavantage'} de ${Math.abs(hc)} but.`);
  });

  [0.5, 1.5, 2.5, 3.5, 4.5].forEach(t => {
    add('Nombre de buts', `Plus de ${t}`, sum(cells, c => c.i + c.j > t), `Environ ${exp} buts attendus dans le match.`);
    add('Nombre de buts', `Moins de ${t}`, sum(cells, c => c.i + c.j < t), `Environ ${exp} buts attendus dans le match.`);
  });
  add('Les deux marquent', 'Oui', sum(cells, c => c.i > 0 && c.j > 0), 'Les deux équipes ont un vrai potentiel offensif.');
  add('Les deux marquent', 'Non', sum(cells, c => c.i === 0 || c.j === 0), 'Au moins une équipe peut rester muette.');
  add('Buts par équipe', `${H} marque 1+`, sum(cells, c => c.i >= 1), `${H} : environ ${lh.toFixed(2)} but attendu.`);
  add('Buts par équipe', `${A} marque 1+`, sum(cells, c => c.j >= 1), `${A} : environ ${la.toFixed(2)} but attendu.`);
  add('Buts par équipe', `${H} marque 2+`, sum(cells, c => c.i >= 2), `${H} : environ ${lh.toFixed(2)} but attendu.`);
  add('Buts par équipe', `${A} marque 2+`, sum(cells, c => c.j >= 2), `${A} : environ ${la.toFixed(2)} but attendu.`);

  const combo = (label, f, why) => add('Combinaisons', label, sum(cells, f), why);
  combo(`${H} ou nul + Plus de 1.5`, c => c.i >= c.j && c.i + c.j > 1, 'Sécurise le résultat et vise un match avec buts.');
  combo(`${A} ou nul + Plus de 1.5`, c => c.j >= c.i && c.i + c.j > 1, 'Sécurise le résultat et vise un match avec buts.');
  combo(`${H} ou nul + Moins de 3.5`, c => c.i >= c.j && c.i + c.j < 4, 'Résultat favorable sans excès de buts.');
  combo(`${A} ou nul + Moins de 3.5`, c => c.j >= c.i && c.i + c.j < 4, 'Résultat favorable sans excès de buts.');
  combo(`${H} gagne + Plus de 1.5`, c => c.i > c.j && c.i + c.j > 1, 'Victoire à domicile dans un match ouvert.');
  combo(`${A} gagne + Plus de 1.5`, c => c.j > c.i && c.i + c.j > 1, 'Victoire extérieure dans un match ouvert.');
  combo('Les deux marquent + Plus de 2.5', c => c.i > 0 && c.j > 0 && c.i + c.j > 2, 'Match ouvert avec buts des deux côtés.');
  combo(`${H} ou nul + Les deux marquent`, c => c.i >= c.j && c.i > 0 && c.j > 0, 'Scénario équilibré avec buts des deux côtés.');
  combo(`${A} ou nul + Les deux marquent`, c => c.j >= c.i && c.i > 0 && c.j > 0, 'Scénario équilibré avec buts des deux côtés.');
  combo('Plus de 1.5 + Moins de 4.5', c => c.i + c.j > 1 && c.i + c.j < 5, 'Fourchette de buts la plus courante.');

  return { markets: M, cells, lh, la };
}

function topScores(p, cells) {
  if (Array.isArray(p.scores) && p.scores.length) return p.scores;
  return [...cells].sort((a, b) => b.pr - a.pr).slice(0, 6).map(c => ({ score: `${c.i}-${c.j}`, probability: pct(c.pr) }));
}

function scoreExplanation(match, p, scores, lh, la) {
  const res = [[match.home, p.homeWin], [match.away, p.awayWin], ['Match nul', p.draw]].sort((a, b) => b[1] - a[1]);
  const gap = res[0][1] - res[1][1];
  const first = scores[0];
  const resultTxt = gap >= 15
    ? `${res[0][0]} est nettement devant (${res[0][1]}% contre ${res[1][1]}% pour ${res[1][0]}).`
    : `${res[0][0]} est légèrement favori (${res[0][1]}%) mais ${res[1][0]} reste proche (${res[1][1]}%) : le match est ouvert.`;
  const goalsTxt = lh + la >= 2.8 ? 'Le modèle voit un match plutôt riche en buts.'
    : lh + la <= 2.2 ? 'Le modèle voit un match plutôt fermé.' : 'Le modèle voit un match avec un nombre de buts moyen.';
  return `Le modèle estime environ <b>${lh.toFixed(2)}</b> but pour ${escapeHtml(match.home)} et <b>${la.toFixed(2)}</b> pour ${escapeHtml(match.away)}. ${escapeHtml(resultTxt)} ${goalsTxt} Le score <b>${escapeHtml(first.score)}</b> arrive en tête (${first.probability}%) car il combine le mieux ces moyennes de buts. Même le score le plus probable reste peu probable en valeur absolue : c'est une estimation, jamais une certitude.`;
}

function marketsHtml(match, p, markets) {
  const row = (m, safe) => `<div class="mk-row ${safe ? 'safe' : ''}"><div><strong>${escapeHtml(m.label)}</strong><small>${escapeHtml(m.why)}</small></div><b>${m.prob}%</b></div>`;
  const safe = markets.filter(m => m.group !== 'Combinaisons' && m.prob >= 75).sort((a, b) => b.prob - a.prob).slice(0, 5);
  const combos = markets.filter(m => m.group === 'Combinaisons').sort((a, b) => b.prob - a.prob).slice(0, 4);
  const groups = [...new Set(markets.map(m => m.group))];
  const best = [[match.home, p.homeWin], [match.away, p.awayWin], ['Match nul', p.draw]].sort((a, b) => b[1] - a[1])[0];

  return `
    <h3>Qui a le plus de chances de gagner ?</h3>
    <div class="mk-best"><strong>${escapeHtml(best[0])}</strong><span>${best[1]}%</span></div>
    ${safe.length ? `<h3>Propositions les plus sûres (75% et plus)</h3><div class="mk-list">${safe.map(m => row(m, true)).join('')}</div>` : ''}
    <h3>Meilleures combinaisons</h3>
    <div class="mk-list">${combos.map(m => row(m, m.prob >= 60)).join('')}</div>
    <h3>Tous les marchés</h3>
    ${groups.map(g => `<details class="mk-group"><summary>${escapeHtml(g)}</summary><div class="mk-list">${markets.filter(m => m.group === g).map(m => row(m, false)).join('')}</div></details>`).join('')}`;
}

// ================= Analyse =================
async function analyzeMatch(id) {
  let match = matches.find(m => String(m.id) === String(id)) || history.find(m => String(m.id) === String(id));
  if (!match) return;
  match = matches.find(m => String(m.id) === String(id)) || match;

  if ($('modalTitle')) $('modalTitle').innerHTML = `${escapeHtml(match.home)} <span>vs</span> ${escapeHtml(match.away)}`;
  if ($('modalLeague')) $('modalLeague').textContent = match.league;
  if ($('modalBody')) $('modalBody').innerHTML = '<div class="empty-state"><strong>Analyse des statistiques réelles…</strong><span>Recherche des derniers résultats disponibles</span></div>';
  if ($('analysisModal')) $('analysisModal').classList.remove('hidden');

  let prediction = predictions.get(match.id);
  if (!prediction) {
    try {
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeTeamId: match.homeId, awayTeamId: match.awayId, home: match.home, away: match.away, competitionCode: match.competitionCode })
      });
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); }
      catch { throw new Error(`Le serveur a renvoyé une réponse non JSON (HTTP ${response.status}).`); }
      if (!response.ok) throw new Error(data.error || 'Les statistiques nécessaires ne sont pas disponibles.');

      prediction = data;
      predictions.set(match.id, prediction);
      history = history.filter(h => String(h.id) !== String(match.id));
      history.unshift({ id: match.id, home: match.home, away: match.away, league: match.league, at: new Date() });
      history = history.slice(0, 30);
      saveToLocalStorage();
    } catch (error) {
      if ($('modalBody')) {
        $('modalBody').innerHTML = `<div class="notice warning"><span>ⓘ</span><p>${escapeHtml(error.message)} L'offre gratuite peut limiter certaines statistiques.</p></div><button class="primary-button full-button" id="modalTicketButton">Ajouter / retirer du ticket</button>`;
        const btn = $('modalTicketButton');
        if (btn) btn.addEventListener('click', () => toggleTicket(match.id));
      }
      return;
    }
  }

  const { markets, cells, lh, la } = buildMarkets(match, prediction);
  const scores = topScores(prediction, cells);
  const isChosen = selectedTickets.some(m => String(m.id) === String(match.id));

  if ($('modalBody')) {
    $('modalBody').innerHTML = `
      <h3 style="margin-top:0">Scores exacts les plus probables</h3>
      <div class="score-list">${scores.map(s => `<div class="score-row"><strong>${escapeHtml(s.score)}</strong><div class="bar"><i style="width:${Math.min(100, s.probability * 5)}%"></i></div><span>${s.probability}%</span></div>`).join('')}</div>
      <h3>Pourquoi ces scores ?</h3>
      <p class="mk-why">${scoreExplanation(match, prediction, scores, lh, la)}</p>
      <div class="prob-grid"><div><span>1 · Domicile</span><strong>${prediction.homeWin}%</strong></div><div><span>X · Match nul</span><strong>${prediction.draw}%</strong></div><div><span>2 · Extérieur</span><strong>${prediction.awayWin}%</strong></div></div>
      ${marketsHtml(match, prediction, markets)}
      <div class="notice warning modal-note"><span>ⓘ</span><p>${escapeHtml(prediction.note || 'Estimation statistique basée sur les résultats récents disponibles. Aucune prédiction n\'est garantie.')}</p></div>
      <button class="primary-button full-button" id="modalTicketButton">${isChosen ? 'Retirer du ticket' : 'Ajouter au ticket'}</button>`;

    const modalBtn = $('modalTicketButton');
    if (modalBtn) modalBtn.addEventListener('click', () => {
      toggleTicket(match.id);
      modalBtn.textContent = selectedTickets.some(m => String(m.id) === String(match.id)) ? 'Retirer du ticket' : 'Ajouter au ticket';
    });
  }
  renderAllLists();
}

// ================= Tickets et historique =================
function renderTickets() {
  if ($('ticketSubtitle')) $('ticketSubtitle').textContent = `${selectedTickets.length} rencontre(s) sélectionnée(s)`;
  const target = $('ticketList');
  if (!target) return;
  if (!selectedTickets.length) {
    target.innerHTML = '<div class="empty-state"><strong>Votre ticket est vide</strong><span>Ajoutez des matchs depuis la liste pour les retrouver ici.</span><button class="primary-button" data-page="matches">Voir les matchs</button></div>';
    return;
  }
  target.innerHTML = selectedTickets.map(m => `<div class="ticket-row"><div><strong>${escapeHtml(m.home)} <span style="color:#8297ad">vs</span> ${escapeHtml(m.away)}</strong><small>${escapeHtml(m.league)}</small></div><button data-remove-ticket="${escapeHtml(m.id)}" aria-label="Retirer">×</button></div>`).join('')
    + '<div class="notice warning" style="margin-top:18px"><span>ⓘ</span><p>Ce ticket sert à organiser vos sélections. Aucun pari n\'est placé par NEL_AI.</p></div>';
}
function renderHistory() {
  const target = $('historyList');
  if (!target) return;
  if (!history.length) {
    target.innerHTML = '<div class="empty-state"><strong>Pas encore d\'historique</strong><span>Les analyses consultées apparaîtront ici.</span><button class="primary-button" data-page="matches">Commencer</button></div>';
    return;
  }
  target.innerHTML = history.map(m => `<div class="ticket-row"><div><strong>${escapeHtml(m.home)} <span style="color:#8297ad">vs</span> ${escapeHtml(m.away)}</strong><small>${escapeHtml(m.league)} · ${new Date(m.at).toLocaleString('fr-FR')}</small></div><button data-analyze="${escapeHtml(m.id)}">Revoir ↗</button></div>`).join('');
}

// ================= Chargement des matchs =================
async function loadRealMatches() {
  const refresh = $('refreshButton');
  if (refresh) refresh.classList.add('spin');
  if ($('statusText')) $('statusText').textContent = 'CHARGEMENT';
  if ($('matchList')) $('matchList').innerHTML = '<div class="empty-state"><strong>Chargement des rencontres réelles…</strong><span>Connexion à l\'API</span></div>';
  if ($('allMatchList')) $('allMatchList').innerHTML = '<div class="empty-state"><strong>Chargement des rencontres réelles…</strong></div>';
  hideNotice();

  try {
    const dateInput = $('matchDate');
    const date = (dateInput && dateInput.value) ? dateInput.value : dateToday();
    const response = await fetch(`/api/matches?date=${encodeURIComponent(date)}`);
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); }
    catch { throw new Error(`Le serveur a renvoyé une réponse non JSON (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(data.error || 'Impossible de récupérer les matchs.');

    matches = (data.matches || []).map(m => ({
      id: String(m.id),
      league: m.competition || 'Compétition',
      leagueLogo: m.competitionLogo || m.leagueLogo || '',
      country: m.country || '',
      time: m.time || 'À confirmer',
      status: m.statusLabel || m.status || 'À venir',
      home: m.homeTeam,
      away: m.awayTeam,
      homeId: m.homeTeamId,
      awayId: m.awayTeamId,
      homeLogo: teamLogoUrl(m.homeLogo || m.homeTeamLogo || m.homeCrest, m.homeTeamId),
      awayLogo: teamLogoUrl(m.awayLogo || m.awayTeamLogo || m.awayCrest, m.awayTeamId),
      competitionCode: m.competitionCode,
      scoreHome: m.scoreHome,
      scoreAway: m.scoreAway
    })).sort(byImportance);

    if ($('statusText')) $('statusText').textContent = 'API CONNECTÉE';
    if (!matches.length) showNotice('Aucun match trouvé pour cette date dans les compétitions disponibles sur l\'offre gratuite.', true);
  } catch (error) {
    matches = [];
    if ($('statusText')) $('statusText').textContent = 'API INDISPONIBLE';
    showNotice(`${error.message} Vérifie le jeton API_FOOTBALL_KEY dans Vercel.`, true);
  } finally {
    renderAllLists();
    updateStats();
    if (refresh) refresh.classList.remove('spin');
  }
}

// ================= Événements =================
document.addEventListener('click', event => {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) { setPage(pageButton.dataset.page); return; }
  const ticketButton = event.target.closest('[data-ticket]');
  if (ticketButton) { toggleTicket(ticketButton.dataset.ticket); return; }
  const analyzeButton = event.target.closest('[data-analyze]');
  if (analyzeButton) { analyzeMatch(analyzeButton.dataset.analyze); return; }
  const removeButton = event.target.closest('[data-remove-ticket]');
  if (removeButton) { toggleTicket(removeButton.dataset.removeTicket); return; }
});

if ($('matchSearch')) $('matchSearch').addEventListener('input', e => renderMatches('matchList', e.target.value));
if ($('allMatchSearch')) $('allMatchSearch').addEventListener('input', e => renderMatches('allMatchList', e.target.value));
if ($('refreshButton')) $('refreshButton').addEventListener('click', loadRealMatches);
if ($('matchDate')) $('matchDate').addEventListener('change', loadRealMatches);
if ($('dismissNotice')) $('dismissNotice').addEventListener('click', hideNotice);

if ($('clearTicket')) $('clearTicket').addEventListener('click', () => {
  selectedTickets = [];
  updateStats();
  renderTickets();
  renderAllLists();
});
if ($('clearHistory')) $('clearHistory').addEventListener('click', () => {
  history = [];
  saveToLocalStorage();
  renderHistory();
});
if ($('menuButton')) $('menuButton').addEventListener('click', () => {
  if ($('sidebar')) $('sidebar').classList.add('open');
  if ($('scrim')) $('scrim').classList.add('show');
});
if ($('closeSidebar')) $('closeSidebar').addEventListener('click', closeMobileMenu);
if ($('scrim')) $('scrim').addEventListener('click', closeMobileMenu);
if ($('closeModal')) $('closeModal').addEventListener('click', () => $('analysisModal').classList.add('hidden'));
if ($('analysisModal')) $('analysisModal').addEventListener('click', e => {
  if (e.target === $('analysisModal')) $('analysisModal').classList.add('hidden');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('analysisModal')) $('analysisModal').classList.add('hidden');
    closeMobileMenu();
  }
});

if ($('year')) $('year').textContent = new Date().getFullYear();
if ($('matchDate')) $('matchDate').value = dateToday();
updateStats();
loadRealMatches();
