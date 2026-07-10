// ============================================
//   MTG | MVM THE LEAGUE — APP.JS
// ============================================

let seasonData = null;
let historyData = null;
const API = `http://${location.hostname}:3001`;

const GL_HOME = ['localhost', '127.0.0.1', '192.168.4.141'];
const glIsLocal = () => GL_HOME.includes(location.hostname);

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
  renderThisWeekResults();
  renderSeasonStats();
  renderMeetTeams();
  renderGameLog();
  glInjectButton();
}

// ---- NAVIGATION ----
function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');
  const navLink = document.querySelector(`nav a[data-page="${pageId}"]`);
  if (navLink) navLink.classList.add('active');
}

// Returns a team-history.html URL if the team has an all_time_teams entry, else null
function teamHistoryUrl(teamName) {
  if (!historyData || !historyData.all_time_teams) return null;
  if (!historyData.all_time_teams[teamName]) return null;
  return `team-history.html?team=${encodeURIComponent(teamName)}`;
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
        ${teamHistoryUrl(t.name) ? `<a href="${teamHistoryUrl(t.name)}" class="team-history-link">${t.name}</a>` : t.name}
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
  if (standings.every(t => t.gp === 0)) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:12px">Risers & fallers will appear after games are played.</div>`;
    return;
  }
  const standingsRanked = [...standings].sort((a,b) => b.winPct - a.winPct || b.diff - a.diff);
  const standingsRankMap = {};
  standingsRanked.forEach((t, i) => { standingsRankMap[t.id] = i + 1; });

  const powerRanked = [...standings].sort((a,b) => b.powerScore - a.powerScore);
  const diverged = powerRanked.map((t, i) => {
    const powerRank = i + 1;
    const standingsRank = standingsRankMap[t.id];
    return { ...t, powerRank, standingsRank, delta: standingsRank - powerRank };
  }).filter(t => t.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);

  if (diverged.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:12px">Power rankings match the standings — no risers or fallers this week.</div>`;
    return;
  }

  container.innerHTML = diverged.map(t => {
    const rising = t.delta > 0;
    const arrow = rising ? '▲' : '▼';
    const color = rising ? 'var(--green)' : 'var(--red)';
    return `<div class="power-item">
      <span class="power-rank ${Math.abs(t.delta) >= 3 ? 'top3' : ''}">${t.powerRank}</span>
      <span class="power-name">${t.name}</span>
      <span class="power-val">${(t.powerScore * 100).toFixed(1)}</span>
      <span class="power-delta" style="color:${color};font-weight:600">${arrow} ${Math.abs(t.delta)}</span>
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

// ---- THIS WEEK'S RESULTS (right rail) ----
function renderThisWeekResults() {
  const section  = document.getElementById('this-week-results-section');
  const container = document.getElementById('this-week-results');
  if (!section || !container) return;

  if (!seasonData.games || seasonData.games.length === 0) {
    section.style.display = 'none';
    return;
  }

  const maxWeek = Math.max(...seasonData.games.map(g => g.week));
  const weekGames = seasonData.games.filter(g => g.week === maxWeek);
  if (weekGames.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  container.innerHTML = weekGames.map(g => {
    const winTeam  = seasonData.teams.find(t => t.id === g.winner_id);
    const loseTeam = seasonData.teams.find(t => t.id === g.loser_id);
    if (!winTeam || !loseTeam) return '';
    const secondary = [
      g.turns ? `${g.turns}t` : '',
      g.mvp   ? `MVP: ${g.mvp}` : '',
    ].filter(Boolean).join(' · ');
    return `<div style="padding:7px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;font-size:13px">
        <span>${winTeam.name} <span style="color:var(--text-muted)">vs</span> ${loseTeam.name}</span>
        <span style="color:var(--gold);white-space:nowrap;margin-left:8px">${g.winner_score} – ${g.loser_score}</span>
      </div>
      ${secondary ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${secondary}</div>` : ''}
    </div>`;
  }).join('');
}

