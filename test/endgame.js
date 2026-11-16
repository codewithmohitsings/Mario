// Endgame test: checkpoints + clearing every level -> win; game-over path.
const { loadGameEnv } = require('./helpers');
const { key, tick, game } = loadGameEnv();

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) failures++; };

tick(1);
game.startSolo();
check('level 1-1 loaded', game.level.name === '1-1');
check('10 maps in sequence', LEVELS.length === 10);

// --- checkpoint: pass it, die, verify respawn there ---
game.player.x = game.level.checkpointX * TS + 20;
game.player.y = 260; game.player.vy = 0;
tick(2);
const cpWasActive = game.cpActive;
game.player.die();
tick(160);
check('solo checkpoint respawn', cpWasActive && game.state === 'playing' &&
  game.player.x >= game.level.checkpointX * TS - 8 && game.lives === 2);

// --- clear all 10 levels via the flag ---
let cleared = 0;
for (let li = 0; li < LEVELS.length; li++) {
  game.player.x = game.level.flagX * TS + 4;   // flag column (always on ground)
  game.player.y = 260;
  game.player.vy = 0;
  for (let i = 0; i < 30; i++) {
    tick(1);
    if (game.state === 'levelclear') break;
  }
  if (game.state !== 'levelclear') break;
  cleared++;
  if (li < LEVELS.length - 1) {
    let advanced = false;
    for (let i = 0; i < 400; i++) {
      tick(1);
      if (game.levelIndex === li + 1 && game.state === 'playing') { advanced = true; break; }
    }
    if (!advanced) break;
  } else {
    for (let i = 0; i < 400; i++) { tick(1); if (game.state === 'win') break; }
  }
}
check('all 10 levels cleared', cleared === 10, `cleared=${cleared}`);
check('win state after final level', game.state === 'win');

// --- game-over path ---
for (let life = 0; life < 4; life++) {
  for (let i = 0; i < 400 && game.state !== 'title'; i++) {
    tick(1);
    if (game.state === 'playing') game.player.die();
  }
  if (game.state === 'title') break;
}
check('game over returns to title', game.state === 'title');

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
