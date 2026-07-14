// ============================================
//   MTG | MVM — ROSTERS.JS
// ============================================

let LAND_FILTER = new Set();
let _customCards = new Map(); // name → card object (has exception_note if applicable)

const HOME_ADDRESSES = ['localhost', '127.0.0.1', '192.168.4.141'];
const isLocal = () => HOME_ADDRESSES.includes(window.location.hostname);

const TXN_TYPES = ['Waive', 'Trade', 'Buy', 'Create'];

let _seasonData = null;
let _landsVisible = false;
let _landsOnly = false;
let _currentView = 'byteam';
let _currentTeamId = null;
let _allFilter  = { txnType: '', proxy: false, cardSearch: '' };
let _teamFilter = { txnType: '', proxy: false, cardSearch: '' };
let _allSortField  = null; let _allSortDir  = 1;
let _teamSortField = null; let _teamSortDir = 1;

async function rostersInit() {
  try {
    const API = `http://${window.location.hostname}:3001`;
    const res = await fetch(`${API}/data`);
    _seasonData = await res.json();
  } catch (e) {
    const res = await fetch('data/season9.json');
    _seasonData = await res.json();
  }
  try {
    const [poolRes, customRes] = await Promise.all([
      fetch('data/card-pool.json'),
      fetch('data/custom-cards.json'),
    ]);
    const cardPool = await poolRes.json();
    LAND_FILTER = new Set(cardPool.filter(c => c.type_line && c.type_line.includes('Land')).map(c => c.name));
    const customPool = await customRes.json();
    _customCards = new Map(customPool.map(c => [c.name, c]));
  } catch (e) {
    LAND_FILTER = new Set(['Plains','Island','Swamp','Mountain','Forest']);
  }
  const leagueTeams = _seasonData.teams || [];
  if (!_currentTeamId && leagueTeams.length) {
    _currentTeamId = leagueTeams.slice().sort((a,b) => a.name.localeCompare(b.name))[0].id;
  }
  renderRostersPage();
}

function renderRostersPage() {
  const container = document.getElementById('rosters-root');
  if (!container || !_seasonData) return;

  const leagueTeams = (_seasonData.teams || []).slice().sort((a,b) => a.name.localeCompare(b.name));
  const bossDecks = _seasonData.bossDecks || [];

  container.innerHTML = `
    ${renderTeamSwitcher(leagueTeams, bossDecks)}
    <div id="roster-content-section">
      ${_currentView === 'byteam' ? renderByTeamView(leagueTeams, bossDecks) : renderAllTeamsView(leagueTeams, bossDecks)}
    </div>
  `;
}

function renderTeamSwitcher(leagueTeams, bossDecks) {
  const allTeamsBtn = `<button class="roster-team-btn${_currentView==='allteams'?' active':''}" data-team-id="__all__" onclick="rosterViewAllTeams()">All Teams</button>`;

  const leagueBtns = leagueTeams.map(t =>
    `<button class="roster-team-btn${_currentView==='byteam'&&t.id===_currentTeamId?' active':''}" data-team-id="${t.id}" onclick="rosterSelectTeam('${t.id}')">${t.name}</button>`
  ).join('');

  const bossBtns = bossDecks.map(t =>
    `<button class="roster-team-btn boss${_currentView==='byteam'&&t.id===_currentTeamId?' active':''}" data-team-id="${t.id}" onclick="rosterSelectTeam('${t.id}')">${t.name}</button>`
  ).join('');

  return `
    <div class="roster-switcher" id="roster-switcher">
      <div class="roster-switcher-row">${allTeamsBtn}${leagueBtns}${bossBtns}</div>
    </div>`;
}

// ---- BY TEAM ----

function renderByTeamView(leagueTeams, bossDecks) {
  const allDecks = [...leagueTeams, ...bossDecks];
  const team = allDecks.find(t => t.id === _currentTeamId) || leagueTeams[0];
  return `
    <div id="roster-table-section">
      ${team ? renderTeamTable(team) : '<div class="roster-empty">No team selected.</div>'}
    </div>`;
}

