const Store = require('electron-store');

const store = new Store({
  defaults: {
    tasks: [],
    accentColor: '#4ECDC4',
    spotifyAuth: null,
    uiExpanded: false,
    pomodoroWorkMinutes: 25,
    pomodoroBreakMinutes: 5
  }
});

module.exports = store;
