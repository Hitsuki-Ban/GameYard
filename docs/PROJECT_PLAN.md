# GameYard 整合与迁移计划

## 产品目标

一个页面完成发现、选择、启动、返回和舒适设置；三个游戏保留各自的视觉与玩法语言。Hub 同时是玩家入口和开发工作台：同一问题摘要应能包含 build、game、locale、公共设置 revision、frame 生命周期和最近诊断事件，而不暴露完整存档。

Hub、契约和原子构建边界已经初始化；PulseLinkOverdrive 的精确上游历史与独立逻辑基线也已进入仓库。生产 catalog 仍为空，直到 Pulse adapter 在下一迁移 slice 中完成，不伪装成已经可从 Hub 启动游戏。

## 架构结论

```text
Catalog / Settings / Diagnostics (React Hub)
                    |
        exact v1 MessageChannel contract
                    |
       one active same-origin iframe
                    |
        game adapter -> original game core
```

- iframe 是长期 DOM/CSS/global/RAF 边界，不是临时兼容层，也不声称隔离恶意代码。
- Hub 不读取 iframe DOM；Host bridge 先对无 `src`/`srcdoc` iframe 注册 listener，再设置严格相对 entry URL。Guest 随后发送不含实例号的 `gameyard:ready-for-init`，Hub 校验 source/origin/protocol/game/build 后，以唯一 `gameyard:init` 发送完整 context、分配 instance 并转移 `MessagePort`，之后业务只走 port。[postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- 同时最多一个 frame。离开游戏时发送 dispose，收到 ACK 后移除；超时也移除并记录失败。
- Hub/game 属于同一个 buildId 和原子 artifact。协议或 build 不一致直接显示缓存/部署混合错误，不做版本协商。
- 初期无 Service Worker。运行边界稳定后才引入一个根 Hub SW；game SW 永不注册。重叠 scope 不宜存在。[Service Worker scope](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)

## 目标目录

```text
apps/hub/                   React 展览与诊断管理面
games/<id>/                 各游戏独立 HTML 入口、adapter、玩法代码与素材
packages/game-contract/     零 DOM 的 schema/types
packages/host-bridge/       frame + MessageChannel 生命周期
packages/guest-bridge/      guest INIT、命令 ACK 与终止清理
packages/diagnostics/       后续提炼结构化事件与导出
packages/testkit/           确定性 window/port/clock 与资源探针
tooling/*assembler*         严格配置、artifact inspector 与事务装配
docs/adr/                   不可逆决策
provenance/                 上游 URL/revision/license/素材来源
```

最终 artifact：

```text
dist/index.html
dist/assets/**
dist/games/<id>/index.html
dist/games/<id>/assets/**
dist/games/<id>/game.manifest.json
dist/games/catalog.json
dist/build-info.json
```

各包不得并行写同一个 `dist`；Hub/game 先写互斥 staging 目录，再由 assembler 检查严格 manifest、build ID、声明文件、路径冲突、Service Worker 与根绝对 URL 后事务合并。当前 production games 明确为空。

最终 `games/` 命名空间只属于 assembler。Hub stage 不得写入任何 `games` 路径，production verifier 也拒绝 catalog 与已登记 game manifest 之外的 game 文件。

## INIT 与 game manifest v1

唯一握手顺序为：

```text
guest window: gameyard:ready-for-init { protocol, gameId, buildId }
host window:  gameyard:init { context } + MessagePort
guest port:   ready
```

Host 必须在 frame 导航之前开始握手，`connectIframe` 因此拒绝预带 `src`/`srcdoc` 的 iframe，并亲自设置属于 `context.baseUrl` 的 entry URL。Build ID 精确为 `gameyard@<16 lowercase hex>`。`game.manifest.json` 是 strict schema，必填 `schemaVersion`、`protocol`、小写稳定 ID、SemVer、build ID、相对 entry、source/supported locales、capabilities、repository/revision/license provenance 与完整 files 白名单。未知字段、旧握手或旧 build ID 不协商、不降级。

## 公共 API v1

HostContext 是完整初始化快照，不允许缺字段：

```ts
type HostContext = {
  protocol: 1;
  buildId: string;
  gameId: string;
  instanceId: string;
  baseUrl: string;
  locale: {
    preference: "system" | "en" | "ja" | "zh-Hans";
    resolved: "en" | "ja" | "zh-Hans";
  };
  settings: {
    revision: number;
    audio: { master: number; music: number; sfx: number };
    motion: { reduced: boolean; screenShake: boolean };
  };
  diagnostics: { mode: "read-only" | "lab" };
};
```

Host → game：`locale.apply`、`settings.apply`、`input.setEnabled`、`input.releaseAll`、`lifecycle.pause/resume/dispose`、`diagnostics.snapshot`。语言与设置更新都携带完整快照和 `commandId`，必须 ACK；不发送空 patch。

Game → host：`ready`、`ack`、`lifecycle.state`、`settings.changeRequest`、`hostAction.request`、`diagnostic.event`、`diagnostics.snapshotResult`。

暂停、设置与 dispose 都需要 commandId/ACK。公共 settings 采用单调 revision；未知字段、错误 revision、错误 build 或超时都显式失败。

## 设置与存储

- Hub 公共键：`gameyard.settings.v1`。
- game 数据前缀：`gameyard.game.<id>.*`。
- 不读取、猜测或静默迁移三个旧 Pages 的键；如果以后需要导入旧存档，必须是单独、可见、可测试的用户操作与 ADR。
- 语言由 Hub 解析为 `en | ja | zh-Hans`，adapter 显式映射 Pulse/Crown 的 `zh-CN` 与 `auto/system` 差异。
- 统一 audio 是 master/music/sfx policy，不是共享 AudioContext。
- 统一 motion 是 reduced/screenShake policy；contrast、glyphs、haptics、hints、flashes 等仍属 game-specific。

## 调试与开发工具层

生产只读诊断抽屉：

- buildId/commit/protocol/game/version/route/base
- frame 生命周期、当前 locale、settings revision 与最近 ACK
- 输入焦点、viewport/canvas/DPR、AudioContext 状态、存储与 SW 状态
- bounded structured events、error/unhandledrejection/console error、长帧摘要
- 用户点击后复制问题摘要或导出版本化 JSON

默认不导出 raw localStorage、完整 save/run 或截图。

开发模式的显式 `Open Lab` 入口：Tweakpane 只操作 game 或 Hub 显式注册的参数；值 session-only，可手动导出带 buildId/gameVersion 的 preset。生产 build 不包含 mutation handler。Vite 8 自带的 console/error 转发作为第一层开发反馈。[Vite 8](https://vite.dev/blog/announcing-vite8)

## 里程碑与完成门

### M0 — 初始化（已完成）

- Vite+ / pnpm / Node 精确固定并能 fresh install。
- Hub 展示三个真实项目、三语公共设置、URL 选择、只读诊断和 dev-only lab。
- Contract/host bridge schema 与 transport 有严格单测。
- Cloudflare Workers Static Assets dry-run 成功。
- 上游 revision/license 进入 provenance。

### M1 — Pulse vertical slice（进行中）

1. 已非 squash 导入上游历史到 `games/pulse-link-overdrive`，并固定 36 assertions / 293 locks 的独立基线。
2. 已完成 strict guest bridge、manifest、testkit 与原子 assembler；production catalog 仍为空。
3. 下一步禁止 Pulse Service Worker，增加明确 boot adapter，只在 INIT 后启动。
4. 公共 locale/audio/motion 只从 HostContext/setting revision 获取；游戏专属 glyphs/haptics 保留。
5. 保留纯 model、logic smoke 与游戏 action mapping。

完成门：现有 logic smoke 全过；root 与 repository-style prefix 均能直达；三语/audio/motion 即时同步；50 次进入/退出仅一个 frame、无悬挂消息；生产无写型 QA。

### M2 — TUMBLEDRUM

前置：明确 LICENSE 或在 `provenance/` 提供足以公开再分发的权属记录。

保留 120 Hz 固定步长、Canvas、内容与程序音频；加入 boot/bridge，公共布尔设置映射到数值 audio policy，不读取旧键。完成门包括原 smoke/integration/regression/full-run、三语言、3:4 desktop/mobile 截图和退出 frame 清理。

### M3 — CrownBreaker

保持 run/save schema 的游戏所有权；停止 game SW 注册；把 `?qa` 能力封装进 testkit 并在生产剔除；adapter 负责 audio scheduler pause 与 dispose。完成门包括 static/i18n/assets/simulator、相同 seed 报告一致、三游戏连续切换和三视口视觉基线。

### M4 — 离线与上线

复用已完成的 staging assembler、路径/资源白名单与 `build-info.json`，加入一个根 Hub PWA。先只预缓存 shell；游戏离线包按用户选择处理，不一次下载全部游戏。发布到 Workers Static Assets，CI 验证真实 preview URL。

## 风险与暂不处理

- TUMBLEDRUM license 是真实发布阻塞，不通过技术 workaround 绕开。
- iOS Safari 的音频解锁、fullscreen、Gamepad 与 frame focus 需要真机门。
- Workers preview URL 的 server logs 能力有限；预览期依赖前端诊断导出与 CI E2E。
- 三个游戏都小于当前静态资产单文件限制；未来大型 Wasm/Unity 包再评估 R2，不预建路径。
- 不先做共享 GameEngine，也不统一三种游戏内 UI。优先完成玩家可见的展览、启动、返回与设置闭环。
