# 🍄 Super Mario — HTML5 Edition

A complete Super Mario-style platformer built with **pure vanilla JavaScript + Canvas + WebAudio**.
No frameworks, no game assets — every sprite is drawn procedurally and every sound is synthesized at runtime.

**New: 3-player race mode over the internet — no game server needed** (P2P via WebRTC + public Nostr relays).

## Play

```bash
# just open it in a browser
xdg-open index.html        # Linux
open index.html            # macOS
```

or serve it:

```bash
python3 -m http.server 8000     # or: npm start
# → http://localhost:8000
```

## 🏁 Multiplayer race (3 players, different devices, different networks)

The **host's browser runs the simulation**; joiners send inputs and see everyone as
ghosts in the same world. Whoever reaches the flag first scores the most points.
3 lives, then you're eliminated — eliminated players spectate until the podium.

1. **Host**: open the page → `👑 HOST RACE` → pick **which levels and how many** (checkbox list, or quick presets 1/3/5/All) → share the **room code** (or the link, `?room=CODE`) with 2 friends → `🏁 START RACE`
2. **Joiners**: open the same page → `🔗 JOIN A RACE` → enter code + name → wait in the lobby
3. Race: 3-2-1 countdown → same world, level after level → results podium (🥇🥈🥉), ranked by **finish points**: 1st over each flag scores the most (e.g. 3 racers: 3-2-1 points per level)

**How it works** (no backend):

- WebRTC DataChannels connect browsers **directly** (peer-to-peer).
- The initial handshake (signaling) happens through **public Nostr relays** via [Trystero](https://github.com/tmoesl/trystero) — nothing to install or host.
- Strict corporate/symmetric NATs that block direct P2P fall back to a **free public TURN relay** (OpenRelay) included in the config.
- Works over the internet; latency for joiners is ~30–80 ms (inputs are sent at 20 Hz, world snapshots at 15 Hz, own movement is locally predicted so it feels instant).

**Notes**

- ⚠️ If the host closes their tab, the race ends for everyone (the host is the referee).
- The page must be served over `http://` (or `file://` works in most browsers) — `https` not required.
- Rematch: after the podium, the host presses `SPACE` to return to the lobby with the same room.

## Controls

| Key | Action |
|---|---|
| ← → / A D | Move |
| Z / Space | Jump (hold = higher) |
| X / Shift | Run · shoot fireball (when Fire Mario) |
| ↓ / S | Crouch (when big) |
| P | Pause (solo only) |
| M | Mute |
| R | Restart (solo only) |
| Touch buttons | Mobile support |

## Single-player features

- **10 levels** — 5 overworld + 5 underground (1-1 … 2-5), each with pits, pipes, stairs, coins and a flagpole
- **Checkpoints** — a mid-level flag turns green when you pass it; dying respawns you there (instead of the level start) in both solo and races
- **Power-ups**: Mushroom 🍄 (grow), Fire Flower (fireballs), Star ★ (invincibility), 1-UP mushroom
- **Enemies**: Goombas (stomp them) and Koopa Troopas (stomp → kick the shell to bowl over others)
- **? blocks & bricks** — bump from below; bricks break when big; blocks jiggle and flip enemies standing on them
- **Classic systems**: score, coin counter (100 coins = 1-UP), lives, countdown timer with hurry mode, time bonus at the flag
- **Chiptune audio**: looping overworld/underground themes + a dozen synthesized SFX (WebAudio, no files)

## Project layout

```
index.html            entry page + lobby/multiplayer UI + touch controls
style.css             page styling / responsive canvas / overlay panels
levels.js             tile-map level definitions, maps 1-5 (data only)
levels2.js            tile-map level definitions, maps 6-10 (data only)
game.js               engine: states, level building, collisions, camera, HUD,
                      host-authoritative multiplayer sim, client prediction,
                      snapshots (15 Hz), input relay (20 Hz), podium
net.js                P2P transport (Trystero/WebRTC) + loopback transport for tests
entities.player.js    player physics (momentum, variable jump, power states)
entities.world.js     enemies, items, fireballs, coin FX, score floaters
renderer.js           procedural sprite/background drawing + ghosts + name tags
audio.js              WebAudio synth: SFX + chiptune music sequencer
vendor/trystero.js    vendored single-file Trystero build (no CDN needed)
test/                 headless tests (drive the real game loop in Node)
```

## Tests

The test suite boots the actual game in Node with stubbed browser APIs:

```bash
npm test
# or individually:
node test/smoke.js        # 1500-frame solo gameplay simulation
node test/mechanics.js    # blocks, powerups, fireballs, stomps, coins, deaths
node test/endgame.js      # checkpoints → flag → all 10 levels → win → game over
node test/multiplayer.js  # 3 simulated players: join, roster, multi-level race,
                          #   ghosts, points, checkpoint respawn, elimination, podium
```

*Fan-made tribute for educational purposes. Mario is a trademark of Nintendo.*
