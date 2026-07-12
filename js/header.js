function renderHeader(activePage) {
  const isIndex = activePage === 'index';
  const navLinks = isIndex
    ? `
      <a href="#" data-page="home" class="active" onclick="navigate('home');return false;">Home</a>
      <a href="#" data-page="games" onclick="navigate('games');return false;">Game Log</a>
      <a href="rosters.html">Rosters</a>
      <a href="history.html">History</a>
      <a href="cards.html">Cards</a>
    `
    : `
      <a href="index.html">Home</a>
      <a href="index.html#games">Game Log</a>
      <a href="rosters.html"${activePage === 'rosters' ? ' class="active"' : ''}>Rosters</a>
      <a href="history.html"${activePage === 'history' ? ' class="active"' : ''}>History</a>
      <a href="cards.html"${activePage === 'cards' ? ' class="active"' : ''}>Cards</a>
    `;

  document.getElementById('site-header').innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <div class="site-logo">MTG | MVM <span>The League</span></div>
        <nav>
          ${navLinks}
          <button class="theme-toggle" id="theme-btn" onclick="toggleTheme()">☀ Light</button>
        </nav>
      </div>
    </header>
  `;
  updateThemeBtn();
}
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page || 'index';
  renderHeader(page);
});
