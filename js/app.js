// ============================================
//   MTG | MVM THE LEAGUE — APP.JS
// ============================================

let seasonData = null;
let historyData = null;
const API = 'http://localhost:3001';

// ---- INIT ----
async function init() {
  try {
    // Try the local API server first (most up to date)
    const res = await fetch(`${API}/data`);
    seasonData = await res.json();
  } catch (e) {
    // Fall back to the static JSON file if server isn't running
    console.warn('Local server not running, falling back to static file.');
    const res = await fetch('data/season9.json');
    seasonData = await res.json();
  }
  try {
    const histRes = await fetch('data/history.json');
    historyData = await histRes.json();
  } catch (e) {
    console.warn('Could not load history.json for head-to-head context.');
  }
  renderAll();
}

async function saveData() {
  try {
    const res = await fetch(`${API}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(seasonData)
    });
    if (!res.ok) throw new Error('Save failed');
    return true;
  } catch (e) {
    console.error('Could not save to local server:', e);
    return false;
  }
}

function renderAll() {
  renderStandings();
  renderPowerRankings();
  renderResultsFeed();
  renderUpcomingThisWeek();
  renderSeasonStats();
  renderTeamsGrid();
  renderGameLog();
}

// ---- NAVIGATION ----
function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');
  const navLink = document.querySelector(`nav a[data-page="${pageId}"]`);
  if (navLink) navLink.classList.add('active');
  if (pageId === 'teams') {
    document.getElementById('teams-grid-view').style.display = 'block';
    document.getElementById('team-detail-view').style.display = 'none';
  }
}

// ---- STANDINGS ----
function computeStandings() {
  if (!seasonData) return [];
  const stats = {};
  seasonData.teams.forEach(t => {
    stats[t.id] = {
      id: t.id, name: t.name, shortName: t.shortName,
      gp: 0, w: 0, l: 0, pf: 0, pa: 0,
      streak: 0, streakType: null,
      recentResults: []
    };
  });
  const sorted = [...seasonData.games].sort((a, b) => a.week - b.week);
  sorted.forEach(g => {
    const w = stats[g.winner_id], l = stats[g.loser_id];
    if (!w || !l) return;
    w.gp++; w.w++; w.pf += g.winner_score; w.pa += g.loser_score;
    l.gp++; l.l++; l.pf += g.loser_score; l.pa += g.winner_score;
    if (w.streakType === 'W') w.streak++;
    else { w.streak = 1; w.streakType = 'W'; }
    if (l.streakType === 'L') l.streak++;
    else { l.streak = 1; l.streakType = 'L'; }
    w.recentResults.push('W');
    l.recentResults.push('L');
  });
  const teams = Object.values(stats);
  teams.forEach(t => {
    t.winPct = t.gp > 0 ? t.w / t.gp : 0;
    t.diff = t.pf - t.pa;
    t.diffPerGame = t.gp > 0 ? t.diff / t.gp : 0;
    t.powerScore = computePowerScore(t, sorted);
  });
  teams.sort((a, b) => b.powerScore - a.powerScore || b.winPct - a.winPct || b.diff - a.diff);
  const leader = teams[0];
  teams.forEach((t, i) => {
    t.rank = i + 1;
    t.gb = leader.gp > 0 ? ((leader.w - leader.l) - (t.w - t.l)) / 2 : 0;
  });
  return teams;
}

function computePowerScore(teamStat, allGames) {
  if (teamStat.gp === 0) return 0;
  const winPct = teamStat.winPct;
  const diffNorm = teamStat.diffPerGame / 20;
  const recent = teamStat.recentResults.slice(-5);
  const recentWins = recent.filter(r => r === 'W').length;
  const recentPct = recent.length > 0 ? recentWins / recent.length : 0;
  const score = (winPct * 0.5) + (diffNorm * 0.3) + (recentPct * 0.2);
  return Math.max(0, Math.min(1, score));
}

function renderStandings() {
  const tbody = document.getElementById('standings-tbody');
  if (!tbody) return;
  const standings = computeStandings();
  if (standings.every(t => t.gp === 0)) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text-muted)">Season 9 begins soon. Check back after the first game.</td></tr>`;
    return;
  }
  tbody.innerHTML = standings.map((t, i) => {
    const streakStr = t.gp > 0
      ? `<span class="${t.streakType === 'W' ? 'streak-w' : 'streak-l'}">${t.streakType}${t.streak}</span>`
      : '—';
    const diffStr = t.gp > 0
      ? `<span class="${t.diff >= 0 ? 'diff-pos' : 'diff-neg'}">${t.diff >= 0 ? '+' : ''}${t.diff}</span>`
      : '—';
    const gbStr = i === 0 ? '—' : (t.gb === 0 ? '—' : t.gb.toFixed(1));
    const psStr = t.gp > 0 ? `<span class="power-score">${(t.powerScore * 100).toFixed(1)}</span>` : '—';
    return `<tr>
      <td class="team-rank num">${t.rank}</td>
      <td class="team-name-cell">
        <a href="#" onclick="showTeam('${t.id}');return false;">${t.name}</a>
        <span class="team-abbr">${t.shortName}</span>
      </td>
      <td class="num">${t.gp}</td>
      <td class="num">${t.w}</td>
      <td class="num">${t.l}</td>
      <td class="num">${t.gp > 0 ? (t.winPct * 100).toFixed(1) + '%' : '—'}</td>
      <td class="num">${gbStr}</td>
      <td class="num">${streakStr}</td>
      <td class="num">${diffStr}</td>
      <td class="num">${psStr}</td>
    </tr>`;
  }).join('');
}

// ---- POWER RANKINGS ----
function renderPowerRankings() {
  const container = document.getElementById('power-rankings-list');
  if (!container) return;
  const standings = computeStandings();
  const top8 = standings.slice(0, 16);
  if (top8.every(t => t.gp === 0)) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:12px">Power rankings will appear after games are played.</div>`;
    return;
  }
  container.innerHTML = top8.map((t, i) => {
    const rank = i + 1;
    return `<div class="power-item">
      <span class="power-rank ${rank <= 3 ? 'top3' : ''}">${rank}</span>
      <span class="power-name">${t.name}</span>
      <span class="power-val">${(t.powerScore * 100).toFixed(1)}</span>
      <span class="power-delta same">—</span>
    </div>`;
  }).join('');
}