// ---- MEET THE TEAMS ----
function renderMeetTeams() {
  const container = document.getElementById('meet-teams-grid');
  if (!container || !seasonData.teams) return;
  container.innerHTML = seasonData.teams.map(t => {
    const url = teamHistoryUrl(t.name);
    return url
      ? `<a href="${url}" class="meet-team-card meet-team-card-link">
          <div class="meet-team-name">${t.name}</div>
          <div class="meet-team-identity">${t.identity || ''}</div>
          <div class="meet-team-oneliner">${t.oneliner || ''}</div>
        </a>`
      : `<div class="meet-team-card">
          <div class="meet-team-name">${t.name}</div>
          <div class="meet-team-identity">${t.identity || ''}</div>
          <div class="meet-team-oneliner">${t.oneliner || ''}</div>
        </div>`;
  }).join('');
}

function toggleMeetTeams(btn) {
  const grid = document.getElementById('meet-teams-grid');
  if (!grid) return;
  const open = grid.style.display !== 'none';
  grid.style.display = open ? 'none' : 'grid';
  btn.setAttribute('aria-expanded', String(!open));
  btn.querySelector('.meet-teams-chevron').textContent = open ? '▾' : '▴';
}
window.toggleMeetTeams = toggleMeetTeams;

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
  const standings = computeStandings();
  const standingsRanked = [...standings].sort((a,b) => b.winPct - a.winPct || b.diff - a.diff);
  const rankMap = {};
  standingsRanked.forEach((t, i) => { rankMap[t.id] = i + 1; });
  container.innerHTML = weekGames.map(g => {
    const home = seasonData.teams.find(t => t.id === g.home_id);
    const away = seasonData.teams.find(t => t.id === g.away_id);
    if (!home || !away) return '';
    const h2h = getHeadToHead(home.name, away.name);
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

    const homeRank = rankMap[home.id] ? `#${rankMap[home.id]}` : '—';
    const awayRank = rankMap[away.id] ? `#${rankMap[away.id]}` : '—';
    const allTimeStr = h2h ? `<span style="font-size:11px;color:var(--text-muted)">All-time: ${h2h.aWins}-${h2h.bWins}</span>` : '';

    return `<div style="padding:7px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;font-size:13px">
        <span>${home.name} <span style="color:var(--text-muted)">vs</span> ${away.name}
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${homeRank} vs ${awayRank}</div>
        </span>
        ${allTimeStr}
      </div>
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
    const editBtn = glIsLocal() && g.id
      ? `<button class="gl-edit-btn" onclick="event.stopPropagation();editLogGame('${g.id}')" title="Edit game">✎</button>`
      : '';
    return `<div class="game-log-item" onclick="this.classList.toggle('expanded')">
      <div class="game-log-header">
        <span class="game-log-matchup">${winTeam.name} vs ${loseTeam.name}</span>
        <span style="display:flex;align-items:center;gap:6px">
          <span class="game-log-score">${g.winner_score} – ${g.loser_score}</span>
          ${editBtn}
        </span>
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

// ---- GAME LOG INLINE FORM ----

let _glEditingGameId = null;
let _glScheduleId    = null;

function glInjectButton() {
  if (!glIsLocal()) return;
  const area = document.getElementById('gl-log-btn-area');
  if (!area || area.querySelector('button')) return;
  const btn = document.createElement('button');
  btn.id = 'gl-open-btn';
  btn.textContent = '+ Log game';
  btn.className = 'gl-log-btn';
  btn.onclick = () => openLogGameForm({});
  area.appendChild(btn);
}

function openLogGameForm(prefill = {}) {
  const layout = document.getElementById('gl-layout');
  const area   = document.getElementById('log-game-form-area');
  if (!area || !layout) return;
  // Toggle closed if already open without a specific prefill trigger
  if (layout.classList.contains('rail-open') && !prefill.gameId && !prefill.scheduleId) {
    closeLogGameForm();
    return;
  }
  _glEditingGameId = prefill.gameId || null;
  _glScheduleId    = prefill.scheduleId || null;
  area.innerHTML = _glBuildFormHTML(prefill);
  layout.classList.add('rail-open');
}

function closeLogGameForm() {
  _glEditingGameId = null;
  _glScheduleId    = null;
  const layout = document.getElementById('gl-layout');
  const area   = document.getElementById('log-game-form-area');
  if (layout) layout.classList.remove('rail-open');
  if (area)   area.innerHTML = '';
}

function glPrefillFromSchedule(scheduleId) {
  const g = (seasonData.schedule || []).find(s => s.id === scheduleId);
  if (!g) return;
  const home = seasonData.teams.find(t => t.id === g.home_id);
  const away = seasonData.teams.find(t => t.id === g.away_id);
  openLogGameForm({
    scheduleId: g.id,
    week: g.week,
    winnerId: g.home_id,
    loserId: g.away_id,
    matchupLabel: `${home ? home.name : g.home_id} vs ${away ? away.name : g.away_id}`,
  });
}

function editLogGame(gameId) {
  const g = (seasonData.games || []).find(x => x.id === gameId);
  if (!g) return;
  openLogGameForm({
    gameId: g.id,
    week: g.week,
    winnerId: g.winner_id,
    loserId: g.loser_id,
    winnerScore: g.winner_score ?? '',
    loserScore:  g.loser_score  ?? '',
    winnerMana:  g.winner_mana  ?? '',
    loserMana:   g.loser_mana   ?? '',
    winnerHand:  g.winner_hand  ?? '',
    loserHand:   g.loser_hand   ?? '',
    winnerDeploy: g.winner_deploy ?? '',
    loserDeploy:  g.loser_deploy  ?? '',
    turns: g.turns ?? '',
    mvp:   g.mvp   ?? '',
    notes: g.notes ?? '',
  });
}

function _glBuildFormHTML(p = {}) {
  const isEdit = !!p.gameId;
  const teams  = (seasonData && seasonData.teams) || [];
  const v      = (k, def = '') => (p[k] != null && p[k] !== undefined) ? p[k] : def;

  const teamOpts = (selectedId) => teams.map(t =>
    `<option value="${t.id}"${t.id === selectedId ? ' selected' : ''}>${t.name}</option>`
  ).join('');

  return `
    <div class="log-game-form">
      <div class="log-game-form-header">
        <span class="log-game-form-title">${isEdit ? 'Edit Game' : 'Log Game'}</span>
        <button class="log-game-form-close" onclick="closeLogGameForm()">✕</button>
      </div>
      ${p.scheduleId ? `<div class="log-game-prefill-banner">
        <strong>${p.matchupLabel || ''}</strong> — Week ${p.week || ''}. Set Winner / Loser to match the result.
      </div>` : ''}
      <div class="gl-form-pair">
        <div class="form-group">
          <label>Week</label>
          <input type="number" id="gl-week" min="1" placeholder="1" value="${v('week')}">
        </div>
        <div class="form-group">
          <label>Turns</label>
          <input type="number" id="gl-turns" min="1" placeholder="e.g. 8" value="${v('turns')}">
        </div>
      </div>
      <div class="gl-form-pair">
        <div class="form-group">
          <label>Winner</label>
          <select id="gl-winner">${teamOpts(v('winnerId'))}</select>
        </div>
        <div class="form-group">
          <label>Loser</label>
          <select id="gl-loser">${teamOpts(v('loserId'))}</select>
        </div>
      </div>
      <div class="gl-form-pair">
        <div class="form-group">
          <label>W Score</label>
          <input type="number" id="gl-winner-score" placeholder="e.g. 14" value="${v('winnerScore')}">
        </div>
        <div class="form-group">
          <label>L Score</label>
          <input type="number" id="gl-loser-score" placeholder="e.g. -3" value="${v('loserScore')}">
        </div>
      </div>
      <div class="gl-form-pair">
        <div class="form-group">
          <label>W Mana</label>
          <input type="number" id="gl-winner-mana" value="${v('winnerMana')}">
        </div>
        <div class="form-group">
          <label>L Mana</label>
          <input type="number" id="gl-loser-mana" value="${v('loserMana')}">
        </div>
      </div>
      <div class="gl-form-pair">
        <div class="form-group">
          <label>W Hand</label>
          <input type="number" id="gl-winner-hand" value="${v('winnerHand')}">
        </div>
        <div class="form-group">
          <label>L Hand</label>
          <input type="number" id="gl-loser-hand" value="${v('loserHand')}">
        </div>
      </div>
      <div class="gl-form-pair">
        <div class="form-group">
          <label>W Deploy</label>
          <input type="number" id="gl-winner-deploy" value="${v('winnerDeploy')}">
        </div>
        <div class="form-group">
          <label>L Deploy</label>
          <input type="number" id="gl-loser-deploy" value="${v('loserDeploy')}">
        </div>
      </div>
      <div class="gl-form-full">
        <div class="form-group">
          <label>MVP Card</label>
          <input type="text" id="gl-mvp" placeholder="e.g. Crystalline Sliver" value="${v('mvp')}">
        </div>
      </div>
      <div class="gl-form-full">
        <div class="form-group">
          <label>Notes</label>
          <textarea id="gl-notes" placeholder="Game recap, key moments...">${v('notes')}</textarea>
        </div>
      </div>
      <div class="log-game-form-actions">
        <button class="btn-primary" onclick="submitLogGame()" style="width:auto;padding:8px 20px;font-size:13px">
          ${isEdit ? 'Update Game' : 'Save Game'}
        </button>
        <button class="gl-cancel-btn" onclick="closeLogGameForm()">Cancel</button>
      </div>
      <div id="gl-success" class="success-msg">✓ Game saved.</div>
      <div id="gl-error" class="success-msg" style="background:#2a1a1a;border-color:#c0392b;color:#d47a7a">✗ Could not reach server.</div>
    </div>`;
}

function _glNum(id) { const v = parseInt((document.getElementById(id) || {}).value); return isNaN(v) ? null : v; }
function _glStr(id) { return ((document.getElementById(id) || {}).value || '').trim(); }

async function submitLogGame() {
  const week        = _glNum('gl-week');
  const winnerId    = _glStr('gl-winner');
  const loserId     = _glStr('gl-loser');
  const winnerScore = _glNum('gl-winner-score');
  const loserScore  = _glNum('gl-loser-score');
  const turns       = _glNum('gl-turns');

  if (!week || !winnerId || !loserId || winnerScore == null || loserScore == null || !turns) {
    alert('Please fill in all required fields: Week, Teams, Scores, Turns.');
    return;
  }
  if (winnerId === loserId) {
    alert('Winner and Loser cannot be the same team.');
    return;
  }

  const gameData = {
    week, winner_id: winnerId, loser_id: loserId,
    winner_score: winnerScore, loser_score: loserScore, turns,
    mvp:          _glStr('gl-mvp'),
    notes:        _glStr('gl-notes'),
    winner_mana:  _glNum('gl-winner-mana'),
    loser_mana:   _glNum('gl-loser-mana'),
    winner_hand:  _glNum('gl-winner-hand'),
    loser_hand:   _glNum('gl-loser-hand'),
    winner_deploy: _glNum('gl-winner-deploy'),
    loser_deploy:  _glNum('gl-loser-deploy'),
  };

  if (_glEditingGameId !== null) {
    const idx = (seasonData.games || []).findIndex(g => g.id === _glEditingGameId);
    if (idx !== -1) Object.assign(seasonData.games[idx], gameData);
  } else {
    if (!seasonData.games) seasonData.games = [];
    seasonData.games.push({ id: `g${Date.now()}`, ...gameData });

    if (_glScheduleId && seasonData.schedule) {
      const sched = seasonData.schedule.find(s => s.id === _glScheduleId);
      if (sched) {
        Object.assign(sched, {
          played: true, winner_id: winnerId, loser_id: loserId,
          winner_score: winnerScore, loser_score: loserScore,
          turns, mvp: gameData.mvp, notes: gameData.notes,
        });
      }
    }
  }

  const ok = await saveData();
  if (ok) {
    const successEl = document.getElementById('gl-success');
    if (successEl) { successEl.style.display = 'block'; }
    setTimeout(() => {
      closeLogGameForm();
      renderStandings();
      renderPowerRankings();
      renderResultsFeed();
      renderUpcomingThisWeek();
      renderThisWeekResults();
      renderSeasonStats();
      renderGameLog();
    }, 600);
  } else {
    const errEl = document.getElementById('gl-error');
    if (errEl) { errEl.style.display = 'block'; setTimeout(() => { errEl.style.display = 'none'; }, 3000); }
  }
}

// ---- EXPOSE TO HTML ----
window.navigate = navigate;
window.renderGameLog = renderGameLog;
window.openLogGameForm   = openLogGameForm;
window.closeLogGameForm  = closeLogGameForm;
window.glPrefillFromSchedule = glPrefillFromSchedule;
window.editLogGame       = editLogGame;
window.submitLogGame     = submitLogGame;

function renderSchedule(filterTeamId = null) {
  const container = document.getElementById('game-log-list');
  if (!container) return;
  const schedule = seasonData.schedule || [];
  const teams = seasonData.teams || [];
  const findTeam = id => teams.find(t => t.id === id);

  let upcoming = schedule
    .filter(g => !g.played)
    .filter(g => !filterTeamId || g.home_id === filterTeamId || g.away_id === filterTeamId)
    .sort((a, b) => a.week - b.week);

  if (!upcoming.length) {
    container.innerHTML = `<div class="empty-state"><p style="color:var(--text-muted);padding:24px 0">No upcoming games.</p></div>`;
    return;
  }

  let currentWeek = null;
  container.innerHTML = upcoming.map(g => {
    const home = findTeam(g.home_id);
    const away = findTeam(g.away_id);
    if (!home || !away) return '';
    let weekHeader = '';
    if (g.week !== currentWeek) {
      currentWeek = g.week;
      weekHeader = `<div style="font-size:11px;color:var(--gold);text-transform:uppercase;letter-spacing:0.08em;padding:10px 0 4px;border-top:1px solid var(--border);margin-top:4px">Week ${g.week}</div>`;
    }
    const scheduleClick = glIsLocal()
      ? `onclick="glPrefillFromSchedule('${g.id}')" title="Click to log this game"`
      : 'style="cursor:default"';
    const scheduleHint = glIsLocal()
      ? `<div class="gl-schedule-hint">click to log →</div>` : '';
    return `${weekHeader}<div class="game-log-item" ${scheduleClick}>
      <div class="game-log-header">
        <span class="game-log-matchup">${home.name} vs ${away.name}</span>
        <span style="font-size:11px;color:var(--text-muted)">Week ${g.week}${glIsLocal() ? '' : ''}</span>
      </div>
      ${scheduleHint}
    </div>`;
  }).join('');
}
window.renderSchedule = renderSchedule;
window.saveData = saveData;
window.seasonData = seasonData;

function switchGameLogTab(tab) {
  const resultsBtn = document.getElementById('log-tab-results');
  const scheduleBtn = document.getElementById('log-tab-schedule');
  if (tab === 'results') {
    resultsBtn.style.background = 'var(--gold)';
    resultsBtn.style.color = 'var(--bg)';
    resultsBtn.style.borderColor = 'var(--gold)';
    scheduleBtn.style.background = 'transparent';
    scheduleBtn.style.color = 'var(--text-muted)';
    scheduleBtn.style.borderColor = 'var(--border)';
    renderGameLog();
  } else {
    scheduleBtn.style.background = 'var(--gold)';
    scheduleBtn.style.color = 'var(--bg)';
    scheduleBtn.style.borderColor = 'var(--gold)';
    resultsBtn.style.background = 'transparent';
    resultsBtn.style.color = 'var(--text-muted)';
    resultsBtn.style.borderColor = 'var(--border)';
    renderSchedule();
  }
}
window.switchGameLogTab = switchGameLogTab;

document.addEventListener('DOMContentLoaded', init);

// Honor deep-link hash on load
if (location.hash) {
  const pageId = location.hash.slice(1);
  if (document.getElementById('page-' + pageId)) {
    navigate(pageId);
  }
}