function renderTeamFilterBar() {
  const hasFilter = _teamFilter.txnType || _teamFilter.proxy || _teamFilter.cardSearch;
  return `
    <div class="roster-filter-bar">
      <span class="roster-filter-label">Filter:</span>
      <select onchange="rosterSetTeamFilter('txnType',this.value)">
        <option value="">All TXN types</option>
        <option value="any"${_teamFilter.txnType==='any'?' selected':''}>Any TXN type</option>
        <option value="none"${_teamFilter.txnType==='none'?' selected':''}>Blank</option>
        ${TXN_TYPES.map(t => `<option value="${t}"${_teamFilter.txnType===t?' selected':''}>${t}</option>`).join('')}
      </select>
      <label class="roster-lands-label" style="margin-left:4px">
        <input type="checkbox" ${_teamFilter.proxy?'checked':''} onchange="rosterSetTeamFilter('proxy',this.checked)">
        Proxy
      </label>
      <label class="roster-lands-label" style="margin-left:4px">
        <input type="checkbox" onchange="rosterToggleLands(this.checked)" ${_landsVisible?'checked':''}>
        Show Lands
      </label>
      <label class="roster-lands-label">
        <input type="checkbox" onchange="rosterToggleLandsOnly(this.checked)" ${_landsOnly?'checked':''}>
        Only Lands
      </label>
      <div style="position:relative;display:inline-flex;align-items:center;margin-left:4px">
        <input class="roster-inline-search" type="text" placeholder="Search cards…"
          value="${(_teamFilter.cardSearch||'').replace(/"/g,'&quot;')}"
          oninput="rosterTeamSearchInput(this.value)">
        ${_teamFilter.cardSearch ? `<button class="roster-inline-clear" onclick="rosterTeamSearchClear()">✕</button>` : ''}
      </div>
      ${hasFilter ? `<button class="roster-filter-clear" onclick="rosterClearTeamFilter()">Clear</button>` : ''}
    </div>`;
}

