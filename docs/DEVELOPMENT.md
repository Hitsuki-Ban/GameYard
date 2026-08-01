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
vp run deploy:dry-run
```

缺失 `vp`、根 `packageManager`、必需 schema 或构建输入时直接停止；不要回退到其他 manager 或静态服务器。

## 验证梯度

1. 修改 contract/settings/catalog：对应 Vitest。
2. 修改 Hub UI：`vp check` + desktop/mobile 浏览器截图。
3. 修改 bridge/game adapter：契约测试 + 进入/退出 E2E。
4. 修改构建/路由：生产 build、root/subpath preview、Wrangler dry-run。
5. 关闭 milestone：`vp run ready`、三视口 E2E、固定视觉基线和独立 reviewer。

首次在本机运行浏览器测试前执行一次 `vp run e2e:install`，它只安装项目固定 Playwright 版本所需的 Chromium。`vp run e2e` 会先生成 production Hub，再由根目录的 `playwright.config.ts` 启动严格端口 preview。测试固定覆盖 1440×900、390×844、844×390 三个 Chromium 视口，并检查 URL 选择、设置持久化、显式设置重置、只读诊断、严格路由、production Lab 剔除与横向溢出。

生产构建的 `hub@<sha256>` ID 由显式声明的 Hub 源码、contract/bridge 源码、workspace 配置和 lockfile 内容确定；这些输入缺失时构建直接失败，不读取 Git 状态或环境变量作为替代。`vp run tooling:test` 使用 Node 内建测试固定 build ID 的确定性、内容变化和缺失输入行为，以及 repository-prefix URL 检查规则。

`vp run artifact:verify` 检查构建产物不含 Lab/Tweakpane、game Service Worker 注册，以及 HTML、CSS、manifest/JSON 和明确 JavaScript URL 调用中的根绝对路径；`//cdn.example/...` 这类 scheme-relative URL 不视为 repository-root 路径。该检查已包含在 `ready` 与 production E2E 中，后者仍严格按 build → artifact verify → Playwright 的顺序运行。`vp run e2e:lab` 单独启动严格端口的开发服务器，验证动态 Lab CSS、参数写入/还原和关闭流程；它不复用 production preview。

## UI 调整

开发模式的 Lab 只修改显式注册的 CSS/token 参数，不写 localStorage。要保留一个方向时，将结果转成经过审查的 CSS token 变更；不要让运行时 preset 成为隐式生产配置。

视觉基准：

- desktop 1440×900
- portrait 390×844
- landscape mobile 844×390
- en / ja / zh-Hans
- reduced motion on/off 中至少一组稳定截图

任何截图场景都应固定 seed/clock 或使用受控 QA action，避免用脆弱坐标点击走完整流程。
