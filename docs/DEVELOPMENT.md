# 开发与验证

## 本机基线

- Vite+ CLI：0.2.7
- Node：24.18.1
- Vite+ mode：`system_first`
- package manager：`pnpm@11.18.0`，由 Vite+ 按根 pin 管理

所有项目命令都从仓库根目录经 `vp` 运行：

```powershell
vp install
vp run e2e:install
vp run dev
vp run check
vp run test
vp run tooling:test
vp run build
vp run preview
vp run ready
vp run artifact:verify
vp run e2e:lab
vp run e2e
vp run e2e:release
vp run release
vp run deploy:dry-run
vp run tumbledrum#browser:install
vp run tumbledrum#build
vp run tumbledrum#test
vp run crown-breaker#browser:install
vp run crown-breaker#build
vp run crown-breaker#check
vp run crown-breaker#test
```

缺失 `vp`、根 `packageManager`、必需 schema 或构建输入时直接停止；不要回退到其他 manager 或静态服务器。

`vp run dev` 是唯一的交互式游戏开发入口：它并行启动 `127.0.0.1:5174` 的 Pulse、`127.0.0.1:5175` 的 TUMBLEDRUM、`127.0.0.1:5176` 的 CrownBreaker 与 `127.0.0.1:5173` 的 Hub。Hub 必须等三份严格 dev manifest 都就绪且 build ID 匹配后才监听，并将三个 `/games/<id>/` 路径同源代理到 Guest；不存在 stage 清空窗口或缺失游戏 fallback。游戏关闭自动 HMR，源码变化后使用 Hub 的“重新加载”按钮建立新的 INIT/MessageChannel 连接。单独打开 game server 没有 Host INIT，不能作为 standalone 页面运行。

## 验证梯度

1. 修改 contract/settings/manifest source/catalog：对应 Vitest 与 tooling assembler gate。
2. 修改 Hub UI：`vp check` + desktop/mobile 浏览器截图。
3. 修改 bridge/game adapter：契约测试 + 进入/退出 E2E。
4. 修改构建/路由：生产 build、root/subpath preview、Wrangler dry-run。
5. 关闭 milestone：`vp run ready`、三视口 E2E、固定视觉基线和独立 reviewer。

首次在本机运行浏览器测试前执行一次 `vp run e2e:install`。它先安装根 Node Playwright 锁定的 Chromium，再分别安装 TUMBLEDRUM 的 Python `playwright==1.61.0` 与 CrownBreaker 的 Node `playwright==1.61.1` 所锁定的浏览器；不会假定三套 Playwright 共用浏览器。`vp run e2e` 会先执行完整 production build，再由根目录的 `playwright.config.ts` 从最终 `dist` 启动严格端口 preview。root E2E 用同一个参数化 driver 对三个 Guest 执行设置、语言、暂停/恢复、只读诊断与 dispose 契约流程，并保留一条 focused Crown gameplay path；完整三视口 × 三语言视觉与三游戏长循环由 repository-prefix release suite 负责。所有 Canvas 测试由单 worker 顺序运行，符合“一次一个活动游戏”的产品边界。

`vp run e2e:release` 在 `/GameYard/` repository prefix 下执行三游戏发布门：Pulse 与 TUMBLEDRUM 保留 desktop、portrait、landscape × en/ja/zh-Hans 的视觉和真实输入基线；CrownBreaker 使用固定随机与 RAF 时钟生成同样 3 × 3 的 title 基线，并以真实 New Run button、键盘 Escape 和 Host Resume 验证 pause/resume。另一条宽测试以 Pulse → TUMBLEDRUM → CrownBreaker round-robin 执行 50 次进入/退出，每 5 次重载当前 Guest；每轮通过 production diagnostics 等待 locale/settings revision 收敛，只允许一个 iframe，并统一检查旧 frame、Host MessagePort、Guest listener/RAF/timer/audio、失败请求、console/page error 与 Service Worker 回到严格基线。最终 public accessibility journey 以一条英文桌面/移动连续流程验证真实 Tab/Enter、焦点可见性、WCAG A/AA、系统 reduced motion、Hub fullscreen 与活动 TUMBLEDRUM portrait ↔ landscape，不为每个控件复制微测试。`vp run release` 是唯一完整本地关闭门，串行执行 ready、root E2E、Lab、repository-prefix release suite 与 Cloudflare dry-run。