function renderTeamTable(team) {
  const sorted = [...(team.roster || [])].sort();
  const notes = team.rosterNotes || {};
  const history = team.transactionHistory || [];
  const counts = {};

  const rows = sorted.map(card => {
    counts[card] = (counts[card] || 0);
    const idx = counts[card]++;
    const key = `${card}|${idx}`;
    const note = notes[key] || {};
    return { card, idx, key, note };
  }).filter(r => {
    if (_landsOnly) { if (!LAND_FILTER.has(r.card)) return false; }
    else if (!_landsVisible && LAND_FILTER.has(r.card)) return false;
    if (_teamFilter.txnType === 'any'  && !r.note.txnType) return false;
    if (_teamFilter.txnType === 'none' &&  r.note.txnType) return false;
    if (_teamFilter.txnType && _teamFilter.txnType !== 'any' && _teamFilter.txnType !== 'none' && r.note.txnType !== _teamFilter.txnType) return false;
    if (_teamFilter.proxy && !r.note.proxy) return false;
    if (_teamFilter.cardSearch && !r.card.toLowerCase().includes(_teamFilter.cardSearch.toLowerCase())) return false;
    return true;
  });

  if (_teamSortField) {
    const f = _teamSortField, d = _teamSortDir;
    rows.sort((a, b) => {
      let av, bv;
      if (f === 'card')       { av = a.card;          bv = b.card; }
      else if (f === 'txn')   { av = a.note.txnType;  bv = b.note.txnType; }
      else if (f === 'fa')    { av = a.note.freeAgent; bv = b.note.freeAgent; }
      else if (f === 'proxy') { av = a.note.proxy ? 1 : 0; bv = b.note.proxy ? 1 : 0; }
      if (av == null || av === '') return 1;
      if (bv == null || bv === '') return -1;
      if (typeof av === 'number') return d * (av - bv);
      return d * String(av).localeCompare(String(bv));
    });
  }

  const filterBar = renderTeamFilterBar();
  const hasFilter = _teamFilter.txnType || _teamFilter.proxy || _teamFilter.cardSearch;

  const nonLandCount = (team.roster || []).filter(c => !LAND_FILTER.has(c)).length;
  const landCount    = (team.roster || []).filter(c =>  LAND_FILTER.has(c)).length;
  const txnHistory   = history.slice().sort((a,b) => b.season - a.season || b.week - a.week);

  const addRow = isLocal() ? `
    <tr id="add-card-row-${team.id}">
      <td colspan="2">
        <input type="text" id="add-card-name-${team.id}" placeholder="Card name…"
          style="width:100%;font-size:13px;padding:5px 8px;border-radius:4px"
          onkeydown="if(event.key==='Enter'){event.preventDefault();rosterAddCard('${team.id}');}">
      </td>
      <td>
        <input type="number" id="add-card-qty-${team.id}" value="1" min="1" max="4"
          style="width:52px;font-size:13px;padding:5px 6px;border-radius:4px">
      </td>
      <td colspan="${isLocal() ? 3 : 2}">
        <button class="commit-btn" onclick="rosterAddCard('${team.id}')"
          style="white-space:nowrap">+ Add Card</button>
      </td>
    </tr>` : '';

  if (rows.length === 0) {
    const msg = hasFilter
      ? 'No cards match the current filters.'
      : `No cards yet.`;
    const emptyTable = isLocal() ? `
      <div class="roster-table-wrap">
        <table class="roster-table">
          <thead>
            <tr><th>Card</th><th>TXN</th><th>Qty</th><th colspan="3"></th></tr>
          </thead>
          <tbody>${addRow}</tbody>
        </table>
      </div>` : `<div class="roster-empty">${msg}</div>`;
    return filterBar + `
      <div class="roster-team-header">
        <div class="roster-team-name">${team.name}</div>
        <div class="roster-card-count">0 cards</div>
      </div>` + emptyTable;
  }

  const tableRows    = rows.map(r => renderRow(r, team.id)).join('');
  const shownLabel   = hasFilter ? `${rows.length} matching` : `${rows.length} shown`;

  return filterBar + `
    <div class="roster-team-header">
      <div class="roster-team-name">${team.name}</div>
      <div class="roster-card-count">${shownLabel} · ${nonLandCount} non-land · ${landCount} land</div>
    </div>
    <div class="roster-table-wrap">
      <table class="roster-table">
        <thead>
          <tr>
            ${['card','txn','fa','proxy'].map(f => {
              const labels = {card:'Card',txn:'TXN',fa:'Free Agent',proxy:'Proxy'};
              const ind = _teamSortField === f ? (_teamSortDir === 1 ? ' ▲' : ' ▼') : '';
              return `<th style="cursor:pointer;user-select:none" onclick="rosterSetTeamSort('${f}')">${labels[f]}${ind}</th>`;
            }).join('')}
            ${isLocal() ? '<th></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          ${addRow}
        </tbody>
      </table>
    </div>
    ${txnHistory.length ? `
    <div class="txn-history-section">
      <div class="txn-history-label">Transaction History</div>
      ${txnHistory.map(tx => `
        <div class="txn-row">
          <span>S${tx.season} Wk${tx.week} &nbsp;&middot;&nbsp;
            <span style="color:var(--red)">&#8722; ${tx.cardOut}</span>
            &nbsp;&rarr;&nbsp;
            <span style="color:var(--green)">+ ${tx.cardIn}</span>
          </span>
          <span>${tx.txnType || ''}${tx.timestamp ? ' &middot; ' + new Date(tx.timestamp).toLocaleDateString() : ''}</span>
        </div>`).join('')}
    </div>` : ''}
  `;
}

