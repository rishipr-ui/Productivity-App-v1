import {
  buildAuthUrl,
  exchangeCodeForToken,
  generateCodeChallenge,
  generateCodeVerifier,
  parseOAuthCallbackUrl,
  refreshAccessToken
} from '../spotify/auth.js';

const ACCENT_PRESETS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#C3A6FF', '#FF9A9E'];
const POLL_MS = 5000;
const MAX_TASKS_VISIBLE = 4;

const api = window.api;

/** @type {string | null} */
let pkceVerifier = null;
let spotifyPollTimer = null;
/** @type {boolean} */
let spotifyIsPlaying = false;

let workSec = 25 * 60;
let breakSec = 5 * 60;

const el = {
  widget: document.getElementById('widget'),
  btnClickthrough: document.getElementById('btn-clickthrough'),
  btnMinimize: document.getElementById('btn-minimize'),
  btnExpand: document.getElementById('btn-expand'),
  btnClose: document.getElementById('btn-close'),
  settingsPanel: document.getElementById('settings-panel'),
  inputWorkMin: document.getElementById('input-work-min'),
  inputBreakMin: document.getElementById('input-break-min'),
  btnSpotify: document.getElementById('btn-spotify-connect'),
  btnSpotifyPrev: document.getElementById('btn-spotify-prev'),
  btnSpotifyPlayPause: document.getElementById('btn-spotify-playpause'),
  btnSpotifyNext: document.getElementById('btn-spotify-next'),
  spotifyTransport: document.getElementById('spotify-transport'),
  albumArt: document.getElementById('album-art'),
  trackTitle: document.getElementById('track-title'),
  trackArtist: document.getElementById('track-artist'),
  progressBar: document.getElementById('progress-bar'),
  progressTimes: document.getElementById('progress-times'),
  taskForm: document.getElementById('task-form'),
  taskInput: document.getElementById('task-input'),
  taskList: document.getElementById('task-list'),
  pomodoroMode: document.getElementById('pomodoro-mode'),
  timerDisplay: document.getElementById('timer-display'),
  pomoBarFill: document.getElementById('pomo-bar-fill'),
  btnPomoStart: document.getElementById('btn-pomo-start'),
  btnPomoPause: document.getElementById('btn-pomo-pause'),
  btnPomoReset: document.getElementById('btn-pomo-reset'),
  accentSwatches: document.getElementById('accent-swatches')
};

let clickThrough = false;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255
  };
}

function applyAccent(hex) {
  const { r, g, b } = hexToRgb(hex);
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-soft', `rgba(${r},${g},${b},0.25)`);
  document.documentElement.style.setProperty('--glow', `rgba(${r},${g},${b},0.35)`);
}

function setClickThrough(on) {
  clickThrough = on;
  api.setIgnoreMouseEvents(on, true);
  syncClickThroughUi();
}

function syncClickThroughUi() {
  el.btnClickthrough.setAttribute('aria-pressed', String(clickThrough));
  el.btnClickthrough.classList.toggle('is-active', clickThrough);
  el.btnClickthrough.title = clickThrough
    ? 'Click-through on — press Ctrl+Shift+W to interact again'
    : 'Click-through — Ctrl+Shift+W to restore';
}

function syncExpandedUi(expanded) {
  el.settingsPanel.hidden = !expanded;
  el.btnExpand.setAttribute('aria-pressed', String(expanded));
  el.btnExpand.title = expanded ? 'Collapse settings' : 'Open settings';
}

function setupChrome() {
  el.btnClickthrough.addEventListener('click', (e) => {
    e.stopPropagation();
    setClickThrough(!clickThrough);
  });
  api.onClickThroughChanged((value) => {
    clickThrough = value;
    syncClickThroughUi();
  });

  el.btnMinimize.addEventListener('click', (e) => {
    e.stopPropagation();
    api.windowMinimize();
  });
  el.btnClose.addEventListener('click', (e) => {
    e.stopPropagation();
    api.windowClose();
  });
  el.btnExpand.addEventListener('click', async (e) => {
    e.stopPropagation();
    const cur = Boolean(await api.store.get('uiExpanded'));
    const next = !cur;
    await api.windowSetExpanded(next);
    syncExpandedUi(next);
  });
}

