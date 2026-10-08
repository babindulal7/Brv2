const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Global error handlers to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('[Electron Main Error]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Electron Unhandled Rejection]', reason);
});

// Optional GPU workaround for virtual or problematic Windows display drivers
if (process.env.ELECTRON_DISABLE_GPU === 'true') {
  app.disableHardwareAcceleration();
}

let mainWindow = null;
let staticServer = null;

function createStaticDistServer(callback) {
  const distDir = path.join(__dirname, '../dist');
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm',
  };

  const server = http.createServer((req, res) => {
    let reqUrl = req.url ? req.url.split('?')[0] : '/';
    let safeSuffix = path.normalize(reqUrl).replace(/^(\.\.[/\\])+/, '');
    if (safeSuffix === '/' || safeSuffix === '\\') safeSuffix = '/index.html';
    let filePath = path.join(distDir, safeSuffix);

    fs.stat(filePath, (err, stats) => {
      if (!err && stats.isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000',
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        // SPA Fallback: serve index.html for client-side routing
        const indexPath = path.join(distDir, 'index.html');
        fs.readFile(indexPath, (readErr, content) => {
          if (readErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found: Please run "npm run build" to build dist first.');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
          }
        });
      }
    });
  });

  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    callback(`http://127.0.0.1:${port}`, server);
  });
}

function createWindow() {
  const serveDist = process.argv.includes('--dist') || Boolean(process.env.ELECTRON_SERVE_DIST);
  const isDev = !serveDist && (process.env.NODE_ENV === 'development' || !app.isPackaged);
  const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';

  // Use valid PNG icon (favicon.ico is a JPEG which native_image fails to load)
  const iconCandidates = [
    path.join(__dirname, '../public/icons/512.png'),
    path.join(__dirname, '../public/icons/192.png'),
    path.join(__dirname, '../public/favicon.ico'),
  ];
  const windowIcon = iconCandidates.find((p) => fs.existsSync(p));

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Babin Rentals OS',
    backgroundColor: '#050b12',
    show: false, // Show once ready-to-show (or via safety timer) to prevent visual flicker
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  let isShown = false;
  const showWindow = () => {
    if (!isShown && mainWindow && !mainWindow.isDestroyed()) {
      isShown = true;
      mainWindow.show();
      mainWindow.focus();
      if (isDev && process.env.ELECTRON_DEVTOOLS === 'true') {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
  };

  mainWindow.once('ready-to-show', showWindow);

  // Safety timer: Never leave window permanently hidden if ready-to-show is delayed or missed
  const safetyTimer = setTimeout(showWindow, 1500);

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.warn(`[Electron] Failed to load ${url} (code ${code}: ${desc})`);
    showWindow();
  });

  // Open external links (e.g. WhatsApp, documentation) in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (isDev) {
    const tryLoadDev = (retries = 2) => {
      mainWindow.loadURL(devUrl).catch((err) => {
        console.warn(`[Electron] Could not reach ${devUrl}: ${err.message}`);
        if (retries > 0) {
          setTimeout(() => tryLoadDev(retries - 1), 1000);
        } else {
          // Dev server not reachable; fallback to static server from dist
          createStaticDistServer((serverUrl, server) => {
            staticServer = server;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.loadURL(serverUrl);
              showWindow();
            }
          });
        }
      });
    };
    tryLoadDev();
  } else {
    // Production / packaged: serve dist locally with SPA fallback
    createStaticDistServer((serverUrl, server) => {
      staticServer = server;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(serverUrl);
        showWindow();
      }
    });
  }

  mainWindow.on('closed', () => {
    clearTimeout(safetyTimer);
    mainWindow = null;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Electron] Another instance is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (staticServer) {
    try {
      staticServer.close();
    } catch {
      // ignore
    }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
