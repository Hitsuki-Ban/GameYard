# PULSE LINK // OVERDRIVE

GameYard 的双盘对战落物游戏 Guest：连接颜色、制造连锁，并在进攻与防守之间押上全部能量。

本包只通过 GameYard Hub 的同源 iframe 启动。Guest 在收到严格匹配的 `gameyard:init` 后创建运行时，并通过版本化 `MessageChannel` 接收语言、公开设置、输入和生命周期命令。

```powershell
# From the repository root: start the same-origin Hub and watched Pulse stage.
vp run dev

# From this package: verify or build the Guest stage.
vp run test
vp run build
```

`vp run build` 将相对路径 Vite artifact 和严格的 `game.manifest.json` 写入 `.gameyard/stage/games/pulse-link-overdrive`。确定性基线固定为 `36 ASSERTIONS / 293 LOCKS`。

代码与原创素材按 [MIT License](LICENSE) 授权。项目来源及导入证据见 [GAMEYARD.md](GAMEYARD.md) 与 [docs/ORIGINS.md](docs/ORIGINS.md)。
