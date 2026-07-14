(function() {
  let _cards = [];
  let _customNames = new Set();
  let _usageMap = {}; // card name → [{team, shortName, count}]
  let _sets = [];

  let _filter = {
    sets: [],
    colors: [],
    colorMode: 'includes', // 'includes' or 'exactly'
    type: '',
    pwrMin: '', pwrMax: '',
    touMin: '', touMax: '',
    rules: '',
  };
  let _sortField = 'name';
  let _sortDir = 1;
  let _rulesTimer = null;

  async function cardsInit() {
    const [poolRes, seasonRes, customRes] = await Promise.all([
      fetch('data/card-pool.json'),
      fetch('data/season9.json'),
      fetch('data/custom-cards.json'),
    ]);
    _cards = await poolRes.json();
    const season = await seasonRes.json();
    const customCards = await customRes.json();
    _customNames = new Set(customCards.map(c => c.name));
    customCards.forEach(c => { c._custom = true; _cards.push(c); });

    // Build usage map from all team rosters
    _usageMap = {};
    const allTeams = (season.teams || []).concat(season.bossDecks || []);
    for (const team of allTeams) {
      (team.roster || []).forEach(cardName => {
        if (!cardName) return;
        if (!_usageMap[cardName]) _usageMap[cardName] = {};
        if (!_usageMap[cardName][team.id]) {
          _usageMap[cardName][team.id] = { shortName: team.shortName || team.name || team.id, count: 0 };
        }
        _usageMap[cardName][team.id].count++;
      });
    }

    // Collect unique set names
    const setSet = new Set(_cards.map(c => c.earliest_set).filter(Boolean));
    _sets = Array.from(setSet).sort();

    document.getElementById('cards-sub').textContent =
      `${_cards.length.toLocaleString()} cards • Alpha through Exodus`;

    renderControlBar();
    renderTable();
  }

  function renderControlBar() {
    const bar = document.getElementById('cards-control-bar');
    bar.innerHTML = `
      <div class="cards-control-group">
        <label>Set</label>
        <select id="cf-sets" multiple onchange="cardsFilterChange()">
          ${_sets.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
        </select>
      </div>
      <div class="cards-control-group">
        <label>Color</label>
        <div class="color-pills" id="cf-color-pills">
          ${['W','U','B','R','G','C'].map(c => `<div class="color-pill" data-c="${c}" onclick="cardsToggleColor('${c}')">${c}</div>`).join('')}
        </div>
        <label class="cards-exact-label">
          <input type="checkbox" id="cf-color-exact" onchange="cardsSetColorExact(this.checked)">
          Exact match only
        </label>
      </div>
      <div class="cards-control-group">
        <label>Type</label>
        <select id="cf-type" onchange="cardsFilterChange()">
          <option value="">All Types</option>
          ${getTypeOptions()}
        </select>
      </div>
      <div class="cards-control-group">
        <label>Power</label>
        <div class="range-row">
          <input type="text" id="cf-pwr-min" placeholder="min" oninput="cardsFilterChange()">
          <span>–</span>
          <input type="text" id="cf-pwr-max" placeholder="max" oninput="cardsFilterChange()">
        </div>
      </div>
      <div class="cards-control-group">
        <label>Toughness</label>
        <div class="range-row">
          <input type="text" id="cf-tou-min" placeholder="min" oninput="cardsFilterChange()">
          <span>–</span>
          <input type="text" id="cf-tou-max" placeholder="max" oninput="cardsFilterChange()">
        </div>
      </div>
      <div class="cards-control-group" style="flex:1;min-width:160px">
        <label>Rules Text</label>
        <input type="text" id="cf-rules" placeholder="e.g. flying" style="width:100%"
          oninput="cardsRulesInput()">
      </div>
      <div class="cards-control-group">
        <label>Sort</label>
        <select id="cf-sort" onchange="cardsSelectSort()">
          <option value="name">Name A–Z</option>
          <option value="set">Set</option>
          <option value="cmc">CMC low–high</option>
          <option value="ratio">Pwr/Mana high–low</option>
        </select>
      </div>
    `;
  }

  function getTypeOptions() {
    const types = new Set();
    _cards.forEach(c => {
      if (c.type_line) {
        const first = c.type_line.split(' ')[0].replace('—','').trim();
        if (first) types.add(first);
      }
    });
    return Array.from(types).sort().map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
  }

  function readFilters() {
    const setsEl = document.getElementById('cf-sets');
    _filter.sets = setsEl ? Array.from(setsEl.selectedOptions).map(o => o.value) : [];
    const typeEl = document.getElementById('cf-type');
    _filter.type = typeEl ? typeEl.value : '';
    _filter.pwrMin = (document.getElementById('cf-pwr-min') || {}).value || '';
    _filter.pwrMax = (document.getElementById('cf-pwr-max') || {}).value || '';
    _filter.touMin = (document.getElementById('cf-tou-min') || {}).value || '';
    _filter.touMax = (document.getElementById('cf-tou-max') || {}).value || '';
    _filter.rules = (document.getElementById('cf-rules') || {}).value || '';
  }

  function applyFilters(cards) {
    return cards.filter(c => {
      if (_filter.sets.length && !_filter.sets.includes(c.earliest_set)) return false;

      if (_filter.colors.length) {
        const cc = c.color_identity || c.colors || [];
        if (_filter.colorMode === 'exactly') {
          if (cc.length !== _filter.colors.length) return false;
          if (!_filter.colors.every(x => cc.includes(x))) return false;
        } else {
          // includes — card must have at least one selected color
          if (_filter.colors.includes('C')) {
            if (cc.length === 0) { /* colorless passes */ }
            else if (!_filter.colors.some(x => x !== 'C' && cc.includes(x))) return false;
          } else {
            if (!_filter.colors.some(x => cc.includes(x))) return false;
          }
        }
      }

      if (_filter.type) {
        const firstWord = (c.type_line || '').split(' ')[0];
        if (firstWord !== _filter.type) return false;
      }

      if (_filter.pwrMin !== '' || _filter.pwrMax !== '') {
        const p = parseFloat(c.power);
        if (isNaN(p)) return false;
        if (_filter.pwrMin !== '' && p < parseFloat(_filter.pwrMin)) return false;
        if (_filter.pwrMax !== '' && p > parseFloat(_filter.pwrMax)) return false;
      }

      if (_filter.touMin !== '' || _filter.touMax !== '') {
        const t = parseFloat(c.toughness);
        if (isNaN(t)) return false;
        if (_filter.touMin !== '' && t < parseFloat(_filter.touMin)) return false;
        if (_filter.touMax !== '' && t > parseFloat(_filter.touMax)) return false;
      }

      if (_filter.rules) {
        const q = _filter.rules.toLowerCase();
        if (!(c.oracle_text || '').toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }

  function applySort(cards) {
    return [...cards].sort((a, b) => {
      if (_sortField === 'name') {
        return _sortDir * (a.name || '').localeCompare(b.name || '');
      }
      if (_sortField === 'set') {
        const sd = (a.earliest_release_date || '').localeCompare(b.earliest_release_date || '');
        return _sortDir * (sd !== 0 ? sd : (a.name || '').localeCompare(b.name || ''));
      }
      if (_sortField === 'cmc') {
        return _sortDir * ((a.cmc || 0) - (b.cmc || 0));
      }
      if (_sortField === 'power') {
        const pa = parseFloat(a.power ?? ''), pb = parseFloat(b.power ?? '');
        if (isNaN(pa) && isNaN(pb)) return 0;
        if (isNaN(pa)) return 1;
        if (isNaN(pb)) return -1;
        return _sortDir * (pa - pb);
      }
      if (_sortField === 'toughness') {
        const ta = parseFloat(a.toughness ?? ''), tb = parseFloat(b.toughness ?? '');
        if (isNaN(ta) && isNaN(tb)) return 0;
        if (isNaN(ta)) return 1;
        if (isNaN(tb)) return -1;
        return _sortDir * (ta - tb);
      }
      if (_sortField === 'ratio') {
        const ra = (a.cmc || 0) > 0 ? parseFloat(a.power || 0) / a.cmc : -Infinity;
        const rb = (b.cmc || 0) > 0 ? parseFloat(b.power || 0) / b.cmc : -Infinity;
        return _sortDir * (rb - ra); // high-low default
      }
      return 0;
    });
  }

  function renderTable() {
    const filtered = applyFilters(_cards);
    const sorted = applySort(filtered);

    document.getElementById('cards-result-bar').textContent =
      `${sorted.length.toLocaleString()} of ${_cards.length.toLocaleString()} cards`;

    // Update sort indicators
    ['name','cmc','set','power','toughness'].forEach(f => {
      const el = document.getElementById('sort-ind-' + f);
      if (el) el.textContent = _sortField === f ? (_sortDir === 1 ? ' ▲' : ' ▼') : '';
    });

    const tbody = document.getElementById('cards-tbody');
    if (!sorted.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">No cards match the current filters.</td></tr>';
      return;
    }

    tbody.innerHTML = sorted.map(c => {
      const usage = _usageMap[c.name] || {};
      const usageBadges = Object.entries(usage).map(([tid, u]) =>
        `<span class="usage-badge has-count">${esc(u.shortName)} ×${u.count}</span>`
      ).join('');
      const specialBadge = c._custom
        ? (c.exception_note
            ? `<span class="exception-badge" title="${esc(c.exception_note)}">Exception</span>`
            : '<span class="custom-badge">Custom</span>')
        : '';
      const badges = specialBadge + usageBadges || '<span class="usage-badge">—</span>';
      const imgUrl = esc(c.image_url || '');
      const rowAttrs = imgUrl
        ? ` class="card-row" data-img="${imgUrl}" onclick="cardRowClick(this)"`
        : ` class="card-row" onclick="cardRowClick(this)"`;
      const setCell = c._custom
        ? (c.exception_note
            ? `<span class="exception-badge" title="${esc(c.exception_note)}">Exception</span>`
            : '<span class="custom-badge">Custom</span>')
        : esc(c.earliest_set || '');
      return `<tr${rowAttrs}>
        <td class="set-cell">${setCell}</td>
        <td class="card-name">${esc(c.name)}</td>
        <td class="mana-cost">${esc(c.mana_cost || '')}</td>
        <td class="card-type">${esc(c.type_line || '')}</td>
        <td><span class="rules-text">${esc(c.oracle_text || '')}</span></td>
        <td class="pt-cell">${c.power != null ? c.power : ''}</td>
        <td class="pt-cell">${c.toughness != null ? c.toughness : ''}</td>
        <td class="usage-col">${badges}</td>
      </tr>`;
    }).join('');
  }

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Public handlers
  window.cardsFilterChange = function() {
    readFilters();
    renderTable();
  };

  window.cardsRulesInput = function() {
    clearTimeout(_rulesTimer);
    _rulesTimer = setTimeout(() => {
      readFilters();
      renderTable();
    }, 200);
  };

  window.cardsToggleColor = function(c) {
    const idx = _filter.colors.indexOf(c);
    if (idx === -1) _filter.colors.push(c);
    else _filter.colors.splice(idx, 1);

    document.querySelectorAll('.color-pill').forEach(el => {
      el.classList.toggle('active', _filter.colors.includes(el.dataset.c));
    });
    renderTable();
  };

  window.cardsSetColorExact = function(checked) {
    _filter.colorMode = checked ? 'exactly' : 'includes';
    renderTable();
  };

  window.cardsSetSort = function(field) {
    if (_sortField === field) _sortDir *= -1;
    else { _sortField = field; _sortDir = 1; }
    const sortEl = document.getElementById('cf-sort');
    if (sortEl && ['name','set','cmc','ratio'].includes(field)) {
      sortEl.value = field;
    }
    renderTable();
  };

  window.cardsSelectSort = function() {
    const v = document.getElementById('cf-sort').value;
    _sortField = v;
    _sortDir = v === 'ratio' ? -1 : 1;
    renderTable();
  };

  // ---- CARD IMAGE LIGHTBOX ----

  let _tapEl = null;

  window.cardRowClick = function(tr) {
    const url = tr.dataset.img;
    if (!url) return;

    // Toggle off if same card already open
    if (_tapEl && _tapEl.dataset.src === url) {
      _tapEl.remove(); _tapEl = null; return;
    }
    if (_tapEl) { _tapEl.remove(); _tapEl = null; }

    const overlay = document.createElement('div');
    overlay.className = 'card-img-overlay';
    overlay.dataset.src = url;

    const img = document.createElement('img');
    img.src = url;
    img.className = 'card-img-overlay-img';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'card-img-overlay-close';
    closeBtn.textContent = '✕';

    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    overlay.onclick = () => { overlay.remove(); _tapEl = null; };

    document.body.appendChild(overlay);
    _tapEl = overlay;
  };

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _tapEl) { _tapEl.remove(); _tapEl = null; }
  });

  document.addEventListener('DOMContentLoaded', cardsInit);
})();