function renderRow(r, teamId) {
  const { card, key, note } = r;
  const hasNote = !!(note.txnType || note.freeAgent || note.proxy);
  const safeKey = key.replace(/[|'\s]/g, '-');

  const txnOptions = ['', ...TXN_TYPES].map(t =>
    `<option value="${t}"${note.txnType === t ? ' selected' : ''}>${t || '—'}</option>`
  ).join('');

  const freeAgentVal = (note.freeAgent || '').replace(/"/g, '&quot;');

  const customEntry = _customCards.get(card);
  const nameTag = customEntry
    ? (customEntry.exception_note
        ? ` <span class="exception-badge" title="${customEntry.exception_note.replace(/"/g,'&quot;')}">Exception</span>`
        : ' <span class="custom-badge">Custom</span>')
    : '';
  const proxyCell = customEntry
    ? `<input type="checkbox" checked disabled title="${customEntry.exception_note ? 'House exception — always proxied' : 'Custom card — always proxied'}">`
    : `<input type="checkbox"
        data-team="${teamId}" data-key="${key}"
        ${note.proxy ? 'checked' : ''}
        onchange="rosterNoteUpdate(this.dataset.team,this.dataset.key,'proxy',this.checked)">`;

  return `<tr class="${hasNote ? 'has-note' : ''}" id="row-${teamId}-${safeKey}">
    <td>${card}${nameTag}</td>
    <td>
      <select data-team="${teamId}" data-key="${key}"
        onchange="rosterNoteUpdate(this.dataset.team,this.dataset.key,'txnType',this.value)">
        ${txnOptions}
      </select>
    </td>
    <td>
      <input type="text"
        data-team="${teamId}" data-key="${key}"
        value="${freeAgentVal}" placeholder="card name…"
        oninput="rosterNoteUpdate(this.dataset.team,this.dataset.key,'freeAgent',this.value)">
    </td>
    <td class="td-center">
      ${proxyCell}
    </td>
    <td class="muted">${note.status || ''}${note.week ? ' Wk' + note.week : ''}</td>
    ${isLocal() ? `
    <td class="td-commit" id="commit-${teamId}-${safeKey}" style="white-space:nowrap">
      ${(note.txnType || note.freeAgent) ? `<button class="commit-btn"
        data-team="${teamId}" data-key="${key}"
        onclick="rosterCommit(this.dataset.team,this.dataset.key)">Commit</button>` : ''}
      <button class="commit-btn" style="color:var(--red);border-color:var(--red);margin-left:4px"
        data-team="${teamId}" data-key="${key}" data-card="${card.replace(/"/g,'&quot;')}"
        onclick="rosterRemoveCard(this.dataset.team,this.dataset.key,this.dataset.card)">✕</button>
    </td>` : ''}
  </tr>`;
}

// ---- NOTE UPDATE (auto-save, no re-render) ----

let _saveTimer = null;

function rosterNoteUpdate(teamId, cardKey, field, value) {
  const allDecks = [...(_seasonData.teams || []), ...(_seasonData.bossDecks || [])];
  const team = allDecks.find(t => t.id === teamId);
  if (!team) return;
  if (!team.rosterNotes) team.rosterNotes = {};
  if (!team.rosterNotes[cardKey]) team.rosterNotes[cardKey] = {};
  team.rosterNotes[cardKey][field] = value;

  // Surgically update row class and commit cell — no full re-render
  const note = team.rosterNotes[cardKey];
  const hasNote = !!(note.txnType || note.freeAgent || note.proxy);
  const safeKey = cardKey.replace(/[|'\s]/g, '-');

  const row = document.getElementById(`row-${teamId}-${safeKey}`);
  if (row) row.className = hasNote ? 'has-note' : '';

  if (isLocal()) {
    const commitCell = document.getElementById(`commit-${teamId}-${safeKey}`);
    if (commitCell) {
      commitCell.innerHTML = (note.txnType || note.freeAgent)
        ? `<button class="commit-btn"
            data-team="${teamId}" data-key="${cardKey.replace(/"/g, '&quot;')}"
            onclick="rosterCommit(this.dataset.team,this.dataset.key)">Commit</button>`
        : '';
    }
  }

  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveToServer, 800);
}

async function saveToServer() {
  if (!isLocal()) return;
  const API = `http://${window.location.hostname}:3001`;
  try {
    await fetch(`${API}/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_seasonData)
    });
  } catch (e) {
    console.warn('Auto-save failed:', e);
  }
}

// ---- ALL TEAMS ----

function renderAllTeamsView(leagueTeams, bossDecks) {
  const filterBar = `
    <div class="roster-filter-bar">
      <span class="roster-filter-label">Filter:</span>
      <select onchange="rosterSetFilter('txnType',this.value)">
        <option value="">All TXN types</option>
        <option value="any"${_allFilter.txnType==='any'?' selected':''}>Any TXN type</option>
        <option value="none"${_allFilter.txnType==='none'?' selected':''}>Blank</option>
        ${TXN_TYPES.map(t => `<option value="${t}" ${_allFilter.txnType===t?'selected':''}>${t}</option>`).join('')}
      </select>
      <label class="roster-lands-label" style="margin-left:4px">
        <input type="checkbox" ${_allFilter.proxy?'checked':''} onchange="rosterSetFilter('proxy',this.checked)">
        Proxy
      </label>
      <label class="roster-lands-label" style="margin-left:4px">
        <input type="checkbox" onchange="rosterToggleLands(this.checked)" ${_landsVisible?'checked':''}>
        Show Lands
      </label>
      <label class="roster-lands-label">
        <input type="checkbox" onchange="rosterToggleLandsOnly(this.checked)" ${_landsOnly?'checked':''}>
        Only Lands
      </label>
      <div style="position:relative;display:inline-flex;align-items:center;margin-left:4px">
        <input class="roster-inline-search" type="text" placeholder="Search cards…"
          value="${(_allFilter.cardSearch||'').replace(/"/g,'&quot;')}"
          oninput="rosterAllSearchInput(this.value)">
        ${_allFilter.cardSearch ? `<button class="roster-inline-clear" onclick="rosterAllSearchClear()">✕</button>` : ''}
      </div>
    </div>`;

  const allDecks = [...leagueTeams, ...bossDecks];
  const rows = [];
  allDecks.forEach(team => {
    const sorted = [...(team.roster || [])].sort();
    const notes = team.rosterNotes || {};
    const counts = {};
    sorted.forEach(card => {
      counts[card] = (counts[card] || 0);
      const idx = counts[card]++;
      const key = `${card}|${idx}`;
      const note = notes[key] || {};
      if (_landsOnly) { if (!LAND_FILTER.has(card)) return; }
      else if (!_landsVisible && LAND_FILTER.has(card)) return;
      if (_allFilter.txnType === 'any'  && !note.txnType) return;
      if (_allFilter.txnType === 'none' &&  note.txnType) return;
      if (_allFilter.txnType && _allFilter.txnType !== 'any' && _allFilter.txnType !== 'none' && note.txnType !== _allFilter.txnType) return;
      if (_allFilter.proxy && !note.proxy) return;
      if (_allFilter.cardSearch && !card.toLowerCase().includes(_allFilter.cardSearch.toLowerCase())) return;
      rows.push({ team, card, key, note });
    });
  });

  if (_allSortField) {
    const f = _allSortField, d = _allSortDir;
    rows.sort((a, b) => {
      let av, bv;
      if (f === 'team')       { av = a.team.name;      bv = b.team.name; }
      else if (f === 'card')  { av = a.card;            bv = b.card; }
      else if (f === 'txn')   { av = a.note.txnType;    bv = b.note.txnType; }
      else if (f === 'fa')    { av = a.note.freeAgent;  bv = b.note.freeAgent; }
      else if (f === 'proxy') { av = a.note.proxy ? 1 : 0; bv = b.note.proxy ? 1 : 0; }
      if (av == null || av === '') return 1;
      if (bv == null || bv === '') return -1;
      if (typeof av === 'number') return d * (av - bv);
      return d * String(av).localeCompare(String(bv));
    });
  }

  if (rows.length === 0) {
    return filterBar + '<div class="roster-empty">No cards match the current filters.</div>';
  }

  const teamCount  = new Set(rows.map(r => r.team.id)).size;
  const tableRows  = rows.map(({ team, card, key, note }) => {
    const hasNote = note.txnType || note.freeAgent || note.proxy;
    const customEntry = _customCards.get(card);
    const nameTag = customEntry
      ? (customEntry.exception_note
          ? ` <span class="exception-badge" title="${customEntry.exception_note.replace(/"/g,'&quot;')}">Exception</span>`
          : ' <span class="custom-badge">Custom</span>')
      : '';
    const cardCell = card + nameTag;
    const proxyCell = customEntry
      ? (customEntry.exception_note
          ? '<span class="proxy-badge">Proxy</span> <span class="exception-badge">Exception</span>'
          : '<span class="proxy-badge">Proxy</span> <span class="custom-badge">Custom</span>')
      : (note.proxy ? '<span class="proxy-badge">Proxy</span>' : '<span class="muted">—</span>');
    return `<tr class="${hasNote ? 'has-note' : ''}">
      <td class="muted">${team.name}</td>
      <td>${cardCell}</td>
      <td><select data-team="${team.id}" data-key="${key}"
        onchange="rosterNoteUpdate(this.dataset.team,this.dataset.key,'txnType',this.value)">
        ${['', ...TXN_TYPES].map(t => `<option value="${t}"${note.txnType === t ? ' selected' : ''}>${t || '—'}</option>`).join('')}
      </select></td>
      <td><input type="text"
        data-team="${team.id}" data-key="${key}"
        value="${(note.freeAgent || '').replace(/"/g, '&quot;')}" placeholder="card name…"
        oninput="rosterNoteUpdate(this.dataset.team,this.dataset.key,'freeAgent',this.value)">
      </td>
      <td>${proxyCell}</td>
    </tr>`;
  }).join('');

  return filterBar + `
    <div class="roster-count">${rows.length} card${rows.length!==1?'s':''} across ${teamCount} team${teamCount!==1?'s':''}</div>
    <div class="roster-table-wrap">
      <table class="roster-table">
        <thead>
          <tr>
            ${['team','card','txn','fa','proxy'].map(f => {
              const labels = {team:'Team',card:'Card',txn:'TXN',fa:'Free Agent',proxy:'Proxy'};
              const ind = _allSortField === f ? (_allSortDir === 1 ? ' ▲' : ' ▼') : '';
              return `<th style="cursor:pointer;user-select:none" onclick="rosterSetAllSort('${f}')">${labels[f]}${ind}</th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

