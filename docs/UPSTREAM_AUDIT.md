# 三个上游游戏实现审计

审计日期：2026-08-01。证据来自三个仓库 `main` 的浅克隆、GitHub API 与源码逐文件检查。GameYard 当前没有复制任何上游游戏代码或素材。

## 快速对照

| 项目               | 固定 revision                              | 浏览器结构                                             | 工具链                                                 | 公共设置                                                         | 主要集成风险                                                 | 迁移顺序 |
| ------------------ | ------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| TUMBLEDRUM         | `ba6fc680626ac59db793175122600369d48f9834` | Canvas；4 个经典 IIFE；`window.TD`；约 4,105 行 `Game` | `uv` + Python 3.12；Playwright 1.61.0；单 HTML builder | audio/music 布尔、shake、motion、contrast、language              | 永续 RAF、不可卸载全局监听、全 viewport、无 LICENSE          | 2        |
| PulseLinkOverdrive | `1e42e4130145922f22315e420daaabf44b42b325` | Canvas + DOM；7 个边界清晰的 IIFE；纯 model 层         | 零依赖运行；Python standalone builder                  | sfx/music 数值、shake、reducedMotion、glyphs、haptics、locale    | 全局 App/RAF/SW；部分 destroy 不完整                         | 1        |
| CrownBreaker       | `1f7b911926c786043ba793e16c4f25cd5f523b21` | Canvas + DOM + SVG；约 4,720 行单体 `game.js`          | `pnpm@11.7.0`；Playwright 1.61.1；模拟/静态检查        | master/music/sfx、shake、flashes、hints、reducedMotion、language | 立即 init、音频 interval、永续 RAF、单体状态、SW cache scope | 3        |

三者均直接操作 `window`、`document`、页面级键盘/可见性事件、Web Audio 与 `localStorage`。因此直接导入同一个 React/DOM 页面不是可接受路径；长期运行边界固定为一个同源 iframe。

## TUMBLEDRUM

