# HUD Widget

Minimal always-on-top desktop productivity overlay built with **Electron**: Spotify now playing (read-only), a tiny task list, Pomodoro timer, and an accent color picker. The UI uses a dark frosted-glass style with **DM Mono**.

## Prerequisites

- Node.js 18+ (recommended: current LTS)
- A [Spotify Developer](https://developer.spotify.com/dashboard) app

## Spotify app setup

1. Log in to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and choose **Create app**.
2. Name it (for example **HUD Widget**), accept the terms, and create the app.
3. Open the app → **Settings**:
   - Add **Redirect URI**: `myapp://callback` (must match exactly).
   - Save.
4. On the app overview page, copy the **Client ID** (you do not need a client secret for PKCE).

## Local configuration

```bash
cp .env.example .env
```

Edit `.env`:

```env
SPOTIFY_CLIENT_ID=your_client_id_here
REDIRECT_URI=myapp://callback
```

## Install and run

```bash
npm install
npm start
```

The first time you click **Connect** under Now playing, your system browser opens for Spotify login. After you approve, the app catches `myapp://callback` and stores tokens locally (via `electron-store`).

**Playback controls** (previous / play-pause / next) need the scope `user-modify-playback-state` and an active Spotify session (desktop or web player with a device available). If you connected before this feature existed, use **Disconnect** then **Connect** again so Spotify grants the new scope.

### Packaged builds

```bash
npm run dist
```

Installers or bundles appear under `dist/`. The installer registers the **myapp** URL scheme so OAuth redirects land in the app.

### Windows: Spotify won’t connect

1. **Redirect URI** on [Spotify Dashboard](https://developer.spotify.com/dashboard) → your app → Settings must include exactly: `myapp://callback` (no `http://`, no trailing slash unless you use the same in `.env`).
2. **Restart the widget after changing `.env`** so `SPOTIFY_CLIENT_ID` reloads (the app loads `.env` from the project folder next to `main.js`).
3. **Custom URL scheme:** After `npm start`, approving login should open `myapp://...` in your **existing** HUD process (a second Electron flash is normal; it forwards to the first). If the browser asks what app to use, pick Electron / HUD Widget once, or run **Register** by starting the app once from the same install that registered `myapp`.
4. **Flow:** Click **Connect** in the widget *before* or *until* you see “Browser opening”; then complete login. The PKCE verifier is stored in the app so the redirect still works when Windows spawns a helper process.

## Usage notes

- **Window:** **−** minimizes, **▢** expands or collapses the **Settings** panel (accent + Pomodoro minutes), **×** closes the app.
- **Click-through:** Diamond control in the header; **Ctrl+Shift+W** (Mac: **Cmd+Shift+W**) toggles it off when needed.
- **Drag:** Drag the **HUD** title area to move the window.
- **Tasks:** Up to **four** tasks are shown; complete or delete items to reveal others stored in order.
- **Pomodoro:** Default 25 min focus / 5 min break (editable in Settings). Horizontal bar shows remaining time; **Start**, **Pause**, and **Reset** are full-width rectangular buttons.

## OAuth (PKCE)

Authorization uses **OAuth 2.0 PKCE** in the renderer with `spotify/auth.js` (no backend). Scopes include reading the current track and **controlling playback** on an active device.

## Project layout

| Path | Role |
|------|------|
| `main.js` | Window, IPC, custom protocol, notifications, global shortcut |
| `preload.js` | Context-isolated APIs for the renderer |
| `store.js` | `electron-store` defaults (`tasks`, `accentColor`, `spotifyAuth`) |
| `renderer/index.html` | Widget markup |
| `renderer/style.css` | Glass theme and CSS variables |
| `renderer/app.js` | Spotify polling, tasks, Pomodoro, accent UI |
| `spotify/auth.js` | PKCE helpers and token exchange |

## v1 limitations

- Playback targets Spotify’s active device (no device picker yet).
- No cloud sync for tasks.
- Single window.

## License

MIT