// ---- COMMIT ----

async function rosterCommit(teamId, cardKey) {
  if (!isLocal()) return;
  const allDecks = [...(_seasonData.teams || []), ...(_seasonData.bossDecks || [])];
  const team = allDecks.find(t => t.id === teamId);
  if (!team) return;
  const note = (team.rosterNotes || {})[cardKey];
  if (!note) return;

  const card = cardKey.split('|')[0];
  const freeAgent = note.freeAgent || '';
  const txnType = note.txnType || '';

  const API = `http://${window.location.hostname}:3001`;

  if (freeAgent && freeAgent !== card) {
    const idx = parseInt(cardKey.split('|')[1] || '0');
    let replaced = 0;
    for (let i = 0; i < team.roster.length; i++) {
      if (team.roster[i] === card) {
        if (replaced === idx) { team.roster[i] = freeAgent; break; }
        replaced++;
      }
    }
    const newNotes = {};
    const newSorted = [...team.roster].sort();
    const newCounts = {};
    newSorted.forEach(c => {
      newCounts[c] = (newCounts[c] || 0);
      const k = `${c}|${newCounts[c]++}`;
      newNotes[k] = team.rosterNotes[k] || {};
    });
    team.rosterNotes = newNotes;
    if (!team.transactionHistory) team.transactionHistory = [];
    team.transactionHistory.push({
      cardOut: card, cardIn: freeAgent, week: note.week || null,
      season: 9, txnType, timestamp: new Date().toISOString()
    });
  } else {
    team.rosterNotes[cardKey] = {};
  }

  try {
    const res = await fetch(`${API}/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_seasonData)
    });
    if (!res.ok) throw new Error('Save failed');
    renderRostersPage();
  } catch (e) {
    alert('✗ Could not reach server. Is server.js running?');
  }
}

// ---- ADD CARD ----

async function rosterAddCard(teamId) {
  if (!isLocal()) return;
  const nameEl = document.getElementById(`add-card-name-${teamId}`);
  const qtyEl  = document.getElementById(`add-card-qty-${teamId}`);
  if (!nameEl) return;

  const cardName = nameEl.value.trim();
  if (!cardName) { nameEl.focus(); return; }
  const qty = Math.max(1, parseInt(qtyEl?.value || '1', 10) || 1);

  const allDecks = [...(_seasonData.teams || []), ...(_seasonData.bossDecks || [])];
  const team = allDecks.find(t => t.id === teamId);
  if (!team) return;
  if (!team.roster) team.roster = [];

  for (let i = 0; i < qty; i++) team.roster.push(cardName);

  const API = `http://${window.location.hostname}:3001`;
  try {
    const res = await fetch(`${API}/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_seasonData)
    });
    if (!res.ok) throw new Error('Save failed');
  } catch (e) {
    console.warn('Add card save failed:', e);
  }

  // Re-render just the table section, keep land toggle state
  const tableSection = document.getElementById('roster-table-section');
  if (tableSection) tableSection.innerHTML = renderTeamTable(team);
}

// ---- REMOVE CARD ----

async function rosterRemoveCard(teamId, cardKey, card) {
  if (!isLocal()) return;
  if (!confirm(`Remove "${card}" from roster?`)) return;

  const allDecks = [...(_seasonData.teams || []), ...(_seasonData.bossDecks || [])];
  const team = allDecks.find(t => t.id === teamId);
  if (!team || !team.roster) return;

  const idx = parseInt(cardKey.split('|')[1] || '0', 10);
  let removed = 0;
  for (let i = 0; i < team.roster.length; i++) {
    if (team.roster[i] === card) {
      if (removed === idx) { team.roster.splice(i, 1); break; }
      removed++;
    }
  }

  // Rebuild rosterNotes keys so indices stay consistent after removal
  if (team.rosterNotes) {
    const newNotes = {};
    const newCounts = {};
    [...team.roster].sort().forEach(c => {
      newCounts[c] = (newCounts[c] || 0);
      const k = `${c}|${newCounts[c]++}`;
      if (team.rosterNotes[k]) newNotes[k] = team.rosterNotes[k];
    });
    team.rosterNotes = newNotes;
  }

  const API = `http://${window.location.hostname}:3001`;
  try {
    const res = await fetch(`${API}/save`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_seasonData)
    });
    if (!res.ok) throw new Error('Save failed');
  } catch (e) {
    console.warn('Remove card save failed:', e);
  }

  const tableSection = document.getElementById('roster-table-section');
  if (tableSection) tableSection.innerHTML = renderTeamTable(team);
}

// ---- PUBLIC HANDLERS ----

function rosterViewAllTeams() {
  _currentView = 'allteams';
  _currentTeamId = null;
  const switcher = document.getElementById('roster-switcher');
  if (switcher) {
    switcher.querySelectorAll('.roster-team-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.teamId === '__all__');
    });
  }
  const content = document.getElementById('roster-content-section');
  if (content) {
    const leagueTeams = (_seasonData.teams || []).slice().sort((a,b) => a.name.localeCompare(b.name));
    const bossDecks   = _seasonData.bossDecks || [];
    content.innerHTML = renderAllTeamsView(leagueTeams, bossDecks);
  }
}
function rosterSwitchView(view)        { _currentView = view;      renderRostersPage(); }
function rosterSelectTeam(id) {
  _currentView = 'byteam';
  _currentTeamId = id;
  _teamFilter = { txnType: '', proxy: false, cardSearch: '' }; _teamSortField = null; _teamSortDir = 1; // reset on team switch
  const switcher = document.getElementById('roster-switcher');
  if (switcher) {
    switcher.querySelectorAll('.roster-team-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.teamId === id);
    });
  }
  const content = document.getElementById('roster-content-section');
  if (content) {
    const leagueTeams = (_seasonData.teams || []).slice().sort((a,b) => a.name.localeCompare(b.name));
    const bossDecks   = _seasonData.bossDecks || [];
    const allDecks    = [...leagueTeams, ...bossDecks];
    const team        = allDecks.find(t => t.id === id) || leagueTeams[0];
    content.innerHTML = `<div id="roster-table-section">${team ? renderTeamTable(team) : '<div class="roster-empty">No team selected.</div>'}</div>`;
  } else {
    renderRostersPage();
  }
}
function rosterToggleLands(v) { _landsVisible = v; renderRostersPage(); }
function rosterToggleLandsOnly(v) { _landsOnly = v; renderRostersPage(); }
function rosterSetFilter(key, value)     { _allFilter[key] = value;  renderRostersPage(); }
function rosterSetTeamFilter(key, value) {
  _teamFilter[key] = value;
  const tableSection = document.getElementById('roster-table-section');
  if (tableSection && _currentView === 'byteam') {
    const leagueTeams = (_seasonData.teams || []).slice().sort((a,b) => a.name.localeCompare(b.name));
    const bossDecks   = _seasonData.bossDecks || [];
    const allDecks    = [...leagueTeams, ...bossDecks];
    const team        = allDecks.find(t => t.id === _currentTeamId) || leagueTeams[0];
    tableSection.innerHTML = team ? renderTeamTable(team) : '<div class="roster-empty">No team selected.</div>';
  } else if (_currentView === 'byteam') {
    renderRostersPage();
  }
}
function rosterClearTeamFilter() {
  _teamFilter = { txnType: '', proxy: false, cardSearch: '' };
  rosterSetTeamFilter('txnType', ''); // triggers re-render
}
function rosterSetAllSort(field) {
  if (_allSortField === field) _allSortDir *= -1;
  else { _allSortField = field; _allSortDir = 1; }
  renderRostersPage();
}
function rosterSetTeamSort(field) {
  if (_teamSortField === field) _teamSortDir *= -1;
  else { _teamSortField = field; _teamSortDir = 1; }
  const tableSection = document.getElementById('roster-table-section');
  if (tableSection && _currentView === 'byteam') {
    const leagueTeams = (_seasonData.teams || []).slice().sort((a,b) => a.name.localeCompare(b.name));
    const bossDecks   = _seasonData.bossDecks || [];
    const allDecks    = [...leagueTeams, ...bossDecks];
    const team        = allDecks.find(t => t.id === _currentTeamId) || leagueTeams[0];
    tableSection.innerHTML = team ? renderTeamTable(team) : '<div class="roster-empty">No team selected.</div>';
  }
}


