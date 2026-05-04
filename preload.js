const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSpotifyClientId: () => ipcRenderer.invoke('spotify:get-client-id'),
  getRedirectUri: () => ipcRenderer.invoke('spotify:get-redirect-uri'),

  spotifySetPkceVerifier: (verifier) => ipcRenderer.invoke('spotify:set-pkce-verifier', verifier),
  spotifyGetPkceVerifier: () => ipcRenderer.invoke('spotify:get-pkce-verifier'),
  spotifyClearPkceVerifier: () => ipcRenderer.invoke('spotify:clear-pkce-verifier'),

  store: {
    get: (key) => ipcRenderer.invoke('store:get', key),
    set: (key, value) => ipcRenderer.invoke('store:set', key, value)
  },

  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  onOAuthCallback: (callback) => {
    const handler = (_, url) => callback(url);
    ipcRenderer.on('oauth:callback', handler);
    return () => ipcRenderer.removeListener('oauth:callback', handler);
  },

  notify: (options) => ipcRenderer.invoke('notify', options),

  setIgnoreMouseEvents: (ignore, forward) =>
    ipcRenderer.invoke('window:set-ignore-mouse-events', ignore, forward ?? true),

  onClickThroughChanged: (callback) => {
    const handler = (_, value) => callback(value);
    ipcRenderer.on('clickthrough:changed', handler);
    return () => ipcRenderer.removeListener('clickthrough:changed', handler);
  },

  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  windowSetExpanded: (expanded) => ipcRenderer.invoke('window:set-expanded', expanded)
});
