// Multiplayer race test: 3 in-process players over a loopback transport.
// Verifies: join flow, roster sync, multi-level race sequence (level advance),
// points, ghost tracking, checkpoint respawn, elimination, final results.
const { loadGameEnv } = require('./helpers');

let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + name + (extra ? ` [${extra}]` : ''));
  if (!cond) failures++;
};

// ---------- three separate game environments ----------
const envs = [];
for (let i = 0; i < 3; i++) {
  for (const m of ['game.js', 'net.js', 'entities.player.js', 'entities.world.js', 'renderer.js', 'audio.js'])
    delete require.cache[require.resolve('../' + m)];
  envs.push(loadGameEnv());
}
const hub = new (envs[2].window.LoopbackHub)();
const [hostEnv, c2Env, c3Env] = envs;

function attach(env, id, name, mode) {
  const { LoopbackTransport, NetSession } = env.window;
  const t = new LoopbackTransport(hub, id);
  const session = new NetSession(mode, { name, transport: t });
  env.game.mp.mode = mode;
  env.game.mp.session = session;
  env.game.state = 'lobby';
  session.onEvent = ev => env.game.onNetEvent(ev);
  return session;
}

const hostSession = attach(hostEnv, 'host1', 'MARIO', 'host');
const c2Session = attach(c2Env, 'join2', 'LUIGI', 'client');
const c3Session = attach(c3Env, 'join3', 'PEACH', 'client');

const flush = () => new Promise(r => setTimeout(r, 25));
const tickAll = (n = 1) => { for (const e of envs) e.tick(n); };

