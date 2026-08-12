import {
  LOCALE_PREFERENCES,
  PUBLIC_LOCALES,
  type LocaleContext,
  type PublicLocale,
} from "@gameyard/game-contract";

export const NEON_SOURCE_LOCALE = "zh-Hans" satisfies PublicLocale;

export const NEON_UNTRANSLATED_CONTENT = Object.freeze({
  "brand.title": "NEON OVERDRIVE",
  "brand.mark": "N/O",
  "brand.system": "NEON RITUAL SYSTEM",
  "brand.gameyard": "GameYard",
  "technology.canvas2d": "Canvas 2D",
  "technology.webAudio": "Web Audio",
  "weapon.overdrive": "OVERDRIVE",
  "weapon.chain": "CHAIN",
  "weapon.drop": "DROP",
  "mode.rush180": "RUSH 180",
  "boss.aella.name": "AELLA // THE FEED",
  "boss.aella.phase.infiniteScroll": "INFINITE SCROLL",
  "boss.aella.phase.redDotHunger": "RED DOT HUNGER",
  "boss.aella.phase.feedCollapse": "FEED COLLAPSE",
  "boss.mirrorSaint.name": "MIRROR SAINT",
  "boss.mirrorSaint.phase.twinReflection": "TWIN REFLECTION",
  "boss.mirrorSaint.phase.glassLattice": "GLASS LATTICE",
  "boss.mirrorSaint.phase.kaleidoscopeEnd": "KALEIDOSCOPE END",
  "boss.algorithm.name": "THE ALGORITHM",
  "boss.algorithm.phase.predictiveDesire": "PREDICTIVE DESIRE",
  "boss.algorithm.phase.perfectCorridor": "PERFECT CORRIDOR",
  "boss.algorithm.phase.goldenEngagement": "GOLDEN ENGAGEMENT",
  "boss.algorithm.phase.zeroSunFinal": "ZERO SUN // FINAL",
  "stage.synapseCity": "SYNAPSE CITY",
  "stage.glassTemple": "GLASS TEMPLE",
  "stage.zeroSun": "ZERO SUN",
} as const);

type NonEmptyCatalog<Catalog extends Record<string, string>> = {
  [Key in keyof Catalog]: Catalog[Key] extends "" ? never : Catalog[Key];
};

function defineSourceCatalog<const Catalog extends Record<string, string>>(
  catalog: Catalog & NonEmptyCatalog<Catalog>,
): Readonly<Catalog> {
  return Object.freeze(catalog);
}