// ---- INLINE CARD SEARCH (filter bars) ----

let _teamSearchTimer = null;
let _allSearchTimer  = null;

function rosterTeamSearchInput(value) {
  clearTimeout(_teamSearchTimer);
  _teamSearchTimer = setTimeout(() => {
    _teamFilter.cardSearch = value;
    const tableSection = document.getElementById('roster-table-section');
    if (tableSection && _currentView === 'byteam') {
      const leagueTeams = (_seasonData.teams || []).slice().sort((a,b) => a.name.localeCompare(b.name));
      const bossDecks   = _seasonData.bossDecks || [];
      const allDecks    = [...leagueTeams, ...bossDecks];
      const team        = allDecks.find(t => t.id === _currentTeamId) || leagueTeams[0];
      tableSection.innerHTML = team ? renderTeamTable(team) : '<div class="roster-empty">No team selected.</div>';
    } else if (_currentView === 'byteam') {
      renderRostersPage();
    }
    _refocusInlineSearch('team');
  }, 200);
}
function rosterTeamSearchClear() {
  _teamFilter.cardSearch = '';
  rosterSetTeamFilter('cardSearch', '');
}
function rosterAllSearchInput(value) {
  clearTimeout(_allSearchTimer);
  _allSearchTimer = setTimeout(() => {
    _allFilter.cardSearch = value;
    const content = document.getElementById('roster-content-section');
    if (content && _currentView === 'allteams') {
      const leagueTeams = (_seasonData.teams || []).slice().sort((a,b) => a.name.localeCompare(b.name));
      const bossDecks   = _seasonData.bossDecks || [];
      content.innerHTML = renderAllTeamsView(leagueTeams, bossDecks);
    } else {
      renderRostersPage();
    }
    _refocusInlineSearch('all');
  }, 200);
}
function rosterAllSearchClear() {
  _allFilter.cardSearch = '';
  const content = document.getElementById('roster-content-section');
  if (content && _currentView === 'allteams') {
    const leagueTeams = (_seasonData.teams || []).slice().sort((a,b) => a.name.localeCompare(b.name));
    const bossDecks   = _seasonData.bossDecks || [];
    content.innerHTML = renderAllTeamsView(leagueTeams, bossDecks);
  } else {
    renderRostersPage();
  }
}