async function loadAccent() {
  const saved = await api.store.get('accentColor');
  const hex = ACCENT_PRESETS.includes(saved) || /^#[0-9A-Fa-f]{6}$/.test(saved) ? saved : ACCENT_PRESETS[1];
  applyAccent(hex);
  renderAccentSwatches(hex);
}

function renderAccentSwatches(current) {
  el.accentSwatches.innerHTML = '';
  ACCENT_PRESETS.forEach((hex) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = hex;
    b.setAttribute('aria-label', `Accent ${hex}`);
    b.setAttribute('aria-checked', hex === current ? 'true' : 'false');
    b.addEventListener('click', async () => {
      applyAccent(hex);
      await api.store.set('accentColor', hex);
      el.accentSwatches.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-checked', 'false'));
      b.setAttribute('aria-checked', 'true');
    });
    el.accentSwatches.appendChild(b);
  });
}

async function loadPomodoroDurations() {
  const w = await api.store.get('pomodoroWorkMinutes');
  const b = await api.store.get('pomodoroBreakMinutes');
  workSec = Math.max(1, Math.min(120, Number(w) || 25)) * 60;
  breakSec = Math.max(1, Math.min(60, Number(b) || 5)) * 60;
  el.inputWorkMin.value = String(Math.round(workSec / 60));
  el.inputBreakMin.value = String(Math.round(breakSec / 60));
  if (!pomo.running) {
    pomo.totalSec = pomo.mode === 'focus' ? workSec : breakSec;
    pomo.remainingSec = pomo.totalSec;
    updatePomoUi();
  }
}

function setupSettingsInputs() {
  const saveDurations = async () => {
    const w = Math.max(1, Math.min(120, Number(el.inputWorkMin.value) || 25));
    const b = Math.max(1, Math.min(60, Number(el.inputBreakMin.value) || 5));
    await api.store.set('pomodoroWorkMinutes', w);
    await api.store.set('pomodoroBreakMinutes', b);
    await loadPomodoroDurations();
  };
  el.inputWorkMin.addEventListener('change', saveDurations);
  el.inputBreakMin.addEventListener('change', saveDurations);
}

/** --- Tasks --- */

async function getTasks() {
  const tasks = await api.store.get('tasks');
  return Array.isArray(tasks) ? tasks : [];
}

async function saveTasks(tasks) {
  await api.store.set('tasks', tasks);
}

async function renderTasks() {
  const all = await getTasks();
  const visible = all.slice(0, MAX_TASKS_VISIBLE);
  el.taskList.innerHTML = '';
  const firstOpen = visible.find((t) => !t.done);
  visible.forEach((t) => {
    const li = document.createElement('li');
    li.className = 'task-item';
    if (t.id === firstOpen?.id) li.classList.add('active');
    if (t.done) li.classList.add('done');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'task-check';
    check.checked = t.done;
    check.addEventListener('change', async () => {
      t.done = check.checked;
      await saveTasks(all);
      renderTasks();
    });

    const span = document.createElement('span');
    span.className = 'task-text';
    span.textContent = t.text;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'task-del';
    del.textContent = '×';
    del.title = 'Delete';
    del.addEventListener('click', async () => {
      const next = all.filter((x) => x.id !== t.id);
      await saveTasks(next);
      renderTasks();
    });

    li.append(check, span, del);
    el.taskList.appendChild(li);
  });
  if (all.length > MAX_TASKS_VISIBLE) {
    const more = document.createElement('li');
    more.className = 'task-item secondary';
    more.style.fontSize = '10px';
    more.style.pointerEvents = 'none';
    more.textContent = `+${all.length - MAX_TASKS_VISIBLE} more — finish visible tasks to see others`;
    el.taskList.appendChild(more);
  }
}

/** --- Pomodoro --- */

