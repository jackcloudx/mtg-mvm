// MTG MVM — Local API Server
// Run with: node server.js
// Listens on port 3001, handles saving game data to season9.json

const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'season9.json');
const PORT = 3001;

const server = http.createServer((req, res) => {
  // Allow requests from live-server (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /data — return current season9.json
  if (req.method === 'GET' && req.url === '/data') {
    try {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Could not read data file' }));
    }
    return;
  }

  // POST /save — write updated data to season9.json
  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        // Validate it's real JSON before writing
        const parsed = JSON.parse(body);
        fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        console.log(`[${new Date().toLocaleTimeString()}] Data saved — ${(parsed.games || []).length} games on record`);
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\nMTG MVM data server running on http://localhost:${PORT}`);
  console.log(`Watching: ${DATA_FILE}`);
  console.log(`Ready to save game data.\n`);
});