// ---- RESULTS FEED ----
function renderResultsFeed() {
  const container = document.getElementById('results-feed');
  if (!container) return;
  if (!seasonData.games || seasonData.games.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:12px 0">No games played yet. Check back after Week 1.</div>`;
    return;
  }
  const recent = [...seasonData.games].sort((a, b) => b.week - a.week).slice(0, 6);
  container.innerHTML = recent.map(g => {
    const winTeam = seasonData.teams.find(t => t.id === g.winner_id);
    const loseTeam = seasonData.teams.find(t => t.id === g.loser_id);
    if (!winTeam || !loseTeam) return '';
    return `<div class="result-card" onclick="this.classList.toggle('expanded')">
      <div class="result-meta">
        <span class="result-week">Week ${g.week}</span>
        <span class="result-turns">${g.turns} turns</span>
      </div>
      <div class="result-matchup">
        <span class="result-team">${winTeam.name}</span>
        <span class="result-score winner">${g.winner_score}</span>
        <span class="result-vs">vs</span>
        <span class="result-score loser">${g.loser_score}</span>
        <span class="result-team">${loseTeam.name}</span>
      </div>
      ${g.mvp ? `<div class="result-mvp">MVP: <span>${g.mvp}</span></div>` : ''}
      ${g.notes ? `<div class="result-notes">${g.notes}</div><div class="expand-hint">Click to expand</div>` : ''}
      ${(() => {
        const seriesGames = seasonData.schedule.filter(s =>
          (s.winner_id === g.winner_id && s.loser_id === g.loser_id) ||
          (s.winner_id === g.loser_id && s.loser_id === g.winner_id) ||
          (s.home_id === g.winner_id && s.away_id === g.loser_id) ||
          (s.home_id === g.loser_id && s.away_id === g.winner_id)
        );
        const played = seriesGames.filter(s => s.played);
        if (played.length === 0) return '';
        const wWins = played.filter(s => s.winner_id === g.winner_id).length;
        const lWins = played.filter(s => s.winner_id === g.loser_id).length;
        const label = played.length === 1
          ? (wWins === 1 ? `${winTeam.name} leads series 1-0` : `${loseTeam.name} leads series 1-0`)
          : wWins === 2 ? `${winTeam.name} wins series 2-0`
          : lWins === 2 ? `${loseTeam.name} wins series 2-0`
          : 'Series tied 1-1';
        return `<div style="font-size:10px;color:var(--gold-dim);margin-top:4px">↻ ${label}</div>`;
      })()}
    </div>`;
  }).join('');
}

