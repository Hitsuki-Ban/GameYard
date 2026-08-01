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
vp run release:pulse
vp run deploy:dry-run
vp run tumbledrum#browser:install
vp run tumbledrum#build
vp run tumbledrum#test
```

缺失 `vp`、根 `packageManager`、必需 schema 或构建输入时直接停止；不要回退到其他 manager 或静态服务器。

`vp run dev` 是唯一的交互式游戏开发入口：它并行启动 `127.0.0.1:5174` 的 Pulse、`127.0.0.1:5175` 的 TUMBLEDRUM 与 `127.0.0.1:5173` 的 Hub。Hub 必须等两份严格 dev manifest 都就绪且 build ID 匹配后才监听，并将两个 `/games/<id>/` 路径同源代理到 Guest；不存在 stage 清空窗口或缺失游戏 fallback。游戏关闭自动 HMR，源码变化后使用 Hub 的“重新加载”按钮建立新的 INIT/MessageChannel 连接。单独打开 game server 没有 Host INIT，不能作为 standalone 页面运行。

## 验证梯度

1. 修改 contract/settings/catalog：对应 Vitest。
2. 修改 Hub UI：`vp check` + desktop/mobile 浏览器截图。
3. 修改 bridge/game adapter：契约测试 + 进入/退出 E2E。
4. 修改构建/路由：生产 build、root/subpath preview、Wrangler dry-run。
5. 关闭 milestone：`vp run ready`、三视口 E2E、固定视觉基线和独立 reviewer。

首次在本机运行浏览器测试前执行一次 `vp run e2e:install`。它先安装根 Node Playwright 锁定的 Chromium，再调用 `vp run tumbledrum#browser:install` 安装上游 Python `playwright==1.61.0` 锁定的独立 revision；不会假定两套 Playwright 共用浏览器。`vp run e2e` 会先执行完整 production build，再由根目录的 `playwright.config.ts` 从最终 `dist` 启动严格端口 preview。测试固定覆盖 1440×900、390×844、844×390 三个 Chromium 视口，并检查 Pulse 启动、三语与公共设置实时同步、暂停/恢复/重载/关闭、设置持久化、显式设置重置、只读诊断、严格路由、production Lab 剔除、artifact metadata 与横向溢出。三个 Canvas 视口由单 worker 顺序运行，使负载与“一次一个活动游戏”的产品边界一致，也避免并行渲染争用掩盖协议结果。

`vp run e2e:release` 在 `/GameYard/` repository prefix 下执行 Pulse 发布门：一条矩阵覆盖 desktop、portrait、landscape 与 en/ja/zh-Hans 的 9 张 viewport 视觉基线，并保留一张暂停后的真实 gameplay 基线，同时走 pointer 启动与触控键按下/释放、keyboard 暂停的可观察结果链并下载有界诊断 JSON；另一条连续执行 50 次进入/退出，每 5 次重载 Guest，统一拒绝残留 iframe、Host MessagePort、全局 runtime listener、失败请求和 console/page error。`vp run release:pulse` 将 ready、root E2E、Lab、prefix release gate 与 Cloudflare dry-run 串成 Issue #5 的完整关闭门。

`vp run tumbledrum#build` 构建唯一 Vite guest stage；`vp run tumbledrum#test` 通过 test-only 同源 Host harness 对该 stage 执行 exact INIT/MessageChannel，再顺序运行 smoke/integration/regression/full-run。测试覆盖 desktop、portrait touch、landscape touch；每个视口通过真实 mouse/touch 启动 Campaign，并从实际 RAF loop 观察每次 simulation update 都是 1/120、每帧后 accumulator 小于一个固定步。所有程序固定使用 `playwright==1.61.0` 所属的 Chromium；外部 `CHROMIUM_EXECUTABLE` 覆盖或缺失的项目浏览器都会直接失败，不改用系统 Chrome。完整流程时间受未 seeded RNG 影响，不锁偶然秒数；1/120 step、13 关、Campaign victory 与 Endless wave 12 才是稳定门。测试 Host 与调试实例不会进入 production stage。

