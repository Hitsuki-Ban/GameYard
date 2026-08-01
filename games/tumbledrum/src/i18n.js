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
    'title.subtitle',
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
    'settings.language',
    'settings.audio',
    'settings.music',
    'settings.shake',
    'settings.motion',
    'settings.contrast',
    'settings.fullscreen',
    'settings.on',
    'settings.off',
    'language.system',
    'language.ja',
    'language.zhHans',
    'language.en',
    'language.short.system',
    'language.short.ja',
    'language.short.zhHans',
    'language.short.en'
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
      'title.subtitle': 'FESTIVAL BREAKER',
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
      'settings.language': 'Language',
      'settings.audio': 'Sound',
      'settings.music': 'Music',
      'settings.shake': 'Screen shake',
      'settings.motion': 'Motion',
      'settings.contrast': 'High contrast',
      'settings.fullscreen': 'Fullscreen',
      'settings.on': 'On',
      'settings.off': 'Off',
      'language.system': 'System language',
      'language.ja': 'Japanese',
      'language.zhHans': 'Simplified Chinese',
      'language.en': 'English',
      'language.short.system': 'AUTO',
      'language.short.ja': '日本語',
      'language.short.zhHans': '简中',
      'language.short.en': 'EN'
    },
    ja: {
      'page.title': 'TUMBLEDRUM — 祭典ブレイカー',
      'page.description': '紙、木、粘土、ロープ、真鍮で作られた、手触りのあるブロック崩し。',
      'page.mainAria': 'TUMBLEDRUM ゲーム',
      'page.canvasAria':
        'TUMBLEDRUM。左右に動いて真鍮のボールを打ち返します。白い結び目の印が必須ターゲットです。',
      'title.subtitle': '祭典ブレイカー',
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
      'settings.language': '言語',
      'settings.audio': '効果音',
      'settings.music': '音楽',
      'settings.shake': '画面の揺れ',
      'settings.motion': '動き',
      'settings.contrast': '高コントラスト',
      'settings.fullscreen': '全画面',
      'settings.on': 'オン',
      'settings.off': 'オフ',
      'language.system': 'システム言語',
      'language.ja': '日本語',
      'language.zhHans': '簡体字中国語',
      'language.en': '英語',
      'language.short.system': '自動',
      'language.short.ja': '日本語',
      'language.short.zhHans': '简中',
      'language.short.en': 'EN'
    },
    'zh-Hans': {
      'page.title': 'TUMBLEDRUM — 滚鼓祭',
      'page.description': '一款由纸张、木头、黏土、绳索与黄铜打造的触感打砖块游戏。',
      'page.mainAria': 'TUMBLEDRUM 游戏',
      'page.canvasAria':
        'TUMBLEDRUM。左右移动并击回黄铜球。带白色绳结印记的是必须击中的目标。',
      'title.subtitle': '祭典破阵',
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
      'settings.language': '语言',
      'settings.audio': '音效',
      'settings.music': '音乐',
      'settings.shake': '画面震动',
      'settings.motion': '动态效果',
      'settings.contrast': '高对比度',
      'settings.fullscreen': '全屏',
      'settings.on': '开',
      'settings.off': '关',
      'language.system': '跟随系统',
      'language.ja': '日语',
      'language.zhHans': '简体中文',
      'language.en': '英语',
      'language.short.system': '自动',
      'language.short.ja': '日本語',
      'language.short.zhHans': '简中',
      'language.short.en': 'EN'
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

})();
