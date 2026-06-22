// ---- THEME TOGGLE ----
// Applies on every page. Reads/writes to localStorage so preference persists.

(function() {
  const saved = localStorage.getItem('mtg-theme');
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (isLight) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('mtg-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('mtg-theme', 'light');
  }
  updateThemeBtn();
}

function updateThemeBtn() {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  btn.textContent = isLight ? '☾ Dark' : '☀ Light';
}

document.addEventListener('DOMContentLoaded', updateThemeBtn);
