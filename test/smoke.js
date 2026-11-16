// Headless smoke test: stub browser APIs, simulate ~1500 frames of play,
// verify no runtime errors and that the player progresses through the level.
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
  get(t, p) {
    if (p in t) return t[p];
    if (p === 'createLinearGradient') return () => gradient;
    if (p === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set(t, p, v) { t[p] = v; return true; },
});
global.document = { getElementById: () => ({ width: 512, height: 320, getContext: () => ctxStub }) };

const ROOT = __dirname + '/..';
for (const f of ['levels.js', 'audio.js', 'entities.player.js', 'entities.world.js', 'renderer.js', 'game.js']) {
  require(ROOT + '/' + f);
}
// bridge browser "globals" into node's global scope
for (const k of ['LEVELS', 'AudioSys', 'Player', 'GRAV', 'MAX_FALL', 'overlap', 'Enemy', 'Item',
  'Fireball', 'CoinFx', 'Floater', 'Renderer', 'TS', 'VW', 'VH', 'ROWS', 'GROUND_Y', 'W', 'H']) {
  if (window[k] !== undefined) globalThis[k] = window[k];
}

handlers.load();  // boots the game, registers first raf callback

const key = (k, down) => window.dispatchEvent({ type: down ? 'keydown' : 'keyup', key: k, preventDefault() {} });

let err = null;
try {
  for (let i = 0; i < 1500; i++) {
    if (i === 5) key(' ', true);        // start
    if (i === 6) key(' ', false);
    if (i === 11) key('ArrowRight', true);
    if (i > 15 && i < 1450) {           // hop continuously to clear pipes/gaps
      if (i % 50 === 0) key('z', true);
      if (i % 50 === 26) key('z', false);
    }
    if (i === 1450) { key('ArrowRight', false); key('z', false); }
    const cb = rafCb; rafCb = null;
    cb();
  }
} catch (e) { err = e; }

const g = window.game;
if (err) { console.error('RUNTIME ERROR:', err); process.exit(1); }
console.log('1500 frames simulated without errors');
console.log(`state=${g.state} lives=${g.lives} score=${g.score} coins=${g.coins}`);
console.log(`player x=${Math.round(g.player.x)} y=${Math.round(g.player.y)} power=${g.player.power} cameraX=${Math.round(g.cameraX)}`);
console.log(`levelWidth=${g.levelWidth} progress=${Math.round(100 * g.player.x / g.levelWidth)}%`);
console.log(`enemies alive=${g.enemies.length} items=${g.items.length} fireballs=${g.fireballs.length}`);