function _refocusInlineSearch(view) {
  // After a re-render the input element is replaced; restore focus and cursor.
  const section = view === 'team'
    ? document.getElementById('roster-table-section')
    : document.getElementById('roster-content-section');
  if (!section) return;
  const input = section.querySelector('.roster-inline-search');
  if (!input) return;
  input.focus();
  const len = input.value.length;
  input.setSelectionRange(len, len);
}

window.rosterTeamSearchInput = rosterTeamSearchInput;
window.rosterTeamSearchClear = rosterTeamSearchClear;
window.rosterAllSearchInput  = rosterAllSearchInput;
window.rosterAllSearchClear  = rosterAllSearchClear;

window.rosterViewAllTeams    = rosterViewAllTeams;
window.rosterSelectTeam      = rosterSelectTeam;
window.rosterToggleLands     = rosterToggleLands;
window.rosterToggleLandsOnly = rosterToggleLandsOnly;
window.rosterSetFilter       = rosterSetFilter;
window.rosterSetTeamFilter   = rosterSetTeamFilter;
window.rosterClearTeamFilter = rosterClearTeamFilter;
window.rosterSetAllSort      = rosterSetAllSort;
window.rosterSetTeamSort     = rosterSetTeamSort;
window.rosterNoteUpdate      = rosterNoteUpdate;
window.rosterCommit          = rosterCommit;
window.rosterAddCard         = rosterAddCard;
window.rosterRemoveCard      = rosterRemoveCard;

document.addEventListener('DOMContentLoaded', rostersInit);