- 仓库：[Hitsuki-Ban/TUMBLEDRUM](https://github.com/Hitsuki-Ban/TUMBLEDRUM)
- 在线版：[GitHub Pages](https://hitsuki-ban.github.io/TUMBLEDRUM/)
- 入口按顺序加载 `i18n/content/audio/game`，各模块通过 `window.TD` 共享；最终实例写到 `window.__TUMBLEDRUM__`：[index.html](https://github.com/Hitsuki-Ban/TUMBLEDRUM/blob/ba6fc680626ac59db793175122600369d48f9834/index.html#L31-L34)、[game.js](https://github.com/Hitsuki-Ban/TUMBLEDRUM/blob/ba6fc680626ac59db793175122600369d48f9834/src/game.js#L4099-L4104)。
- 设置与存档键为 `tumbledrum-settings-v1`、`tumbledrum-save-v1`；活动 run 不持久化：[game.js](https://github.com/Hitsuki-Ban/TUMBLEDRUM/blob/ba6fc680626ac59db793175122600369d48f9834/src/game.js#L220-L258)。
- 日/中/英目录会严格比较 key/type，System 模式监听 `languagechange`：[i18n.js](https://github.com/Hitsuki-Ban/TUMBLEDRUM/blob/ba6fc680626ac59db793175122600369d48f9834/src/i18n.js#L183-L239)。
- Canvas 逻辑尺寸为 900×1200，模拟采用固定步长，缩放依据整个 `window`；输入、resize、orientation、visibility 均为页面级监听：[game.js](https://github.com/Hitsuki-Ban/TUMBLEDRUM/blob/ba6fc680626ac59db793175122600369d48f9834/src/game.js#L298-L414)。
- 仓库当前没有 LICENSE。公开 artifact 在明确许可或内部权属记录之前不得包含其源代码和素材；这不是技术兼容问题，而是 M0 发布门。

可保留：内容/关卡模型、程序化音频、严格翻译目录、现有完整浏览器测试。需要改造：显式 boot、pause/resume、设置映射、音频数值增益和 bridge 事件。无需实现同页 destroy，因为卸载由移除 iframe 完成。

## PulseLinkOverdrive

- 仓库：[Hitsuki-Ban/PulseLinkOverdrive](https://github.com/Hitsuki-Ban/PulseLinkOverdrive)
- 在线版：[GitHub Pages](https://hitsuki-ban.github.io/PulseLinkOverdrive/)
- `config/model/input/render/audio/app` 已有清晰边界，`model.js` 不触碰 DOM，并导出主要逻辑类：[开发说明](https://github.com/Hitsuki-Ban/PulseLinkOverdrive/blob/1e42e4130145922f22315e420daaabf44b42b325/docs/DEVELOPMENT.md)、[model.js](https://github.com/Hitsuki-Ban/PulseLinkOverdrive/blob/1e42e4130145922f22315e420daaabf44b42b325/src/model.js#L1168-L1173)。
- `SaveStore` 使用精确字段校验；设置、统计、教程、模式和难度存在 `pulse-link-overdrive.save.v1`，不保存活动对局：[config.js](https://github.com/Hitsuki-Ban/PulseLinkOverdrive/blob/1e42e4130145922f22315e420daaabf44b42b325/src/config.js#L137-L252)。
- 输入层已经把键盘、pointer、touch 和 Gamepad 归一为游戏 action，但 action 语义仍应留在游戏中：[input.js](https://github.com/Hitsuki-Ban/PulseLinkOverdrive/blob/1e42e4130145922f22315e420daaabf44b42b325/src/input.js#L37-L128)。
- `App` 仍拥有永久 RAF、全局生命周期和 Service Worker 注册；嵌入构建必须移除 SW：[app.js](https://github.com/Hitsuki-Ban/PulseLinkOverdrive/blob/1e42e4130145922f22315e420daaabf44b42b325/src/app.js#L488-L517)。

它是首个 vertical slice：规则层最干净，设置语义最接近目标协议，也已有较好的容器 resize。迁移完成门要求不再由 guest 持有公共语言/舒适设置的第二份事实源。

## CrownBreaker

- 仓库：[Hitsuki-Ban/CrownBreaker](https://github.com/Hitsuki-Ban/CrownBreaker)
- 在线版：[GitHub Pages](https://hitsuki-ban.github.io/CrownBreaker/)
- 页面运行逻辑集中在约 207 KB 的 `game.js` 闭包，文件末尾立即 `init()`：[game.js](https://github.com/Hitsuki-Ban/CrownBreaker/blob/1f7b911926c786043ba793e16c4f25cd5f523b21/game.js#L4703-L4720)。
- 持久化最完整：`crownBreaker.settings.v2`、`crownBreaker.save.v2`、`crownBreaker.run.v3`，活动 battle/run 有严格验证：[game.js](https://github.com/Hitsuki-Ban/CrownBreaker/blob/1f7b911926c786043ba793e16c4f25cd5f523b21/game.js#L1138-L1239)。该 run schema 不会上移为 Hub 通用 schema。
- 首次交互后音频 scheduler 每 50 ms 运行且没有 stop；页面另有永续 RAF 和全局事件：[game.js](https://github.com/Hitsuki-Ban/CrownBreaker/blob/1f7b911926c786043ba793e16c4f25cd5f523b21/game.js#L449-L502)、[game.js](https://github.com/Hitsuki-Ban/CrownBreaker/blob/1f7b911926c786043ba793e16c4f25cd5f523b21/game.js#L4193-L4261)。
- `?qa` 暴露强力写接口，确定性场景和模拟价值很高，但生产构建必须剔除 mutation handler：[game.js](https://github.com/Hitsuki-Ban/CrownBreaker/blob/1f7b911926c786043ba793e16c4f25cd5f523b21/game.js#L4390-L4710)。
- Service Worker 预缓存大量素材，cache 名不含 registration scope；Hub 版不能注册它：[sw.js](https://github.com/Hitsuki-Ban/CrownBreaker/blob/1f7b911926c786043ba793e16c4f25cd5f523b21/sw.js#L1-L113)。

它最后迁移：先用 iframe 保住单体的玩法与完整 run，再把 QA 接口接入 testkit；不要为了共享而先拆规则闭包。

## 上移与保留边界

上移 Hub：catalog/route、frame 生命周期、公共 locale、master/music/sfx 与 motion policy、焦点/暂停/全屏仲裁、版本化诊断、静态构建和最终单一 PWA。

保留 game：规则/AI/RNG、Canvas/DOM renderer、游戏 action 和手势、程序化音色/节拍、save/run schema、翻译文本、素材与确定性模拟工具。

“三者都有”并不自动代表应共享。只有语义、生命周期和变化方向同时一致的能力才进入公共层。
