(function () {
  'use strict';

  const TD = (window.TD = window.TD || {});
  const supportedLocales = Object.freeze(['en', 'ja', 'zh-Hans']);
  const listeners = new Set();
  const numberFormats = new Map();
  const catalogKeys = Object.freeze([
    'page.title',
    'page.description',
    'page.mainAria',
    'page.canvasAria',
    'boot.failure',
    'title.subtitle',
    'semantic.controls',
    'semantic.title',
    'semantic.gameplay',
    'semantic.settings',
    'semantic.pause',
    'semantic.upgrade',
    'semantic.victory',
    'semantic.gameover',
    'action.campaign',
    'action.campaignDescription',
    'action.endless',
    'action.endlessDescription',
    'action.settings',
    'action.pause',
    'action.resume',
    'action.exit',
    'action.back',
    'action.launch',
    'action.parade',
    'action.confirm',
    'action.home',
    'action.retry',
    'mode.campaign',
    'mode.endless',
    'status.title',
    'status.paused',
    'status.resumed',
    'status.settings',
    'status.campaignStage',
    'status.endlessWave',
    'status.retry',
    'status.bossDefeat',
    'status.upgrade',
    'status.victory',
    'status.gameover',
    'status.languageChanged',
    'status.settingSelection',
    'status.gameplaySummary',
    'settings.language',
    'settings.audio',
    'settings.music',
    'settings.shake',
    'settings.motion',
    'settings.contrast',
    'settings.fullscreen',
    'settings.contrastDescription',
    'settings.fullscreenDescription',
    'settings.on',
    'settings.off',
    'language.system',
    'language.ja',
    'language.zhHans',
    'language.en',
    'language.short.system',
    'language.short.ja',
    'language.short.zhHans',
    'language.short.en',
    'upgrade.option',
    'upgrade.wide.name',
    'upgrade.wide.description',
    'upgrade.sweet.name',
    'upgrade.sweet.description',
    'upgrade.pierce.name',
    'upgrade.pierce.description',
    'upgrade.blast.name',
    'upgrade.blast.description',
    'upgrade.parade.name',
    'upgrade.parade.description',
    'upgrade.swarm.name',
    'upgrade.swarm.description',
    'upgrade.reserve.name',
    'upgrade.reserve.description',
    'upgrade.fan.name',
    'upgrade.fan.description',
    'upgrade.magnet.name',
    'upgrade.magnet.description'
  ]);
  const fontFamilies = Object.freeze({
    en: 'Georgia, "Times New Roman", Times, serif',
    ja: '"Yu Mincho", YuMincho, "Hiragino Mincho ProN", "Noto Serif JP", Georgia, serif',
    'zh-Hans': '"Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", STSong, SimSun, Georgia, serif'
  });

  let locale = null;

  function number(value) {
    return formatNumber(value);
  }

  const catalogs = {
    en: {
      'page.title': 'TUMBLEDRUM — Festival Breaker',
      'page.description': 'A tactile brick breaker crafted from paper, wood, clay, rope, and brass.',
      'page.mainAria': 'TUMBLEDRUM game',
      'page.canvasAria':
        'TUMBLEDRUM. Move left and right to return the brass ball. White knot stamps mark required targets.',
      'boot.failure': 'TUMBLEDRUM could not connect to GameYard.',
      'title.subtitle': 'FESTIVAL BREAKER',
      'semantic.controls': 'TUMBLEDRUM controls',
      'semantic.title': 'Title actions',
      'semantic.gameplay': 'Current run',
      'semantic.settings': 'Settings',
      'semantic.pause': 'Pause menu',
      'semantic.upgrade': 'Choose one talisman',
      'semantic.victory': 'Campaign complete',
      'semantic.gameover': 'Endless run complete',
      'action.campaign': 'Start Campaign',
      'action.campaignDescription': 'Play the thirteen authored festival stages.',
      'action.endless': 'Start Endless',
      'action.endlessDescription': 'Play increasingly difficult generated waves.',
      'action.settings': 'Open Settings',
      'action.pause': 'Pause',
      'action.resume': 'Resume',
      'action.exit': 'Exit to title',
      'action.back': 'Back to title',
      'action.launch': 'Launch the ball',
      'action.parade': 'Start Parade',
      'action.confirm': 'Confirm selection',
      'action.home': 'Return to title',
      'action.retry': 'Retry Endless',
      'mode.campaign': 'Campaign',
      'mode.endless': 'Endless',
      'status.title': 'TUMBLEDRUM title screen. Choose Campaign, Endless, or Settings.',
      'status.paused': 'Game paused.',
      'status.resumed': 'Game resumed.',
      'status.settings': 'Settings. Adjust contrast or request fullscreen.',
      'status.campaignStage': ({ current, total }) =>
        `Campaign stage ${number(current)} of ${number(total)}. Move left and right to return the ball. White knot stamps mark required targets.`,
      'status.endlessWave': ({ wave }) => `Endless wave ${number(wave)}.`,
      'status.retry': 'Stage retry. Assistance has increased slightly.',
      'status.bossDefeat': 'The final parade float is collapsing. Campaign complete.',
      'status.upgrade': 'Choose a hanging talisman.',
      'status.victory': ({ score }) => `Victory! Score: ${number(score)}.`,
      'status.gameover': ({ wave }) => `Game over. Wave ${number(wave)}.`,
      'status.languageChanged': ({ language }) => `Language changed to ${language}.`,
      'status.settingSelection': ({ settingKey, enabled }) =>
        `${t(`settings.${settingKey}`)}: ${t(enabled ? 'settings.on' : 'settings.off')}.`,
      'status.gameplaySummary': ({ mode, stage, lives, score, required }) =>
        `${mode}, stage ${number(stage)}. Lives ${number(lives)}. Score ${number(score)}. Required targets ${number(required)}.`,
      'settings.language': 'Language',
      'settings.audio': 'Sound',
      'settings.music': 'Music',
      'settings.shake': 'Screen shake',
      'settings.motion': 'Motion',
      'settings.contrast': 'High contrast',
      'settings.fullscreen': 'Fullscreen',
      'settings.contrastDescription': 'Raises separation between the board, pieces, and effects.',
      'settings.fullscreenDescription': 'Requests fullscreen from the GameYard Host.',
      'settings.on': 'On',
      'settings.off': 'Off',
      'language.system': 'System language',
      'language.ja': 'Japanese',
      'language.zhHans': 'Simplified Chinese',
      'language.en': 'English',
      'language.short.system': 'AUTO',
      'language.short.ja': '日本語',
      'language.short.zhHans': '简中',
      'language.short.en': 'EN',
      'upgrade.option': ({ name, description, level, max }) =>
        `${name}, level ${number(level)} of ${number(max)}. ${description}`,
      'upgrade.wide.name': 'Wide Paddle',
      'upgrade.wide.description': 'Increases paddle width.',
      'upgrade.sweet.name': 'Sweet Spot',
      'upgrade.sweet.description': 'Widens the center-hit zone.',
      'upgrade.pierce.name': 'Charge Pierce',
      'upgrade.pierce.description': 'Improves charged ball penetration.',
      'upgrade.blast.name': 'Blast Radius',
      'upgrade.blast.description': 'Expands explosion reach.',
      'upgrade.parade.name': 'Long Parade',
      'upgrade.parade.description': 'Extends Parade duration.',
      'upgrade.swarm.name': 'Parade Swarm',
      'upgrade.swarm.description': 'Adds balls during Parade.',
      'upgrade.reserve.name': 'Reserve Bead',
      'upgrade.reserve.description': 'Adds a reserve life.',
      'upgrade.fan.name': 'Safety Fan',
      'upgrade.fan.description': 'Improves drain protection.',
      'upgrade.magnet.name': 'Scrap Magnet',
      'upgrade.magnet.description': 'Pulls useful scraps toward the paddle.'
    },
    ja: {
      'page.title': 'TUMBLEDRUM — 祭典ブレイカー',
      'page.description': '紙、木、粘土、ロープ、真鍮で作られた、手触りのあるブロック崩し。',
      'page.mainAria': 'TUMBLEDRUM ゲーム',
      'page.canvasAria':
        'TUMBLEDRUM。左右に動いて真鍮のボールを打ち返します。白い結び目の印が必須ターゲットです。',
      'boot.failure': 'TUMBLEDRUMをGameYardに接続できませんでした。',
      'title.subtitle': '祭典ブレイカー',
      'semantic.controls': 'TUMBLEDRUM 操作',
      'semantic.title': 'タイトル操作',
      'semantic.gameplay': '現在のラン',
      'semantic.settings': '設定',
      'semantic.pause': 'ポーズメニュー',
      'semantic.upgrade': '護符を1つ選択',
      'semantic.victory': 'キャンペーン完了',
      'semantic.gameover': 'エンドレス終了',
      'action.campaign': 'キャンペーン開始',
      'action.campaignDescription': '13の祭典ステージを順番に遊びます。',
      'action.endless': 'エンドレス開始',
      'action.endlessDescription': '難しくなっていく自動生成ウェーブを遊びます。',
      'action.settings': '設定を開く',
      'action.pause': '一時停止',
      'action.resume': '再開',
      'action.exit': 'タイトルへ戻る',
      'action.back': 'タイトルへ戻る',
      'action.launch': 'ボールを発射',
      'action.parade': 'パレード開始',
      'action.confirm': '選択を決定',
      'action.home': 'タイトルへ戻る',
      'action.retry': 'エンドレス再挑戦',
      'mode.campaign': 'キャンペーン',
      'mode.endless': 'エンドレス',
      'status.title': 'TUMBLEDRUMのタイトル画面です。キャンペーン、エンドレス、設定から選びます。',
      'status.paused': '一時停止しました。',
      'status.resumed': 'ゲームを再開しました。',
      'status.settings': '設定です。コントラストを変更するか、全画面表示をリクエストできます。',
      'status.campaignStage': ({ current, total }) =>
        `キャンペーン ${number(current)}／${number(total)}ステージ。左右に動いてボールを打ち返します。白い結び目の印が必須ターゲットです。`,
      'status.endlessWave': ({ wave }) => `エンドレス 第${number(wave)}ウェーブ。`,
      'status.retry': 'ステージを再挑戦します。補助が少し強くなりました。',
      'status.bossDefeat': '最後の山車が崩れています。キャンペーン完了です。',
      'status.upgrade': '吊り下げられた護符を選んでください。',
      'status.victory': ({ score }) => `クリア！ スコア：${number(score)}。`,
      'status.gameover': ({ wave }) => `ゲームオーバー。第${number(wave)}ウェーブ。`,
      'status.languageChanged': ({ language }) => `言語を${language}に変更しました。`,
      'status.settingSelection': ({ settingKey, enabled }) =>
        `${t(`settings.${settingKey}`)}：${t(enabled ? 'settings.on' : 'settings.off')}。`,
      'status.gameplaySummary': ({ mode, stage, lives, score, required }) =>
        `${mode}、ステージ${number(stage)}。残機${number(lives)}。スコア${number(score)}。必須ターゲット${number(required)}。`,
      'settings.language': '言語',
      'settings.audio': '効果音',
      'settings.music': '音楽',
      'settings.shake': '画面の揺れ',
      'settings.motion': '動き',
      'settings.contrast': '高コントラスト',
      'settings.fullscreen': '全画面',
      'settings.contrastDescription': '盤面、ピース、エフェクトの区別を強くします。',
      'settings.fullscreenDescription': 'GameYardホストに全画面表示を要求します。',
      'settings.on': 'オン',
      'settings.off': 'オフ',
      'language.system': 'システム言語',
      'language.ja': '日本語',
      'language.zhHans': '簡体字中国語',
      'language.en': '英語',
      'language.short.system': '自動',
      'language.short.ja': '日本語',
      'language.short.zhHans': '简中',
      'language.short.en': 'EN',
      'upgrade.option': ({ name, description, level, max }) =>
        `${name}、レベル${number(level)}／${number(max)}。${description}`,
      'upgrade.wide.name': '幅広パドル',
      'upgrade.wide.description': 'パドルの幅を広げます。',
      'upgrade.sweet.name': 'スイートスポット',
      'upgrade.sweet.description': '中央ヒット判定を広げます。',
      'upgrade.pierce.name': 'チャージ貫通',
      'upgrade.pierce.description': 'チャージボールの貫通力を高めます。',
      'upgrade.blast.name': '爆発範囲',
      'upgrade.blast.description': '爆発の届く範囲を広げます。',
      'upgrade.parade.name': 'ロングパレード',
      'upgrade.parade.description': 'パレードの時間を延ばします。',
      'upgrade.swarm.name': 'パレード群舞',
      'upgrade.swarm.description': 'パレード中のボールを増やします。',
      'upgrade.reserve.name': '予備の珠',
      'upgrade.reserve.description': '残機を1つ増やします。',
      'upgrade.fan.name': '守りの扇',
      'upgrade.fan.description': 'ボール落下時の保護を強めます。',
      'upgrade.magnet.name': '破片磁石',
      'upgrade.magnet.description': '役立つ破片をパドルへ引き寄せます。'
    },
    'zh-Hans': {
      'page.title': 'TUMBLEDRUM — 滚鼓祭',
      'page.description': '一款由纸张、木头、黏土、绳索与黄铜打造的触感打砖块游戏。',
      'page.mainAria': 'TUMBLEDRUM 游戏',
      'page.canvasAria':
        'TUMBLEDRUM。左右移动并击回黄铜球。带白色绳结印记的是必须击中的目标。',
      'boot.failure': 'TUMBLEDRUM 无法连接到 GameYard。',
      'title.subtitle': '祭典破阵',
      'semantic.controls': 'TUMBLEDRUM 控制',
      'semantic.title': '标题操作',
      'semantic.gameplay': '当前游戏',
      'semantic.settings': '设置',
      'semantic.pause': '暂停菜单',
      'semantic.upgrade': '选择一枚护符',
      'semantic.victory': '战役完成',
      'semantic.gameover': '无尽模式结束',
      'action.campaign': '开始战役',
      'action.campaignDescription': '游玩十三个编排好的祭典关卡。',
      'action.endless': '开始无尽模式',
      'action.endlessDescription': '挑战难度逐渐提高的生成波次。',
      'action.settings': '打开设置',
      'action.pause': '暂停',
      'action.resume': '继续',
      'action.exit': '退出到标题',
      'action.back': '返回标题',
      'action.launch': '发射球',
      'action.parade': '开始巡游',
      'action.confirm': '确认选择',
      'action.home': '返回标题',
      'action.retry': '重试无尽模式',
      'mode.campaign': '战役',
      'mode.endless': '无尽模式',
      'status.title': 'TUMBLEDRUM 标题画面。请选择战役、无尽模式或设置。',
      'status.paused': '游戏已暂停。',
      'status.resumed': '游戏已继续。',
      'status.settings': '设置。可调整对比度或请求全屏显示。',
      'status.campaignStage': ({ current, total }) =>
        `战役第 ${number(current)} 关，共 ${number(total)} 关。左右移动并击回球，白色绳结印记代表必须击中的目标。`,
      'status.endlessWave': ({ wave }) => `无尽模式第 ${number(wave)} 波。`,
      'status.retry': '重新挑战本关，辅助已略微增强。',
      'status.bossDefeat': '最终祭典花车正在崩解，战役完成。',
      'status.upgrade': '请选择一枚悬挂护符。',
      'status.victory': ({ score }) => `胜利！得分：${number(score)}。`,
      'status.gameover': ({ wave }) => `游戏结束。到达第 ${number(wave)} 波。`,
      'status.languageChanged': ({ language }) => `语言已切换为${language}。`,
      'status.settingSelection': ({ settingKey, enabled }) =>
        `${t(`settings.${settingKey}`)}：${t(enabled ? 'settings.on' : 'settings.off')}。`,
      'status.gameplaySummary': ({ mode, stage, lives, score, required }) =>
        `${mode}，第 ${number(stage)} 关。剩余生命 ${number(lives)}。得分 ${number(score)}。必需目标 ${number(required)}。`,
      'settings.language': '语言',
      'settings.audio': '音效',
      'settings.music': '音乐',
      'settings.shake': '画面震动',
      'settings.motion': '动态效果',
      'settings.contrast': '高对比度',
      'settings.fullscreen': '全屏',
      'settings.contrastDescription': '增强棋盘、物件和特效之间的区分度。',
      'settings.fullscreenDescription': '向 GameYard 宿主请求全屏显示。',
      'settings.on': '开',
      'settings.off': '关',
      'language.system': '跟随系统',
      'language.ja': '日语',
      'language.zhHans': '简体中文',
      'language.en': '英语',
      'language.short.system': '自动',
      'language.short.ja': '日本語',
      'language.short.zhHans': '简中',
      'language.short.en': 'EN',
      'upgrade.option': ({ name, description, level, max }) =>
        `${name}，等级 ${number(level)}/${number(max)}。${description}`,
      'upgrade.wide.name': '宽幅挡板',
      'upgrade.wide.description': '增加挡板宽度。',
      'upgrade.sweet.name': '甜蜜点',
      'upgrade.sweet.description': '扩大中心击球区域。',
      'upgrade.pierce.name': '蓄力贯穿',
      'upgrade.pierce.description': '提升蓄力球的贯穿能力。',
      'upgrade.blast.name': '爆炸半径',
      'upgrade.blast.description': '扩大爆炸波及范围。',
      'upgrade.parade.name': '悠长巡游',
      'upgrade.parade.description': '延长巡游持续时间。',
      'upgrade.swarm.name': '巡游球群',
      'upgrade.swarm.description': '增加巡游期间的球数。',
      'upgrade.reserve.name': '备用珠',
      'upgrade.reserve.description': '增加一次备用生命。',
      'upgrade.fan.name': '护身扇',
      'upgrade.fan.description': '增强掉球保护。',
      'upgrade.magnet.name': '碎片磁铁',
      'upgrade.magnet.description': '将有用碎片吸向挡板。'
    }
  };

  validateCatalogs();

  function validateCatalogs() {
    const referenceKeys = [...catalogKeys].sort();
    for (const catalogLocale of supportedLocales) {
      const candidateKeys = Object.keys(catalogs[catalogLocale]).sort();
      if (
        candidateKeys.length !== referenceKeys.length ||
        candidateKeys.some((key, index) => key !== referenceKeys[index])
      ) {
        throw new Error(`Incomplete ${catalogLocale} translation catalog.`);
      }
      if (catalogLocale === 'en') continue;
      for (const key of referenceKeys) {
        if (typeof catalogs[catalogLocale][key] !== typeof catalogs.en[key]) {
          throw new TypeError(`Translation type mismatch for "${key}" in ${catalogLocale}.`);
        }
      }
    }
  }

  function syncDocument() {
    const description = document.querySelector('meta[name="description"]');
    const stage = document.querySelector('main.stage');
    const canvas = document.getElementById('game');
    if (!document.documentElement || !description || !stage || !canvas) {
      throw new Error('TUMBLEDRUM localization requires html, description, main.stage, and #game nodes.');
    }

    document.documentElement.lang = locale;
    document.title = t('page.title');
    description.setAttribute('content', t('page.description'));
    stage.setAttribute('aria-label', t('page.mainAria'));
    canvas.setAttribute('aria-label', t('page.canvasAria'));
    document.documentElement.dataset.i18nReady = 'true';
  }

  function resolveLocale(requestedLocale) {
    if (typeof requestedLocale !== 'string' || requestedLocale.length === 0) {
      throw new TypeError('TUMBLEDRUM requires a browser locale string.');
    }
    if (supportedLocales.includes(requestedLocale)) return requestedLocale;
    const language = requestedLocale.toLowerCase().split('-')[0];
    if (language === 'ja') return 'ja';
    if (language === 'zh') return 'zh-Hans';
    return 'en';
  }

  function setLocale(nextLocale) {
    if (!supportedLocales.includes(nextLocale)) {
      throw new RangeError(`Unsupported Host locale: ${String(nextLocale)}`);
    }
    if (nextLocale === locale) return false;
    locale = nextLocale;
    syncDocument();
    notifyListeners();
    return true;
  }

  function t(key, params) {
    const catalog = catalogs[locale];
    if (!Object.prototype.hasOwnProperty.call(catalog, key)) {
      throw new RangeError(`Unknown translation key: ${String(key)}`);
    }
    const message = catalog[key];
    return typeof message === 'function' ? message(params) : message;
  }

  function formatNumber(value) {
    let formatter = numberFormats.get(locale);
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale);
      numberFormats.set(locale, formatter);
    }
    return formatter.format(value);
  }

  function onChange(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Localization listener must be a function.');
    }
    listeners.add(listener);
    return function removeListener() {
      listeners.delete(listener);
    };
  }

  function notifyListeners() {
    for (const listener of listeners) listener(I18N);
  }

  const I18N = {
    supportedLocales,
    resolveLocale,
    setLocale,
    t,
    formatNumber,
    onChange,
    syncDocument
  };

  Object.defineProperties(I18N, {
    locale: {
      enumerable: true,
      get: () => locale
    },
    fontFamily: {
      enumerable: true,
      get: () => fontFamilies[locale]
    }
  });

  Object.freeze(I18N);
  TD.I18N = I18N;
  setLocale(resolveLocale(navigator.language));

})();