(async () => {
  await flush();

  check('host sees 2 joiners', hostSession.players.size === 3, [...hostSession.players.values()].map(p => p.name).join(','));
  check('client2 roster synced', c2Session.players.size === 3);
  check('client3 roster synced', c3Session.players.size === 3);
  check('palettes unique', new Set([...hostSession.players.values()].map(p => p.ci)).size === 3);

  // ---------- start a 2-level race ----------
  hostEnv.game.mpStartRace([0, 1]);
  hostSession.send({ t: 'start', levels: [0, 1] });
  await flush(); tickAll(2);

  check('host in countdown', hostEnv.game.state === 'countdown');
  check('client2 in countdown', c2Env.game.state === 'countdown');
  check('client3 in countdown', c3Env.game.state === 'countdown');
  check('host has 3 racers', hostEnv.game.racers.length === 3);
  tickAll(190);
  check('host playing', hostEnv.game.state === 'playing');
  check('client2 playing', c2Env.game.state === 'playing');

  // ---------- movement + snapshot sync ----------
  hostEnv.game.input.right = true;
  c2Env.game.input.right = true;
  for (let i = 0; i < 60; i++) { tickAll(1); await flush(); }

  const hPlayer = hostEnv.game.racers.find(r => r.player.local).player;
  check('host mario moved right', hPlayer.x > 100, `x=${Math.round(hPlayer.x)}`);
  const c2me = c2Env.game.racers.find(r => r.player.local).player;
  check('client2 predicted movement', c2me.x > 100, `x=${Math.round(c2me.x)}`);
  const hLuigi = hostEnv.game.racers.find(r => r.id === 'join2');
  check('host simulates luigi', hLuigi && hLuigi.player.x > 100, `x=${Math.round(hLuigi ? hLuigi.player.x : -1)}`);
  const c2hostRacer = c2Env.game.racers.find(r => r.id === 'host1');
  check('client2 sees host ghost', c2hostRacer && c2hostRacer.ix !== undefined, `ix=${c2hostRacer && Math.round(c2hostRacer.ix)}`);
  check('client2 sees enemies', c2Env.game.enemies.length > 0, `n=${c2Env.game.enemies.length}`);

  // ---------- finish level 1 (teleport everyone onto the flag column) ----------
  hostEnv.game.input.right = false;
  c2Env.game.input.right = false;
  {
    const g = hostEnv.game;
    for (const r of g.racers) {
      r.player.x = g.level.flagX * TS + 4;
      r.player.y = 260;
      r.player.vy = 0;
    }
  }
  for (let i = 0; i < 60 && hostEnv.game.state !== 'countdown'; i++) { tickAll(1); await flush(); }
  check('host advanced to level 2/2', hostEnv.game.mp.levelPos === 1 && hostEnv.game.state === 'countdown',
    `pos=${hostEnv.game.mp.levelPos} state=${hostEnv.game.state}`);
  await flush(); tickAll(30);
  check('client2 advanced to level 2/2', c2Env.game.mp.levelPos === 1, `pos=${c2Env.game.mp.levelPos}`);
  check('client2 rebuilt map', c2Env.game.level.name === '1-2', c2Env.game.level.name);
  tickAll(100);
  check('host playing level 2', hostEnv.game.state === 'playing');
  check('racers respawned at level start', Math.abs(hostEnv.game.racers[0].player.x - 3 * TS) < 40,
    `x=${Math.round(hostEnv.game.racers[0].player.x)}`);
  check('level-1 points awarded', hostEnv.game.racers[0].points === 3 && hostEnv.game.racers[1].points === 2,
    hostEnv.game.racers.map(r => r.points).join(','));

  // ---------- finish level 2 -> results ----------
  {
    const g = hostEnv.game;
    for (const r of g.racers) {
      r.player.x = g.level.flagX * TS + 4;
      r.player.y = 260;
      r.player.vy = 0;
    }
  }
  for (let i = 0; i < 60 && hostEnv.game.state !== 'results'; i++) { tickAll(1); await flush(); }
  check('host reached results', hostEnv.game.state === 'results');
  check('finish order recorded', hostEnv.game.mp.order.length === 3, hostEnv.game.mp.order.join(','));
  check('points accumulated', hostEnv.game.racers[0].points === 6, hostEnv.game.racers.map(r => r.points).join(','));
  await flush(); tickAll(30); await flush();
  check('client2 got results/done', c2Env.game.state === 'results', c2Env.game.state);
  check('client2 points synced', (c2Env.game.racers.find(r => r.id === 'host1') || {}).points === 6);

  // ---------- race 2: checkpoint respawn + elimination ----------
  hostEnv.game.mpStartRace([0]);
  hostSession.send({ t: 'start', levels: [0] });
  await flush(); tickAll(2); tickAll(190);
  check('second race playing', hostEnv.game.state === 'playing');
  const luigiHost = hostEnv.game.racers.find(r => r.id === 'join2');
  const cpX = LEVELS[0].checkpointX;

  luigiHost.player.x = cpX * TS + 20;   // luigi passes the checkpoint
  luigiHost.player.y = 260;
  tickAll(2);
  check('luigi checkpoint registered', luigiHost.cpDone === true);

  luigiHost.player.die();               // die once -> respawn at checkpoint
  tickAll(115); await flush();
  check('luigi respawned at checkpoint', !luigiHost.player.dead &&
    Math.abs(luigiHost.player.x - cpX * TS) < 8, `x=${Math.round(luigiHost.player.x)}`);

  luigiHost.player.die();               // two more deaths -> eliminated
  tickAll(115); await flush();
  luigiHost.player.die();
  tickAll(115); await flush();
  tickAll(20); await flush();
  check('luigi eliminated after 3 deaths', luigiHost.eliminated, `lives=${luigiHost.lives}`);

  // remaining racers finish the single level -> results
  {
    const g = hostEnv.game;
    for (const r of g.racers) {
      if (r.eliminated) continue;
      r.player.x = g.level.flagX * TS + 4;
      r.player.y = 260;
      r.player.vy = 0;
    }
  }
  for (let i = 0; i < 60 && hostEnv.game.state !== 'results'; i++) { tickAll(1); await flush(); }
  check('results after elimination', hostEnv.game.state === 'results');
  const lastRacer = hostEnv.game.racers.find(r => r.rank === 3);
  check('eliminated racer ranked last', lastRacer && lastRacer.id === 'join2', lastRacer && lastRacer.id);
  check('luigi scored no points', (hostEnv.game.racers.find(r => r.id === 'join2') || {}).points === 0);

  console.log(failures === 0 ? '\nALL MP CHECKS PASSED' : `\n${failures} MP CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('MP TEST ERROR:', e); process.exit(1); });
