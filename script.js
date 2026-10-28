const demoMatches = [];

let matches = [];
let selectedTickets = [];
let history = [];
let currentPage = 'dashboard';
const predictions = new Map();
const $ = id => document.getElementById(id);
const initials = name => name.split(/\s+/).map(x => x[0]).join('').slice(0,2).toUpperCase();

function showNotice(message, warning=true) {
  $('noticeText').textContent = message;
  $('notice').classList.remove('hidden');
  $('notice').classList.toggle('warning', warning);
}
function hideNotice(){ $('notice').classList.add('hidden'); }
function dateToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
function setPage(page) {
  currentPage = page;
  const labels = {dashboard:'Vue générale',matches:'Matchs du jour',analysis:'Analyses IA',tickets:'Mes tickets',history:'Historique'};
  const titles = {dashboard:'Votre centre de prédiction.',matches:'Les matchs du jour.',analysis:'Analyses IA.',tickets:'Vos sélections.',history:'Vos analyses récentes.'};
  const subtitles = {dashboard:'Les données du jeu, présentées avec clarté.',matches:'Explorez les rencontres et sélectionnez celles à analyser.',analysis:'Consultez les probabilités estimées du modèle.',tickets:'Retrouvez les rencontres que vous avez sélectionnées.',history:'Retrouvez les analyses consultées pendant cette session.'};
  document.querySelectorAll('.page-section').forEach(el => el.classList.add('hidden'));
  const section = $(page+'Page');
  if (section) section.classList.remove('hidden');
  document.querySelectorAll('.nav-link').forEach(el => el.classList.toggle('active',el.dataset.page===page));
  $('breadcrumbLabel').textContent=labels[page]||'NEL_AI';
  $('pageTitle').textContent=titles[page]||'NEL_AI';
  $('pageSubtitle').textContent=subtitles[page]||'';
  closeMobileMenu();
  if(page==='tickets') renderTickets();
  if(page==='history') renderHistory();
  if(page==='matches') renderMatches('allMatchList',$('allMatchSearch').value);
}
function matchCard(match) {
  const chosen=selectedTickets.some(m=>m.id===match.id);
  const prediction=predictions.get(match.id);
  return `<article class="match-card">
    <div class="league-row"><span class="league-badge">⚽</span><span>${escapeHtml(match.league)}</span><span class="league-country">${escapeHtml(match.country||'')}</span><span class="match-time">${escapeHtml(match.time||'À venir')}</span></div>
    <div class="match-main"><div class="teams">
      <div class="team"><div class="team-logo">${escapeHtml(initials(match.home))}</div><span class="team-name">${escapeHtml(match.home)}</span></div>
      <div class="versus">${match.scoreHome !== null && match.scoreHome !== undefined ? `<strong>${match.scoreHome} - ${match.scoreAway}</strong>` : '<span>VS</span>'}</div>
      <div class="team"><div class="team-logo">${escapeHtml(initials(match.away))}</div><span class="team-name">${escapeHtml(match.away)}</span></div>
    </div><div class="match-actions"><button class="ticket-toggle ${chosen?'chosen':''}" data-ticket="${match.id}" title="Ajouter au ticket">${chosen?'✓':'＋'}</button><button class="analyze-button" data-analyze="${match.id}">Analyser <span>↗</span></button></div></div>
    ${prediction?`<div class="inline-prediction"><span>1 <b>${prediction.homeWin}%</b></span><span>X <b>${prediction.draw}%</b></span><span>2 <b>${prediction.awayWin}%</b></span><button data-analyze="${match.id}">Détails</button></div>`:''}
  </article>`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function renderMatches(targetId='matchList', query='') {
  const target=$(targetId);
  if(!target) return;
  const filtered=matches.filter(m=>`${m.home} ${m.away} ${m.league} ${m.country||''}`.toLowerCase().includes((query||'').toLowerCase()));
  if(!filtered.length){target.innerHTML='<div class="empty-state"><strong>Aucun match trouvé</strong><span>Essayez une autre recherche.</span></div>';return;}
  target.innerHTML=filtered.map(matchCard).join('');
}
function updateStats() {
  $('totalMatches').textContent=matches.length;
  $('liveMatches').textContent=matches.filter(m=>m.status==='En direct').length;
  $('finishedMatches').textContent=matches.filter(m=>m.status==='Terminé').length;
  $('ticketStat').textContent=selectedTickets.length;
  $('ticketCount').textContent=selectedTickets.length;
}
function toggleTicket(id) {
  const match=matches.find(m=>String(m.id)===String(id));
  if(!match)return;
  const index=selectedTickets.findIndex(m=>String(m.id)===String(id));
  if(index>=0) selectedTickets.splice(index,1); else selectedTickets.push(match);
  updateStats(); renderMatches('matchList',$('matchSearch').value);
  renderMatches('allMatchList',$('allMatchSearch').value);
  if(currentPage==='tickets')renderTickets();
}
function poisson(lambda,k){let f=1;for(let i=2;i<=k;i++)f*=i;return Math.exp(-lambda)*Math.pow(lambda,k)/f;}
function calculatePrediction(match) {
  // Démonstration seulement : paramètres génériques, pas des statistiques réelles des équipes.
  const homeLambda=1.45, awayLambda=1.10;
  let homeWin=0,draw=0,awayWin=0,over25=0,btts=0,scores=[];
  for(let h=0;h<=8;h++)for(let a=0;a<=8;a++){
    const p=poisson(homeLambda,h)*poisson(awayLambda,a);
    scores.push({home:h,away:a,p});
    if(h>a)homeWin+=p;else if(h===a)draw+=p;else awayWin+=p;
    if(h+a>=3)over25+=p;
    if(h>0&&a>0)btts+=p;
  }
  scores.sort((a,b)=>b.p-a.p);
  const pct=n=>Math.round(n*1000)/10;
  return {homeWin:pct(homeWin),draw:pct(draw),awayWin:pct(awayWin),over25:pct(over25),under25:pct(1-over25),bttsYes:pct(btts),bttsNo:pct(1-btts),scores:scores.slice(0,5).map(s=>({score:`${s.home} - ${s.away}`,probability:pct(s.p)}))};
}
async function analyzeMatch(id) {
  const match=matches.find(m=>String(m.id)===String(id));
  if(!match)return;
  $('modalTitle').innerHTML=`${escapeHtml(match.home)} <span>vs</span> ${escapeHtml(match.away)}`;
  $('modalLeague').textContent=match.league;
  $('modalBody').innerHTML='<div class="empty-state"><strong>Analyse des statistiques réelles…</strong><span>Recherche des derniers résultats disponibles</span></div>';
  $('analysisModal').classList.remove('hidden');
  let prediction=predictions.get(match.id);
  if(!prediction){
    try {
      const response=await fetch('/api/predict', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({homeTeamId:match.homeId,awayTeamId:match.awayId,home:match.home,away:match.away,competitionCode:match.competitionCode})
      });
      const raw=await response.text();
      let data;
      try { data=JSON.parse(raw); } catch { throw new Error(`Le serveur Vercel a renvoyé une réponse non JSON (HTTP ${response.status}). Ouvre Vercel > Deployments > Functions/Logs pour voir l'erreur serveur.`); }
      if(!response.ok) throw new Error(data.error || 'Les statistiques nécessaires ne sont pas disponibles.');
      prediction=data;
      predictions.set(match.id,prediction);
      history.unshift({id:match.id,home:match.home,away:match.away,league:match.league,at:new Date()});history=history.slice(0,30);
    } catch(error) {
      $('modalBody').innerHTML=`<div class="notice warning"><span>ⓘ</span><p>${escapeHtml(error.message)} L’offre gratuite peut limiter certaines statistiques ou certains endpoints.</p></div><button class="primary-button full-button" id="modalTicketButton">Ajouter / retirer du ticket</button>`;
      $('modalTicketButton').addEventListener('click',()=>toggleTicket(match.id));
      return;
    }
  }
  $('modalBody').innerHTML=`
    <div class="prob-grid"><div><span>1 · Domicile</span><strong>${prediction.homeWin}%</strong></div><div><span>X · Match nul</span><strong>${prediction.draw}%</strong></div><div><span>2 · Extérieur</span><strong>${prediction.awayWin}%</strong></div></div>
    <h3>Scores exacts les plus probables</h3>
    <div class="score-list">${prediction.scores.map(s=>`<div class="score-row"><strong>${s.score}</strong><div class="bar"><i style="width:${Math.min(100,s.probability*5)}%"></i></div><span>${s.probability}%</span></div>`).join('')}</div>
    <div class="metrics-grid"><div class="metric-card"><span>Plus de 2,5 buts</span><strong>${prediction.over25}%</strong></div><div class="metric-card"><span>Moins de 2,5 buts</span><strong>${prediction.under25}%</strong></div><div class="metric-card"><span>Les deux marquent</span><strong>${prediction.bttsYes}%</strong></div></div>
    <div class="notice warning modal-note"><span>ⓘ</span><p>${escapeHtml(prediction.note || 'Estimation statistique basée sur les résultats récents disponibles. Elle ne garantit aucun résultat.')}</p></div>
    <button class="primary-button full-button" id="modalTicketButton">${selectedTickets.some(m=>m.id===match.id)?'Retirer du ticket':'Ajouter au ticket'}</button>`;
  $('modalTicketButton').addEventListener('click',()=>{toggleTicket(match.id);$('modalTicketButton').textContent=selectedTickets.some(m=>m.id===match.id)?'Retirer du ticket':'Ajouter au ticket';});
  renderMatches('matchList',$('matchSearch').value);
  renderMatches('allMatchList',$('allMatchSearch').value);
}
function renderTickets() {
  $('ticketSubtitle').textContent=`${selectedTickets.length} rencontre(s) sélectionnée(s)`;
  const target=$('ticketList');
  if(!selectedTickets.length){target.innerHTML='<div class="empty-state"><strong>Votre ticket est vide</strong><span>Ajoutez des matchs depuis la liste pour les retrouver ici.</span><button class="primary-button" data-page="matches">Voir les matchs</button></div>';return;}
  target.innerHTML=selectedTickets.map(m=>`<div class="ticket-row"><div><strong>${escapeHtml(m.home)} <span style="color:#8297ad">vs</span> ${escapeHtml(m.away)}</strong><small>${escapeHtml(m.league)}</small></div><button data-remove-ticket="${m.id}" aria-label="Retirer">×</button></div>`).join('')+'<div class="notice warning" style="margin-top:18px"><span>ⓘ</span><p>Ce ticket sert à organiser vos sélections. Aucun pari n’est placé par NEL_AI et aucun gain n’est garanti.</p></div>';
}
function renderHistory() {
  const target=$('historyList');
  if(!history.length){target.innerHTML='<div class="empty-state"><strong>Pas encore d’historique</strong><span>Les analyses consultées apparaîtront ici pendant cette session.</span><button class="primary-button" data-page="matches">Commencer</button></div>';return;}
  target.innerHTML=history.map(m=>`<div class="ticket-row"><div><strong>${escapeHtml(m.home)} <span style="color:#8297ad">vs</span> ${escapeHtml(m.away)}</strong><small>${escapeHtml(m.league)} · ${m.at.toLocaleString('fr-FR')}</small></div><button data-analyze="${m.id}">Revoir ↗</button></div>`).join('');
}
function closeMobileMenu(){$('sidebar').classList.remove('open');$('scrim').classList.remove('show');}
async function loadRealMatches(){
  const refresh = $('refreshButton');
  refresh.classList.add('spin');
  $('statusText').textContent = 'CHARGEMENT';
  $('matchList').innerHTML = '<div class="empty-state"><strong>Chargement des rencontres réelles…</strong><span>Connexion à API-Football</span></div>';
  $('allMatchList').innerHTML = '<div class="empty-state"><strong>Chargement des rencontres réelles…</strong></div>';
  hideNotice();
  try {
    const date = $('matchDate').value || dateToday();
    const response = await fetch(`/api/matches?date=${encodeURIComponent(date)}`);
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error(`Le serveur Vercel a renvoyé une réponse non JSON (HTTP ${response.status}). Vérifie les journaux des fonctions dans Vercel.`); }
    if (!response.ok) throw new Error(data.error || 'Impossible de récupérer les matchs.');
    matches = (data.matches || []).map(m => ({
      id: String(m.id), league: m.competition || 'Compétition',
      country: m.country || '', time: m.time || 'À confirmer',
      status: m.statusLabel || m.status || 'À venir',
      home: m.homeTeam, away: m.awayTeam, homeId: m.homeTeamId,
      awayId: m.awayTeamId, competitionCode: m.competitionCode,
      scoreHome: m.scoreHome, scoreAway: m.scoreAway
    }));
    $('statusText').textContent = 'API CONNECTÉE';
    if (!matches.length) showNotice('Aucun match trouvé pour cette date dans les compétitions disponibles sur l’offre gratuite. Essaie une autre date.', true);
  } catch (error) {
    matches = [];
    $('statusText').textContent = 'API INDISPONIBLE';
    showNotice(`${error.message} Vérifie le jeton API_FOOTBALL_KEY dans Vercel et le déploiement. Aucun match fictif ne sera affiché.`, true);
  } finally {
    renderMatches('matchList', $('matchSearch').value);
    renderMatches('allMatchList', $('allMatchSearch').value);
    updateStats();
    refresh.classList.remove('spin');
  }
}