const pomo = {
  mode: /** @type {'focus' | 'break'} */ ('focus'),
  totalSec: workSec,
  remainingSec: workSec,
  running: false,
  interval: /** @type {ReturnType<typeof setInterval> | null} */ (null)
};

function pomoLabel() {
  return pomo.mode === 'focus' ? 'Focus' : 'Break';
}

function formatMmSs(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function setPomoMode(mode) {
  pomo.mode = mode;
  pomo.totalSec = mode === 'focus' ? workSec : breakSec;
  pomo.remainingSec = pomo.totalSec;
  el.pomodoroMode.textContent = pomoLabel();
  el.widget.classList.toggle('pomodoro-break', mode === 'break');
  updatePomoUi();
}

function updatePomoBar() {
  const p = pomo.totalSec > 0 ? pomo.remainingSec / pomo.totalSec : 0;
  el.pomoBarFill.style.width = `${Math.min(100, Math.max(0, p * 100))}%`;
}

function updatePomoUi() {
  el.timerDisplay.textContent = formatMmSs(pomo.remainingSec);
  updatePomoBar();
}

function clearPomoInterval() {
  if (pomo.interval) {
    clearInterval(pomo.interval);
    pomo.interval = null;
  }
}

async function onPomoComplete() {
  clearPomoInterval();
  pomo.running = false;
  if (pomo.mode === 'focus') {
    await api.notify({ title: 'Focus session complete', body: 'Take a short break.' });
    setPomoMode('break');
  } else {
    await api.notify({ title: 'Break over', body: 'Ready for another focus round.' });
    setPomoMode('focus');
  }
}

function tickPomo() {
  if (!pomo.running) return;
  if (pomo.remainingSec <= 0) {
    onPomoComplete();
    return;
  }
  pomo.remainingSec -= 1;
  updatePomoUi();
  if (pomo.remainingSec <= 0) onPomoComplete();
}

function setupPomodoro() {
  setPomoMode('focus');
  el.btnPomoStart.addEventListener('click', () => {
    if (pomo.running) return;
    pomo.running = true;
    clearPomoInterval();
    pomo.interval = setInterval(tickPomo, 1000);
  });
  el.btnPomoPause.addEventListener('click', () => {
    pomo.running = false;
    clearPomoInterval();
  });
  el.btnPomoReset.addEventListener('click', () => {
    clearPomoInterval();
    pomo.running = false;
    pomo.remainingSec = pomo.totalSec;
    updatePomoUi();
  });
}

/** --- Spotify --- */

async function getSpotifyAuth() {
  const raw = await api.store.get('spotifyAuth');
  if (!raw || !raw.accessToken) return null;
  return raw;
}

async function setSpotifyAuth(auth) {
  await api.store.set('spotifyAuth', auth);
}

async function ensureAccessToken() {
  const clientId = await api.getSpotifyClientId();
  if (!clientId) return null;
  let auth = await getSpotifyAuth();
  if (!auth) return null;
  const bufferMs = 60_000;
  if (auth.expiresAt && auth.expiresAt > Date.now() + bufferMs) {
    return auth.accessToken;
  }
  if (!auth.refreshToken) return null;
  try {
    const next = await refreshAccessToken(clientId, auth.refreshToken);
    auth = { ...auth, ...next };
    await setSpotifyAuth(auth);
    return auth.accessToken;
  } catch {
    await setSpotifyAuth(null);
    return null;
  }
}

function setPlaybackGlyph() {
  el.btnSpotifyPlayPause.textContent = spotifyIsPlaying ? '⏸' : '▶';
}

function setTransportEnabled(on) {
  el.btnSpotifyPrev.disabled = !on;
  el.btnSpotifyPlayPause.disabled = !on;
  el.btnSpotifyNext.disabled = !on;
}

async function spotifyPlayerPause() {
  const token = await ensureAccessToken();
  if (!token) return false;
  const res = await fetch('https://api.spotify.com/v1/me/player/pause', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.ok || res.status === 204;
}

async function spotifyPlayerPlay() {
  const token = await ensureAccessToken();
  if (!token) return false;
  const res = await fetch('https://api.spotify.com/v1/me/player/play', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  return res.ok || res.status === 204;
}

async function spotifyPlayerPost(path) {
  const token = await ensureAccessToken();
  if (!token) return false;
  const res = await fetch(`https://api.spotify.com/v1/me/player/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.ok || res.status === 204;
}

async function toggleSpotifyPlayPause() {
  if (spotifyIsPlaying) {
    const ok = await spotifyPlayerPause();
    if (ok) {
      spotifyIsPlaying = false;
      setPlaybackGlyph();
    }
  } else {
    const ok = await spotifyPlayerPlay();
    if (ok) {
      spotifyIsPlaying = true;
      setPlaybackGlyph();
    }
  }
  setTimeout(updateSpotifyUi, 500);
}

function setupSpotifyTransport() {
  el.btnSpotifyPrev.addEventListener('click', async () => {
    const ok = await spotifyPlayerPost('previous');
    if (ok) setTimeout(updateSpotifyUi, 400);
  });
  el.btnSpotifyNext.addEventListener('click', async () => {
    const ok = await spotifyPlayerPost('next');
    if (ok) setTimeout(updateSpotifyUi, 400);
  });
  el.btnSpotifyPlayPause.addEventListener('click', async () => {
    await toggleSpotifyPlayPause();
  });
}

function setSpotifyDisconnectedUi() {
  el.btnSpotify.textContent = 'Connect';
  setTransportEnabled(false);
  spotifyIsPlaying = false;
  setPlaybackGlyph();
  el.albumArt.style.backgroundImage = '';
  el.albumArt.setAttribute('data-placeholder', '');
  el.trackTitle.textContent = '—';
  el.trackArtist.textContent = 'Connect Spotify to see playback';
  el.progressBar.style.width = '0%';
  el.progressTimes.textContent = '';
}

async function updateSpotifyUi() {
  const token = await ensureAccessToken();
  if (!token) {
    setSpotifyDisconnectedUi();
    return;
  }
  el.btnSpotify.textContent = 'Disconnect';
  setTransportEnabled(true);
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 204) {
      spotifyIsPlaying = false;
      setPlaybackGlyph();
      el.albumArt.style.backgroundImage = '';
      el.albumArt.setAttribute('data-placeholder', '');
      el.trackTitle.textContent = '—';
      el.trackArtist.textContent = 'No song playing';
      el.progressBar.style.width = '0%';
      el.progressTimes.textContent = '';
      return;
    }
    if (res.status === 401) throw new Error('401');
    if (!res.ok) {
      if (res.status === 403 || res.status === 404) {
        el.trackArtist.textContent = 'Open Spotify on a device to control playback';
      }
      return;
    }
    const data = await res.json();
    const item = data.item;
    spotifyIsPlaying = Boolean(data.is_playing);
    setPlaybackGlyph();
    if (!item) {
      el.trackArtist.textContent = 'No song playing';
      return;
    }
    const img = item.album?.images?.[0]?.url || item.album?.images?.slice(-1)[0]?.url;
    if (img) {
      el.albumArt.style.backgroundImage = `url("${img}")`;
      el.albumArt.removeAttribute('data-placeholder');
    } else {
      el.albumArt.style.backgroundImage = '';
      el.albumArt.setAttribute('data-placeholder', '');
    }
    el.trackTitle.textContent = item.name || '—';
    const artists = (item.artists || []).map((a) => a.name).filter(Boolean).join(', ');
    el.trackArtist.textContent = artists || 'Unknown artist';
    const dur = item.duration_ms || 1;
    const prog = data.progress_ms ?? 0;
    const pct = Math.min(100, Math.max(0, (prog / dur) * 100));
    el.progressBar.style.width = `${pct}%`;
    const fmt = (ms) => formatMmSs(Math.floor(ms / 1000));
    el.progressTimes.textContent = `${fmt(prog)} / ${fmt(dur)}`;
  } catch {
    el.trackArtist.textContent = 'Could not load playback';
  }
}

function startSpotifyPoll() {
  stopSpotifyPoll();
  spotifyPollTimer = setInterval(updateSpotifyUi, POLL_MS);
}

function stopSpotifyPoll() {
  if (spotifyPollTimer) {
    clearInterval(spotifyPollTimer);
    spotifyPollTimer = null;
  }
}

async function beginSpotifyAuth() {
  const clientId = await api.getSpotifyClientId();
  const redirectUri = await api.getRedirectUri();
  if (!clientId) {
    el.trackArtist.textContent = 'Set SPOTIFY_CLIENT_ID in .env (next to main.js)';
    return;
  }
  pkceVerifier = generateCodeVerifier();
  await api.spotifySetPkceVerifier(pkceVerifier);
  const challenge = await generateCodeChallenge(pkceVerifier);
  const url = buildAuthUrl(clientId, redirectUri, challenge);
  el.trackArtist.textContent = 'Browser opening — approve, then return here';
  await api.openExternal(url);
}

async function handleOAuthUrl(url) {
  const { code, error } = parseOAuthCallbackUrl(url);
  const verifier = (await api.spotifyGetPkceVerifier()) || pkceVerifier;

  if (error) {
    await api.spotifyClearPkceVerifier();
    pkceVerifier = null;
    el.trackArtist.textContent =
      error === 'access_denied' ? 'Spotify login cancelled' : `Spotify error: ${error}`;
    return;
  }
  if (!code) {
    await api.spotifyClearPkceVerifier();
    pkceVerifier = null;
    el.trackArtist.textContent =
      'Invalid callback — in Spotify Dashboard add Redirect URI: myapp://callback (exact match)';
    return;
  }
  if (!verifier) {
    el.trackArtist.textContent = 'Click Connect here first, then sign in in the browser';
    return;
  }

  const clientId = await api.getSpotifyClientId();
  const redirectUri = await api.getRedirectUri();
  try {
    const auth = await exchangeCodeForToken(clientId, redirectUri, code, verifier);
    await setSpotifyAuth(auth);
    await api.spotifyClearPkceVerifier();
    pkceVerifier = null;
    startSpotifyPoll();
    await updateSpotifyUi();
  } catch (e) {
    await api.spotifyClearPkceVerifier();
    pkceVerifier = null;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('invalid_grant') || msg.includes('400')) {
      el.trackArtist.textContent = 'Session expired — click Connect again';
    } else {
      el.trackArtist.textContent = msg.length > 90 ? `${msg.slice(0, 90)}…` : msg;
    }
    console.error(e);
  }
}

async function setupSpotify() {
  setupSpotifyTransport();
  const auth = await getSpotifyAuth();
  el.btnSpotify.addEventListener('click', async () => {
    if (await getSpotifyAuth()) {
      await setSpotifyAuth(null);
      stopSpotifyPoll();
      setSpotifyDisconnectedUi();
      return;
    }
    await beginSpotifyAuth();
  });
  if (auth) {
    startSpotifyPoll();
    await updateSpotifyUi();
  } else {
    setSpotifyDisconnectedUi();
  }
}

/** --- Init --- */

async function init() {
  setupChrome();
  const expanded = Boolean(await api.store.get('uiExpanded'));
  syncExpandedUi(expanded);

  await loadPomodoroDurations();
  setupSettingsInputs();

  await loadAccent();
  el.taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = el.taskInput.value.trim();
    if (!text) return;
    const tasks = await getTasks();
    tasks.unshift({ id: crypto.randomUUID(), text, done: false });
    await saveTasks(tasks);
    el.taskInput.value = '';
    renderTasks();
  });
  await renderTasks();
  setupPomodoro();
  await setupSpotify();

  const removeOAuth = api.onOAuthCallback((url) => {
    handleOAuthUrl(url);
  });
  window.addEventListener('beforeunload', () => {
    removeOAuth?.();
    stopSpotifyPoll();
    clearPomoInterval();
  });
}

init();