const ZH_HANS = defineSourceCatalog({
  "document.title": `${NEON_UNTRANSLATED_CONTENT["brand.title"]} // 弹幕爆奏`,
  "document.description": `${NEON_UNTRANSLATED_CONTENT["brand.title"]}：演出特化型纵向弹幕射击，支持键鼠、触控与手柄。`,
  "title.eyebrow": "合成弹幕仪式",
  "title.subtitle": "弹幕爆奏",
  "title.ignite": "点火",
  "title.igniteHint": "ENTER / SPACE / Z / 轻触",
  "title.best": "最高分 {score}",
  "title.photosensitiveWarning": "含高频闪光与画面震动，可在设置中降低。",
  "menu.mode": "模式",
  "menu.settings": "设置",
  "menu.archive": "档案",
  "menu.back": "返回",
  "menu.confirm": "确认",
  "mode.eyebrow": "选择仪式",
  "mode.title": "模式",
  "mode.story.name": "战役推进",
  "mode.story.description": "三幕战役 · 自适应强度 · 自动重启",
  "mode.rush.name": NEON_UNTRANSLATED_CONTENT["mode.rush180"],
  "mode.rush.description": "三分钟高密度计分战",
  "mode.endless.name": "无尽模式",
  "mode.endless.description": "持续攀升的强度与循环首领战",
  "mode.endless.locked": "完成战役后解锁",
  "mode.endless.unlocked": "已解锁",
  "archive.eyebrow": "档案 / 构建 1.0",
  "archive.title": "设计档案",
  "archive.intro": `风险不是惩罚，而是演出燃料。擦弹和贴脸击破会充满 ${NEON_UNTRANSLATED_CONTENT["weapon.overdrive"]}；发动后，弹幕被转化为分数、火力与新的危险。`,
  "archive.accessible.name": "零门槛",
  "archive.accessible.description": "自动射击、微小判定、自动超载、自动重启",
  "archive.mastery.name": "高上限",
  "archive.mastery.description": "贴脸倍率、延迟清算、强度管理、无伤相位",
  "archive.browser.name": "纯浏览器",
  "archive.browser.description": `${NEON_UNTRANSLATED_CONTENT["technology.canvas2d"]}、${NEON_UNTRANSLATED_CONTENT["technology.webAudio"]}、键鼠/触屏/手柄`,
  "archive.runtimeNote": "所有图形、动画与声音均在运行时程序化生成，不加载外部素材。",
  "control.title": "操作",
  "control.kicker": "N/O // 输入",
  "control.move": "移动 {bindings}",
  "control.focus": "聚焦 {bindings}",
  "control.drop": `超载 ${NEON_UNTRANSLATED_CONTENT["weapon.drop"]} {bindings}`,
  "control.pause": "暂停 {bindings}",
  "control.keyboard.move": "WASD / 方向键",
  "control.keyboard.focus": "SHIFT",
  "control.keyboard.drop": "SPACE",
  "control.keyboard.pause": "ESC / P",
  "control.pointer.move": "鼠标 / 触控拖动",
  "control.pointer.drop": "点击 / 轻触",
  "control.gamepad.move": "左摇杆",
  "control.gamepad.focus": "LB",
  "control.gamepad.drop": "A",
  "control.gamepad.pause": "菜单键",
  "settings.eyebrow": "校准",
  "settings.title": "设置",
  "settings.host.title": `${NEON_UNTRANSLATED_CONTENT["brand.gameyard"]} 设置`,
  "settings.host.revision": "主机修订 {revision}",
  "settings.host.master": "主音量",
  "settings.host.music": "音乐",
  "settings.host.sfx": "音效",
  "settings.host.reducedMotion": "减少动态效果",
  "settings.host.screenShake": "画面震动",
  "settings.game.title": "游戏设置",
  "settings.game.fxDensity": "效果密度",
  "settings.game.showHitbox": "常显判定点",
  "settings.game.autoGuard": "自动保险",
  "settings.fx.max": "最高",
  "settings.fx.balanced": "均衡",
  "settings.fx.low": "低",
  "settings.value.on": "开启",
  "settings.value.off": "关闭",
  "settings.save": "应用设置",
  "settings.fullscreen": "全屏",
  "settings.pending": "正在等待主机确认…",
  "settings.applied": "已应用主机修订 {revision}",
  "settings.error": "设置请求失败：{message}",
  "pause.eyebrow": "信号已暂停",
  "pause.title": "暂停",
  "pause.resume": "继续",
  "pause.restart": "重新开始",
  "pause.toTitle": "返回标题",
  "hud.score": "分数",
  "hud.stage": "第 {stage} 幕",
  "hud.sector": "区域 {sector}",
  "hud.phase": "相位 {phase}",
  "hud.shield": "护盾",
  "hud.drive": NEON_UNTRANSLATED_CONTENT["weapon.overdrive"],
  "hud.chain": NEON_UNTRANSLATED_CONTENT["weapon.chain"],
  "hud.threat": "威胁",
  "hud.threat.low": "低",
  "hud.threat.rising": "上升",
  "hud.threat.high": "高",
  "hud.threat.fatal": "致命",
  "hud.best": "最高分 {score}",
  "hud.bossHealth": "{boss} 生命值",
  "upgrade.eyebrow": "仪式完成",
  "upgrade.title": "选择强化",
  "upgrade.description": "任意一个都只会让你更强。",
  "upgrade.hint": "点击 / 1—3",
  "upgrade.level": "等级 {from} → {to}",
  "upgrade.voltage.name": "高压狂热",
  "upgrade.voltage.description": "主炮射速提高 22%，火力反馈更密集。",
  "upgrade.satellite.name": "伴飞星群",
  "upgrade.satellite.description": "增加一枚伴飞炮；最多形成六机齐射。",
  "upgrade.echo.name": "余响延长",
  "upgrade.echo.description": `${NEON_UNTRANSLATED_CONTENT["weapon.overdrive"]} 持续时间增加 1.6 秒。`,
  "upgrade.magnet.name": "危险磁场",
  "upgrade.magnet.description": "擦弹范围与充能效率提高，危险更容易变成资源。",
  "upgrade.nova.name": "终幕新星",
  "upgrade.nova.description": "超载结束时追加全屏伤害与二次爆炸。",
  "upgrade.armor.name": "复合护层",
  "upgrade.armor.description": "最大护盾 +1，并立即补满一格。",
  "upgrade.hunter.name": "贴脸猎杀",
  "upgrade.hunter.description": "近距离攻击与限时模式结算大幅强化。",
  "upgrade.recycler.name": "保险回收",
  "upgrade.recycler.description": "自动保险消耗降低，并扩大紧急清弹范围。",
  "upgrade.chain.name": "连锁锁存",
  "upgrade.chain.description": `${NEON_UNTRANSLATED_CONTENT["weapon.chain"]} 衰减减慢 28%，失误后的保留量提高。`,
  "upgrade.missile.name": "追迹饱和",
  "upgrade.missile.description": "追踪弹发射频率与爆炸范围提高。",
  "upgrade.arc.name": "擦弹电弧",
  "upgrade.arc.description": "连续擦弹会向最近敌人释放自动电弧。",
  "upgrade.mercy.name": "重启协议",
  "upgrade.mercy.description": "每幕首次真实受击无损，并触发大范围反击。",
  "boss.aella.name": NEON_UNTRANSLATED_CONTENT["boss.aella.name"],
  "boss.aella.phase.infiniteScroll": NEON_UNTRANSLATED_CONTENT["boss.aella.phase.infiniteScroll"],
  "boss.aella.phase.redDotHunger": NEON_UNTRANSLATED_CONTENT["boss.aella.phase.redDotHunger"],
  "boss.aella.phase.feedCollapse": NEON_UNTRANSLATED_CONTENT["boss.aella.phase.feedCollapse"],
  "boss.mirrorSaint.name": NEON_UNTRANSLATED_CONTENT["boss.mirrorSaint.name"],
  "boss.mirrorSaint.phase.twinReflection":
    NEON_UNTRANSLATED_CONTENT["boss.mirrorSaint.phase.twinReflection"],
  "boss.mirrorSaint.phase.glassLattice":
    NEON_UNTRANSLATED_CONTENT["boss.mirrorSaint.phase.glassLattice"],
  "boss.mirrorSaint.phase.kaleidoscopeEnd":
    NEON_UNTRANSLATED_CONTENT["boss.mirrorSaint.phase.kaleidoscopeEnd"],
  "boss.algorithm.name": NEON_UNTRANSLATED_CONTENT["boss.algorithm.name"],
  "boss.algorithm.phase.predictiveDesire":
    NEON_UNTRANSLATED_CONTENT["boss.algorithm.phase.predictiveDesire"],
  "boss.algorithm.phase.perfectCorridor":
    NEON_UNTRANSLATED_CONTENT["boss.algorithm.phase.perfectCorridor"],
  "boss.algorithm.phase.goldenEngagement":
    NEON_UNTRANSLATED_CONTENT["boss.algorithm.phase.goldenEngagement"],
  "boss.algorithm.phase.zeroSunFinal":
    NEON_UNTRANSLATED_CONTENT["boss.algorithm.phase.zeroSunFinal"],
  "result.signalLost": "信号丢失",
  "result.ritualComplete": "仪式完成",
  "result.gameOver": "游戏结束",
  "result.victory": "胜利",
  "result.timeClear": "计时完成",
  "result.score": "分数",
  "result.maxChain": "最大连锁",
  "result.graze": "擦弹",
  "result.kills": "击破",
  "result.grade": "评级",
  "result.newRecord": "新纪录",
  "result.retry": "再次点火",
  "result.toTitle": "返回标题",
  "unlock.endless": "无尽模式已解锁",
  "error.init.title": `${NEON_UNTRANSLATED_CONTENT["brand.title"]} // 初始化失败`,
  "error.init.unknown": "未知的初始化失败。",
  "error.profile.json": "无法读取游戏档案。",
  "error.profile.schema": "游戏档案格式无效。",
  "error.settings.invalid": "主机设置格式无效。",
  "error.settings.request": "主机拒绝了设置请求。",
  "error.fullscreen": "无法进入全屏。",
  "a11y.gameRegion": `${NEON_UNTRANSLATED_CONTENT["brand.title"]} 游戏区域`,
  "a11y.canvas": `${NEON_UNTRANSLATED_CONTENT["brand.title"]} 弹幕射击游戏画面`,
  "a11y.modeDialog": "选择游戏模式",
  "a11y.archiveDialog": "设计档案",
  "a11y.settingsDialog": "游戏设置",
  "a11y.pauseDialog": "游戏已暂停",
  "a11y.upgradeDialog": "选择强化",
  "a11y.resultDialog": "本局结果",
  "a11y.closeDialog": "关闭 {dialog}",
  "a11y.touchDrive": `发动 ${NEON_UNTRANSLATED_CONTENT["weapon.overdrive"]}`,
  "a11y.shieldStatus": "护盾 {current}/{maximum}",
  "a11y.driveStatus": `超载能量 {percent}`,
  "a11y.bossStatus": "{boss}，相位 {phase}，生命值 {percent}",
  "announcement.scene.title": "已返回标题画面。",
  "announcement.scene.playing": "战斗开始。",
  "announcement.scene.upgrade": "请选择一项强化。",
  "announcement.scene.result": "战斗结束。",
  "announcement.run.started": "{mode}开始。",
  "announcement.boss.entered": "首领 {boss} 进入战场。",
  "announcement.boss.phaseCompleted": "相位 {phase} 突破。",
  "announcement.boss.destroyed": "首领 {boss} 已击破。",
  "announcement.player.hit": "受到攻击，剩余护盾 {shield}。",
  "announcement.player.rebooted": "已重启，剩余次数 {remaining}。",
  "announcement.upgrade.offered": "可选择 {count} 项强化。",
  "announcement.upgrade.selected": "已选择 {upgrade}，等级 {level}。",
  "announcement.tutorial.autoFire": "自动射击已上线。",
  "announcement.tutorial.closeCall": "近身闪避会积累超载能量。",
  "announcement.power.increased": "火力提升至 {power}。",
  "announcement.guard.firstSave": "首次保险已触发。",
  "announcement.guard.auto": "自动保险已触发。",
  "announcement.guard.pulse": "保险脉冲已释放。",
  "announcement.overdrive.activated": `${NEON_UNTRANSLATED_CONTENT["weapon.overdrive"]} 已发动。`,
  "announcement.mode.rushResumed": "首领 {bosses} 已击破，连锁继续。",
  "announcement.mode.endlessResumed": "进入区域 {sector}。",
  "announcement.run.victory": "战斗胜利。",
  "announcement.run.defeat": "战斗失败。",
  "canvas.floater.rush": "贴脸 {value}",
  "canvas.floater.shieldBreak": "护盾破碎",
  "canvas.floater.firstSave": "首次保险",
  "canvas.floater.autoSave": "自动保险",
  "canvas.floater.pulse": "脉冲",
  "canvas.floater.power": "火力 {value}",
  "canvas.floater.breakGuard": "超载保险",
  "canvas.floater.rebootGuard": "重启保险",
  "canvas.floater.noHitBreak": "无伤突破",
  "canvas.floater.timeBreak": "限时突破",
  "canvas.floater.phaseBreak": "相位突破",
  "canvas.floater.phaseBonus": "相位 +{value}",
  "canvas.prompt.buildDrive": "积累超载能量",
  "canvas.prompt.move": "移动 // 自动射击",
  "canvas.prompt.graze": "擦弹 // 积累超载",
  "canvas.prompt.drop": `按空格 // ${NEON_UNTRANSLATED_CONTENT["weapon.drop"]}`,
  "canvas.banner.warning": "警告",
  "canvas.banner.bossErased": "首领已抹除",
  "canvas.banner.phase": "相位 {value}",
  "canvas.banner.act": "第 {value} 幕",
  "canvas.banner.overdrive": NEON_UNTRANSLATED_CONTENT["weapon.overdrive"],
  "canvas.banner.autoDrop": `自动 ${NEON_UNTRANSLATED_CONTENT["weapon.drop"]}`,
  "canvas.banner.rageReboot": "狂怒重启",
  "canvas.banner.rush": NEON_UNTRANSLATED_CONTENT["mode.rush180"],
  "canvas.banner.endless": "无尽模式",
  "canvas.banner.breakScreen": "击穿屏幕",
  "canvas.banner.sector": "区域 {value}",
  "canvas.banner.reserve": "剩余 {value}",
  "canvas.banner.stage0": NEON_UNTRANSLATED_CONTENT["stage.synapseCity"],
  "canvas.banner.stage1": NEON_UNTRANSLATED_CONTENT["stage.glassTemple"],
  "canvas.banner.stage2": NEON_UNTRANSLATED_CONTENT["stage.zeroSun"],
  "canvas.banner.noBrakes": "永不减速 / 冲击高分",
  "canvas.banner.rankNeverSleeps": "强度永不休眠",
});

