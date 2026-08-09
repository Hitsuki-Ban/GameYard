# CROWN//BREAKER for GameYard

CROWN//BREAKER 是一款以国际象棋走法为核心的浏览器棋盘肉鸽。当前目录是 GameYard 的受管 guest，不再作为独立站点、standalone HTML 或独立 PWA 发布。

运行时只通过版本化 `MessageChannel` 与 Hub 通信。Hub 负责语言、公共设置、输入开关、暂停/恢复、诊断和部署；游戏保留规则、渲染、音频、存档与内容目录。完整的迁移边界、存储键、构建产物和已验证基线见 [GAMEYARD.md](GAMEYARD.md)。

## 当前命令

所有命令均从 GameYard 仓库根目录执行，并且只使用 `vp`：

```bash
vp install
vp run crown-breaker#dev
vp run crown-breaker#build
vp run crown-breaker#build:testkit
vp run crown-breaker#check:stages
vp run crown-breaker#check:enemies
vp run crown-breaker#check:traits
vp run crown-breaker#baseline
vp run crown-breaker#sim -- --runs <count> --policy <greedy|random> --seed-base <seed>
```

- `dev` 在 production registry 声明的严格端口提供 `/games/crown-breaker/`。
- `build` 写入 `.gameyard/stage/games/crown-breaker`，并检查生产产物中不存在 testkit、旧存储、Manifest 或 Service Worker 残留。
- `build:testkit` 写入 `.gameyard/testkit/games/crown-breaker`；其同页测试宿主也必须完成真实 `connectGuest` 握手与 ACK 后才开放 QA 接口。
- `baseline` 包含完整上游行为门禁、生产构建和固定 100-run fixture，属于耗时验证。

## 项目结构

- `src/main.js`、`src/managed-runtime.js`：GameYard guest 入口与受管生命周期资源。
- `game.js`、`i18n.js`、`styles.css`、`assets/`：游戏规则、内容、呈现与素材。
- `tests/testkit/`：仅显式 testkit 构建使用的同页 Host。
- `tools/`：确定性上游行为检查、模拟器与生产产物检查。
- `QA_REPORT.md`：迁移前独立项目的历史验证档案，不是当前操作手册。

## License

Released under the [MIT License](LICENSE.txt).