`vp run tumbledrum#build` 构建唯一 Vite guest stage；`vp run tumbledrum#test` 通过 test-only 同源 Host harness 对该 stage 执行 exact INIT/MessageChannel，再顺序运行 smoke/integration/regression/full-run。测试覆盖 desktop、portrait touch、landscape touch；每个视口通过真实 mouse/touch 启动 Campaign，并从实际 RAF loop 观察每次 simulation update 都是 1/120、每帧后 accumulator 小于一个固定步。所有程序固定使用 `playwright==1.61.0` 所属的 Chromium；外部 `CHROMIUM_EXECUTABLE` 覆盖或缺失的项目浏览器都会直接失败，不改用系统 Chrome。完整流程时间受未 seeded RNG 影响，不锁偶然秒数；1/120 step、13 关、Campaign victory 与 Endless wave 12 才是稳定门。测试 Host 与调试实例不会进入 production stage。

`vp run crown-breaker#test` 是 CrownBreaker 游戏包的行为宽门：复用 static/i18n/assets、三幕、敌人、traits 与 seed base 1000 的 100 局确定性报告，并构建、扫描严格 guest stage。真实 INIT/MessageChannel、Host 命令 ACK、公共设置/locale、audio scheduler pause、输入释放与 resource dispose 由根 `vp run e2e` 中唯一的 desktop Crown 主路径验证。生产 stage 不含 QA mutation、game Service Worker 或 standalone fallback；不要用短局或逐 setter 微测试替代这两条互补宽门。

根 `vp run test` 与 `vp run ready` 将 workspace 测试按单任务串行调度。多个游戏的真实浏览器门不会争用渲染时钟或音频 ramp，这与“一次一个活动游戏”的产品边界一致；每个游戏内部仍可按自身固定策略使用 worker。

## CI 与发布

`.github/workflows/verify-and-publish.yml` 是唯一自动构建与生产部署路径。PR 和 `main` 先在 Ubuntu 上通过 check、tooling/shared tests 与三游戏保存基线；随后单独的 artifact job 执行一次 `vp run build`，生成 `.gameyard/release-metadata.json`，并把 `dist`、`deployment/`、`provenance/`、`wrangler.jsonc` 与 metadata 作为一个 artifact 上传一次。metadata 精确记录 Git source SHA、`gameyard@<build>`、protocol、三份 manifest 的版本/revision/license/hash、provenance hash 与部署 config/Worker hash。消费者使用 artifact 内同一份 provenance 输入复验，不能依赖 checkout 的平台换行表示。

Host smoke 和 Cloudflare dry-run 都下载该 artifact，再执行 artifact-only published verifier 与 metadata verifier；root Guest/PWA 和 `/GameYard/` PWA 使用现有宽 Playwright 流程，不另建 helper 微测试。固定 Windows artifact consumer 直接运行现有视觉/三语言/50-switch 矩阵和单条 public accessibility journey，禁止调用会先 build 的 wrapper。构建与本地 preview 另执行 source-bound verifier，要求 stage、源码与 build ID 完全一致；下载和部署路径不重建、不依赖临时 stage。`vp run deploy:dry-run` 只接受已复验的 deployment entry 与 `dist`。Cloudflare production job 仅在 `main`、所有前置 job 通过后进入 `cloudflare-production` environment，并通过 `vp exec wrangler deploy --env production --strict` 上传下载的同一份 artifact。

