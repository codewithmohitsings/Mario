// Shared test harness: stubs browser APIs and loads the game scripts.
// Returns { handlers, tick, key, window, game } after boot.
function loadGameEnv() {
  const handlers = {};
  global.window = {
    addEventListener: (ev, fn) => { handlers[ev] = fn; },
    dispatchEvent: e => handlers[e.type](e),
    AudioContext: undefined,
    webkitAudioContext: undefined,
  };
  let rafCb = null;
  global.requestAnimationFrame = fn => { rafCb = fn; };

  const gradient = { addColorStop() {} };
  const ctxStub = new Proxy({ imageSmoothingEnabled: false }, {
    get(t, p) { if (p in t) return t[p]; if (p === 'createLinearGradient') return () => gradient; if (p === 'measureText') return () => ({ width: 10 }); return () => {}; },
    set(t, p, v) { t[p] = v; return true; },
  });

  const elementStub = () => ({
    style: {}, dataset: {}, value: '', textContent: '', innerHTML: '', disabled: false,
    onclick: null, width: 512, height: 320,
    querySelectorAll: () => [],
    getContext: () => ctxStub,
    addEventListener: () => {},
  });
  const canvas = elementStub();

  global.document = {
    getElementById: id => (id === 'game' ? canvas : elementStub()),
    querySelectorAll: () => [],
  };
  global.location = { search: '', origin: 'http://localhost', pathname: '/index.html' };
  global.URLSearchParams = URLSearchParams;

  const ROOT = __dirname + '/..';
  for (const f of ['levels.js', 'levels2.js', 'audio.js', 'net.js', 'entities.player.js', 'entities.world.js', 'renderer.js', 'game.js']) require(ROOT + '/' + f);
  for (const k of ['LEVELS', 'LEVELS2', 'AudioSys', 'Player', 'GRAV', 'MAX_FALL', 'overlap', 'Enemy', 'Item', 'Fireball', 'CoinFx', 'Floater', 'Renderer', 'NetSession', 'LoopbackHub', 'LoopbackTransport', 'makeCode', 'UI', 'Game',
    'TS', 'VW', 'VH', 'ROWS', 'GROUND_Y', 'W', 'H', 'RACE_LIVES', 'SNAP_EVERY'])
    if (window[k] !== undefined) globalThis[k] = window[k];

  handlers.load();   // boot: creates game, starts loop

  const game = window.game;
  const tick = n => {
    for (let i = 0; i < n; i++) {
      // re-install THIS env's raf setter: modules resolve requestAnimationFrame
      // via the shared global at call time
      global.requestAnimationFrame = fn => { rafCb = fn; };
      const cb = rafCb; rafCb = null; cb();
    }
  };
  const key = (k, down) => window.dispatchEvent({ type: down ? 'keydown' : 'keyup', key: k, preventDefault() {} });
  return { handlers, tick, key, game, window, canvas, raf: () => rafCb, setRaf: fn => { rafCb = fn; } };
}
module.exports = { loadGameEnv };
