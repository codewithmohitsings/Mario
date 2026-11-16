// Level definitions for Super Mario JS
// Tile ids: 0 empty, 1 ground, 2 brick, 3 ?-block(coin), 4 ?-block(mushroom),
//           5 used block, 6 solid block, 7 pipe, 8 coin (non-solid)

const TILE = { B: 2, Q: 3, QM: 4, S: 6 };

const LEVELS = [
  {
    name: '1-1',
    width: 216,
    time: 300,
    // inclusive ground column ranges (gaps between ranges are pits)
    ground: [[0, 68], [71, 85], [88, 152], [155, 215]],
    pipes: [[28, 2], [38, 3], [46, 4], [57, 4]],
    blocks: [
      { x: 16, y: 9, t: TILE.Q },
      { x: 20, y: 9, t: TILE.B }, { x: 21, y: 9, t: TILE.QM }, { x: 22, y: 9, t: TILE.B },
      { x: 23, y: 9, t: TILE.Q }, { x: 24, y: 9, t: TILE.B },
      { x: 22, y: 5, t: TILE.Q },
      { x: 77, y: 9, t: TILE.B }, { x: 78, y: 9, t: TILE.Q }, { x: 79, y: 9, t: TILE.B },
      { x: 80, y: 5, t: TILE.B }, { x: 81, y: 5, t: TILE.B }, { x: 82, y: 5, t: TILE.B },
      { x: 83, y: 5, t: TILE.QM },
      { x: 84, y: 5, t: TILE.B }, { x: 85, y: 5, t: TILE.B }, { x: 86, y: 5, t: TILE.B }, { x: 87, y: 5, t: TILE.B },
      { x: 91, y: 5, t: TILE.B }, { x: 92, y: 5, t: TILE.Q }, { x: 93, y: 5, t: TILE.B },
      { x: 100, y: 9, t: TILE.B }, { x: 101, y: 9, t: TILE.B },
      { x: 106, y: 9, t: TILE.Q },
      { x: 118, y: 9, t: TILE.B }, { x: 119, y: 9, t: TILE.Q }, { x: 120, y: 9, t: TILE.B },
      { x: 128, y: 5, t: TILE.B }, { x: 129, y: 5, t: TILE.Q }, { x: 130, y: 5, t: TILE.Q }, { x: 131, y: 5, t: TILE.B },
      { x: 140, y: 9, t: TILE.B }, { x: 141, y: 9, t: TILE.B }
    ],
    coins: [
      [33, 8], [34, 8], [63, 8], [64, 8],
      [69, 9], [70, 9], [86, 8], [87, 8],
      [92, 6], [93, 6], [94, 6],
      [102, 9], [103, 9], [112, 9], [113, 9],
      [133, 9], [134, 9], [144, 7], [145, 7],
      [153, 9], [154, 9]
    ],
    // t: 'goomba' | 'koopa'; y = tile row enemy stands on (default 13 = ground)
    enemies: [
      { x: 22, t: 'goomba' },
      { x: 40, t: 'goomba' },
      { x: 51, t: 'goomba' }, { x: 52.5, t: 'goomba' },
      { x: 62, t: 'koopa' },
      { x: 80, t: 'goomba' }, { x: 82, t: 'goomba' },
      { x: 97, t: 'goomba' }, { x: 99, t: 'goomba' },
      { x: 107, t: 'koopa' },
      { x: 120, t: 'goomba' }, { x: 121.5, t: 'goomba' },
      { x: 130, t: 'goomba' }, { x: 131.5, t: 'goomba' },
      { x: 145, t: 'koopa' }
    ],
    stairs: [
      { x: 181, n: 4, dir: 1 },   // ascending 1..4
      { x: 186, n: 4, dir: -1 }   // descending 4..1
    ],
    flagX: 198,
    castleX: 205
  },

  {
    name: '1-2',
    width: 222,
    time: 300,
    ground: [[0, 23], [26, 44], [48, 69], [73, 94], [97, 117], [122, 139], [142, 164], [169, 221]],
    pipes: [[15, 2], [33, 3], [60, 4], [110, 2], [152, 3]],
    blocks: [
      { x: 8, y: 9, t: TILE.B }, { x: 9, y: 9, t: TILE.Q }, { x: 10, y: 9, t: TILE.B },
      { x: 30, y: 5, t: TILE.B }, { x: 31, y: 5, t: TILE.B }, { x: 32, y: 5, t: TILE.B },
      { x: 33, y: 5, t: TILE.B }, { x: 34, y: 5, t: TILE.B },
      { x: 36, y: 9, t: TILE.B }, { x: 37, y: 9, t: TILE.Q }, { x: 38, y: 9, t: TILE.B }, { x: 39, y: 9, t: TILE.B },
      { x: 50, y: 9, t: TILE.QM },
      { x: 55, y: 5, t: TILE.B }, { x: 56, y: 5, t: TILE.B }, { x: 57, y: 5, t: TILE.B }, { x: 58, y: 5, t: TILE.B },
      { x: 75, y: 9, t: TILE.B }, { x: 76, y: 9, t: TILE.B }, { x: 77, y: 9, t: TILE.Q },
      { x: 84, y: 5, t: TILE.B }, { x: 85, y: 5, t: TILE.B }, { x: 86, y: 5, t: TILE.B },
      { x: 87, y: 5, t: TILE.QM },
      { x: 88, y: 5, t: TILE.B }, { x: 89, y: 5, t: TILE.B }, { x: 90, y: 5, t: TILE.B },
      { x: 100, y: 9, t: TILE.Q }, { x: 101, y: 9, t: TILE.Q },
      { x: 128, y: 9, t: TILE.B }, { x: 129, y: 9, t: TILE.QM }, { x: 130, y: 9, t: TILE.B },
      { x: 145, y: 5, t: TILE.B }, { x: 146, y: 5, t: TILE.B }, { x: 147, y: 5, t: TILE.B }, { x: 148, y: 5, t: TILE.B },
      { x: 155, y: 9, t: TILE.B }, { x: 156, y: 9, t: TILE.Q }, { x: 157, y: 9, t: TILE.B }
    ],
    coins: [
      [45, 8], [46, 7], [47, 8],
      [64, 9], [65, 9],
      [70, 8], [71, 8], [72, 8],
      [95, 8], [96, 8],
      [118, 7], [119, 7], [120, 7], [121, 7],
      [140, 8], [141, 8],
      [165, 8], [166, 7], [167, 7], [168, 8]
    ],
    enemies: [
      { x: 12, t: 'koopa' },
      { x: 20, t: 'goomba' }, { x: 21.5, t: 'goomba' },
      { x: 31, t: 'koopa', y: 5 },
      { x: 50, t: 'goomba' }, { x: 51.5, t: 'goomba' },
      { x: 56, t: 'koopa', y: 5 },
      { x: 78, t: 'goomba' }, { x: 80, t: 'goomba' },
      { x: 88, t: 'koopa', y: 5 },
      { x: 100, t: 'goomba' }, { x: 101.5, t: 'goomba' }, { x: 103, t: 'goomba' },
      { x: 113, t: 'koopa' },
      { x: 126, t: 'goomba' }, { x: 127.5, t: 'goomba' },
      { x: 146, t: 'koopa', y: 5 },
      { x: 155, t: 'goomba' }, { x: 156.5, t: 'goomba' }, { x: 158, t: 'goomba' }, { x: 159.5, t: 'goomba' },
      { x: 175, t: 'koopa' }
    ],
    stairs: [
      { x: 190, n: 4, dir: 1 },
      { x: 195, n: 4, dir: -1 }
    ],
    flagX: 204,
    castleX: 211
  }
];

if (typeof module !== 'undefined') module.exports = { LEVELS, TILE };
if (typeof window !== 'undefined') window.LEVELS = LEVELS;
