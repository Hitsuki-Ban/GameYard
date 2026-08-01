(function () {
  'use strict';

  const TD = (window.TD = window.TD || {});

  const W = 900;
  const H = 1200;

  const PALETTES = [
    {
      name: 'Lantern Lane',
      cloth: '#19232b',
      cloth2: '#26343a',
      paper: '#f2e3bd',
      cream: '#fff3cf',
      red: '#bd4634',
      red2: '#8f3029',
      gold: '#d3a23a',
      green: '#3f6f62',
      plum: '#794257',
      clay: '#b86b48',
      clay2: '#7d4937',
      wood: '#5c3929',
      wood2: '#34251f',
      ink: '#211c1a',
      rope: '#b79a63',
      white: '#fff6dc'
    },
    {
      name: 'Paper Menagerie',
      cloth: '#242433',
      cloth2: '#343042',
      paper: '#efe0b3',
      cream: '#fff2cc',
      red: '#c4513a',
      red2: '#963c31',
      gold: '#daa63f',
      green: '#4b755e',
      plum: '#784b60',
      clay: '#b06a4c',
      clay2: '#74463a',
      wood: '#63402d',
      wood2: '#39271f',
      ink: '#201b1c',
      rope: '#bca16d',
      white: '#fff7de'
    },
    {
      name: 'Grand Procession',
      cloth: '#20262c',
      cloth2: '#31363b',
      paper: '#f0dfb6',
      cream: '#fff0c5',
      red: '#b94131',
      red2: '#852f29',
      gold: '#d7a23a',
      green: '#496a58',
      plum: '#704050',
      clay: '#ad6343',
      clay2: '#724134',
      wood: '#583726',
      wood2: '#31231d',
      ink: '#1f1a18',
      rope: '#b79a62',
      white: '#fff6dc'
    }
  ];

  const B = (type, x, y, w, h, extra) =>
    Object.assign(
      {
        type,
        x,
        y,
        w: w || 92,
        h: h || 48,
        required: true
      },
      extra || {}
    );

  function grid(cols, rows, x, y, gapX, gapY, maker) {
    const out = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const item = maker(c, r, x + c * gapX, y + r * gapY);
        if (item) out.push(item);
      }
    }
    return out;
  }

  function stage1() {
    const bricks = grid(6, 3, 103, 250, 118, 78, (c, r, x, y) =>
      B('paper', x, y, 104, 56, { variant: (c + r) % 4 })
    );
    return {
      id: 'lantern-gate',
      act: 0,
      speed: 590,
      bricks,
      motif: 'gate'
    };
  }

  function stage2() {
    const bricks = [];
    for (let i = 0; i < 7; i += 1) {
      const y = 250 + Math.abs(i - 3) * 46;
      bricks.push(B('clay', 54 + i * 115, y, 102, 54, { variant: i % 2 }));
      if (i > 0 && i < 6) {
        bricks.push(B('paper', 54 + i * 115, y + 76, 102, 52, { variant: (i + 1) % 4 }));
      }
    }
    bricks.push(B('bell', 404, 520, 92, 64, { required: false }));
    return {
      id: 'clay-teeth',
      act: 0,
      speed: 610,
      bricks,
      motif: 'arch'
    };
  }

  function stage3() {
    const bricks = [];
    const cx = 450;
    const cy = 390;
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      bricks.push(
        B('paper', cx + Math.cos(a) * 255 - 46, cy + Math.sin(a) * 160 - 24, 92, 48, {
          required: i % 2 === 0,
          variant: i % 4,
          rotation: a + Math.PI / 2
        })
      );
    }
    bricks.push(B('bomb', 268, 322, 82, 64, { required: true }));
    bricks.push(B('bomb', 550, 322, 82, 64, { required: true }));
    bricks.push(B('bomb', 268, 455, 82, 64, { required: true }));
    bricks.push(B('bomb', 550, 455, 82, 64, { required: true }));
    return {
      id: 'firewheel',
      act: 0,
      speed: 625,
      bricks,
      motif: 'ring'
    };
  }

  function stage4() {
    const bricks = [];
    const groups = [
      { x: 150, id: 'a' },
      { x: 355, id: 'b' },
      { x: 560, id: 'c' }
    ];
    groups.forEach((g, gi) => {
      bricks.push(B('anchor', g.x + 36, 535, 102, 64, { group: g.id, required: true, variant: gi }));
      for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 2; c += 1) {
          bricks.push(
            B(r === 0 ? 'clay' : 'paper', g.x + c * 104, 260 + r * 82, 94, 50, {
              group: g.id,
              linked: true,
              required: false,
              variant: (gi + r + c) % 4
            })
          );
        }
      }
    });
    return {
      id: 'hanging-market',
      act: 0,
      speed: 635,
      bricks,
      motif: 'ropes'
    };
  }

  function stage5() {
    const bricks = [];
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 6; c += 1) {
        const x = 116 + c * 116 + (r % 2 ? 52 : 0);
        if (x > 760) continue;
        if ((r + c) % 3 === 0) {
          bricks.push(
            B('spinner', x, 235 + r * 96, 70, 70, {
              required: false,
              motion: { axis: 'x', amp: 24 + r * 5, speed: 0.8 + c * 0.06, phase: c }
            })
          );
        } else {
          bricks.push(
            B('paper', x, 245 + r * 96, 88, 50, {
              variant: (r + c) % 4,
              required: true,
              motion: { axis: 'x', amp: 18, speed: 0.65 + r * 0.1, phase: c * 0.7 }
            })
          );
        }
      }
    }
    return {
      id: 'pinwheel-alley',
      act: 1,
      speed: 650,
      bricks,
      motif: 'wind'
    };
  }

  function stage6() {
    const bricks = [];
    bricks.push(...grid(7, 2, 92, 230, 104, 82, (c, r, x, y) =>
      B(r === 0 && c % 2 === 1 ? 'bell' : 'paper', x, y, 88, r === 0 && c % 2 === 1 ? 62 : 48, {
        required: !(r === 0 && c % 2 === 1),
        variant: (c + r) % 4
      })
    ));
    bricks.push(B('gift', 170, 446, 112, 64, { required: true, gift: 'wide' }));
    bricks.push(B('clay', 300, 446, 112, 64, { required: true }));
    bricks.push(B('gift', 430, 446, 112, 64, { required: true, gift: 'multi' }));
    bricks.push(B('clay', 560, 446, 112, 64, { required: true }));
    bricks.push(B('gift', 690, 446, 112, 64, { required: true, gift: 'shield' }));
    return {
      id: 'bell-garden',
      act: 1,
      speed: 660,
      bricks,
      motif: 'bells'
    };
  }

  function stage7() {
    const bricks = [];
    const rows = [
      '  pppp  ',
      ' pcppcp ',
      'pwppppwp',
      'p pbbp p',
      '  pppp  '
    ];
    rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === ' ') return;
        const map = { p: 'paper', c: 'clay', w: 'wood', b: 'bomb' };
        bricks.push(
          B(map[ch], 92 + c * 90, 205 + r * 75, 78, ch === 'b' ? 62 : 48, {
            required: ch !== 'w',
            variant: (r + c) % 4
          })
        );
      });
    });
    return {
      id: 'paper-menagerie',
      act: 1,
      speed: 675,
      bricks,
      motif: 'mask'
    };
  }

  function stage8() {
    const bricks = [];
    for (let side = 0; side < 2; side += 1) {
      const baseX = side === 0 ? 135 : 545;
      for (let r = 0; r < 4; r += 1) {
        for (let c = 0; c < 2; c += 1) {
          bricks.push(
            B((r + c) % 3 === 0 ? 'clay' : 'paper', baseX + c * 100, 225 + r * 78, 88, 48, {
              variant: (r + c + side) % 4,
              motion: {
                axis: 'y',
                amp: 34,
                speed: 0.65 + side * 0.12,
                phase: r * 0.7 + side * 2
              }
            })
          );
        }
      }
    }
    bricks.push(B('gift', 394, 350, 112, 70, { gift: 'multi', required: true }));
    bricks.push(B('spinner', 411, 500, 78, 78, { required: false }));
    return {
      id: 'twin-kites',
      act: 1,
      speed: 690,
      bricks,
      motif: 'kites'
    };
  }

  function stage9() {
    const bricks = [];
    const anchors = [
      { x: 160, y: 545, id: 'l' },
      { x: 635, y: 545, id: 'r' },
      { x: 355, y: 610, id: 'm' }
    ];
    anchors.forEach((a, i) => {
      bricks.push(B('anchor', a.x, a.y, 105, 62, { group: a.id, required: true, variant: i }));
    });
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        if ((r + c) % 2 === 1) continue;
        const group = c < 3 ? 'l' : c > 3 ? 'r' : 'm';
        bricks.push(
          B((r + c) % 4 === 0 ? 'wood' : 'clay', 105 + c * 100, 205 + r * 78, 88, 50, {
            group,
            linked: true,
            required: false,
            variant: (r + c) % 3
          })
        );
      }
    }
    bricks.push(B('bomb', 406, 322, 88, 66, { required: true }));
    return {
      id: 'rope-lattice',
      act: 2,
      speed: 705,
      bricks,
      motif: 'lattice'
    };
  }

  function stage10() {
    const bricks = [];
    for (let r = 0; r < 5; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        if ((c + r) % 3 === 1) continue;
        bricks.push(
          B(r < 2 ? 'wood' : r < 4 ? 'clay' : 'paper', 95 + c * 102, 175 + r * 88, 90, 52, {
            variant: (c + r) % 4,
            motion: {
              axis: 'y',
              amp: 55 + r * 5,
              speed: 0.32 + r * 0.04,
              phase: c * 0.45 + r
            }
          })
        );
      }
    }
    bricks.push(B('gift', 394, 650, 112, 66, { gift: 'charge', required: true }));
    return {
      id: 'tumbling-roof',
      act: 2,
      speed: 720,
      bricks,
      motif: 'roof'
    };
  }

  function stage11() {
    const bricks = [];
    const cx = 450;
    const cy = 390;
    for (let ring = 0; ring < 3; ring += 1) {
      const count = 8 + ring * 4;
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * Math.PI * 2 + ring * 0.22;
        const rx = 120 + ring * 105;
        const ry = 82 + ring * 72;
        const type = ring === 0 ? (i % 3 === 0 ? 'bomb' : 'paper') : ring === 1 ? (i % 2 ? 'clay' : 'paper') : (i % 4 === 0 ? 'spinner' : 'paper');
        bricks.push(
          B(type, cx + Math.cos(a) * rx - 42, cy + Math.sin(a) * ry - 25, 84, type === 'spinner' ? 68 : 50, {
            required: type !== 'spinner' && (ring < 2 || i % 2 === 0),
            variant: (i + ring) % 4,
            rotation: a + Math.PI / 2,
            motion: ring === 2 ? { axis: 'x', amp: 12, speed: 0.55, phase: a } : null
          })
        );
      }
    }
    return {
      id: 'grand-crest',
      act: 2,
      speed: 735,
      bricks,
      motif: 'crest'
    };
  }

  function stage12() {
    const bricks = [];
    const rows = [
      'wwcccww',
      'cpppppc',
      'pbbgbbp',
      'cpppppc',
      'wwaaaww'
    ];
    rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        const map = { w: 'wood', c: 'clay', p: 'paper', b: 'bomb', g: 'gift', a: 'anchor' };
        const type = map[ch];
        const extra = { required: ch !== 'w', variant: (r + c) % 4 };
        if (ch === 'g') extra.gift = 'multi';
        if (ch === 'a') {
          extra.group = `gate-${c}`;
          extra.required = true;
        }
        bricks.push(B(type, 105 + c * 100, 185 + r * 88, 88, ch === 'b' || ch === 'a' || ch === 'g' ? 64 : 50, extra));
        if (ch === 'a') {
          for (let rr = 0; rr < 2; rr += 1) {
            bricks.push(
              B('paper', 105 + c * 100, 690 + rr * 64, 88, 44, {
                group: `gate-${c}`,
                linked: true,
                required: false,
                variant: (rr + c) % 4
              })
            );
          }
        }
      });
    });
    return {
      id: 'procession-gate',
      act: 2,
      speed: 750,
      bricks,
      motif: 'final-gate'
    };
  }

  function bossStage() {
    return {
      id: 'great-mask',
      act: 2,
      speed: 730,
      boss: true,
      motif: 'boss',
      bricks: [
        B('anchor', 125, 610, 112, 68, { group: 'boss-left', required: true, bossSeal: true }),
        B('anchor', 663, 610, 112, 68, { group: 'boss-right', required: true, bossSeal: true }),
        B('anchor', 250, 740, 112, 68, { group: 'boss-low-left', required: true, bossSeal: true }),
        B('anchor', 538, 740, 112, 68, { group: 'boss-low-right', required: true, bossSeal: true })
      ]
    };
  }

  const STAGE_BUILDERS = [
    stage1,
    stage2,
    stage3,
    stage4,
    stage5,
    stage6,
    stage7,
    stage8,
    stage9,
    stage10,
    stage11,
    stage12,
    bossStage
  ];

  const UPGRADES = [
    { id: 'wide', max: 3, icon: 'paddle' },
    { id: 'sweet', max: 3, icon: 'target' },
    { id: 'pierce', max: 3, icon: 'pierce' },
    { id: 'blast', max: 3, icon: 'bomb' },
    { id: 'parade', max: 3, icon: 'drum' },
    { id: 'swarm', max: 3, icon: 'multi' },
    { id: 'reserve', max: 3, icon: 'bead' },
    { id: 'fan', max: 3, icon: 'shield' },
    { id: 'magnet', max: 3, icon: 'scrap' }
  ];

  function makeEndlessStage(wave, random) {
    const rng = random || Math.random;
    const act = Math.floor((wave - 1) / 4) % 3;
    const bricks = [];
    const pattern = wave % 6;
    const hpChance = Math.min(0.62, 0.08 + wave * 0.025);
    const woodChance = Math.min(0.25, Math.max(0, (wave - 6) * 0.014));
    const bombChance = Math.min(0.18, 0.03 + wave * 0.007);
    const cols = 6 + (wave % 2);
    const rows = Math.min(6, 3 + Math.floor(wave / 3));
    const gapX = 102;
    const gapY = 74;
    const startX = (W - (cols - 1) * gapX - 88) / 2;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        let include = true;
        if (pattern === 0) include = (r + c) % 2 === 0 || r === rows - 1;
        if (pattern === 1) include = c >= r - 1 && c <= cols - r;
        if (pattern === 2) include = Math.abs(c - (cols - 1) / 2) + r < cols;
        if (pattern === 3) include = c === 0 || c === cols - 1 || r === 0 || r === rows - 1;
        if (pattern === 4) include = (c + 2 * r) % 3 !== 1;
        if (!include) continue;

        const roll = rng();
        let type = 'paper';
        if (roll < bombChance) type = 'bomb';
        else if (roll < bombChance + woodChance) type = 'wood';
        else if (roll < bombChance + woodChance + hpChance) type = 'clay';
        else if (wave > 4 && roll > 0.94) type = 'spinner';
        const required = type !== 'spinner' && (rng() > 0.16 || r === rows - 1);
        bricks.push(
          B(type, startX + c * gapX, 190 + r * gapY, 88, type === 'spinner' ? 68 : 48, {
            required,
            variant: Math.floor(rng() * 4),
            motion:
              wave > 5 && rng() < Math.min(0.28, wave * 0.018)
                ? {
                    axis: rng() < 0.65 ? 'x' : 'y',
                    amp: 14 + rng() * 34,
                    speed: 0.35 + rng() * 0.75,
                    phase: rng() * Math.PI * 2
                  }
                : null
          })
        );
      }
    }

    if (wave % 3 === 0) {
      bricks.push(
        B('gift', 394, 690, 112, 64, {
          required: true,
          gift: ['multi', 'wide', 'shield', 'charge'][wave % 4]
        })
      );
    }
    if (wave % 5 === 0) {
      bricks.push(B('bell', 210, 680, 86, 62, { required: false }));
      bricks.push(B('bell', 604, 680, 86, 62, { required: false }));
    }

    return {
      id: `endless-${wave}`,
      act,
      speed: Math.min(900, 600 + wave * 17),
      endlessWave: wave,
      bricks,
      motif: ['checker', 'stairs', 'diamond', 'frame', 'weave', 'rows'][pattern]
    };
  }

  TD.CONTENT = {
    W,
    H,
    PALETTES,
    UPGRADES,
    buildStage(index) {
      const builder = STAGE_BUILDERS[Math.max(0, Math.min(STAGE_BUILDERS.length - 1, index))];
      return builder();
    },
    stageCount: STAGE_BUILDERS.length,
    regularStageCount: STAGE_BUILDERS.length - 1,
    makeEndlessStage
  };
})();
