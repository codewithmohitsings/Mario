# 🍄 Super Mario — HTML5 Edition

A complete Super Mario-style platformer built with **pure vanilla JavaScript + Canvas + WebAudio**.
No frameworks, no external assets — every sprite is drawn procedurally and every sound is synthesized at runtime.

## Play

```bash
# just open it in a browser
xdg-open index.html        # Linux
open index.html            # macOS
```

or serve it:

```bash
npx serve .                # or: python3 -m http.server
```

## Controls

| Key | Action |
|---|---|
| ← → / A D | Move |
| Z / Space | Jump (hold = higher) |
| X / Shift | Run · shoot fireball (when Fire Mario) |
| ↓ / S | Crouch (when big) |
| P | Pause |
| M | Mute |
| R | Restart |
| Touch buttons | Mobile support |

## Features

- **2 full levels** — overworld (1-1) and underground (1-2), each with pits, pipes, stairs, coins and a flagpole
- **Power-ups**: Mushroom 🍄 (grow), Fire Flower (fireballs), Star ★ (invincibility), 1-UP mushroom
- **Enemies**: Goombas (stomp them) and Koopa Troopas (stomp → kick the shell to bowl over others)
- **? blocks & bricks** — bump from below; bricks break when big; blocks jiggle and flip enemies standing on them
- **Classic systems**: score, coin counter (100 coins = 1-UP), lives, countdown timer with hurry mode, time bonus at the flag
- **Chiptune audio**: looping overworld/underground themes + a dozen synthesized SFX (WebAudio, no files)
- **Parallax scenery**, death/respawn, level-clear walk-to-castle sequence, pause, game over, win screen
- **Mobile touch controls** and pixel-perfect scaled rendering

## Project layout

```
index.html            entry page + touch controls
style.css             page styling / responsive canvas
levels.js             tile-map level definitions (data only)
game.js               engine: game states, level building, collisions, camera, HUD
entities.player.js    player physics (momentum, variable jump, power states)
entities.world.js     enemies, items, fireballs, coin FX, score floaters
renderer.js           procedural sprite/background drawing
audio.js              WebAudio synth: SFX + chiptune music sequencer
test/                 headless test harness (runs the real game loop in Node)
```

## Tests

The test suite boots the actual game in Node with stubbed browser APIs and drives thousands of frames:

```bash
node test/smoke.js       # 1500-frame gameplay simulation, no crashes
node test/mechanics.js   # blocks, powerups, fireballs, stomps, coins, deaths
node test/endgame.js     # flag → level clear → level 2 → win → game over
```

*Fan-made tribute for educational purposes. Mario is a trademark of Nintendo.*