Cloudflare Static Assets binding 默认直接服务 root；Worker 只对精确 `/GameYard` mount 运行，将其 path 映射到同一 binding 的 root 文件。路由脚本、Wrangler 配置与 release metadata 都进入 build/release identity；缺少其中任一文件会在部署前停止。生产 deploy 的机器可读输出提供 Worker version 与 target URL，随后对 root 和 `/GameYard/` 校验 `build-info.json`、三游戏启动以及 console/page/request/HTTP 信号。

GitHub environment 必须配置：

- `CLOUDFLARE_ACCOUNT_ID`：目标 Cloudflare account ID；
- `CLOUDFLARE_API_TOKEN`：只授权该 account 的 Workers Scripts Edit token。

缺失凭据时 production job 显式失败，不跳过、不改走本机构建或另一条 publish path。`preview`/`production` Wrangler environment 分别命名为 `gameyard-preview` 与 `gameyard`；Static Assets 保持普通 HTML 路由和真实 404，不启用 SPA fallback。

生产构建的 `gameyard@<16 lowercase hex>` ID 由显式声明的 Hub 源码、contract/host/guest bridge、assembler、`provenance/`、workspace/config 与 lockfile 内容确定；每个游戏还必须通过 `site.assembly.json` 的 `productionInputs` 声明自己的生产源码。输入缺失时构建直接失败，不读取 Git、环境变量、stage 或陈旧 `dist` 作为替代。`vp run tooling:test` 使用 Node 内建测试固定 build ID 的确定性、游戏源码覆盖、内容变化和缺失输入行为，以及 repository-prefix URL 检查规则。

`vp run build` 始终执行 Pulse stage → TUMBLEDRUM stage → CrownBreaker stage → Hub stage → site assembler → production verifier。每个游戏只在 `game.manifest.source.json` 声明 ID、版本、入口、语言、能力与 provenance；`@gameyard/manifest-tools` 的共享 Vite 插件从这份 strict source 生成 dev/production `game.manifest.json`。Assembler 首先严格解析 `provenance/upstreams.json`，校验所有项目专用 `LicenseRef-*` 记录、授权文本哈希与公开分发状态，并要求生产 game manifest 的 repository/revision/license 与 upstream index 精确一致；缺失或不完整会在读取 stage 前失败。TUMBLEDRUM 的 repository/revision/tree/LicenseRef/record 路径不可降级。随后 assembler 读取严格 `site.assembly.json` 和每个 `game.manifest.json`，从 stage manifest 推导 catalog identity，拒绝缺失/未声明文件、ID/build 不一致、大小写或文件/目录碰撞、Hub 越权写入 `games/`、game Service Worker 和根绝对 URL，并事务替换最终 `dist`；验证失败时保留已有 artifact。当前 catalog 精确登记三款游戏，测试 Host、截图、standalone 文件和生成工具均不进入 `dist`。

`vp run artifact:verify` 还会验证 `build-info.json`、`games/catalog.json`、每个 manifest、catalog 外 game 路径和完整文件集合，并检查产物不含 Lab/Tweakpane、game Service Worker 注册，以及 HTML、CSS、manifest/JSON 和明确 JavaScript URL 调用中的根绝对路径；Hub production build 还从输出模块图直接拒绝 `lab`/`testkit` 模块。`//cdn.example/...` 这类 scheme-relative URL 不视为 repository-root 路径。该检查已包含在根 build、preview、ready、production E2E 与 Wrangler dry-run 中，因此 direct preview 会拒绝与当前源码 build ID 不同的陈旧 `dist`。`vp run e2e:lab` 单独启动严格端口的开发服务器，用一个三游戏宽流程验证 manifest-bound startup scene、session-only 设置、preset 导出、错误版本拒绝与精确导入；它不复用 production preview。

## PWA 与离线验证