export type NeonCatalogKey = keyof typeof ZH_HANS;

type PlaceholderNames<Text extends string> = Text extends `${string}{${infer Name}}${infer Rest}`
  ? Name | PlaceholderNames<Rest>
  : never;

type SamePlaceholders<Left extends string, Right extends string> = [
  PlaceholderNames<Left>,
] extends [PlaceholderNames<Right>]
  ? [PlaceholderNames<Right>] extends [PlaceholderNames<Left>]
    ? true
    : false
  : false;

type CatalogParity<Candidate extends Record<NeonCatalogKey, string>> = {
  [Key in NeonCatalogKey]: Candidate[Key] extends ""
    ? never
    : SamePlaceholders<(typeof ZH_HANS)[Key], Candidate[Key]> extends true
      ? Candidate[Key]
      : never;
};

function defineTranslation<const Candidate extends Record<NeonCatalogKey, string>>(
  catalog: Candidate &
    CatalogParity<Candidate> &
    Record<Exclude<keyof Candidate, NeonCatalogKey>, never>,
): Readonly<Candidate> {
  return Object.freeze(catalog);
}

const EN = defineTranslation({
  "document.title": `${NEON_UNTRANSLATED_CONTENT["brand.title"]} // Danmaku Overdrive`,
  "document.description": `${NEON_UNTRANSLATED_CONTENT["brand.title"]}: a spectacle-driven vertical danmaku shooter with keyboard, touch, and gamepad support.`,
  "title.eyebrow": "A SYNTHETIC DANMAKU RITUAL",
  "title.subtitle": "DANMAKU OVERDRIVE",
  "title.ignite": "IGNITE",
  "title.igniteHint": "ENTER / SPACE / Z / TAP",
  "title.best": "BEST {score}",
  "title.photosensitiveWarning":
    "Contains rapid flashes and screen shake. Both can be reduced in Settings.",
  "menu.mode": "MODE",
  "menu.settings": "SETTINGS",
  "menu.archive": "ARCHIVE",
  "menu.back": "BACK",
  "menu.confirm": "CONFIRM",
  "mode.eyebrow": "SELECT RITUAL",
  "mode.title": "MODE",
  "mode.story.name": "STORY DRIVE",
  "mode.story.description": "Three acts · Adaptive intensity · Automatic reboot",
  "mode.rush.name": NEON_UNTRANSLATED_CONTENT["mode.rush180"],
  "mode.rush.description": "Three minutes of high-density score attack",
  "mode.endless.name": "ENDLESS",
  "mode.endless.description": "Escalating intensity and looping boss encounters",
  "mode.endless.locked": "Complete Story to unlock",
  "mode.endless.unlocked": "UNLOCKED",
  "archive.eyebrow": "ARCHIVE / BUILD 1.0",
  "archive.title": "DESIGN ARCHIVE",
  "archive.intro": `Risk is not punishment; it fuels the spectacle. Grazing and close-range kills charge ${NEON_UNTRANSLATED_CONTENT["weapon.overdrive"]}, which converts bullets into score, firepower, and fresh danger.`,
  "archive.accessible.name": "EASY ENTRY",
  "archive.accessible.description": "Auto-fire, tiny hitbox, automatic overdrive, automatic reboot",
  "archive.mastery.name": "HIGH CEILING",
  "archive.mastery.description":
    "Proximity multipliers, delayed cash-out, intensity control, no-hit phases",
  "archive.browser.name": "PURE BROWSER",
  "archive.browser.description": `${NEON_UNTRANSLATED_CONTENT["technology.canvas2d"]}, ${NEON_UNTRANSLATED_CONTENT["technology.webAudio"]}, keyboard/mouse, touch, and gamepad`,
  "archive.runtimeNote":
    "Every graphic, animation, and sound is generated at runtime without external assets.",
  "control.title": "CONTROLS",
  "control.kicker": "N/O // INPUT",
  "control.move": "MOVE {bindings}",
  "control.focus": "FOCUS {bindings}",
  "control.drop": `${NEON_UNTRANSLATED_CONTENT["weapon.drop"]} {bindings}`,
  "control.pause": "PAUSE {bindings}",
  "control.keyboard.move": "WASD / ARROW KEYS",
  "control.keyboard.focus": "SHIFT",
  "control.keyboard.drop": "SPACE",
  "control.keyboard.pause": "ESC / P",
  "control.pointer.move": "MOUSE / TOUCH DRAG",
  "control.pointer.drop": "CLICK / TAP",
  "control.gamepad.move": "LEFT STICK",
  "control.gamepad.focus": "LB",
  "control.gamepad.drop": "A",
  "control.gamepad.pause": "MENU",
  "settings.eyebrow": "CALIBRATION",
  "settings.title": "SETTINGS",
  "settings.host.title": `${NEON_UNTRANSLATED_CONTENT["brand.gameyard"]} SETTINGS`,
  "settings.host.revision": "HOST REVISION {revision}",
  "settings.host.master": "MASTER",
  "settings.host.music": "MUSIC",
  "settings.host.sfx": "SFX",
  "settings.host.reducedMotion": "REDUCE MOTION",
  "settings.host.screenShake": "SCREEN SHAKE",
  "settings.game.title": "GAME SETTINGS",
  "settings.game.fxDensity": "FX DENSITY",
  "settings.game.showHitbox": "ALWAYS SHOW HITBOX",
  "settings.game.autoGuard": "AUTO-GUARD",
  "settings.fx.max": "MAX",
  "settings.fx.balanced": "BALANCED",
  "settings.fx.low": "LOW",
  "settings.value.on": "ON",
  "settings.value.off": "OFF",
  "settings.save": "APPLY SETTINGS",
  "settings.fullscreen": "FULLSCREEN",
  "settings.pending": "WAITING FOR HOST CONFIRMATION…",
  "settings.applied": "HOST REVISION {revision} APPLIED",
  "settings.error": "SETTINGS REQUEST FAILED: {message}",
  "pause.eyebrow": "SIGNAL SUSPENDED",
  "pause.title": "PAUSED",
  "pause.resume": "RESUME",
  "pause.restart": "RESTART",
  "pause.toTitle": "RETURN TO TITLE",
  "hud.score": "SCORE",
  "hud.stage": "ACT {stage}",
  "hud.sector": "SECTOR {sector}",
  "hud.phase": "PHASE {phase}",
  "hud.shield": "SHIELD",
  "hud.drive": NEON_UNTRANSLATED_CONTENT["weapon.overdrive"],
  "hud.chain": NEON_UNTRANSLATED_CONTENT["weapon.chain"],
  "hud.threat": "THREAT",
  "hud.threat.low": "LOW",
  "hud.threat.rising": "RISING",
  "hud.threat.high": "HIGH",
  "hud.threat.fatal": "FATAL",
  "hud.best": "BEST {score}",
  "hud.bossHealth": "{boss} HEALTH",
  "upgrade.eyebrow": "RITUAL COMPLETE",
  "upgrade.title": "SELECT UPGRADE",
  "upgrade.description": "Every choice makes you stronger.",
  "upgrade.hint": "CLICK / 1—3",
  "upgrade.level": "LV {from} → {to}",
  "upgrade.voltage.name": "VOLTAGE FEVER",
  "upgrade.voltage.description": "Main-weapon fire rate increases by 22% for denser feedback.",
  "upgrade.satellite.name": "SATELLITE SWARM",
  "upgrade.satellite.description": "Adds one drone, up to a six-unit synchronized volley.",
  "upgrade.echo.name": "EXTENDED ECHO",
  "upgrade.echo.description": `${NEON_UNTRANSLATED_CONTENT["weapon.overdrive"]} lasts 1.6 seconds longer.`,
  "upgrade.magnet.name": "DANGER MAGNET",
  "upgrade.magnet.description":
    "Increases graze range and charge efficiency, turning danger into resources.",
  "upgrade.nova.name": "FINAL NOVA",
  "upgrade.nova.description": "Adds screen-wide damage and a second explosion when overdrive ends.",
  "upgrade.armor.name": "COMPOSITE ARMOR",
  "upgrade.armor.description": "Maximum shield +1 and immediately restores one shield.",
  "upgrade.hunter.name": "POINT-BLANK HUNTER",
  "upgrade.hunter.description": "Greatly improves close-range damage and Rush scoring.",
  "upgrade.recycler.name": "GUARD RECYCLER",
  "upgrade.recycler.description": "Reduces auto-guard cost and expands emergency bullet clearing.",
  "upgrade.chain.name": "CHAIN LATCH",
  "upgrade.chain.description": `${NEON_UNTRANSLATED_CONTENT["weapon.chain"]} decays 28% slower and retains more after mistakes.`,
  "upgrade.missile.name": "HOMING SATURATION",
  "upgrade.missile.description": "Increases homing-missile frequency and blast radius.",
  "upgrade.arc.name": "GRAZE ARC",
  "upgrade.arc.description": "Consecutive grazes discharge an automatic arc at the nearest enemy.",
  "upgrade.mercy.name": "REBOOT PROTOCOL",
  "upgrade.mercy.description":
    "The first real hit in each act deals no damage and triggers a wide counterattack.",
  "boss.aella.name": NEON_UNTRANSLATED_CONTENT["boss.aella.name"],
  "boss.aella.phase.infiniteScroll": NEON_UNTRANSLATED_CONTENT["boss.aella.phase.infiniteScroll"],
  "boss.aella.phase.redDotHunger": NEON_UNTRANSLATED_CONTENT["boss.aella.phase.redDotHunger"],
  "boss.aella.phase.feedCollapse": NEON_UNTRANSLATED_CONTENT["boss.aella.phase.feedCollapse"],
  "boss.mirrorSaint.name": NEON_UNTRANSLATED_CONTENT["boss.mirrorSaint.name"],
  "boss.mirrorSaint.phase.twinReflection":
    NEON_UNTRANSLATED_CONTENT["boss.mirrorSaint.phase.twinReflection"],
  "boss.mirrorSaint.phase.glassLattice":
    NEON_UNTRANSLATED_CONTENT["boss.mirrorSaint.phase.glassLattice"],
  "boss.mirrorSaint.phase.kaleidoscopeEnd":
    NEON_UNTRANSLATED_CONTENT["boss.mirrorSaint.phase.kaleidoscopeEnd"],
  "boss.algorithm.name": NEON_UNTRANSLATED_CONTENT["boss.algorithm.name"],
  "boss.algorithm.phase.predictiveDesire":
    NEON_UNTRANSLATED_CONTENT["boss.algorithm.phase.predictiveDesire"],
  "boss.algorithm.phase.perfectCorridor":
    NEON_UNTRANSLATED_CONTENT["boss.algorithm.phase.perfectCorridor"],
  "boss.algorithm.phase.goldenEngagement":
    NEON_UNTRANSLATED_CONTENT["boss.algorithm.phase.goldenEngagement"],
  "boss.algorithm.phase.zeroSunFinal":
    NEON_UNTRANSLATED_CONTENT["boss.algorithm.phase.zeroSunFinal"],
  "result.signalLost": "SIGNAL LOST",
  "result.ritualComplete": "RITUAL COMPLETE",
  "result.gameOver": "GAME OVER",
  "result.victory": "VICTORY",
  "result.timeClear": "TIME CLEAR",
  "result.score": "SCORE",
  "result.maxChain": "MAX CHAIN",
  "result.graze": "GRAZE",
  "result.kills": "KILLS",
  "result.grade": "GRADE",
  "result.newRecord": "NEW RECORD",
  "result.retry": "IGNITE AGAIN",
  "result.toTitle": "RETURN TO TITLE",
  "unlock.endless": "ENDLESS MODE UNLOCKED",
  "error.init.title": `${NEON_UNTRANSLATED_CONTENT["brand.title"]} // INIT FAILED`,
  "error.init.unknown": "Unknown initialization failure.",
  "error.profile.json": "The game profile could not be read.",
  "error.profile.schema": "The game profile format is invalid.",
  "error.settings.invalid": "The Host settings format is invalid.",
  "error.settings.request": "The Host rejected the settings request.",
  "error.fullscreen": "Fullscreen could not be entered.",
  "a11y.gameRegion": `${NEON_UNTRANSLATED_CONTENT["brand.title"]} game region`,
  "a11y.canvas": `${NEON_UNTRANSLATED_CONTENT["brand.title"]} danmaku playfield`,
  "a11y.modeDialog": "Choose game mode",
  "a11y.archiveDialog": "Design archive",
  "a11y.settingsDialog": "Game settings",
  "a11y.pauseDialog": "Game paused",
  "a11y.upgradeDialog": "Choose an upgrade",
  "a11y.resultDialog": "Run result",
  "a11y.closeDialog": "Close {dialog}",
  "a11y.touchDrive": `Activate ${NEON_UNTRANSLATED_CONTENT["weapon.overdrive"]}`,
  "a11y.shieldStatus": "Shield {current} of {maximum}",
  "a11y.driveStatus": `Overdrive charge {percent}`,
  "a11y.bossStatus": "{boss}, phase {phase}, health {percent}",
  "announcement.scene.title": "Returned to the title screen.",
  "announcement.scene.playing": "Combat started.",
  "announcement.scene.upgrade": "Choose one upgrade.",
  "announcement.scene.result": "Combat ended.",
  "announcement.run.started": "{mode} started.",
  "announcement.boss.entered": "Boss {boss} entered the field.",
  "announcement.boss.phaseCompleted": "Phase {phase} cleared.",
  "announcement.boss.destroyed": "Boss {boss} destroyed.",
  "announcement.player.hit": "Hit taken. {shield} shield remaining.",
  "announcement.player.rebooted": "Rebooted. {remaining} reboots remaining.",
  "announcement.upgrade.offered": "{count} upgrades available.",
  "announcement.upgrade.selected": "Selected {upgrade}, level {level}.",
  "announcement.tutorial.autoFire": "Auto-fire online.",
  "announcement.tutorial.closeCall": "Close dodges build overdrive charge.",
  "announcement.power.increased": "Power increased to {power}.",
  "announcement.guard.firstSave": "First-save guard activated.",
  "announcement.guard.auto": "Auto-guard activated.",
  "announcement.guard.pulse": "Guard pulse released.",
  "announcement.overdrive.activated": `${NEON_UNTRANSLATED_CONTENT["weapon.overdrive"]} activated.`,
  "announcement.mode.rushResumed": "Boss {bosses} destroyed. Chain continues.",
  "announcement.mode.endlessResumed": "Entering sector {sector}.",
  "announcement.run.victory": "Run cleared.",
  "announcement.run.defeat": "Run failed.",
  "canvas.floater.rush": "RUSH {value}",
  "canvas.floater.shieldBreak": "SHIELD BREAK",
  "canvas.floater.firstSave": "FIRST SAVE",
  "canvas.floater.autoSave": "AUTO SAVE",
  "canvas.floater.pulse": "PULSE",
  "canvas.floater.power": "POWER {value}",
  "canvas.floater.breakGuard": "BREAK GUARD",
  "canvas.floater.rebootGuard": "REBOOT GUARD",
  "canvas.floater.noHitBreak": "NO HIT BREAK",
  "canvas.floater.timeBreak": "TIME BREAK",
  "canvas.floater.phaseBreak": "PHASE BREAK",
  "canvas.floater.phaseBonus": "PHASE +{value}",
  "canvas.prompt.buildDrive": "BUILD DRIVE",
  "canvas.prompt.move": "MOVE // AUTO FIRE",
  "canvas.prompt.graze": "GRAZE // BUILD DRIVE",
  "canvas.prompt.drop": `PRESS SPACE // ${NEON_UNTRANSLATED_CONTENT["weapon.drop"]}`,
  "canvas.banner.warning": "WARNING",
  "canvas.banner.bossErased": "BOSS ERASED",
  "canvas.banner.phase": "PHASE {value}",
  "canvas.banner.act": "ACT {value}",
  "canvas.banner.overdrive": NEON_UNTRANSLATED_CONTENT["weapon.overdrive"],
  "canvas.banner.autoDrop": `AUTO ${NEON_UNTRANSLATED_CONTENT["weapon.drop"]}`,
  "canvas.banner.rageReboot": "RAGE REBOOT",
  "canvas.banner.rush": NEON_UNTRANSLATED_CONTENT["mode.rush180"],
  "canvas.banner.endless": "ENDLESS",
  "canvas.banner.breakScreen": "BREAK THE SCREEN",
  "canvas.banner.sector": "SECTOR {value}",
  "canvas.banner.reserve": "{value} RESERVE",
  "canvas.banner.stage0": NEON_UNTRANSLATED_CONTENT["stage.synapseCity"],
  "canvas.banner.stage1": NEON_UNTRANSLATED_CONTENT["stage.glassTemple"],
  "canvas.banner.stage2": NEON_UNTRANSLATED_CONTENT["stage.zeroSun"],
  "canvas.banner.noBrakes": "NO BRAKES / HIGH SCORE",
  "canvas.banner.rankNeverSleeps": "RANK NEVER SLEEPS",
});

