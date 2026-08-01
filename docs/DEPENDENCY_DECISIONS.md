# 外部库与托管调研

调研日期：2026-08-01。版本同时通过 npm registry、Vite+ 官方 scaffold 和本机 `vp info` 复核；项目锁文件是最终事实源。

## 选定栈

| 依赖                    | 固定版本         | 用途                                                             | 选择理由                                                                                                                                         |
| ----------------------- | ---------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vite-plus`             | 0.2.7            | 唯一项目入口、Vite 8 build、Vitest、Oxlint/Oxfmt、workspace task | 官方将 dev/check/test/build/run/pack 统一；0.x 升级必须显式进行。[Vite+](https://viteplus.dev/)、[monorepo](https://viteplus.dev/guide/monorepo) |
| `pnpm`                  | 11.18.0          | Vite+ 下层 workspace manager                                     | 根 `packageManager` 精确固定；日常不直接调用。[install](https://viteplus.dev/guide/install)                                                      |
| React / React DOM       | 19.2.8           | 只用于 Hub 管理面                                                | 设置、catalog、诊断抽屉适合声明式 UI；game contract 与 guest 不依赖 React。[npm](https://www.npmjs.com/package/react)                            |
| Zod                     | 4.4.3            | manifest、公共设置、window/port 消息唯一 runtime schema          | discriminated union 与 strict object 能让混合 deployment、未知字段直接失败。[Zod 4](https://zod.dev/v4)                                          |
| i18next / react-i18next | 26.3.6 / 17.0.11 | Hub 三语 catalog 与实时 locale                                   | Hub 只解析公共 locale；各游戏文本仍在 game namespace。[API](https://www.i18next.com/overview/api)                                                |
| Playwright Test         | 1.62.1           | E2E、iframe focus/lifecycle、视觉回归                            | 同一工具覆盖 Chromium/Firefox/WebKit 和 screenshot diff，不再叠加第二套视觉服务。[screenshots](https://playwright.dev/docs/test-snapshots)       |
| Tweakpane               | 4.0.5            | 仅开发环境的 UI 参数实验                                         | session-only，适合调整 token/spacing/motion；生产构建没有写接口。[docs](https://tweakpane.github.io/docs/)                                       |
| Wrangler                | 4.118.0          | Workers Static Assets 本地校验/发布                              | 不引入 Cloudflare runtime 代码也可部署原子静态 artifact。[static assets](https://developers.cloudflare.com/workers/static-assets/)               |

## 明确不引入

- 状态库：公共状态很小，React reducer/store + 一个严格持久化模块足够。
- 音频库：Hub 统一的是增益策略；程序化音频图和解锁必须由各 game 拥有。
- 输入库：Hub 只仲裁焦点、启停和 release-all；高频动作不跨 frame 转发。
- single-spa / Module Federation：它们解决多团队独立部署，本项目需要的是一个原子 artifact。[single-spa](https://single-spa.js.org/docs/microfrontends-concept/)、[Module Federation](https://webpack.js.org/concepts/module-federation/)
- Storybook：其 Manager/Preview channel 是重要参考，但引入整套工具会和 GameYard 自己的运行舞台、诊断抽屉重复。[addon architecture](https://storybook.js.org/docs/addons)
- Sentry：先完成本地结构化诊断和导出；只有明确启用真实用户遥测时再做一条显式集成路径，不保留空 DSN 或静默关闭分支。
- Howler、通用 game engine、微前端 RPC：当前三个游戏没有稳定共同引擎语义。

## 同类项目带来的设计输入

- itch.io 将每个 HTML5 包放进 iframe，要求 `index.html` 与相对资源路径，并采用 click-to-play/fullscreen 模式；这验证了“package + 独立 viewport”是成熟分发边界。[HTML5 uploads](https://itch.io/docs/creators/html5)
- Storybook 将统一 UI 分为 Manager 和 iframe Preview，并通过 channel 同步 globals；GameYard 借鉴这个调试模型，不复制其 addon runtime。[globals](https://storybook.js.org/docs/8/essentials/toolbars-and-globals)
- [js13kGames/games](https://github.com/js13kGames/games) 把 catalog、静态包和 Worker runtime 分层；GameYard 保留分层思想，不建立 legacy route 例外表。
- [Hack Club Sprig](https://github.com/hackclub/sprig) 把 gallery、engine、games、scripts、tests 分开；GameYard 对应为 hub、contract/bridge、games、tooling、tests。
- [WASM-4 distribution](https://wasm4.org/docs/guides/distribution/) 的 cartridge ABI 说明 manifest、截图、存储 prefix 应当稳定且与运行内容分离。

## 托管选择

主路径选 Cloudflare Workers Static Assets，不同时维护 GitHub Pages workflow。

理由：

1. 静态资源与未来轻量 Worker API 可以原子部署；asset-first 请求不需要先经过 Worker 代码。[Static Assets](https://developers.cloudflare.com/workers/static-assets/)
2. `_headers`、显式路由策略、版本/预览能力和 Workers Logs 比 GitHub Pages 更适合持续 UI/运行调试。[Workers logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
3. GitHub Pages 可以部署 Vite artifact，但仓库子路径 base、无原生 PR live preview、缺少自定义响应头会形成长期限制。[GitHub custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Vite deploy](https://vite.dev/guide/static-deploy.html)
4. 初期不启用 Cloudflare Vite plugin：Vite+ 0.2.x 与该插件没有供应商组合承诺。`vp build` 先生成纯静态 `dist`，Wrangler 只负责预览/部署，边界更小。

路由使用 `./?game=<id>`，资源 `base: "./"`，因此 artifact 本身保持相对路径；这是产物属性，不是维护第二个部署实现。

COOP/COEP 不全站开启。三个现有游戏不需要 SharedArrayBuffer；若未来某个 game 明确需要 Wasm threads，将为其重新做资源与 frame 边界决策，而不是预先影响全部外部资源。