生产构建的 `gameyard@<16 lowercase hex>` ID 由显式声明的 Hub 源码、contract/host/guest bridge、assembler、`provenance/`、workspace/config 与 lockfile 内容确定；每个游戏还必须通过 `site.assembly.json` 的 `productionInputs` 声明自己的生产源码。输入缺失时构建直接失败，不读取 Git、环境变量、stage 或陈旧 `dist` 作为替代。`vp run tooling:test` 使用 Node 内建测试固定 build ID 的确定性、游戏源码覆盖、内容变化和缺失输入行为，以及 repository-prefix URL 检查规则。

`vp run build` 始终执行 Pulse stage → TUMBLEDRUM stage → Hub stage → site assembler → production verifier。Assembler 首先严格解析 `provenance/upstreams.json`，校验所有项目专用 `LicenseRef-*` 记录、授权文本哈希与公开分发状态，并要求生产 game manifest 的 repository/revision/license 与 upstream index 精确一致；缺失或不完整会在读取 stage 前失败。TUMBLEDRUM 的 repository/revision/tree/LicenseRef/record 路径不可降级。随后 assembler 读取严格 `site.assembly.json` 和每个 `game.manifest.json`，拒绝缺失/未声明文件、ID/build 不一致、大小写或文件/目录碰撞、Hub 越权写入 `games/`、game Service Worker 和根绝对 URL，并事务替换最终 `dist`；验证失败时保留已有 artifact。当前 catalog 精确登记 Pulse 与 TUMBLEDRUM，测试 Host、截图、standalone 文件和生成工具均不进入 `dist`。

`vp run artifact:verify` 还会验证 `build-info.json`、`games/catalog.json`、每个 manifest、catalog 外 game 路径和完整文件集合，并检查产物不含 Lab/Tweakpane、game Service Worker 注册，以及 HTML、CSS、manifest/JSON 和明确 JavaScript URL 调用中的根绝对路径；`//cdn.example/...` 这类 scheme-relative URL 不视为 repository-root 路径。该检查已包含在根 build、preview、ready、production E2E 与 Wrangler dry-run 中，因此 direct preview 会拒绝与当前源码 build ID 不同的陈旧 `dist`。`vp run e2e:lab` 单独启动严格端口的开发服务器，验证动态 Lab CSS、参数写入/还原和关闭流程；它不复用 production preview。

Host 创建运行 frame 时必须先插入一个没有 `src`/`srcdoc` 的 iframe，再调用 `connectIframe({ entryUrl, ... })`。Bridge 校验相对 entry 属于 `HostContext.baseUrl`，注册 timeout/window listener 后才设置 `src`；不要在 JSX/HTML 中预载文档，也不要在 bridge 外导航。这个单一顺序保证缓存命中或极速加载也不会早于 Host listener 发送一次性 `ready-for-init`。

## 添加游戏 stage

游戏构建只能写自己的 `.gameyard/stage/games/<id>`。随后在 `site.assembly.json` 添加严格对象：

```json
{
  "id": "game-id",
  "stage": ".gameyard/stage/games/game-id",
  "productionInputs": ["games/game-id/package.json", "games/game-id/src"]
}
```

添加 stage 前必须先在 `provenance/upstreams.json` 登记固定 repository/revision/tree/license。通用 SPDX license 使用 `rightsRecord: null`；项目专用 `LicenseRef-*` 必须指向严格分发记录，且记录覆盖授权来源、允许动作/托管位置、全部素材类别与第三方边界。不得用仓库所有权猜测许可。

stage 根必须包含 `game.manifest.json`，其 `files` 精确声明自身、入口和全部嵌套素材，且 build ID 必须与站点一致。不要把 stage、`dist`、测试或生成产物列为 production input；不要直接复制未迁移的 standalone 包。

## UI 调整

开发模式的 Lab 只修改显式注册的 CSS/token 参数，不写 localStorage。要保留一个方向时，将结果转成经过审查的 CSS token 变更；不要让运行时 preset 成为隐式生产配置。

视觉基准：

- desktop 1440×900
- portrait 390×844
- landscape mobile 844×390
- en / ja / zh-Hans
- reduced motion on/off 中至少一组稳定截图

任何截图场景都应固定 seed/clock 或使用受控 QA action，避免用脆弱坐标点击走完整流程。
