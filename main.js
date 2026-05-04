const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { app, BrowserWindow, ipcMain, shell, Notification, globalShortcut } = require('electron');
const store = require('./store.js');

const REDIRECT_URI = (process.env.REDIRECT_URI || 'myapp://callback').trim();
const PROTOCOL = 'myapp';

let mainWindow = null;
let clickThroughActive = false;
/** @type {string | null} */
let pendingOAuthUrl = null;
/** @type {string | null} */
let pendingPkceVerifier = null;

function findMyAppUrlInArgv(argv) {
  if (!argv || !argv.length) return null;
  for (const raw of argv) {
    if (typeof raw !== 'string') continue;
    const arg = raw.replace(/^["']|["']$/g, '').trim();
    if (arg.toLowerCase().startsWith(`${PROTOCOL}://`)) return arg;
  }
  const joined = argv.filter((a) => typeof a === 'string').join(' ');
  const m = joined.match(/myapp:\/\/[^\s"']+/i);
  return m ? m[0] : null;
}

if (process.defaultApp) {
  const entry =
    process.argv[1] != null
      ? path.resolve(process.argv[1])
      : path.join(__dirname, 'main.js');
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [entry]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = findMyAppUrlInArgv(argv);
    if (url) forwardOAuthUrl(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function forwardOAuthUrl(url) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('oauth:callback', url);
  } else {
    pendingOAuthUrl = url;
  }
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  forwardOAuthUrl(url);
});

const COMPACT_SIZE = { width: 430, height: 312 };
const EXPANDED_SIZE = { width: 460, height: 540 };

function getInitialBounds() {
  const expanded = store.get('uiExpanded', false);
  return expanded ? EXPANDED_SIZE : COMPACT_SIZE;
}

function createWindow() {
  const { width, height } = getInitialBounds();

  mainWindow = new BrowserWindow({
    width,
    height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.platform === 'darwin') {
    try {
      mainWindow.setVibrancy('ultra-dark');
      if (typeof mainWindow.setWindowButtonVisibility === 'function') {
        mainWindow.setWindowButtonVisibility(false);
      }
    } catch (_) {
      /* vibrancy optional */
    }
  }

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingOAuthUrl) {
      mainWindow.webContents.send('oauth:callback', pendingOAuthUrl);
      pendingOAuthUrl = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    const url = findMyAppUrlInArgv(process.argv);
    if (url) forwardOAuthUrl(url);
  }

  createWindow();

  const spotifyClientId = () => (process.env.SPOTIFY_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');

  ipcMain.handle('spotify:get-client-id', () => spotifyClientId());
  ipcMain.handle('spotify:get-redirect-uri', () => REDIRECT_URI);

  ipcMain.handle('spotify:set-pkce-verifier', (_e, verifier) => {
    pendingPkceVerifier = typeof verifier === 'string' && verifier.length > 0 ? verifier : null;
    return true;
  });
  ipcMain.handle('spotify:get-pkce-verifier', () => pendingPkceVerifier);
  ipcMain.handle('spotify:clear-pkce-verifier', () => {
    pendingPkceVerifier = null;
    return true;
  });

  ipcMain.handle('store:get', (_e, key) => store.get(key));
  ipcMain.handle('store:set', (_e, key, value) => {
    store.set(key, value);
    return true;
  });

  ipcMain.handle('shell:open-external', async (_e, url) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('notify', (_e, opts) => {
    if (!Notification.isSupported()) return false;
    const n = new Notification({
      title: opts.title || 'HUD Widget',
      body: opts.body || ''
    });
    n.show();
    return true;
  });

  ipcMain.handle('window:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  });

  ipcMain.handle('window:close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });

  ipcMain.handle('window:set-expanded', (_e, expanded) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    store.set('uiExpanded', Boolean(expanded));
    const { width, height } = expanded ? EXPANDED_SIZE : COMPACT_SIZE;
    mainWindow.setSize(width, height, true);
    return true;
  });

  ipcMain.handle('window:set-ignore-mouse-events', (_e, ignore, forward) => {
    clickThroughActive = Boolean(ignore);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(clickThroughActive, { forward: Boolean(forward) });
      mainWindow.webContents.send('clickthrough:changed', clickThroughActive);
    }
  });

  const toggleClickThroughAccel = 'CommandOrControl+Shift+W';
  try {
    globalShortcut.register(toggleClickThroughAccel, () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      clickThroughActive = !clickThroughActive;
      mainWindow.setIgnoreMouseEvents(clickThroughActive, { forward: true });
      mainWindow.webContents.send('clickthrough:changed', clickThroughActive);
    });
  } catch (e) {
    console.warn('Global shortcut not registered:', toggleClickThroughAccel, e);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
