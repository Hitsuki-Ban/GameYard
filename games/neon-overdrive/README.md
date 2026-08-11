# NEON OVERDRIVE // 弹幕爆奏

一款零依赖、离线可运行、演出优先的纵向弹幕射击游戏。所有画面、弹体、粒子、界面、音乐与音效均在浏览器运行时程序化生成。

## 立即运行

最直接的方法：双击单文件版 `NEON_OVERDRIVE.html`。项目源码入口为 `index.html`。

首次点击 `IGNITE` 后浏览器才会解锁声音，这是 Web Audio 的正常安全限制。若浏览器对本地文件有额外限制，可在项目目录运行：

```bash
python3 -m http.server 8080
```

随后在浏览器中打开 `http://localhost:8080`。

项目也提供：

- macOS / Linux：`run_local.sh`
- Windows：`run_local.bat`

## 操作

| 动作 | 键鼠 | 手柄 | 触屏 |
|---|---|---|---|
| 移动 | WASD / 方向键 / 鼠标 | 左摇杆 / 十字键 | 拖动 |
| 聚焦慢速 | Shift / X | LB / LT | — |
| OVERDRIVE / PULSE | Space / Z / 左键 | A / RT | `DROP` |
| 暂停 | Esc / P | Menu | 浏览器暂停时自动暂停 |

无需按住射击。武器始终自动开火。

## 模式

### STORY DRIVE

三幕完整战役，每幕包含编排敌群、精英战与多阶段 Boss。Story 带有低门槛保护：

- 4 像素核心判定点；
- 自动射击与自动 OVERDRIVE；
- 每幕首次碰撞免费救场；
- DRIVE 足够时自动保险；
- Boss 相位击破恢复一格护盾；
- 四次自动 `RAGE REBOOT`，以分数折损换取继续推进；
- 幕间三选一强化，形成不同构筑。

完成 Story 后解锁 Endless。

### RUSH 180

三分钟纯计分模式。Boss 在 45、90、135 秒出现；没有 Story 重启。适合路线优化与高分挑战。

### ENDLESS

每 70 秒提高一个扇区并进入 Boss 战。敌方 Rank、数量和装甲持续提升；没有 Story 重启。

## 核心系统

- **擦弹**：靠近弹幕会获得 DRIVE、CHAIN 和分数。
- **RUSH**：贴近敌人击破会得到 1—5 级近杀奖励。
- **OVERDRIVE**：满槽后发动，清弹、强化火力、提供一次破盾保护，并在结束时二次清算。
- **PULSE**：槽未满但资源足够时按下发动局部保险；可主动用资源换安全。
- **CHAIN**：连续攻击、擦弹与清弹维持倍率；OVERDRIVE 期间倍率翻倍。
- **Rank**：系统根据幕数、连锁、无伤时间和 OVERDRIVE 状态动态提高弹量与弹速；受击会暂时降低 Rank。
- **构筑**：12 种强化覆盖射速、僚机、超载时长、护盾、近杀、保险、连锁、导弹、擦弹电弧等方向。

详细数值、研究来源与设计推导见 `DESIGN_NOTES.md`。

## 设置

标题画面的“设置”提供：

- 主音量与音乐音量；
- MAX / BALANCED / LOW 三档效果密度；
- 画面震动开关；
- 高频闪光开关；
- 常显判定点；
- 自动保险开关。

设置、各模式最高分和 Endless 解锁状态保存在 `localStorage`。清除浏览器站点数据会清除这些记录。

## 技术结构

```text
NEON_OVERDRIVE.html  可独立运行的单文件发行版
index.html       页面结构、HUD、模式与设置界面
styles.css       街机框体、响应式布局、过渡与可访问性样式
game.js          固定步长战斗内核、弹幕脚本、Boss、音频与存档
DESIGN_NOTES.md  研究、机制公式与 MDA 分析
QA_REPORT.md    自动回归环境、矩阵、数据与边界
run_local.sh     macOS / Linux 本地服务器启动器
run_local.bat    Windows 本地服务器启动器
```

技术栈：原生 HTML、CSS、Canvas 2D、Web Audio、Gamepad API、Pointer Events、localStorage。无第三方库、无网络请求、无外部素材。

## 已执行验证

- JavaScript 语法检查：通过；
- Chromium 桌面标题、战斗、OVERDRIVE、Boss、暂停、升级、结算流程：通过；
- Web Audio 解锁、合成音乐调度与音效：通过；
- 390 × 844 触屏布局、拖动与 `DROP` 按钮：通过；
- Story / Rush 结算、Endless 解锁、本地记录：通过；
- 固定步长随机化长时回归：10 / 10 次朴素左右摆动输入完成三幕 Story；
- 首次 OVERDRIVE 在测试中最迟于约 22.45 秒触发；
- 无页面脚本错误或控制台异常。

这是浏览器发行候选构建，不包含在线排行榜、云存档、商店支付、平台成就或主机认证层。
