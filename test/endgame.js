// Endgame test: teleport near each flag, verify level-clear sequence,
// level 2 load, and the win state.
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
let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) failures++; };

// start
key(' ', true);
{ const cb = rafCb; rafCb = null; cb(); }
key(' ', false);
g.player.power = 1; g.player.h = 42; g.player.y -= 14;
check('level 1-1 loaded', g.level.name === '1-1');

// teleport in front of the flag and walk into it
g.player.x = g.level.flagX * TS - 60;
g.player.y = (ROWS - 2) * TS - 42;
const scoreBefore = g.score;
for (let i = 0; i < 300; i++) {
  key('ArrowRight', true);
  const cb = rafCb; rafCb = null; cb();
  if (g.state === 'levelclear') break;
}
key('ArrowRight', false);
check('flag triggers levelclear', g.state === 'levelclear');
check('time bonus scored', g.score > scoreBefore);

// let the clear sequence finish -> level 2
let sawL2 = false;
for (let i = 0; i < 400; i++) {
  const cb = rafCb; rafCb = null; cb();
  if (g.levelIndex === 1 && g.state === 'playing') { sawL2 = true; break; }
}
check('level 1-2 loaded after clear', sawL2 && g.level.name === '1-2');
check('level 1-2 has underground theme', g.theme === 'underground');
check('timer reset for level 2', g.timeLeft === g.level.time);

// teleport to level 2 flag
g.player.x = g.level.flagX * TS - 60;
g.player.y = (ROWS - 2) * TS - 42;
for (let i = 0; i < 300; i++) {
  key('ArrowRight', true);
  const cb = rafCb; rafCb = null; cb();
  if (g.state === 'levelclear') break;
}
key('ArrowRight', false);
check('level 2 flag triggers levelclear', g.state === 'levelclear');
for (let i = 0; i < 400; i++) {
  const cb = rafCb; rafCb = null; cb();
  if (g.state === 'win') break;
}
check('win state after final level', g.state === 'win');

// game-over path: kill the player 3 times quickly
for (let life = 0; life < 3; life++) {
  for (let i = 0; i < 400 && g.state !== 'title'; i++) {
    const cb = rafCb; rafCb = null; cb();
    if (g.state === 'playing') g.player.die();
  }
  if (g.state === 'title') break;
}
check('game over returns to title', g.state === 'title');

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