const JA = defineTranslation({
  "document.title": `${NEON_UNTRANSLATED_CONTENT["brand.title"]} // 弾幕爆奏`,
  "document.description": `${NEON_UNTRANSLATED_CONTENT["brand.title"]}：キーボード、タッチ、ゲームパッドに対応した演出特化型縦スクロール弾幕シューティング。`,
  "title.eyebrow": "合成弾幕リチュアル",
  "title.subtitle": "弾幕爆奏",
  "title.ignite": "点火",
  "title.igniteHint": "ENTER / SPACE / Z / タップ",
  "title.best": "ベスト {score}",
  "title.photosensitiveWarning": "激しい点滅と画面揺れを含みます。設定で軽減できます。",
  "menu.mode": "モード",
  "menu.settings": "設定",
  "menu.archive": "アーカイブ",
  "menu.back": "戻る",
  "menu.confirm": "決定",
  "mode.eyebrow": "リチュアル選択",
  "mode.title": "モード",
  "mode.story.name": "ストーリードライブ",
  "mode.story.description": "全3幕・適応型難度・オートリブート",
  "mode.rush.name": NEON_UNTRANSLATED_CONTENT["mode.rush180"],
  "mode.rush.description": "3分間の高密度スコアアタック",
  "mode.endless.name": "エンドレス",
  "mode.endless.description": "上昇し続ける強度と繰り返すボス戦",
  "mode.endless.locked": "ストーリークリアで解放",
  "mode.endless.unlocked": "解放済み",
  "archive.eyebrow": "アーカイブ / ビルド 1.0",
  "archive.title": "デザインアーカイブ",
  "archive.intro": `リスクは罰ではなく、演出の燃料。グレイズと近距離撃破で ${NEON_UNTRANSLATED_CONTENT["weapon.overdrive"]} を満たし、弾幕をスコア、火力、そして新たな危険へ変換します。`,
  "archive.accessible.name": "すぐ遊べる",
  "archive.accessible.description":
    "オート射撃、小さな当たり判定、オートオーバードライブ、オートリブート",
  "archive.mastery.name": "奥深い攻略",
  "archive.mastery.description": "近距離倍率、遅延精算、強度管理、ノーヒットフェーズ",
  "archive.browser.name": "ブラウザ完結",
  "archive.browser.description": `${NEON_UNTRANSLATED_CONTENT["technology.canvas2d"]}、${NEON_UNTRANSLATED_CONTENT["technology.webAudio"]}、キーボード/マウス、タッチ、ゲームパッド`,
  "archive.runtimeNote":
    "すべてのグラフィック、アニメーション、サウンドは外部素材なしで実行時に生成されます。",
  "control.title": "操作",
  "control.kicker": "N/O // 入力",
  "control.move": "移動 {bindings}",
  "control.focus": "低速移動 {bindings}",
  "control.drop": `${NEON_UNTRANSLATED_CONTENT["weapon.drop"]} {bindings}`,
  "control.pause": "ポーズ {bindings}",
  "control.keyboard.move": "WASD / 矢印キー",
  "control.keyboard.focus": "SHIFT",
  "control.keyboard.drop": "SPACE",
  "control.keyboard.pause": "ESC / P",
  "control.pointer.move": "マウス / タッチドラッグ",
  "control.pointer.drop": "クリック / タップ",
  "control.gamepad.move": "左スティック",
  "control.gamepad.focus": "LB",
  "control.gamepad.drop": "A",
  "control.gamepad.pause": "メニュー",
  "settings.eyebrow": "キャリブレーション",
  "settings.title": "設定",
  "settings.host.title": `${NEON_UNTRANSLATED_CONTENT["brand.gameyard"]} 設定`,
  "settings.host.revision": "ホストリビジョン {revision}",
  "settings.host.master": "マスター音量",
  "settings.host.music": "音楽",
  "settings.host.sfx": "効果音",
  "settings.host.reducedMotion": "モーションを減らす",
  "settings.host.screenShake": "画面揺れ",
  "settings.game.title": "ゲーム設定",
  "settings.game.fxDensity": "エフェクト密度",
  "settings.game.showHitbox": "当たり判定を常時表示",
  "settings.game.autoGuard": "オートガード",
  "settings.fx.max": "最大",
  "settings.fx.balanced": "バランス",
  "settings.fx.low": "低",
  "settings.value.on": "オン",
  "settings.value.off": "オフ",
  "settings.save": "設定を適用",
  "settings.fullscreen": "フルスクリーン",
  "settings.pending": "ホストの確認を待っています…",
  "settings.applied": "ホストリビジョン {revision} を適用しました",
  "settings.error": "設定リクエストに失敗しました：{message}",
  "pause.eyebrow": "シグナル停止中",
  "pause.title": "ポーズ",
  "pause.resume": "再開",
  "pause.restart": "リスタート",
  "pause.toTitle": "タイトルへ戻る",
  "hud.score": "スコア",
  "hud.stage": "ACT {stage}",
  "hud.sector": "セクター {sector}",
  "hud.phase": "フェーズ {phase}",
  "hud.shield": "シールド",
  "hud.drive": NEON_UNTRANSLATED_CONTENT["weapon.overdrive"],
  "hud.chain": NEON_UNTRANSLATED_CONTENT["weapon.chain"],
  "hud.threat": "脅威",
  "hud.threat.low": "低",
  "hud.threat.rising": "上昇",
  "hud.threat.high": "高",
  "hud.threat.fatal": "致命的",
  "hud.best": "ベスト {score}",
  "hud.bossHealth": "{boss} 体力",
  "upgrade.eyebrow": "リチュアル完了",
  "upgrade.title": "強化を選択",
  "upgrade.description": "どれを選んでも確実に強くなります。",
  "upgrade.hint": "クリック / 1—3",
  "upgrade.level": "LV {from} → {to}",
  "upgrade.voltage.name": "高圧フィーバー",
  "upgrade.voltage.description": "メインショットの連射速度が22%上昇します。",
  "upgrade.satellite.name": "サテライトスウォーム",
  "upgrade.satellite.description": "随伴砲を1機追加し、最大6機で同時射撃します。",
  "upgrade.echo.name": "エコー延長",
  "upgrade.echo.description": `${NEON_UNTRANSLATED_CONTENT["weapon.overdrive"]} の持続時間が1.6秒延長されます。`,
  "upgrade.magnet.name": "デンジャーマグネット",
  "upgrade.magnet.description": "グレイズ範囲と充填効率が上がり、危険を資源に変えやすくなります。",
  "upgrade.nova.name": "ファイナルノヴァ",
  "upgrade.nova.description": "オーバードライブ終了時に全画面ダメージと二次爆発を追加します。",
  "upgrade.armor.name": "複合装甲",
  "upgrade.armor.description": "最大シールド+1、さらにシールドを1つ即時回復します。",
  "upgrade.hunter.name": "ポイントブランクハンター",
  "upgrade.hunter.description": "近距離攻撃とラッシュのスコア倍率を大幅に強化します。",
  "upgrade.recycler.name": "ガードリサイクラー",
  "upgrade.recycler.description": "オートガードの消費を減らし、緊急弾消し範囲を広げます。",
  "upgrade.chain.name": "チェインラッチ",
  "upgrade.chain.description": `${NEON_UNTRANSLATED_CONTENT["weapon.chain"]} の減衰が28%遅くなり、ミス後の維持量が増えます。`,
  "upgrade.missile.name": "ホーミングサチュレーション",
  "upgrade.missile.description": "追尾弾の発射頻度と爆発範囲が上昇します。",
  "upgrade.arc.name": "グレイズアーク",
  "upgrade.arc.description": "連続グレイズで最も近い敵へ自動的に電弧を放ちます。",
  "upgrade.mercy.name": "リブートプロトコル",
  "upgrade.mercy.description": "各幕の最初の被弾を無効化し、広範囲の反撃を発生させます。",
  "boss.aella.name": NEON_UNTRANSLATED_CONTENT["boss.aella.name"],
  "boss.aella.phase.infiniteScroll": NEON_UNTRANSLATED_CONTENT["boss.aella.phase.infiniteScroll"],
  "boss.aella.phase.redDotHunger": NEON_UNTRANSLATED_CONTENT["boss.aella.phase.redDotHunger"],
  "boss.aella.phase.feedCollapse": NEON_UNTRANSLATED_CONTENT["boss.aella.phase.feedCollapse"],
  "boss.mirrorSaint.name": NEON_UNTRANSLATED_CONTENT["boss.mirrorSaint.name"],
  "boss.mirrorSaint.phase.twinReflection":
    NEON_UNTRANSLATED_CONTENT["boss.mirrorSaint.phase.twinReflection"],
  "boss.mirrorSaint.phase.glassLattice":
    NEON_UNTRANSLATED_CONTENT["boss.mirrorSaint.phase.glassLattice"],
  "boss.mirrorSaint.phase.kaleidoscopeEnd":
    NEON_UNTRANSLATED_CONTENT["boss.mirrorSaint.phase.kaleidoscopeEnd"],
  "boss.algorithm.name": NEON_UNTRANSLATED_CONTENT["boss.algorithm.name"],
  "boss.algorithm.phase.predictiveDesire":
    NEON_UNTRANSLATED_CONTENT["boss.algorithm.phase.predictiveDesire"],
  "boss.algorithm.phase.perfectCorridor":
    NEON_UNTRANSLATED_CONTENT["boss.algorithm.phase.perfectCorridor"],
  "boss.algorithm.phase.goldenEngagement":
    NEON_UNTRANSLATED_CONTENT["boss.algorithm.phase.goldenEngagement"],
  "boss.algorithm.phase.zeroSunFinal":
    NEON_UNTRANSLATED_CONTENT["boss.algorithm.phase.zeroSunFinal"],
  "result.signalLost": "シグナルロスト",
  "result.ritualComplete": "リチュアル完了",
  "result.gameOver": "ゲームオーバー",
  "result.victory": "勝利",
  "result.timeClear": "タイムクリア",
  "result.score": "スコア",
  "result.maxChain": "最大チェイン",
  "result.graze": "グレイズ",
  "result.kills": "撃破",
  "result.grade": "評価",
  "result.newRecord": "新記録",
  "result.retry": "再点火",
  "result.toTitle": "タイトルへ戻る",
  "unlock.endless": "エンドレスモード解放",
  "error.init.title": `${NEON_UNTRANSLATED_CONTENT["brand.title"]} // 初期化失敗`,
  "error.init.unknown": "不明な初期化エラーです。",
  "error.profile.json": "ゲームプロフィールを読み取れませんでした。",
  "error.profile.schema": "ゲームプロフィールの形式が無効です。",
  "error.settings.invalid": "ホスト設定の形式が無効です。",
  "error.settings.request": "ホストが設定リクエストを拒否しました。",
  "error.fullscreen": "フルスクリーンに移行できませんでした。",
  "a11y.gameRegion": `${NEON_UNTRANSLATED_CONTENT["brand.title"]} ゲーム領域`,
  "a11y.canvas": `${NEON_UNTRANSLATED_CONTENT["brand.title"]} 弾幕シューティング画面`,
  "a11y.modeDialog": "ゲームモードを選択",
  "a11y.archiveDialog": "デザインアーカイブ",
  "a11y.settingsDialog": "ゲーム設定",
  "a11y.pauseDialog": "ゲーム一時停止",
  "a11y.upgradeDialog": "強化を選択",
  "a11y.resultDialog": "プレイ結果",
  "a11y.closeDialog": "{dialog}を閉じる",
  "a11y.touchDrive": `${NEON_UNTRANSLATED_CONTENT["weapon.overdrive"]} を発動`,
  "a11y.shieldStatus": "シールド {current}/{maximum}",
  "a11y.driveStatus": `オーバードライブ充填 {percent}`,
  "a11y.bossStatus": "{boss}、フェーズ {phase}、体力 {percent}",
  "announcement.scene.title": "タイトル画面に戻りました。",
  "announcement.scene.playing": "戦闘開始。",
  "announcement.scene.upgrade": "強化を1つ選んでください。",
  "announcement.scene.result": "戦闘終了。",
  "announcement.run.started": "{mode}を開始しました。",
  "announcement.boss.entered": "ボス {boss} が出現しました。",
  "announcement.boss.phaseCompleted": "フェーズ {phase} を突破しました。",
  "announcement.boss.destroyed": "ボス {boss} を撃破しました。",
  "announcement.player.hit": "被弾。残りシールド {shield}。",
  "announcement.player.rebooted": "リブート。残り {remaining} 回。",
  "announcement.upgrade.offered": "{count}個の強化から選択できます。",
  "announcement.upgrade.selected": "{upgrade}、レベル {level} を選択しました。",
  "announcement.tutorial.autoFire": "オート射撃オンライン。",
  "announcement.tutorial.closeCall": "近接回避でオーバードライブが蓄積します。",
  "announcement.power.increased": "火力が {power} に上昇しました。",
  "announcement.guard.firstSave": "初回ガードが発動しました。",
  "announcement.guard.auto": "オートガードが発動しました。",
  "announcement.guard.pulse": "ガードパルスを放ちました。",
  "announcement.overdrive.activated": `${NEON_UNTRANSLATED_CONTENT["weapon.overdrive"]} 発動。`,
  "announcement.mode.rushResumed": "ボス {bosses} 撃破。チェイン継続。",
  "announcement.mode.endlessResumed": "セクター {sector} に進入します。",
  "announcement.run.victory": "ランクリア。",
  "announcement.run.defeat": "ラン失敗。",
  "canvas.floater.rush": "接近 {value}",
  "canvas.floater.shieldBreak": "シールドブレイク",
  "canvas.floater.firstSave": "ファーストセーブ",
  "canvas.floater.autoSave": "オートセーブ",
  "canvas.floater.pulse": "パルス",
  "canvas.floater.power": "パワー {value}",
  "canvas.floater.breakGuard": "ブレイクガード",
  "canvas.floater.rebootGuard": "リブートガード",
  "canvas.floater.noHitBreak": "ノーヒットブレイク",
  "canvas.floater.timeBreak": "タイムブレイク",
  "canvas.floater.phaseBreak": "フェーズブレイク",
  "canvas.floater.phaseBonus": "フェーズ +{value}",
  "canvas.prompt.buildDrive": "ドライブを蓄積",
  "canvas.prompt.move": "移動 // オート射撃",
  "canvas.prompt.graze": "グレイズ // ドライブ蓄積",
  "canvas.prompt.drop": `SPACE // ${NEON_UNTRANSLATED_CONTENT["weapon.drop"]}`,
  "canvas.banner.warning": "警告",
  "canvas.banner.bossErased": "ボス消去",
  "canvas.banner.phase": "フェーズ {value}",
  "canvas.banner.act": "ACT {value}",
  "canvas.banner.overdrive": NEON_UNTRANSLATED_CONTENT["weapon.overdrive"],
  "canvas.banner.autoDrop": `AUTO ${NEON_UNTRANSLATED_CONTENT["weapon.drop"]}`,
  "canvas.banner.rageReboot": "レイジリブート",
  "canvas.banner.rush": NEON_UNTRANSLATED_CONTENT["mode.rush180"],
  "canvas.banner.endless": "エンドレス",
  "canvas.banner.breakScreen": "画面を撃ち抜け",
  "canvas.banner.sector": "セクター {value}",
  "canvas.banner.reserve": "残り {value}",
  "canvas.banner.stage0": NEON_UNTRANSLATED_CONTENT["stage.synapseCity"],
  "canvas.banner.stage1": NEON_UNTRANSLATED_CONTENT["stage.glassTemple"],
  "canvas.banner.stage2": NEON_UNTRANSLATED_CONTENT["stage.zeroSun"],
  "canvas.banner.noBrakes": "止まるな / ハイスコア",
  "canvas.banner.rankNeverSleeps": "強度は眠らない",
});

