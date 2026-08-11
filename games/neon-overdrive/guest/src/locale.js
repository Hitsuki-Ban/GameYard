const SUPPORTED = "zh-Hans";
const PREFERENCES = Object.freeze(["system", SUPPORTED]);

const catalogs = Object.freeze({
  "zh-Hans": Object.freeze({
    title: "霓虹超载",
    subtitle: "弹幕爆奏",
    ignite: "点火",
    story: "战役",
    rush: "限时",
    endless: "无尽",
    locked: "完成战役后解锁",
    pause: "信号暂停",
    resume: "继续",
    retry: "再次点火",
    toTitle: "返回标题",
    upgrade: "选择升级",
    victory: "胜利",
    gameOver: "游戏结束",
  }),
});

function exactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

export function assertLocaleContext(locale) {
  if (
    !exactKeys(locale, ["preference", "resolved"]) ||
    !PREFERENCES.includes(locale.preference) ||
    locale.resolved !== SUPPORTED
  ) {
    throw new RangeError("Neon locale context must be an exact supported GameYard locale.");
  }
}

export function createNeonLocale(initial) {
  assertLocaleContext(initial);
  let context = initial;
  return {
    get context() {
      return context;
    },
    apply(next) {
      assertLocaleContext(next);
      context = next;
    },
    text(key) {
      const value = catalogs[context.resolved][key];
      if (value === undefined) throw new RangeError(`Unknown Neon translation key: ${key}`);
      return value;
    },
  };
}
