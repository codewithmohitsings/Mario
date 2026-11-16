// Progression test: big Mario runs right with well-timed jumps, must reach
// the flag of level 1-1 and load level 1-2.
const handlers = {};
global.window = { addEventListener: (ev, fn) => { handlers[ev] = fn; }, dispatchEvent: e => handlers[e.type](e) };
let rafCb = null;
global.requestAnimationFrame = fn => { rafCb = fn; };
const gradient = { addColorStop() {} };
const ctxStub = new Proxy({ imageSmoothingEnabled: false }, {
  get(t, p) { if (p in t) return t[p]; if (p === 'createLinearGradient') return () => gradient; if (p === 'measureText') return () => ({ width: 10 }); return () => {}; },
  set(t, p, v) { t[p] = v; return true; },
});
global.document = { getElementById: () => ({ width: 512, height: 320, getContext: () => ctxStub }) };
const ROOT = __dirname + '/..';
for (const f of ['levels.js', 'audio.js', 'entities.player.js', 'entities.world.js', 'renderer.js', 'game.js']) require(ROOT + '/' + f);
for (const k of ['LEVELS', 'AudioSys', 'Player', 'GRAV', 'MAX_FALL', 'overlap', 'Enemy', 'Item', 'Fireball', 'CoinFx', 'Floater', 'Renderer', 'TS', 'VW', 'VH', 'ROWS', 'GROUND_Y', 'W', 'H'])
  if (window[k] !== undefined) globalThis[k] = window[k];

handlers.load();
const key = (k, d) => window.dispatchEvent({ type: d ? 'keydown' : 'keyup', key: k, preventDefault() {} });
const g = window.game;

let err = null, levelReached = null, cleared = false;
try {
  for (let i = 0; i < 6000; i++) {
    if (i === 5) key(' ', true);
    if (i === 6) key(' ', false);
    if (i === 7) { g.player.power = 1; g.player.h = 42; g.player.y -= 14; }  // big mario for the bot
    if (i > 20 && i % 200 === 0) g.player.starTime = 500;                    // test-bot star power
    if (i === 8) key('x', true);        // hold run
    if (i === 11) key('ArrowRight', true);
    // rhythmic jumps: long enough to clear 4-tile pipes
    if (i > 15 && i < 5900) {
      if (i % 44 === 0) key('z', true);
      if (i % 44 === 30) key('z', false);
    }
    const cb = rafCb; rafCb = null; cb();
    if (i % 500 === 0 && g.level) {
      console.log(`f${i} lvl=${g.level.name} x=${Math.round(g.player.x)} (${Math.round(100 * g.player.x / g.levelWidth)}%) lives=${g.lives} score=${g.score} coins=${g.coins} state=${g.state}`);
    }
    if (g.levelIndex === 1 && levelReached === null) { levelReached = i; console.log(`>>> LEVEL 1-2 LOADED at frame ${i}, score=${g.score}, coins=${g.coins}, lives=${g.lives}`); }
  }
} catch (e) { err = e; }

if (err) { console.error('RUNTIME ERROR:', err); process.exit(1); }
console.log('\nFINAL:', `lvl=${g.level.name} state=${g.state} score=${g.score} coins=${g.coins} lives=${g.lives}`);
console.log(levelReached !== null ? 'PASS: reached level 2' : 'FAIL: never reached level 2');
