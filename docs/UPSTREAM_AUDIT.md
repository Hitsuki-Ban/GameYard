# 生产游戏来源审计

审计日期：2026-08-01；Issue #11 runtime 结论更新于 2026-08-02。证据来自三个仓库 `main` 的浅克隆、GitHub API、源码逐文件检查与当前生产 artifact。GameYard 已导入三个项目的固定历史，三款游戏均通过各自 adapter 进入同一个 Hub runtime catalog。

## 快速对照

| 项目               | 固定 revision                              | 浏览器结构                                             | 工具链                                                 | 公共设置                                                         | 主要集成风险                                                 | 迁移顺序 |
| ------------------ | ------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| TUMBLEDRUM         | `ba6fc680626ac59db793175122600369d48f9834` | Canvas；4 个经典 IIFE；`window.TD`；约 4,105 行 `Game` | `uv` + Python 3.12；Playwright 1.61.0；单 HTML builder | audio/music 布尔、shake、motion、contrast、language              | 永续 RAF、不可卸载全局监听、全 viewport、项目专用权利边界    | 2        |
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
- 仓库仍没有通用 LICENSE。GameYard 仅依据项目所有者在任务 `019fbbb1-910c-7652-9cb5-f27d8150dd88` 中给出的迁移与公开托管方向，记录了绑定该 revision/tree 的项目专用分发授权；它不是 standalone 仓库的通用开源许可证，也不扩张为 GameYard 之外的商业使用或转授权声明。
- `provenance/tumbledrum/distribution-record.json` 逐类覆盖运行源码与本地化、Canvas/CSS 视觉、内联图标、程序化音频、单文件构建、11 张截图、文档/测试/构建元数据，并明确不存在随包分发的字体、录音或外部 runtime 素材。记录同时固定上游 `SHA256SUMS.txt` 与 `ASSET_MANIFEST.md` 的 SHA-256。
- Site assembler 在读取 stage 前校验严格 upstream index、项目专用记录、授权文本哈希与 revision/tree；记录缺失、不完整、被篡改或禁止公开时整站 artifact 直接失败。权利记录本身也进入内容派生 build ID。

已保留内容/关卡模型、程序化音频、严格翻译目录与综合浏览器基线。GameYard 版本已改为 INIT 后显式 boot、Host pause/resume、数值音频增益和 bridge 事件，并在 iframe 移除前执行资源级 dispose。

Issue #7 将该 revision 作为非 squash subtree 第二父提交导入 `games/tumbledrum`；固定 tree 的 37 个 blob 与 36 条 `SHA256SUMS.txt` 记录保留为上游证据。Issue #8 退役单文件产品路径，并将原 smoke/integration/regression/full-run 接到 test-only 同源 Host harness；它们运行当前唯一生产源码。上游 full-run 使用未 seeded `Math.random`，所以偶然耗时只作为观测值；稳定门仍是 `FIXED_DT = 1 / 120`、13 个 authored stages、Campaign victory、Endless wave 12 和三视口真实输入。

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

Issue #10 以非 squash subtree 导入该 revision，纯导入提交保留上游提交为第二父；MIT `LICENSE.txt`、50 个最终 SVG、素材风格指南和逐项哈希均随固定历史保留。旧 `QA_REPORT.md` 属于 v3.7.0，不能代表固定的 v3.7.1；GameYard 因此两次运行 seed base 1000 的 100 局 greedy 模拟，均得到 64 胜、36 负且原始 JSON 字节完全一致。完整摘要与 canonical JSON SHA-256 `4911ab81e19d102b6f06457e7f66b0a7262273871cd0745bf176884e6f2d9a44` 固定在新的 fixture 中。

Issue #11 已将生产入口改为 INIT/MessageChannel guest：公共 locale、master/music/sfx、reduced motion 与 screen shake 只消费 Host 快照；save/run 和 flashes/hints 使用严格 `gameyard.game.crown-breaker.*` envelope，不读取旧键。Host pause 会停止 RAF 与 50 ms audio scheduler 并释放输入，dispose 进一步清理 timers/global listeners、关闭 AudioContext 与 MessagePort。生产构建不含 game Service Worker、旧 standalone boot 或写 QA surface；确定性场景仅保留在显式 testkit/baseline 边界。

CrownBreaker 仍以独立 iframe 保住单体玩法、run/save schema、资源与音频语义；没有为了共享而拆分规则闭包。Issue #11 的 root E2E 只固定一条真实 Hub 生命周期，完整三视口与三游戏长循环属于后续发布门。

## 上移与保留边界

上移 Hub：catalog/route、frame 生命周期、公共 locale、master/music/sfx 与 motion policy、焦点/暂停/全屏仲裁、版本化诊断、静态构建和最终单一 PWA。

保留 game：规则/AI/RNG、Canvas/DOM renderer、游戏 action 和手势、程序化音色/节拍、save/run schema、翻译文本、素材与确定性模拟工具。

“多个游戏都有”并不自动代表应共享。只有语义、生命周期和变化方向同时一致的能力才进入公共层。

## Kamifuda Runner

Kamifuda Runner 不是仓库导入。项目所有者提供的 `games/kamifuda-runner-v4.zip` 由 `provenance/kamifuda-runner/source-snapshot.json` 与完整 inventory 固定；该来源没有 repository、Git revision 或 public license，因此记录保持三个字段为 `null`，生产 manifest 使用 `owner-provided-source-snapshot` 判别项直接绑定 record 与 archive SHA-256。Issue #55 的 production admission 只覆盖 GameYard modular Guest 与 catalog/pipeline 输入；原 archive、standalone、Python packaging helper、candidate helper 和测试材料均明确排除。Assembler 与 release metadata 会重新校验 owner direction grant、archive、inventory、逐文件摘要和 admission 状态，缺失或被篡改时整站构建失败。
