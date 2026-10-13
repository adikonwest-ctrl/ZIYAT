const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');
const dataFile = path.join(rootDir, 'data', 'content.json');
const mapDataFile = path.join(rootDir, 'data', 'map-places.json');
const port = process.env.PORT || 3000;
const adminUsername = process.env.ZIYAT_ADMIN_USER || 'ziyat_admin';
const adminPassword = process.env.ZIYAT_ADMIN_PASSWORD || '';
const adminAvailable = Boolean(adminPassword) && process.env.VERCEL !== '1';
const secureCookies = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
const sessionDurationMs = 1000 * 60 * 60 * 8;
const sessions = new Map();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readSiteData() {
  return readJsonFile(dataFile, {
    site: {
      title: 'ZIYAT',
      tagline: 'История, память и знания Актюбинского края',
      description: 'Образовательная платформа о людях, местах и событиях региона.',
      ctaText: 'Перейти к карте',
      heroImage: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80',
      heroAlt: 'Исторический пейзаж Актюбинской области'
    },
    people: [],
    encyclopedia: [],
    archaeology: []
  });
}

function readMapPlaces() {
  return readJsonFile(mapDataFile, []);
}

function normalisePlace(place) {
  const base = {
    id: place.id || `place-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title: String(place.title || '').trim(),
    category: String(place.category || 'разное').trim(),
    description: String(place.description || '').trim(),
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    historicalPeriod: String(place.historicalPeriod || 'неизвестно').trim(),
    image: String(place.image || '').trim(),
    sourceUrl: String(place.sourceUrl || '').trim(),
    sourceLabel: String(place.sourceLabel || 'Источник не указан').trim(),
    status: String(place.status || 'verified').trim()
  };

  if (!Number.isFinite(base.latitude) || !Number.isFinite(base.longitude)) {
    throw new Error('Latitude and longitude required');
  }

  if (!base.title || !base.description) {
    throw new Error('Title and description required');
  }

  return base;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function serveStaticFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Page not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function getCookieValue(header, name) {
  if (!header) return null;
  const cookies = header.split(';').map(cookie => cookie.trim());
  const found = cookies.find(cookie => cookie.startsWith(`${name}=`));
  return found ? found.slice(name.length + 1) : null;
}

function createSession() {
  const sessionId = crypto.randomBytes(24).toString('hex');
  sessions.set(sessionId, {
    createdAt: Date.now(),
    expiresAt: Date.now() + sessionDurationMs
  });
  return sessionId;
}

function isAuthenticated(req) {
  if (!adminAvailable) return false;
  const sessionId = getCookieValue(req.headers.cookie || '', 'sessionId');
  if (!sessionId) return false;
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return false;
  }
  session.expiresAt = Date.now() + sessionDurationMs;
  return true;
}

function requireAdmin(req, res, next) {
  if (!isAuthenticated(req)) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }
  next();
}

function handleAdminApi(req, res, requestUrl, pathname) {
  if (pathname === '/api/admin/check' && req.method === 'GET') {
    sendJson(res, 200, { authenticated: isAuthenticated(req), user: isAuthenticated(req) ? adminUsername : null });
    return true;
  }

  if (pathname === '/api/admin/content' && req.method === 'GET') {
    requireAdmin(req, res, () => sendJson(res, 200, readSiteData()));
    return true;
  }

  if (pathname === '/api/admin/content' && req.method === 'PUT') {
    requireAdmin(req, res, () => {
      parseBody(req)
        .then(payload => {
          const data = readSiteData();
          const nextData = { ...data, ...payload };
          if (payload.site) {
            nextData.site = { ...data.site, ...payload.site };
          }
          writeJsonFile(dataFile, nextData);
          sendJson(res, 200, nextData);
        })
        .catch(error => sendJson(res, 400, { error: error.message || 'Invalid payload' }));
    });
    return true;
  }

  if (pathname === '/api/admin/login' && req.method === 'POST') {
    if (!adminAvailable) {
      const message = process.env.VERCEL === '1'
        ? 'Admin editing is disabled on Vercel until persistent storage is configured'
        : 'Admin login is not configured on this server';
      sendJson(res, 503, { error: message });
      return true;
    }

    parseBody(req)
      .then(body => {
        const username = String(body.username || '').trim();
        const password = String(body.password || '').trim();
        if (username !== adminUsername || password !== adminPassword) {
          sendJson(res, 401, { error: 'Invalid credentials' });
          return;
        }

        const sessionId = createSession();
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Set-Cookie': `sessionId=${sessionId}; HttpOnly; SameSite=Lax;${secureCookies} Path=/; Max-Age=${Math.floor(sessionDurationMs / 1000)}`
        });
        res.end(JSON.stringify({ ok: true, user: adminUsername }));
      })
      .catch(error => {
        sendJson(res, 400, { error: error.message || 'Bad request' });
      });
    return true;
  }

  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    const sessionId = getCookieValue(req.headers.cookie || '', 'sessionId');
    if (sessionId) sessions.delete(sessionId);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': 'sessionId=; Max-Age=0; Path=/'
    });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  if (pathname === '/api/admin/map-places' && req.method === 'GET') {
    requireAdmin(req, res, () => sendJson(res, 200, readMapPlaces()));
    return true;
  }

  if (pathname === '/api/admin/map-places' && req.method === 'POST') {
    requireAdmin(req, res, () => {
      parseBody(req)
        .then(body => {
          try {
            const places = readMapPlaces();
            const place = normalisePlace(body);
            places.push(place);
            writeJsonFile(mapDataFile, places);
            sendJson(res, 201, place);
          } catch (error) {
            sendJson(res, 400, { error: error.message || 'Invalid place data' });
          }
        })
        .catch(error => {
          sendJson(res, 400, { error: error.message || 'Invalid request body' });
        });
    });
    return true;
  }

  if (pathname.startsWith('/api/admin/map-places/') && (req.method === 'PUT' || req.method === 'DELETE')) {
    requireAdmin(req, res, () => {
      const placeId = decodeURIComponent(pathname.split('/').pop());
      if (req.method === 'DELETE') {
        const places = readMapPlaces().filter(item => item.id !== placeId);
        writeJsonFile(mapDataFile, places);
        sendJson(res, 200, { ok: true, removed: placeId });
        return;
      }

      parseBody(req)
        .then(body => {
          try {
            const places = readMapPlaces();
            const index = places.findIndex(item => item.id === placeId);
            if (index === -1) {
              sendJson(res, 404, { error: 'Place not found' });
              return;
            }
            const updated = normalisePlace({ ...places[index], ...body, id: placeId });
            places[index] = updated;
            writeJsonFile(mapDataFile, places);
            sendJson(res, 200, updated);
          } catch (error) {
            sendJson(res, 400, { error: error.message || 'Invalid place data' });
          }
        })
        .catch(error => {
          sendJson(res, 400, { error: error.message || 'Invalid request body' });
        });
    });
    return true;
  }

  return false;
}

function handleRequest(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  if (pathname === '/api/site-data' && req.method === 'GET') {
    sendJson(res, 200, readSiteData());
    return;
  }

  if (pathname === '/api/map-places' && req.method === 'GET') {
    sendJson(res, 200, readMapPlaces());
    return;
  }

  if (handleAdminApi(req, res, requestUrl, pathname)) {
    return;
  }

  if (pathname === '/admin' || pathname === '/admin.html' || pathname.startsWith('/admin/')) {
    if (!adminAvailable) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Admin is unavailable until credentials and persistent storage are configured.');
      return;
    }
    serveStaticFile(res, path.join(publicDir, 'admin.html'));
    return;
  }

  if (pathname.endsWith('.html') && pathname !== '/' && pathname !== '/index.html') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    serveStaticFile(res, path.join(publicDir, 'index.html'));
    return;
  }

  const filePath = path.join(publicDir, pathname.replace(/^\/+/, ''));
  const normalizedPath = path.normalize(filePath);

  if (!normalizedPath.startsWith(publicDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(normalizedPath, (error, stats) => {
    if (!error && stats.isFile()) {
      serveStaticFile(res, normalizedPath);
      return;
    }

    serveStaticFile(res, path.join(publicDir, 'index.html'));
  });
}

if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(port, () => {
    console.log(`ZIYAT running on http://localhost:${port}`);
    console.log(`Admin UI: http://localhost:${port}/admin`);
  });
}

module.exports = { handleRequest };
