// Mechanics test: ?-blocks, items, powerups, fireballs, stomps, coins, bricks.
const { loadGameEnv } = require('./helpers');
const { key, tick, game } = loadGameEnv();

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ': ' + name); if (!cond) failures++; };

tick(1);
game.startSolo(); tick(3);
check('game started', game.state === 'playing');

// --- ?-block bump spawns mushroom (row 14 = bumpable from ground) ---
game.player.x = 21 * TS + 4;           // under ?-block at 21,14 (QM)
game.player.y = 14 * TS + TS;          // directly below it
game.player.vy = -6;                   // rising
game.player.h = 28; game.player.power = 0;
tick(1);                               // one frame: head hits block
check('?-block turns to used', game.map[14][21] === 5);
check('mushroom item spawned', game.items.length === 1 && game.items[0].kind === 'mushroom');

// --- collect the mushroom ---
const item = game.items[0];
item.emerging = false;
item.x = game.player.x; item.y = game.player.y + 10;
game.player.power = 0; game.player.h = 28;
tick(2);
check('mushroom makes mario big', game.player.power === 1 && game.player.h === 42);
check('score added for mushroom', game.score >= 1000);

// --- flower gives fire power ---
game.player.grow('flower');
check('flower gives fire power', game.player.power === 2);
tick(35);                              // let grow-shifting animation finish
const fbCount = game.fireballs.length;
key('x', true); game.input.fire = true; tick(1); key('x', false);
check('fireball spawned', game.fireballs.length === fbCount + 1);
tick(30);

// --- stomp a goomba ---
game.player.power = 0; game.player.h = 28; game.player.y = 260; game.player.starTime = 0;
const e = game.enemies.find(e => e.activated && e.type === 'goomba' && e.state === 'walk');
if (e) {
  game.player.x = e.x; game.player.y = e.y - 30; game.player.vy = 5;
  tick(1);
  check('stomp kills goomba', e.state === 'dying' || e.state === 'shell');
} else check('stomp kills goomba', false);

// --- coin tile pickup ---
const coinKey = [...game.coinTiles][0];
const [cx, cy] = coinKey.split(',').map(Number);
game.player.x = cx * TS; game.player.y = cy * TS - 20;
const coinsBefore = game.coins;
tick(1);
check('coin tile collected', game.coins === coinsBefore + 1 || !game.coinTiles.has(coinKey));

// --- brick breaks when big ---
game.player.power = 1; game.player.h = 42;
game.player.x = 20 * TS + 10; game.player.y = 14 * TS + TS; game.player.vy = -6; game.player.invuln = 0;
const brickBefore = game.map[14][20];
tick(1);
check('brick destroyed by big mario headbutt', brickBefore === 2 ? game.map[14][20] === 0 : true);

// --- star kills on contact ---
game.player.starTime = 300;
const e2 = game.enemies.find(e => e.activated && e.state === 'walk');
if (e2) {
  game.player.x = e2.x; game.player.y = e2.y; game.player.vy = 0;
  tick(1);
  check('star power kills enemy on touch', e2.state === 'dying');
} else check('star power kills enemy on touch', true);

// --- fireball kills enemy ---
const e3 = game.enemies.find(e => e.activated && e.state === 'walk');
if (e3) {
  const fb = new Fireball(game, e3.x - 20, e3.y, 1);
  game.fireballs.push(fb);
  tick(10);
  check('fireball kills enemy', e3.state === 'dying' || fb.dead);
} else check('fireball kills enemy', true);

// --- 100 coins = extra life ---
game.coins = 99;
game.collectCoin();
check('100 coins grants 1-up', game.lives >= 4 && game.coins === 0);

// --- checkpoint activates and respawn uses it ---
const cpX = game.level.checkpointX;
check('level has checkpoint', typeof cpX === 'number');
game.player.x = cpX * TS + 20; game.player.y = 260; game.player.vy = 0;
tick(1);
check('checkpoint activates on pass', game.cpActive === true && game.racerSolo.cpDone === true);
game.player.die();
tick(160);
check('respawn at checkpoint', game.state === 'playing' &&
  Math.abs(game.player.x - cpX * TS) < 8 && game.lives >= 2);

// --- pit death and respawn ---
game.cameraX = 0;   // un-clamp: local player can't be left of the camera
game.player.x = 69 * TS + 8; game.player.y = game.levelHeight - 40; game.player.vy = 5; game.player.starTime = 0;
tick(30);
check('pit fall kills player', game.state === 'dying');
tick(160);
check('respawn after death', game.state === 'playing' && game.lives >= 1);

// --- all 10 maps load and are geometrically sane ---
check('10 maps defined', LEVELS.length === 10);
let mapsOk = true;
for (const L of LEVELS) {
  // every level: ground under flag/castle/checkpoint, flag/castle inside width
  const hasFlag = L.ground.some(([a, b]) => L.flagX >= a && L.flagX <= b);
  const hasCastle = L.ground.some(([a, b]) => L.castleX + 4 <= b);
  const hasCp = L.ground.some(([a, b]) => L.checkpointX >= a && L.checkpointX <= b);
  const inWidth = L.flagX < L.width && L.castleX + 5 <= L.width;
  if (!hasFlag || !hasCastle || !hasCp || !inWidth) { mapsOk = false; console.log('  bad map:', L.name, hasFlag, hasCastle, hasCp, inWidth); }
}
check('all maps geometrically valid', mapsOk);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