const CATALOGS = Object.freeze({
  en: EN,
  ja: JA,
  "zh-Hans": ZH_HANS,
} satisfies Record<PublicLocale, Readonly<Record<NeonCatalogKey, string>>>);

export const NEON_CATALOG_KEYS = Object.freeze(Object.keys(ZH_HANS) as NeonCatalogKey[]);

const PLACEHOLDER_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/gu;
const PUBLIC_LOCALE_SET = new Set<string>(PUBLIC_LOCALES);
const LOCALE_PREFERENCE_SET = new Set<string>(LOCALE_PREFERENCES);

function exactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function placeholders(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]).sort();
}

function assertCatalogs(): void {
  const exactPublicLocales = ["en", "ja", "zh-Hans"] satisfies PublicLocale[];
  if (
    PUBLIC_LOCALES.length !== exactPublicLocales.length ||
    !PUBLIC_LOCALES.every((locale, index) => locale === exactPublicLocales[index])
  ) {
    throw new Error("Neon requires the exact public locale contract en, ja, zh-Hans.");
  }
  if (!exactKeys(CATALOGS, PUBLIC_LOCALES)) {
    throw new Error("Neon catalogs must exactly match the public locale contract.");
  }
  for (const locale of PUBLIC_LOCALES) {
    const catalog = CATALOGS[locale];
    if (!exactKeys(catalog, NEON_CATALOG_KEYS)) {
      throw new Error(`Neon ${locale} catalog keys do not match ${NEON_SOURCE_LOCALE}.`);
    }
    for (const key of NEON_CATALOG_KEYS) {
      const value = catalog[key];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`Neon ${locale} translation ${key} must be non-empty.`);
      }
      const sourcePlaceholders = placeholders(ZH_HANS[key]);
      const localizedPlaceholders = placeholders(value);
      if (
        sourcePlaceholders.length !== localizedPlaceholders.length ||
        !sourcePlaceholders.every(
          (placeholder, index) => placeholder === localizedPlaceholders[index],
        )
      ) {
        throw new Error(`Neon ${locale} translation ${key} has mismatched placeholders.`);
      }
    }
  }
}

