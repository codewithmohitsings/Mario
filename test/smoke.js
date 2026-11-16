// Headless smoke test: simulate ~1500 frames of solo play, verify no errors.
const { loadGameEnv } = require('./helpers');
const env = loadGameEnv();
const { key, tick, game } = env;

let err = null;
try {
  tick(2);
  key(' ', true); tick(1); key(' ', false);   // start solo via menu-hidden path
  // startSolo is triggered by keydown when menu hidden; UI.menuVisible stub says visible
  // so drive it directly:
  if (game.state !== 'playing') game.startSolo();
  tick(3);
  key('ArrowRight', true);
  for (let i = 0; i < 1500; i++) {
    if (i % 50 === 0) key('z', true);
    if (i % 50 === 26) key('z', false);
    tick(1);
  }
} catch (e) { err = e; }

if (err) { console.error('RUNTIME ERROR:', err); process.exit(1); }
console.log('1520 frames simulated without errors');
console.log(`state=${game.state} lives=${game.lives} score=${game.score} coins=${game.coins}`);
console.log(`player x=${Math.round(game.player.x)} cameraX=${Math.round(game.cameraX)} progress=${Math.round(100 * game.player.x / game.levelWidth)}%`);
console.log(`enemies alive=${game.enemies.length} racers=${game.racers.length}`);