// ---- UPCOMING SCHEDULE ----
function getHeadToHead(nameA, nameB) {
  if (!historyData || !historyData.head_to_head) return null;
  const key1 = `${nameA}|${nameB}`;
  const key2 = `${nameB}|${nameA}`;
  const record = historyData.head_to_head[key1] || historyData.head_to_head[key2];
  if (!record) return null;
  const aWins = record.team_a === nameA ? record.wins_a : record.wins_b;
  const bWins = record.team_a === nameA ? record.wins_b : record.wins_a;
  return { aWins, bWins, total: aWins + bWins };
}

function renderUpcomingThisWeek() {
  const container = document.getElementById('upcoming-week');
  if (!container) return;
  if (!seasonData.schedule || seasonData.schedule.length === 0) {
    container.innerHTML = '';
    return;
  }
  const unplayed = seasonData.schedule.filter(g => !g.played);
  if (unplayed.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:13px">Regular season complete.</div>`;
    return;
  }
  const nextWeek = Math.min(...unplayed.map(g => g.week));
  const weekGames = unplayed.filter(g => g.week === nextWeek);
  container.innerHTML = weekGames.map(g => {
    const home = seasonData.teams.find(t => t.id === g.home_id);
    const away = seasonData.teams.find(t => t.id === g.away_id);
    if (!home || !away) return '';
    const h2h = getHeadToHead(home.name, away.name);
    const h2hStr = h2h
      ? `<div style="font-size:10px;color:var(--text-muted);margin-top:1px">All-time: ${h2h.aWins}-${h2h.bWins}</div>`
      : '';

    // Series record: find both scheduled games between this pair this season
    const seriesGames = seasonData.schedule.filter(s =>
      (s.home_id === g.home_id && s.away_id === g.away_id) ||
      (s.home_id === g.away_id && s.away_id === g.home_id)
    );
    const playedSeries = seriesGames.filter(s => s.played);
    let seriesStr = '';
    if (playedSeries.length > 0) {
      const homeWins = playedSeries.filter(s => s.winner_id === g.home_id).length;
      const awayWins = playedSeries.filter(s => s.winner_id === g.away_id).length;
      const label = playedSeries.length === 2
        ? (homeWins === 2 ? `${home.name} leads series 2-0` : awayWins === 2 ? `${away.name} leads series 2-0` : 'Series tied 1-1')
        : (homeWins === 1 ? `${home.name} leads series 1-0` : `${away.name} leads series 1-0`);
      seriesStr = `<div style="font-size:10px;color:var(--gold-dim);margin-top:1px">↻ ${label}</div>`;
    }

    return `<div style="padding:7px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span>${home.name} <span style="color:var(--text-muted)">vs</span> ${away.name}</span>
      </div>
      ${h2hStr}
      ${seriesStr}
    </div>`;
  }).join('');
}

// ---- SEASON STATS ----
function renderSeasonStats() {
  const gamesEl = document.getElementById('stat-games');
  const teamsEl = document.getElementById('stat-teams');
  if (gamesEl) gamesEl.textContent = seasonData.games ? seasonData.games.length : 0;
  if (teamsEl) teamsEl.textContent = seasonData.teams ? seasonData.teams.length : 0;
}

// ---- TEAMS ----
function renderTeamsGrid() {
  const container = document.getElementById('teams-grid');
  if (!container) return;
  const standings = computeStandings();
  const standingMap = {};
  standings.forEach(s => standingMap[s.id] = s);
  container.innerHTML = seasonData.teams.map(t => {
    const s = standingMap[t.id] || { w: 0, l: 0, gp: 0 };
    const colorsHtml = t.colors.map(c =>
      `<span class="color-pip color-${c.replace('/', '')}">${c}</span>`
    ).join('');
    return `<div class="team-card" onclick="showTeam('${t.id}')">
      <div class="team-card-header">
        <div class="team-card-name">${t.name}</div>
        <div class="team-card-record">${s.w}-${s.l}</div>
      </div>
      <div class="team-card-identity">${t.identity}</div>
      <div class="team-card-colors">${colorsHtml}</div>
    </div>`;
  }).join('');
}

