(() => {
  "use strict";
  const PLO = (window.PLO = window.PLO || {});

  const SUPPORTED_LOCALES = Object.freeze(["zh-CN", "ja", "en"]);

  const CATALOGS = Object.freeze({
    "zh-CN": Object.freeze({
      "meta.description": "原创双盘对战落物网页游戏，支持中文、日本語与 English。",
      "boot.failure": "PULSE LINK 无法连接到 GameYard。",
      "canvas.label": "PULSE LINK 游戏盘面",
      "language.label": "语言",
      "language.chooseAuto": "跟随系统语言",
      "language.chooseChinese": "切换为中文",
      "language.chooseJapanese": "切换为日语",
      "language.chooseEnglish": "切换为英语",
      "screen.title": "标题菜单",
      "screen.game": "对局界面",
      "screen.pause": "暂停菜单",
      "screen.result": "对局结果",
      "screen.settings": "设置",
      "screen.help": "玩法与操作",
      "title.play": "开始游戏",
      "title.modeGroup": "游戏模式",
      "mode.duel": "对战",
      "mode.blitz": "闪击",
      "mode.lab": "练习",
      "mode.duelLabel": "对战模式",
      "mode.blitzLabel": "九十秒闪击模式",
      "mode.labLabel": "练习模式",
      "difficulty.label": "难度",
      "difficulty.lower": "降低难度",
      "difficulty.higher": "提高难度",
      "difficulty.current": "当前难度：{level}",
      "difficulty.soft": "轻松",
      "difficulty.core": "标准",
      "difficulty.hard": "困难",
      "difficulty.apex": "巅峰",
      "title.help": "玩法与操作",
      "title.settings": "设置",
      "title.fullscreen": "请求全屏",
      "title.stats": "本地战绩",
      "title.wins": "胜",
      "title.bestChain": "连锁",
      "title.footnote": "原创网页游戏 · GAMEYARD GUEST",
      "hud.pause": "暂停",
      "touch.label": "触摸操作",
      "touch.left": "左移",
      "touch.hardDrop": "快速落下",
      "touch.right": "右移",
      "touch.rotate": "顺时针旋转",
      "pause.title": "已暂停",
      "pause.resume": "继续",
      "pause.restart": "重新开始",
      "pause.quit": "返回标题",
      "result.winTitle": "连线完成",
      "result.lossTitle": "连线中断",
      "result.labTitle": "练习完成",
      "result.victory": "胜利",
      "result.defeat": "失败",
      "result.labResult": "练习结果",
      "result.score": "分数",
      "result.maxChain": "最高连锁",
      "result.pressure": "施压",
      "result.retry": "再来一局",
      "result.title": "返回标题",
      "settings.title": "设置",
      "settings.close": "关闭设置",
      "settings.sfxTitle": "音效",
      "settings.sfxDescription": "操作与结算音效",
      "settings.sfxVolume": "音效音量",
      "settings.musicTitle": "音乐",
      "settings.musicDescription": "程序化背景音乐",
      "settings.musicVolume": "音乐音量",
      "settings.shakeTitle": "屏幕震动",
      "settings.shakeDescription": "冲击与连锁震动",
      "settings.motionTitle": "减弱动态",
      "settings.motionDescription": "减少位移与闪光",
      "settings.glyphsTitle": "颜色纹样",
      "settings.glyphsDescription": "强化形状与纹样编码",
      "settings.hapticsTitle": "触觉反馈",
      "settings.hapticsDescription": "在支持的设备上启用振动",
      "settings.tutorialReplay": "重播图形教学",
      "settings.tutorialArmed": "教学已就绪",
      "help.title": "连线指南",
      "help.close": "关闭帮助",
      "help.connectTitle": "同色三连通",
      "help.connectBody": "上下左右连成三个即可消除。连续结算会形成连锁。",
      "help.pulseTitle": "脉冲块",
      "help.pulseBody": "让普通消除贴近白色脉冲块，可一次获得 100 能量。",
      "help.attackTitle": "全额攻击",
      "help.attackBody": "能量达到 100 后，把全部能量化为从底部抬升的彩色行。",
      "help.defenseTitle": "全额防御",
      "help.defenseBody": "抵消在途攻击，并清除盘面上方的高风险块。",
      "help.centerTitle": "中央致死",
      "help.centerBody": "只有中央生成列触顶会败。两侧是可主动利用的筑坝空间。",
      "help.reverseTitle": "逆向连锁",
      "help.reverseBody": "攻击行也是普通彩色块，可能替对手接成消除；每次押注都不是绝对安全。",
      "controls.move": "移动",
      "controls.softDrop": "软降",
      "controls.rotateCW": "顺时针旋转",
      "controls.rotateCCW": "逆时针旋转",
      "controls.hardDrop": "快速落下",
      "controls.attack": "攻击",
      "controls.guard": "防御",
      "controls.pause": "暂停",
      "controls.gamepad": "也支持触屏与标准手柄",
      "save.repaired": "检测到损坏的本地存档，已重置为全新存档。",
      "save.unavailable": "当前会话无法保存本地进度。",
      "save.dismiss": "关闭存档通知",
      "aria.gameActions": "对局操作",
      "aria.gameControls":
        "键盘操作：方向键或 A、D 移动；向下键或 S 软降；向上键、X 或 K 顺时针旋转；Z 或 J 逆时针旋转；空格快速落下；C 或 L 攻击；V 或分号防御；Escape 或 P 暂停。攻击和防御需要至少 100 能量。",
      "aria.attackControl": "攻击。快捷键 C 或 L；至少需要 100 能量。",
      "aria.defenseControl": "防御。快捷键 V 或分号；至少需要 100 能量。",
      "aria.gameSummary":
        "你：分数 {playerScore}，能量 {playerEnergy}，盘面危险度 {playerDanger}%，来袭 {playerIncoming} 行。对手：分数 {cpuScore}，能量 {cpuEnergy}，盘面危险度 {cpuDanger}%，来袭 {cpuIncoming} 行。",
      "aria.tutorialComplete": "图形教学完成",
      "aria.attack": "攻击已发动。压力：{lines}。",
      "aria.opponentAttack": "对手攻击正在接近。压力：{lines}。",
      "aria.defense": "防御完成。抵消：{canceled}；清除：{purged}。",
      "aria.chainEnergy": "第 {chain} 连锁，获得能量。",
      "aria.matchStart": "对局开始",
      "aria.paused": "已暂停",
      "aria.matchEnd": "对局结束",
      "aria.matchLoss": "对局失败",
      "canvas.chain": "{chain} 连锁",
      "canvas.counter": "反击",
      "canvas.overdrive": "超载",
      "canvas.incoming": "来袭",
      "canvas.guard": "防御",
      "canvas.blocked": "已拦截",
      "canvas.matchStart": "连线！",
      "canvas.tutorialSync": "同步",
      "canvas.player": "你",
      "canvas.energy": "能量",
      "canvas.countdownStart": "开始！",
      "canvas.energyReady": "100",
    }),
    ja: Object.freeze({
      "meta.description":
        "中国語・日本語・英語に対応した、オリジナルの2面対戦型落ちものWebゲーム。",
      "boot.failure": "PULSE LINK は GameYard に接続できませんでした。",
      "canvas.label": "PULSE LINK ゲーム盤",
      "language.label": "言語",
      "language.chooseAuto": "システム言語に合わせる",
      "language.chooseChinese": "中国語に切り替える",
      "language.chooseJapanese": "日本語に切り替える",
      "language.chooseEnglish": "英語に切り替える",
      "screen.title": "タイトルメニュー",
      "screen.game": "対戦画面",
      "screen.pause": "ポーズメニュー",
      "screen.result": "対戦結果",
      "screen.settings": "設定",
      "screen.help": "遊び方と操作",
      "title.play": "ゲームを始める",
      "title.modeGroup": "ゲームモード",
      "mode.duel": "対戦",
      "mode.blitz": "速攻",
      "mode.lab": "練習",
      "mode.duelLabel": "対戦モード",
      "mode.blitzLabel": "90秒ブリッツモード",
      "mode.labLabel": "練習モード",
      "difficulty.label": "難易度",
      "difficulty.lower": "難易度を下げる",
      "difficulty.higher": "難易度を上げる",
      "difficulty.current": "現在の難易度：{level}",
      "difficulty.soft": "やさしい",
      "difficulty.core": "標準",
      "difficulty.hard": "ハード",
      "difficulty.apex": "最高",
      "title.help": "遊び方と操作",
      "title.settings": "設定",
      "title.fullscreen": "フルスクリーンをリクエスト",
      "title.stats": "ローカル戦績",
      "title.wins": "勝",
      "title.bestChain": "連鎖",
      "title.footnote": "オリジナル WEB ゲーム · GAMEYARD GUEST",
      "hud.pause": "ポーズ",
      "touch.label": "タッチ操作",
      "touch.left": "左へ移動",
      "touch.hardDrop": "ハードドロップ",
      "touch.right": "右へ移動",
      "touch.rotate": "右回転",
      "pause.title": "ポーズ",
      "pause.resume": "再開",
      "pause.restart": "やり直す",
      "pause.quit": "タイトルへ",
      "result.winTitle": "リンク完了",
      "result.lossTitle": "リンク切断",
      "result.labTitle": "練習完了",
      "result.victory": "勝利",
      "result.defeat": "敗北",
      "result.labResult": "練習結果",
      "result.score": "スコア",
      "result.maxChain": "最大連鎖",
      "result.pressure": "プレッシャー",
      "result.retry": "もう一度",
      "result.title": "タイトルへ",
      "settings.title": "設定",
      "settings.close": "設定を閉じる",
      "settings.sfxTitle": "効果音",
      "settings.sfxDescription": "操作音と決着音",
      "settings.sfxVolume": "効果音の音量",
      "settings.musicTitle": "音楽",
      "settings.musicDescription": "自動生成BGM",
      "settings.musicVolume": "音楽の音量",
      "settings.shakeTitle": "画面の揺れ",
      "settings.shakeDescription": "衝撃と連鎖の振動",
      "settings.motionTitle": "動きを減らす",
      "settings.motionDescription": "移動演出と点滅を抑える",
      "settings.glyphsTitle": "色の模様",
      "settings.glyphsDescription": "形と模様による識別を強める",
      "settings.hapticsTitle": "触覚フィードバック",
      "settings.hapticsDescription": "対応端末で振動を使う",
      "settings.tutorialReplay": "ビジュアルチュートリアルを再生",
      "settings.tutorialArmed": "チュートリアル準備完了",
      "help.title": "リンクのしかた",
      "help.close": "ヘルプを閉じる",
      "help.connectTitle": "同色を3つつなぐ",
      "help.connectBody": "同じ色を上下左右に3つつなぐと消えます。続けて消えると連鎖になります。",
      "help.pulseTitle": "パルスブロック",
      "help.pulseBody": "通常の消去を白いパルスブロックに隣接させると、100エナジーを得られます。",
      "help.attackTitle": "全力攻撃",
      "help.attackBody": "エナジーが100以上になると、全量を使って相手の盤面を下から押し上げます。",
      "help.defenseTitle": "全力防御",
      "help.defenseBody": "飛来中の攻撃を相殺し、盤面上部の危険なブロックを消します。",
      "help.centerTitle": "中央が命綱",
      "help.centerBody":
        "中央の出現列が上端に達したときだけ敗北します。両側は壁として活用できます。",
      "help.reverseTitle": "逆転連鎖",
      "help.reverseBody":
        "攻撃で増える列も通常ブロックです。相手の消去を助けることがあり、攻撃は常に安全とは限りません。",
      "controls.move": "移動",
      "controls.softDrop": "ソフトドロップ",
      "controls.rotateCW": "右回転",
      "controls.rotateCCW": "左回転",
      "controls.hardDrop": "ハードドロップ",
      "controls.attack": "攻撃",
      "controls.guard": "防御",
      "controls.pause": "ポーズ",
      "controls.gamepad": "タッチ操作と標準ゲームパッドにも対応",
      "save.repaired": "破損したローカルセーブを検出し、新しいセーブに初期化しました。",
      "save.unavailable": "このセッションではローカル進行状況を保存できません。",
      "save.dismiss": "セーブ通知を閉じる",
      "aria.gameActions": "対戦操作",
      "aria.gameControls":
        "キーボード操作：矢印キーまたは A・D で移動、下矢印または S でソフトドロップ、上矢印・X・K で右回転、Z または J で左回転、スペースでハードドロップ、C または L で攻撃、V またはセミコロンで防御、Escape または P でポーズします。攻撃と防御には100以上のエナジーが必要です。",
      "aria.attackControl": "攻撃。ショートカットは C または L。100以上のエナジーが必要です。",
      "aria.defenseControl":
        "防御。ショートカットは V またはセミコロン。100以上のエナジーが必要です。",
      "aria.gameSummary":
        "自分：スコア {playerScore}、エナジー {playerEnergy}、盤面危険度 {playerDanger}%、接近中 {playerIncoming} 行。相手：スコア {cpuScore}、エナジー {cpuEnergy}、盤面危険度 {cpuDanger}%、接近中 {cpuIncoming} 行。",
      "aria.tutorialComplete": "ビジュアルチュートリアルが完了しました",
      "aria.attack": "攻撃を発動しました。プレッシャー：{lines}。",
      "aria.opponentAttack": "相手の攻撃が接近中です。プレッシャー：{lines}。",
      "aria.defense": "防御しました。相殺：{canceled}、消去：{purged}。",
      "aria.chainEnergy": "{chain}連鎖。エナジーを獲得しました。",
      "aria.matchStart": "対戦開始",
      "aria.paused": "一時停止しました",
      "aria.matchEnd": "対戦終了",
      "aria.matchLoss": "敗北しました",
      "canvas.chain": "{chain} 連鎖",
      "canvas.counter": "カウンター",
      "canvas.overdrive": "オーバードライブ",
      "canvas.incoming": "接近中",
      "canvas.guard": "ガード",
      "canvas.blocked": "ブロック",
      "canvas.matchStart": "リンク！",
      "canvas.tutorialSync": "シンクロ",
      "canvas.player": "あなた",
      "canvas.energy": "エナジー",
      "canvas.countdownStart": "開始！",
      "canvas.energyReady": "100",
    }),
    en: Object.freeze({
      "meta.description":
        "An original split-board competitive falling-block web game in Chinese, Japanese, and English.",
      "boot.failure": "PULSE LINK could not connect to GameYard.",
      "canvas.label": "PULSE LINK game boards",
      "language.label": "Language",
      "language.chooseAuto": "Follow the system language",
      "language.chooseChinese": "Switch to Chinese",
      "language.chooseJapanese": "Switch to Japanese",
      "language.chooseEnglish": "Switch to English",
      "screen.title": "Title menu",
      "screen.game": "Match screen",
      "screen.pause": "Pause menu",
      "screen.result": "Match result",
      "screen.settings": "Settings",
      "screen.help": "How to play and controls",
      "title.play": "Start game",
      "title.modeGroup": "Game mode",
      "mode.duel": "DUEL",
      "mode.blitz": "BLITZ",
      "mode.lab": "LAB",
      "mode.duelLabel": "Duel mode",
      "mode.blitzLabel": "Ninety-second Blitz mode",
      "mode.labLabel": "Practice mode",
      "difficulty.label": "Difficulty",
      "difficulty.lower": "Lower difficulty",
      "difficulty.higher": "Raise difficulty",
      "difficulty.current": "Current difficulty: {level}",
      "difficulty.soft": "Soft",
      "difficulty.core": "Core",
      "difficulty.hard": "Hard",
      "difficulty.apex": "Apex",
      "title.help": "How to play and controls",
      "title.settings": "Settings",
      "title.fullscreen": "Request fullscreen",
      "title.stats": "Local record",
      "title.wins": "WINS",
      "title.bestChain": "CHAIN",
      "title.footnote": "ORIGINAL WEB GAME · GAMEYARD GUEST",
      "hud.pause": "Pause",
      "touch.label": "Touch controls",
      "touch.left": "Move left",
      "touch.hardDrop": "Hard drop",
      "touch.right": "Move right",
      "touch.rotate": "Rotate clockwise",
      "pause.title": "PAUSED",
      "pause.resume": "RESUME",
      "pause.restart": "RESTART",
      "pause.quit": "TITLE",
      "result.winTitle": "LINK COMPLETE",
      "result.lossTitle": "LINK BROKEN",
      "result.labTitle": "RUN COMPLETE",
      "result.victory": "VICTORY",
      "result.defeat": "DEFEAT",
      "result.labResult": "LAB RESULT",
      "result.score": "SCORE",
      "result.maxChain": "MAX CHAIN",
      "result.pressure": "PRESSURE",
      "result.retry": "RETRY",
      "result.title": "TITLE",
      "settings.title": "SETTINGS",
      "settings.close": "Close settings",
      "settings.sfxTitle": "SFX",
      "settings.sfxDescription": "Action and resolution sounds",
      "settings.sfxVolume": "Sound effect volume",
      "settings.musicTitle": "MUSIC",
      "settings.musicDescription": "Procedural background music",
      "settings.musicVolume": "Music volume",
      "settings.shakeTitle": "SCREEN SHAKE",
      "settings.shakeDescription": "Impact and chain vibration",
      "settings.motionTitle": "REDUCED MOTION",
      "settings.motionDescription": "Reduce movement and flashes",
      "settings.glyphsTitle": "COLOR GLYPHS",
      "settings.glyphsDescription": "Strengthen shape and pattern coding",
      "settings.hapticsTitle": "HAPTICS",
      "settings.hapticsDescription": "Use vibration on supported devices",
      "settings.tutorialReplay": "REPLAY VISUAL TUTORIAL",
      "settings.tutorialArmed": "TUTORIAL ARMED",
      "help.title": "HOW TO LINK",
      "help.close": "Close help",
      "help.connectTitle": "Connect three colors",
      "help.connectBody":
        "Connect three matching colors vertically or horizontally to clear them. Continued clears form chains.",
      "help.pulseTitle": "Pulse blocks",
      "help.pulseBody": "Clear beside a white pulse block to gain 100 energy at once.",
      "help.attackTitle": "Full-power attack",
      "help.attackBody":
        "At 100 energy or more, spend everything to push colored rows up from your opponent’s floor.",
      "help.defenseTitle": "Full-power defense",
      "help.defenseBody":
        "Cancel incoming attacks and clear high-risk blocks near the top of your board.",
      "help.centerTitle": "Protect the center",
      "help.centerBody":
        "You lose only when the center spawn column reaches the top. Use the sides as deliberate walls.",
      "help.reverseTitle": "Reverse chains",
      "help.reverseBody":
        "Attack rows are normal colored blocks and may complete an opponent’s clear, so every attack is a calculated risk.",
      "controls.move": "MOVE",
      "controls.softDrop": "SOFT DROP",
      "controls.rotateCW": "ROTATE RIGHT",
      "controls.rotateCCW": "ROTATE LEFT",
      "controls.hardDrop": "HARD DROP",
      "controls.attack": "ATTACK",
      "controls.guard": "GUARD",
      "controls.pause": "PAUSE",
      "controls.gamepad": "Touch controls and standard gamepads are also supported",
      "save.repaired": "A damaged local save was detected and reset to a new save.",
      "save.unavailable": "Local progress cannot be saved during this session.",
      "save.dismiss": "Dismiss save notice",
      "aria.gameActions": "Match actions",
      "aria.gameControls":
        "Keyboard controls: move with the arrow keys or A and D; soft drop with Down or S; rotate clockwise with Up, X, or K; rotate counterclockwise with Z or J; hard drop with Space; attack with C or L; defend with V or semicolon; and pause with Escape or P. Attack and defense require at least 100 energy.",
      "aria.attackControl": "Attack. Shortcut C or L. Requires at least 100 energy.",
      "aria.defenseControl": "Defend. Shortcut V or semicolon. Requires at least 100 energy.",
      "aria.gameSummary":
        "You: score {playerScore}, energy {playerEnergy}, board danger {playerDanger} percent, {playerIncoming} incoming lines. Opponent: score {cpuScore}, energy {cpuEnergy}, board danger {cpuDanger} percent, {cpuIncoming} incoming lines.",
      "aria.tutorialComplete": "Visual tutorial complete",
      "aria.attack": "Attack launched. Pressure: {lines}.",
      "aria.opponentAttack": "Incoming opponent attack. Pressure: {lines}.",
      "aria.defense": "Defense complete. Canceled: {canceled}; cleared: {purged}.",
      "aria.chainEnergy": "Chain {chain}; energy gained.",
      "aria.matchStart": "Match started",
      "aria.paused": "Paused",
      "aria.matchEnd": "Match complete",
      "aria.matchLoss": "Match lost",
      "canvas.chain": "{chain} CHAIN",
      "canvas.counter": "COUNTER",
      "canvas.overdrive": "OVERDRIVE",
      "canvas.incoming": "INCOMING",
      "canvas.guard": "GUARD",
      "canvas.blocked": "BLOCKED",
      "canvas.matchStart": "LINK!",
      "canvas.tutorialSync": "SYNC",
      "canvas.player": "YOU",
      "canvas.energy": "ENERGY",
      "canvas.countdownStart": "LINK!",
      "canvas.energyReady": "100",
    }),
  });

  const placeholders = (value) =>
    [...value.matchAll(/\{([a-z][a-zA-Z0-9]*)\}/g)]
      .map((match) => match[1])
      .sort((left, right) => left.localeCompare(right));

  function validateCatalogs() {
    const referenceKeys = Object.keys(CATALOGS.en).sort();
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = CATALOGS[locale];
      const keys = Object.keys(catalog).sort();
      if (
        keys.length !== referenceKeys.length ||
        keys.some((key, index) => key !== referenceKeys[index])
      ) {
        throw new Error(`Translation catalog keys do not match for ${locale}.`);
      }
      for (const key of referenceKeys) {
        if (typeof catalog[key] !== "string" || !catalog[key].trim()) {
          throw new Error(`Translation ${locale}:${key} must be a non-empty string.`);
        }
        const expected = placeholders(CATALOGS.en[key]);
        const actual = placeholders(catalog[key]);
        if (
          expected.length !== actual.length ||
          expected.some((name, index) => name !== actual[index])
        ) {
          throw new Error(`Translation placeholders do not match for ${locale}:${key}.`);
        }
      }
    }
    return referenceKeys;
  }

  const CATALOG_KEYS = Object.freeze(validateCatalogs());

  class I18n {
    constructor({ locale }) {
      if (!SUPPORTED_LOCALES.includes(locale))
        throw new RangeError(`Unsupported locale: ${locale}`);
      this.locale = locale;
      this.listeners = new Set();
      this.numberFormatter = new Intl.NumberFormat(this.locale);
    }

    static get supportedLocales() {
      return SUPPORTED_LOCALES;
    }
    static get catalogKeys() {
      return CATALOG_KEYS;
    }

    static resolveBrowserLocale(languages) {
      if (!Array.isArray(languages)) {
        throw new TypeError("Browser languages must be an array.");
      }
      for (const language of languages) {
        if (typeof language !== "string") {
          throw new TypeError("Browser language entries must be strings.");
        }
        const normalized = language.toLowerCase();
        if (normalized === "ja" || normalized.startsWith("ja-")) return "ja";
        if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
        if (normalized === "en" || normalized.startsWith("en-")) return "en";
      }
      return "en";
    }

    setLocale(locale) {
      if (!SUPPORTED_LOCALES.includes(locale))
        throw new RangeError(`Unsupported locale: ${locale}`);
      if (locale === this.locale) return false;
      this.locale = locale;
      this.numberFormatter = new Intl.NumberFormat(locale);
      const listeners = Array.from(this.listeners);
      for (const listener of listeners) listener({ locale });
      return true;
    }

    subscribe(listener) {
      if (typeof listener !== "function")
        throw new TypeError("Locale listener must be a function.");
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    t(key, params = {}) {
      const value = CATALOGS[this.locale][key];
      if (value === undefined)
        throw new ReferenceError(`Missing translation: ${this.locale}:${key}`);
      return value.replace(/\{([a-z][a-zA-Z0-9]*)\}/g, (token, name) => {
        if (!Object.prototype.hasOwnProperty.call(params, name)) {
          throw new ReferenceError(`Missing translation parameter ${name} for ${key}.`);
        }
        return String(params[name]);
      });
    }

    formatNumber(value) {
      const number = Number(value);
      if (!Number.isFinite(number))
        throw new TypeError(`Cannot format non-finite number: ${value}`);
      return this.numberFormatter.format(Math.max(0, Math.floor(number)));
    }

    applyHead() {
      document.documentElement.lang = this.locale;
      const description = document.querySelector('meta[name="description"]');
      if (!description) throw new Error("The localized meta description element is required.");
      description.setAttribute("content", this.t("meta.description"));
    }

    apply(root = document) {
      this.applyHead();
      for (const element of root.querySelectorAll("[data-i18n]")) {
        element.textContent = this.t(element.dataset.i18n);
      }
      for (const element of root.querySelectorAll("[data-i18n-aria-label]")) {
        element.setAttribute("aria-label", this.t(element.dataset.i18nAriaLabel));
      }
    }

    destroy() {
      this.listeners.clear();
    }
  }

  PLO.I18n = I18n;
})();