生产 Hub 注册唯一的同 scope `service-worker.js`。shell precache 绑定当前 `gameyard@<build>`；游戏资源不批量预取，只有用户在 Offline drawer 对当前选中游戏执行 Save 后，才将该 manifest 的精确文件集和 catalog 放入当前 scope/build 的 cache。Clear offline games 仅清理这些 cache，不读取或删除 `gameyard.*` 存档。未保存游戏在离线状态返回显式 503 页面，不回退到陈旧或其他版本资源。

发布更新不会由 waiting worker 自动接管。页面先以网络 `build-info.json` 校验 HTML/JS 与原子 artifact；版本混合时停在 `ARTIFACT / CONTRACT / STOP`，用户应用当前 release 后才 `skipWaiting` 并重载。根路径和 `/GameYard/` 前缀分别由一条宽 Playwright 流程验证；不要为单个 message/cache helper 追加重复浏览器测试。

正式 GitHub Release 由独立的 `Publish verified release` workflow 显式接收已经成功完成的 `main` push `run_id` 与非空 `release_tag`；它不会运行 build。该 job 先验证指定 run 的 workflow、branch、event、conclusion 与唯一未过期 artifact，直接下载 Actions 原始 ZIP，断言 ZIP SHA-256 等于 artifact API digest，再复验 metadata 和线上双路径，最后把 tag 指向该 run 的完整 source SHA 并上传原始 ZIP；既有 tag、Release、asset 或 digest/SHA 不一致都直接失败，不覆盖旧发布物。

```powershell
vp run build
vp exec playwright test tests/e2e/pwa.spec.ts --config playwright.config.ts --project desktop-chromium
vp exec playwright test tests/release/pwa-prefix.spec.ts --config playwright.release.config.ts
```

Host 创建运行 frame 时必须先插入一个没有 `src`/`srcdoc` 的 iframe，再调用 `connectIframe({ entryUrl, ... })`。Bridge 校验相对 entry 属于 `HostContext.baseUrl`，注册 timeout/window listener 后才设置 `src`；不要在 JSX/HTML 中预载文档，也不要在 bridge 外导航。这个单一顺序保证缓存命中或极速加载也不会早于 Host listener 发送一次性 `ready-for-init`。

## 添加游戏 stage

游戏构建只能写自己的 `.gameyard/stage/games/<id>`。随后在 `site.assembly.json` 添加严格对象：

```json
{
  "stage": ".gameyard/stage/games/game-id",
  "productionInputs": ["games/game-id/package.json", "games/game-id/src"]
}
```

游戏 ID 不写入 assembly config；先创建经过 `GameManifestSourceSchema` 校验的 `games/<id>/game.manifest.source.json`，再由共享 manifest 插件生成 stage identity。添加 stage 前必须先在 `provenance/upstreams.json` 登记固定 repository/revision/tree/license。通用 SPDX license 使用 `rightsRecord: null`；项目专用 `LicenseRef-*` 必须指向严格分发记录，且记录覆盖授权来源、允许动作/托管位置、全部素材类别与第三方边界。不得用仓库所有权猜测许可。

stage 根必须包含 `game.manifest.json`，其 `files` 精确声明自身、入口和全部嵌套素材，且 build ID 必须与站点一致。不要把 stage、`dist`、测试或生成产物列为 production input；不要直接复制未迁移的 standalone 包。

## UI 调整

开发模式的 Lab 只通过现有 Host 公共设置/语言/生命周期 API 与显式 CSS token 应用 startup scene，不写 localStorage。preset 严格绑定当前 guest 的 game ID、SemVer、build ID、scene ID/version 与 seed；任何版本不匹配直接拒绝，不迁移也不补默认值。要保留一个方向时，将结果转成经过审查的正式变更；不要让 runtime preset 成为隐式生产配置。

视觉基准：

- desktop 1440×900
- portrait 390×844
- landscape mobile 844×390
- en / ja / zh-Hans
- reduced motion on/off 中至少一组稳定截图

任何截图场景都应固定 seed/clock 或使用受控 QA action，避免用脆弱坐标点击走完整流程。