document.addEventListener('click',event=>{
  const pageButton=event.target.closest('[data-page]');
  if(pageButton){setPage(pageButton.dataset.page);return;}
  const ticketButton=event.target.closest('[data-ticket]');
  if(ticketButton){toggleTicket(ticketButton.dataset.ticket);return;}
  const analyzeButton=event.target.closest('[data-analyze]');
  if(analyzeButton){analyzeMatch(analyzeButton.dataset.analyze);return;}
  const removeButton=event.target.closest('[data-remove-ticket]');
  if(removeButton){toggleTicket(removeButton.dataset.removeTicket);renderTickets();return;}
});
$('matchSearch').addEventListener('input',e=>renderMatches('matchList',e.target.value));
$('allMatchSearch').addEventListener('input',e=>renderMatches('allMatchList',e.target.value));
$('refreshButton').addEventListener('click',loadRealMatches);
$('matchDate').addEventListener('change',loadRealMatches);
$('dismissNotice').addEventListener('click',hideNotice);
$('clearTicket').addEventListener('click',()=>{selectedTickets=[];updateStats();renderTickets();renderMatches('matchList',$('matchSearch').value);renderMatches('allMatchList',$('allMatchSearch').value);});
$('clearHistory').addEventListener('click',()=>{history=[];renderHistory();});
$('menuButton').addEventListener('click',()=>{$('sidebar').classList.add('open');$('scrim').classList.add('show');});
$('closeSidebar').addEventListener('click',closeMobileMenu);
$('scrim').addEventListener('click',closeMobileMenu);
$('closeModal').addEventListener('click',()=>$('analysisModal').classList.add('hidden'));
$('analysisModal').addEventListener('click',e=>{if(e.target===$('analysisModal'))$('analysisModal').classList.add('hidden');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('analysisModal').classList.add('hidden');closeMobileMenu();}});
$('year').textContent=new Date().getFullYear();
$('matchDate').value=dateToday();
loadRealMatches();