assertCatalogs();

function assertLocaleContext(value: unknown): asserts value is LocaleContext {
  if (
    !exactKeys(value, ["preference", "resolved"]) ||
    typeof value.preference !== "string" ||
    !LOCALE_PREFERENCE_SET.has(value.preference) ||
    typeof value.resolved !== "string" ||
    !PUBLIC_LOCALE_SET.has(value.resolved)
  ) {
    throw new RangeError("Neon locale context must be an exact supported GameYard locale.");
  }
}

export type NeonNumberStyle = "score" | "integer" | "decimal2" | "percent" | "clock";
export type NeonTranslationParams = Readonly<Record<string, string | number>>;

function requireFinite(value: number, style: NeonNumberStyle): void {
  if (!Number.isFinite(value)) throw new TypeError(`Neon ${style} value must be finite.`);
}

export function createNeonI18n(initial: LocaleContext) {
  assertLocaleContext(initial);
  let context: LocaleContext = Object.freeze({ ...initial });
  let locale = context.resolved as PublicLocale;
  let scoreFormatter: Intl.NumberFormat;
  let integerFormatter: Intl.NumberFormat;
  let decimal2Formatter: Intl.NumberFormat;
  let percentFormatter: Intl.NumberFormat;
  let clockPartFormatter: Intl.NumberFormat;

  function createFormatters(): void {
    scoreFormatter = new Intl.NumberFormat(locale, {
      minimumIntegerDigits: 9,
      maximumFractionDigits: 0,
      useGrouping: false,
    });
    integerFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    decimal2Formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    percentFormatter = new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 0,
    });
    clockPartFormatter = new Intl.NumberFormat(locale, {
      minimumIntegerDigits: 2,
      maximumFractionDigits: 0,
      useGrouping: false,
    });
  }

  createFormatters();

  return Object.freeze({
    get context(): LocaleContext {
      return context;
    },
    apply(next: LocaleContext): void {
      assertLocaleContext(next);
      context = Object.freeze({ ...next });
      locale = context.resolved as PublicLocale;
      createFormatters();
    },
    t(key: NeonCatalogKey, params?: NeonTranslationParams): string {
      if (!Object.hasOwn(ZH_HANS, key)) {
        throw new RangeError(`Unknown Neon translation key: ${String(key)}`);
      }
      const value = CATALOGS[locale][key];
      const required = placeholders(value);
      if (required.length === 0) {
        if (params !== undefined && Object.keys(params).length !== 0) {
          throw new RangeError(`Neon translation ${key} does not accept parameters.`);
        }
        return value;
      }
      if (!exactKeys(params, required)) {
        throw new RangeError(`Neon translation ${key} requires exactly: ${required.join(", ")}.`);
      }
      return value.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
        const replacement = params[name];
        if (
          (typeof replacement !== "string" && typeof replacement !== "number") ||
          (typeof replacement === "number" && !Number.isFinite(replacement))
        ) {
          throw new TypeError(
            `Neon translation parameter ${name} must be text or a finite number.`,
          );
        }
        return String(replacement);
      });
    },
    formatNumber(value: number, style: NeonNumberStyle): string {
      requireFinite(value, style);
      switch (style) {
        case "score":
          if (value < 0) throw new RangeError("Neon score must be non-negative.");
          return scoreFormatter.format(Math.floor(value));
        case "integer":
          return integerFormatter.format(Math.trunc(value));
        case "decimal2":
          return decimal2Formatter.format(value);
        case "percent":
          return percentFormatter.format(value);
        case "clock": {
          if (value < 0) throw new RangeError("Neon clock must be non-negative.");
          const totalSeconds = Math.floor(value);
          return `${clockPartFormatter.format(Math.floor(totalSeconds / 60))}:${clockPartFormatter.format(totalSeconds % 60)}`;
        }
        default:
          throw new RangeError(`Unknown Neon number style: ${String(style)}`);
      }
    },
  });
}
