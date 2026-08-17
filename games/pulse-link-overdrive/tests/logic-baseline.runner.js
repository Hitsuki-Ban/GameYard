window.runPulseLogicBaseline = () => {
  const PLO = window.PLO;
  const passed = [];
  const assert = (condition, name, detail = "") => {
    if (!condition) throw new Error(`${name}${detail ? ` :: ${detail}` : ""}`);
    passed.push(name);
  };
  const cell = (kind, color) => PLO.makeCell(kind, color, { id: Math.floor(Math.random() * 1e6) });
  const tickBoard = (board, frames = 60) => {
    for (let i = 0; i < frames; i++) board.update(1 / 60, false);
  };
  const makeGame = (mode = "lab", seed = 1) => {
    const game = new PLO.GameSession({
      mode,
      difficulty: 1,
      seed,
      bus: new PLO.EventBus(),
      settings: { reducedMotion: true },
    });
    game.state = "playing";
    game.countdown = 0;
    return game;
  };
  const makeStorage = (initial) => {
    const values = new Map(initial);
    return {
      getItem: (key) => (values.has(key) ? values.get(key) : null),
      setItem: (key, value) => values.set(key, String(value)),
      read: (key) => values.get(key),
    };
  };

  {
    assert(
      PLO.I18n.catalogKeys.length >= 100,
      "三语目录包含完整界面键",
      `keys=${PLO.I18n.catalogKeys.length}`,
    );
    assert(
      JSON.stringify(PLO.I18n.supportedLocales) === JSON.stringify(["zh-CN", "ja", "en"]),
      "Guest 语言目录集合固定",
    );
    assert(
      new PLO.I18n({ locale: "zh-CN" }).t("mode.duel") === "对战",
      "Host 简体中文映射到中文目录",
    );
    assert(new PLO.I18n({ locale: "ja" }).t("mode.duel") === "対戦", "Host 日语映射到日文目录");
    assert(new PLO.I18n({ locale: "en" }).t("mode.duel") === "DUEL", "Host 英语映射到英文目录");
    assert(
      PLO.I18n.resolveBrowserLocale(["ja-JP", "en-US"]) === "ja",
      "启动失败优先采用浏览器日语",
    );
    assert(
      PLO.I18n.resolveBrowserLocale(["zh-Hans-CN", "en-US"]) === "zh-CN",
      "启动失败映射浏览器简体中文",
    );
    assert(PLO.I18n.resolveBrowserLocale(["fr-FR"]) === "en", "不支持的浏览器语言使用英文展览文案");
    let invalidBrowserLanguages = false;
    try {
      PLO.I18n.resolveBrowserLocale("ja-JP");
    } catch (error) {
      invalidBrowserLanguages = error instanceof TypeError;
    }
    assert(invalidBrowserLanguages, "非法浏览器语言输入立即报错");
    const i18n = new PLO.I18n({ locale: "ja" });
    let changes = 0;
    i18n.subscribe(() => changes++);
    assert(
      i18n.setLocale("zh-CN") && changes === 1 && i18n.t("mode.duel") === "对战",
      "Host 语言可实时应用",
    );
    let missingKey = false,
      missingParam = false;
    try {
      i18n.t("missing.key");
    } catch (error) {
      missingKey = error instanceof ReferenceError;
    }
    try {
      i18n.t("aria.attack");
    } catch (error) {
      missingParam = error instanceof ReferenceError;
    }
    assert(missingKey && missingParam, "缺少翻译键或插值参数时立即报错");
    i18n.destroy();
    const controlDescriptions = PLO.I18n.supportedLocales.map((locale) => {
      const catalog = new PLO.I18n({ locale });
      const description = catalog.t("aria.gameControls");
      catalog.destroy();
      return description;
    });
    assert(
      controlDescriptions.every(
        (text) =>
          ["X", "K", "Z", "J", "P"].every((key) => text.includes(key)) && text.includes("Escape"),
      ),
      "三语辅助操作说明覆盖双向旋转与暂停",
    );
  }
  {
    const key = PLO.CONFIG.STORAGE_KEY;
    assert(key === "gameyard.game.pulse-link-overdrive.save.v1", "存档只使用 GameYard 命名空间");
    const validStore = new PLO.SaveStore(key, makeStorage());
    assert(
      PLO.validateSaveData(validStore.data) &&
        Object.keys(validStore.data.settings).sort().join(",") === "glyphs,haptics",
      "存档只保留游戏自有设置",
    );
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
      const invalidStorage = makeStorage([
        [key, '{"version":1,"settings":{"glyphs":true,"haptics":true,"music":1}}'],
      ]);
      const invalidStore = new PLO.SaveStore(key, invalidStorage);
      assert(
        invalidStore.recovery === "repaired" && PLO.validateSaveData(invalidStore.data),
        "含公开设置的存档按当前 schema 明确修复",
      );
      const malformedStorage = makeStorage([[key, "{broken json"]]);
      const malformedStore = new PLO.SaveStore(key, malformedStorage);
      assert(
        malformedStore.recovery === "repaired" &&
          PLO.validateSaveData(JSON.parse(malformedStorage.read(key))),
        "损坏 JSON 存档可恢复并重新持久化",
      );
      let statusNotified = false;
      const failingStorage = {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("quota", "QuotaExceededError");
        },
      };
      const failingStore = new PLO.SaveStore(key, failingStorage);
      failingStore.subscribeStatus(() => {
        statusNotified = true;
      });
      failingStore.patchSettings({ glyphs: false });
      assert(
        !failingStore.available && failingStore.recovery === "unavailable" && statusNotified,
        "运行期间存档写入失败会发出可见状态",
      );
    } finally {
      console.warn = originalWarn;
    }
  }
  {
    const game = makeGame("lab", 11),
      player = game.player,
      board = player.board;
    board.spawnDisabled = true;
    board.active = null;
    board.grid = PLO.logic.createEmptyGrid();
    const R = PLO.CONFIG.ROWS;
    board.grid[R - 1][0] = cell("normal", 1);
    board.grid[R - 1][1] = cell("normal", 1);
    board.grid[R - 1][2] = cell("normal", 0);
    board.grid[R - 2][2] = cell("normal", 0);
    board.grid[R - 3][2] = cell("normal", 0);
    board.grid[R - 4][2] = cell("normal", 1);
    board.grid[R - 1][3] = cell("pulse", -1);
    board.startResolution(false);
    tickBoard(board, 120);
    assert(player.cp === 122, "两段连锁与脉冲 CP 正确", `cp=${player.cp}`);
    assert(player.maxChain === 2, "连锁段数递增", `chain=${player.maxChain}`);
    assert(board.grid.flat().filter(Boolean).length === 0, "连锁后盘面正确清空");
  }
  {
    const game = makeGame("lab", 12),
      player = game.player,
      board = player.board;
    board.spawnDisabled = true;
    board.active = null;
    board.grid = PLO.logic.createEmptyGrid();
    const R = PLO.CONFIG.ROWS;
    for (let x = 0; x < 3; x++) board.grid[R - 1][x] = cell("normal", 2);
    board.grid[R - 1][6] = cell("pulse", -1);
    board.startResolution(false);
    tickBoard(board, 70);
    assert(player.cp === 6, "非邻接脉冲不提供 CP", `cp=${player.cp}`);
    assert(board.grid[R - 1][6]?.kind === "pulse", "非邻接脉冲保留");
  }
  {
    const grid = PLO.logic.createEmptyGrid(),
      R = PLO.CONFIG.ROWS;
    grid[R - 1][0] = cell("normal", 0);
    grid[R - 2][1] = cell("normal", 0);
    grid[R - 3][2] = cell("normal", 0);
    assert(PLO.logic.findClearData(grid) === null, "对角相邻不会清除");
    grid[R - 2][0] = cell("normal", 0);
    grid[R - 3][0] = cell("normal", 0);
    assert(PLO.logic.findClearData(grid).regular >= 3, "四方向三连通会清除");
  }
  {
    const game = makeGame("lab", 13),
      board = game.player.board;
    board.grid = PLO.logic.createEmptyGrid();
    board.grid[0][0] = cell("normal", 0);
    board.grid[1][6] = cell("normal", 1);
    assert(!board.checkCenterTop(), "侧列进入隐藏区仍安全");
    board.grid[1][PLO.CONFIG.CENTER_COL] = cell("normal", 2);
    assert(board.checkCenterTop(), "中央列进入隐藏区判负");
  }
  {
    const game = makeGame("duel", 14);
    game.projectiles = [];
    game.player.cp = 350;
    game.player.lastChain = 0;
    game.player.recentChainTimer = 0;
    assert(game.player.castAttack(), "100+ CP 可发动攻击");
    assert(game.player.cp === 0, "攻击消耗全部 CP");
    assert(
      game.projectiles.at(-1).lines === 3,
      "350 CP 产生 3 行压力",
      `lines=${game.projectiles.at(-1).lines}`,
    );
  }
  {
    const game = makeGame("duel", 15);
    game.projectiles = [];
    const projectile = game.launchAttack(game.cpu, game.player, 4, 500, 0);
    game.player.cp = 270;
    assert(game.player.castDefense(), "100+ CP 可发动防御");
    assert(game.player.cp === 0, "防御消耗全部 CP");
    assert(projectile.lines === 1, "270 CP 抵消 3 行在途攻击", `remaining=${projectile.lines}`);
  }
  {
    const game = makeGame("duel", 16),
      board = game.player.board;
    const before = board.grid.flat().filter(Boolean).length;
    board.receiveLines(3);
    assert(board.pendingLines === 3, "活动块存在时攻击进入待处理队列");
    assert(board.grid.flat().filter(Boolean).length === before, "待处理攻击不会提前改写盘面");
  }
  {
    const game = makeGame("lab", 17),
      board = game.player.board;
    let valid = true,
      bad = "";
    for (let n = 0; n < 500; n++) {
      const row = board.makeRiseRow();
      for (let x = 2; x < row.length; x++)
        if (row[x].color === row[x - 1].color && row[x].color === row[x - 2].color) {
          valid = false;
          bad = `row ${n}`;
          break;
        }
    }
    assert(valid, "500 组上升行无横向天然三连", bad);
  }
  {
    const game = makeGame("duel", 18),
      player = game.player;
    const start = player.board.active.x;
    const consumed = new Set();
    const mock = {
      isDown: () => false,
      consume: (action) => {
        if (action === "left" && !consumed.has(action)) {
          consumed.add(action);
          return true;
        }
        return false;
      },
    };
    player.updateHuman(1 / 60, mock);
    assert(player.board.active.x === start - 1, "单帧移动输入不会丢失");
  }
  {
    const game = makeGame("lab", 19);
    game.cpu.board.lose("test");
    assert(!game.cpu.board.dead, "LAB 目标触顶后解除死亡态");
    assert(game.cpu.board.grid.flat().filter(Boolean).length > 0, "LAB 目标触顶后重新填充");
  }
  {
    const game = makeGame("blitz", 20);
    game.timeLeft = 0.01;
    game.update(0.02, { isDown: () => false, consume: () => false });
    assert(game.ended, "BLITZ 在计时归零后结算");
  }
  let locks = 0;
  for (let seed = 30; seed < 35; seed++) {
    const bus = new PLO.EventBus();
    bus.on("pieceLock", () => locks++);
    const game = new PLO.GameSession({
      mode: "duel",
      difficulty: seed % 4,
      seed,
      bus,
      settings: { reducedMotion: true },
    });
    game.state = "playing";
    const rng = new PLO.RNG(seed * 91);
    for (let frame = 0; frame < 18000 && !game.ended; frame++) {
      const board = game.player.board;
      if (board.active && !board.resolution && frame % 22 === 0) {
        const turns = rng.int(0, 3);
        for (let i = 0; i < turns; i++) board.rotate(1);
        const target = rng.int(0, 6);
        for (let i = 0; i < 8 && board.active && board.active.x !== target; i++)
          board.move(Math.sign(target - board.active.x), 0);
        board.hardDrop(false);
      }
      if (game.player.cp >= 100 && frame % 180 === 0) {
        if (rng.chance(0.65)) game.player.castAttack();
        else game.player.castDefense();
      }
      game.update(1 / 60, { isDown: () => false, consume: () => false });
    }
  }
  assert(locks > 60, "多难度 AI/状态机浸泡完成", `locks=${locks}`);
  return { assertions: passed.length, locks, passed };
};