function showTeam(teamId) {
  navigate('teams');
  const team = seasonData.teams.find(t => t.id === teamId);
  if (!team) return;
  const standings = computeStandings();
  const s = standings.find(t => t.id === teamId) || { w: 0, l: 0, gp: 0, diff: 0, powerScore: 0 };
  document.getElementById('teams-grid-view').style.display = 'none';
  const detail = document.getElementById('team-detail-view');
  detail.style.display = 'block';
  const cardCounts = {};
  team.roster.forEach(c => { cardCounts[c] = (cardCounts[c] || 0) + 1; });
  const rosterHtml = Object.entries(cardCounts).map(([card, count]) =>
    `<span class="roster-card-name">${count > 1 ? count + 'x ' : ''}${card}</span>`
  ).join('');
  const teamGames = seasonData.games
    ? seasonData.games.filter(g => g.winner_id === teamId || g.loser_id === teamId)
        .sort((a, b) => b.week - a.week)
    : [];
  const gamesHtml = teamGames.length === 0
    ? '<div style="color:var(--text-muted);font-size:13px">No games played yet.</div>'
    : teamGames.map(g => {
        const isWin = g.winner_id === teamId;
        const opp = seasonData.teams.find(t => t.id === (isWin ? g.loser_id : g.winner_id));
        const myScore = isWin ? g.winner_score : g.loser_score;
        const oppScore = isWin ? g.loser_score : g.winner_score;
        return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
          <span>Wk ${g.week} — ${opp ? opp.name : '?'}</span>
          <span style="color:${isWin ? 'var(--green)' : 'var(--red)'}">
            ${isWin ? 'W' : 'L'} ${myScore} – ${oppScore}
          </span>
        </div>`;
      }).join('');
  detail.innerHTML = `
    <button class="back-btn" onclick="backToTeams()">← All Teams</button>
    <div class="team-detail-header">
      <div class="team-detail-name">${team.name}</div>
      <div class="team-detail-oneliner">${team.oneliner}</div>
      <div class="team-stats-row">
        <div class="team-stat">
          <span class="team-stat-val">${s.w}-${s.l}</span>
          <span class="team-stat-label">Record</span>
        </div>
        <div class="team-stat">
          <span class="team-stat-val">${s.gp > 0 ? (s.w / s.gp * 100).toFixed(0) + '%' : '—'}</span>
          <span class="team-stat-label">Win %</span>
        </div>
        <div class="team-stat">
          <span class="team-stat-val" style="color:${s.diff >= 0 ? 'var(--green)' : 'var(--red)'}">${s.diff >= 0 ? '+' : ''}${s.diff}</span>
          <span class="team-stat-label">Pt Diff</span>
        </div>
        <div class="team-stat">
          <span class="team-stat-val" style="color:var(--gold)">${s.gp > 0 ? (s.powerScore * 100).toFixed(1) : '—'}</span>
          <span class="team-stat-label">Power Score</span>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">
      <div>
        <div class="section-header"><span class="section-title">Roster</span></div>
        <div class="roster-grid">${rosterHtml || '<span style="color:var(--text-muted);font-size:13px">Roster pending.</span>'}</div>
      </div>
      <div>
        <div class="section-header"><span class="section-title">Game Log</span></div>
        ${gamesHtml}
      </div>
    </div>`;
}

function backToTeams() {
  document.getElementById('teams-grid-view').style.display = 'block';
  document.getElementById('team-detail-view').style.display = 'none';
}

// ---- GAME LOG ----
function renderGameLog(filterTeamId = null) {
  const container = document.getElementById('game-log-list');
  if (!container) return;
  if (!seasonData.games || seasonData.games.length === 0) {
    container.innerHTML = `<div class="empty-state"><h3>No games yet</h3><p>The Season 9 schedule hasn't started. Check back after Week 1.</p></div>`;
    return;
  }
  let games = [...seasonData.games].sort((a, b) => b.week - a.week);
  if (filterTeamId) {
    games = games.filter(g => g.winner_id === filterTeamId || g.loser_id === filterTeamId);
  }
  container.innerHTML = games.map(g => {
    const winTeam = seasonData.teams.find(t => t.id === g.winner_id);
    const loseTeam = seasonData.teams.find(t => t.id === g.loser_id);
    if (!winTeam || !loseTeam) return '';
    return `<div class="game-log-item" onclick="this.classList.toggle('expanded')">
      <div class="game-log-header">
        <span class="game-log-matchup">${winTeam.name} vs ${loseTeam.name}</span>
        <span class="game-log-score">${g.winner_score} – ${g.loser_score}</span>
      </div>
      <div class="game-log-meta">
        <span>Week ${g.week}</span>
        <span>${g.turns} turns</span>
        ${g.mvp ? `<span>MVP: ${g.mvp}</span>` : ''}
      </div>
      ${g.notes ? `<div class="game-log-notes">${g.notes}</div>` : ''}
    </div>`;
  }).join('');
}

// ---- EXPOSE TO HTML ----
window.navigate = navigate;
window.showTeam = showTeam;
window.backToTeams = backToTeams;
window.renderGameLog = renderGameLog;
window.saveData = saveData;
window.seasonData = seasonData;

document.addEventListener('DOMContentLoaded', init);
