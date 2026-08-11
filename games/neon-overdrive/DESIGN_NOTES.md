# NEON OVERDRIVE — 研究与设计说明

版本：Build 1.0  
交付形态：浏览器发行候选构建  
设计目标：让不知道规则、只凭直觉移动和按键的玩家在极短时间内获得强烈正反馈，同时保留足以支撑重复挑战、路线优化和高分竞争的系统深度。

---

## 1. 目标语义：如何理解“ドパガキ也能爽玩”

这里不把目标玩家理解为“能力差”，而是理解为：

1. 对说明文字耐受度低；
2. 期待高频、可感知、立即兑现的反馈；
3. 在理解系统前就需要先体验一次峰值；
4. 会凭直觉拖动、按大按钮、追逐闪光物；
5. 若失败后长时间失去控制，会迅速流失。

因此，本作不通过教程先解释名词，而通过系统自动完成第一次完整闭环：

`移动 / 击破 → DRIVE 上升 → 满槽提示 → 未操作时自动发动 → 全屏清弹与火力爆发 → 更高分数与更高 Rank → 新一轮高密度弹幕`

首个 OVERDRIVE 设置了隐藏的进度下限：第 12 秒开始抬高最低 DRIVE，第 20 秒达到 100%，再经过 2.45 秒无输入后自动发动。即使玩家频繁触发保险，第一次高潮也不会被资源消耗永久推迟。

---

## 2. 弹幕射击变体调查与取舍

### 2.0 变体谱系矩阵

调查不是按“作品名罗列”，而是按玩家在弹幕前被要求做出的核心决策分类：

| 变体 | 代表结构 | 主要快感 | 主要认知成本 | 本作取舍 |
|---|---|---|---|---|
| 纯闪避 / 固定路线型 | 手工编排关卡、Boss 相位、背板优化 | 从混沌中读出安全路线 | 初见失败率高，峰值兑现较慢 | 保留三幕与十个 Boss 相位，但增加保护层 |
| 擦弹成长型 | [Psyvariar Delta](https://store.steampowered.com/app/998990/Psyvariar_Delta/)、[Graze Counter GM](https://store.steampowered.com/app/1486440/Graze_Counter_GM/) | 把危险直接转化为火力 | 需要让“近但未中”足够可读 | 作为主轴，统一产出 DRIVE / CHAIN / 反馈 |
| 贴脸击破型 | [Ketsui Deathtiny](https://m2stg.com/en/ketsui/) | 主动压缩安全距离换收益 | 容易与生存目标冲突 | 设计为可选的 RUSH 1—5，而非通关门槛 |
| 极性 / 谜题型 | [Ikaruga](https://store.steampowered.com/app/253750/Ikaruga/) | 吸收、切色、顺序连锁的解题感 | 前置规则多，直觉错误代价大 | 只吸收高对比颜色语言，不采用极性 |
| 资源爆发 / 清弹型 | [DoDonPachi Resurrection](https://www.cave.co.jp/gameonline/daifukkatu/system/03_hcm.html)、Crimzon Clover Break | 积累后短时间压倒屏幕 | Bomb、Hyper、倍率若分离会增加 UI 负担 | 合并为 DRIVE / PULSE / OVERDRIVE 单资源 |
| 时间变换 / 弹幕炼金型 | [Espgaluda](https://www.cave.co.jp/en/business/espgaluda/) 的 Kakusei 系 | 改写弹速并把弹幕变成得分物 | 状态切换与资源反转较难无教程理解 | 不采用减速切态，只保留清弹兑现 |
| 自适应强度型 | [Crimzon Clover: World EXplosion](https://store.steampowered.com/app/1718160/Crimzon_Clover_World_EXplosion/) Boost | “越强，画面越疯狂” | 隐形橡皮筋会让高手感到被惩罚 | Rank 同时增加风险和可得分资源，受击仅给短恢复窗 |
| 武器熟练 / 颜色连锁型 | [Radiant Silvergun](https://store.steampowered.com/app/2450820/Radiant_Silvergun/) | 路线、击破顺序与成长绑定 | 容易把初见变成错误构筑 | 改为幕间三选一正向强化，不设废卡 |
| Roguelite 房间型 | [Enter the Gungeon](https://store.steampowered.com/app/311690/Enter_the_Gungeon/) | 程序化遭遇、掉落与局内构筑 | 长局随机性会稀释手工弹幕主题 | 只采用轻量构筑；主线仍为手工节奏 |
| 合作容错型 | [Jamestown+](https://jamestownplus.com/) | 队友复活、多人火力与社交混乱 | 单人原型无法兑现合作价值 | 本版不做多人，把容错移到自动救场 |
| Reverse bullet hell / Bullet Heaven | 自动攻击、敌潮、局内升级 | 低操作负担下持续成长 | 闪避与弹源阅读被弱化 | 采用自动射击与升级节奏，但保留敌弹判定和贴脸决策 |

结论：本作不是把所有系统叠加，而是选择最能在无说明条件下被感知的四件事——靠近、充能、爆发、升级；其余深度藏在距离、兑现时机、Rank 与构筑之间。

### 2.1 Psyvariar：擦弹直接转化为成长

Psyvariar 的 BUZZ 思路证明，子弹可以不只是失败威胁，也可以成为主动接近的资源。NEON OVERDRIVE 采用这一结构，但把成长拆成三个同步反馈：

- DRIVE：通往爆发；
- CHAIN：通往即时倍率；
- 视觉与音频火花：通往瞬时手感。

取舍：不使用复杂等级表，不要求玩家记住“多少次擦弹升一级”。一次擦弹立即同时产生音效、粒子、数值与资源变化。

### 2.2 Ketsui：贴脸击破创造真正的空间决策

只奖励生存会让最优策略退化为缩在画面底部。Ketsui 的近距离计分启发了本作的 `RUSH 1—5`：击破时根据玩家和敌人的距离划分等级，越近，基础分、DRIVE 和 CHAIN 越高。

这使同一波敌人产生两种合法解法：

- 远距离稳定处理；
- 前压贴脸，承担碰撞与弹源风险，换取倍率和更快的爆发循环。

### 2.3 DoDonPachi Resurrection：积累—释放—清算

Hyper 和自动保险类结构的价值，在于把弹幕压力转化为可主动释放的节奏峰值。本作将其合并为同一资源：

- 满槽：OVERDRIVE，全屏清弹、火力强化、倍率翻倍、一次破盾保护；
- 未满但资源足够：PULSE，局部清弹与范围伤害；
- 自动保险开启时：危险碰撞可自动消耗 DRIVE；
- OVERDRIVE 结束：再次清弹并按剩余弹体进行终结清算。

同一条资源同时承担进攻、保命和计分，避免额外 Bomb 图标与规则负担。

### 2.4 Crimzon Clover：Break 爆发与 Boost 自适应强度

Crimzon Clover 的 Break / Double Break 与 Boost 模式说明，爆发状态和动态强度可以共同制造“我越强，游戏越疯狂”的正循环。本作的 Rank 不是传统难度菜单，而是连续变量：玩家连锁更高、无伤更久、处于 OVERDRIVE 时，弹量与弹速逐渐上升；受击则暂时下降。

取舍：Rank 不直接显示精确数字，只显示 `LOW / RISING / HIGH / FATAL`，避免玩家把注意力从画面转移到公式。

### 2.5 Ikaruga：高辨识度规则，但不适合作为本作主轴

极性吸收和颜色连锁具有很强的战略辨识度，但它要求玩家先理解“同色吸收、异色受伤、顺序连锁”等明确规则。对于“先爽后懂”的目标，这会形成前置认知门槛。因此本作只吸收其颜色可读性，不采用极性系统。

### 2.6 小判定点与聚焦移动

本作采用 4 像素核心判定点、约 25 像素擦弹半径，以及 Shift / LB 聚焦慢速。高速移动用于直觉闪避，聚焦用于高密度精修；开启“常显判定点”后无需按聚焦也能观察核心。

---

## 3. MDA 分解

### Mechanics / 机制

- 自动射击；
- 4 像素判定点与擦弹半径；
- DRIVE / PULSE / OVERDRIVE；
- CHAIN 与倍率；
- RUSH 近杀等级；
- 动态 Rank；
- 护盾、自动保险、每幕首次免费救场；
- Story 的四次 RAGE REBOOT；
- Boss 多相位与无伤奖励；
- 12 种幕间强化；
- Story、Rush、Endless 三种时间结构。

### Dynamics / 动态

- 玩家会在安全射击和贴脸追分之间摆动；
- 擦弹越多，爆发越快；爆发越频繁，Rank 越高；Rank 越高，可擦弹体越多；
- DRIVE 同时是攻击和保险资源，形成“现在花掉保命，还是继续等满槽”的张力；
- OVERDRIVE 可以提前手动结束，把剩余时长兑换为分数和终结爆炸；
- 高手追求无伤相位、贴脸 RUSH、延迟清弹和 Rank 管理；
- 新手即使失误，也会看到免费救场、自动保险、自动重启和反击演出，而不是立即中断。

### Aesthetics / 体验

- Sensation：高密度霓虹、屏幕震动、闪光、程序化音乐分层；
- Challenge：微小判定与高可读弹体；
- Expression：构筑、近杀路线、超载时机；
- Submission / Flow：自动射击降低操作负担，节奏由弹幕和爆发自然推动；
- Discovery：玩家先发现“贴近会发光、满槽会爆”，随后才逐渐理解倍率与 Rank。

---

## 4. 核心闭环与数值公式

### 4.1 CHAIN 倍率

```text
基础倍率 = 1 + CHAIN × 0.04
OVERDRIVE 倍率 = 基础倍率 × 2
```

CHAIN 上限为 100，因此普通状态理论上限为 ×5，OVERDRIVE 为 ×10。击破、擦弹、清弹会增加 CHAIN；停止有效行为后逐渐衰减。

### 4.2 动态 Rank

Story 的基础 Rank：

```text
0.20 + ACT × 0.10
```

表现项由以下内容组成：

```text
CHAIN 贡献：最高 +0.22
无伤时间：最高 +0.14
OVERDRIVE：+0.09
受击惩罚：暂时 -RankPenalty
```

最终 Rank 被限制在 0.16—1.00。敌弹参数：

```text
弹量缩放 = 0.62 + Rank × 0.68
弹速缩放 = 0.82 + Rank × 0.34
```

这不是简单追赶机制：表现好会得到更多风险与更多计分资源；表现差会得到短暂恢复窗口。

### 4.3 RUSH 近杀

敌人死亡时根据距离计算 RUSH 1—5。越接近弹源，击破收益越高；部分强化进一步提高近距离伤害与 RUSH 分数，使前压成为完整构筑方向。

### 4.4 DRIVE 经济

DRIVE 来源：

- 击破；
- 擦弹；
- 被清除弹体转化的 DRIVE 拾取物；
- 低速被动充能；
- 首次爆发的隐藏进度下限。

DRIVE 支出：

- 100：OVERDRIVE；
- 默认 32：自动 PULSE；
- 略低成本：玩家主动 PULSE；
- 强化可降低保险成本。

真实受击不会把 DRIVE 清零，而是保留约 68%，最低保留 18，防止玩家在最需要反击时被彻底剥夺高潮。

### 4.5 OVERDRIVE

默认持续 6.2 秒：

- 发动时全屏清弹；
- 对全体敌人造成冲击伤害；
- 提高射速、弹体尺寸、穿透与导弹频率；
- CHAIN 至少维持在 70；
- 倍率翻倍；
- 获得一次 BREAK GUARD；
- 结束时再次清弹并造成终结伤害；
- 再次按键可提前结算，剩余时长兑换分数。

### 4.6 初次高潮保底

```text
第 12 秒：首次 DRIVE 下限开始上升
第 20 秒：下限达到 100
满槽后 2.45 秒未按键：AUTO DROP
```

测试中的朴素左右摆动输入约在 22.45 秒触发第一次 OVERDRIVE。

---

## 5. 新手保护不等于取消深度

### 5.1 保护层

1. 自动射击；
2. 每幕开场无敌；
3. 每幕首次碰撞触发免费 `FIRST SAVE`；
4. DRIVE 足够时自动 PULSE；
5. OVERDRIVE 自带一次保护；
6. Boss 相位结束恢复一格护盾；
7. Story 四次 `RAGE REBOOT`：满盾复活、分数乘 0.9、立即进入 OVERDRIVE；
8. 受击降低 Rank；
9. 三选一强化没有负面词条。

### 5.2 高手损失与高分约束

保护并非无成本：

- 自动保险消耗 DRIVE，推迟 OVERDRIVE；
- 真实受击降低 CHAIN，并计入最终评级；
- RAGE REBOOT 折损总分；
- Rush 和 Endless 没有 Story 重启；
- 无伤相位获得 1.6 倍相位奖励；
- 主动提前结算 OVERDRIVE 可以获得额外分数，但失去剩余强化时间。

因此，新手可以完成内容，高手仍有明确的无伤、资源和路线优化空间。

---

## 6. 演出结构

### 6.1 视觉层级

从低到高：

1. 背景星线和舞台几何；
2. 敌弹的颜色与形状；
3. 玩家弹、导弹和僚机；
4. 擦弹火花、击破粒子和文字；
5. OVERDRIVE 扫描线、边框、全屏字样；
6. Boss 相位破坏、环形冲击、白闪与屏震。

危险弹体始终使用高亮核心和可辨轮廓，背景只使用低透明度线条，避免“演出比判定更亮”。

### 6.2 音频层级

程序化音乐以 150 BPM 运行：

- 基础：Kick、Snare、Hat、Bass；
- Rank 提高：增加 Arp 密度；
- Boss：提高强度层；
- OVERDRIVE：Bass 升八度、额外打击和高频层；
- 擦弹、击破、相位、警告、保险和重启使用不同合成音色。

声音只在首次用户手势后创建 AudioContext，遵守浏览器策略。

### 6.3 峰值节奏

- 约 22.5 秒内保证首次 OVERDRIVE；
- Story 敌群按 4—8 秒形成小波峰；
- 精英、Carrier 和激光形成中波峰；
- Boss 每个相位形成独立主题；
- 相位破坏清屏并恢复护盾；
- 幕间强化形成低压决策谷；
- RAGE REBOOT 把失败瞬间转换为反击峰值。

---

## 7. 内容结构

### ACT I — SYNAPSE CITY

目的：快速建立移动、自动射击、擦弹和首次 OVERDRIVE。敌群以 Scout、Diver、Spinner 为主，Boss `AELLA // THE FEED` 使用环形弹、信息流墙和双发螺旋。

### ACT II — GLASS TEMPLE

目的：引入镜像、轨道敌人、交叉激光和更高空间占用。Boss `MIRROR SAINT` 使用双源镜像弹、玻璃网格和万花筒分裂弹。

### ACT III — ZERO SUN

目的：把此前元素组合为高密度终局。Boss `THE ALGORITHM` 有四个相位，包含预判扇形、走廊、黄金角螺旋、旋转激光与弹墙叠加。

### RUSH 180

三分钟计分压缩：持续程序化波次，45 / 90 / 135 秒进入 Boss。时间到即结算，强调单位时间分数与主动风险。

### ENDLESS

70 秒一个扇区；每个扇区提高敌量、速度、复仇弹和装甲概率，并轮换舞台与 Boss。

---

## 8. 强化池

共 12 项：

1. 过压线圈：射速；
2. 伴飞矩阵：僚机；
3. 延迟快感：OVERDRIVE 时长；
4. 牵引核心：擦弹半径与收益；
5. 终幕新星：结束爆炸；
6. 复合护层：最大护盾；
7. 贴脸猎杀：近距离伤害与 RUSH；
8. 保险回收：PULSE 成本与范围；
9. 连锁锁存：CHAIN 保留；
10. 追迹饱和：导弹；
11. 擦弹电弧：擦弹自动攻击；
12. 重启协议：每幕一次额外免费保护。

每次只展示三个选项；所有选项纯正向，没有需要先计算的负面代价。深度来自构筑之间对资源循环的不同放大方式，而不是词条陷阱。

---

## 9. “让人沉迷”的边界

本作追求的是基于掌握感的自愿重复，而不是运营型强迫：

- 没有体力、每日任务、签到、倒计时回流或付费随机；
- 没有无法预判的失败惩罚；
- 每次失败都能看见明确可改善项：距离、无伤、保险消耗、超载时机；
- 三种模式提供内容完成、限时计分和无限成长三种目标；
- 本地最高分和构筑随机性提供重复挑战；
- 反馈密度高，但核心规则数量保持低。

目标是形成“再打一局能明显更好”的技能循环，而不是制造外部义务。

---

## 10. 技术实现

### 渲染

- 540 × 960 固定逻辑分辨率；
- Canvas 2D；
- 运行时生成弹体 SpriteBank，避免每帧重复绘制复杂路径；
- 敌弹上限 2600，玩家弹上限 420，粒子根据效果密度限制；
- 对象池与 swap-remove 减少垃圾回收；
- 画面震动、闪光和粒子密度可关闭或降低。

### 时间

- 固定逻辑步长 1/60 秒；
- 每帧最多追赶 5 个逻辑步；
- 单帧时间最大按 0.1 秒处理，避免切换标签页后爆炸式追帧；
- 页面失焦自动暂停。

### 输入

- 键盘；
- 鼠标直接跟随；
- Pointer Events 触屏拖动；
- Gamepad API；
- 表单和按钮拥有独立键盘行为，避免全局游戏快捷键吞掉设置操作。

### 音频

- Web Audio 实时合成；
- 压缩器控制峰值；
- 分离音乐与音效增益；
- 根据 Rank、Boss 和 OVERDRIVE 调节编曲层。

### 存档

- localStorage 保存设置、三模式最高分、Endless 解锁；
- 存储不可用时自动退化为无存档运行，不影响游戏。

---

## 11. QA 与模拟结果

已验证：

- `node --check game.js` 无语法错误；
- 标题、模式、设置、暂停、升级、重试、返回标题；
- Story 三幕推进与 Boss 多相位；
- Rush 时间结算；
- Story 胜利后 Endless 解锁；
- OVERDRIVE 发动和提前结算；
- Web Audio Context 正常进入 `running`；
- 桌面与 390 × 844 触屏布局；
- 键盘在按钮上按 Enter 不会误启动战斗；
- 页面无脚本错误和控制台异常。

固定步长自动模拟：

- 完全不移动：可推进至 ACT III；
- 仅做周期性左右摆动：首个 OVERDRIVE 最迟约 22.45 秒触发；在 10 次随机化长时回归中 10 / 10 完成三幕 Story；
- 该模拟不会读取弹幕、不会主动按 OVERDRIVE，也不会针对敌人做路线规划。

模拟不是人类可玩性测试的替代品，但可以证明保护层、自动峰值和完整流程在极低技能输入下确实连通。

---

## 12. 研究参考脉络与可核对资料

以下资料用于确认机制本身，而非用评论口碑替代设计判断。访问日期：2026-07-24。

### 作品机制

- [Psyvariar Delta — Steam 官方说明](https://store.steampowered.com/app/998990/Psyvariar_Delta/)：BUZZ 以擦近敌弹作为强化关键。
- [Ketsui Deathtiny — M2 Shot Triggers 官方页](https://m2stg.com/en/ketsui/)：越接近敌人，得分筹码价值越高。
- [DoDonPachi Resurrection — CAVE Hyper Counter 官方说明](https://www.cave.co.jp/gameonline/daifukkatu/system/03_hcm.html)：击破充槽、满槽发动、期间可破坏敌弹。
- [Crimzon Clover: World EXplosion — Steam 官方说明](https://store.steampowered.com/app/1718160/Crimzon_Clover_World_EXplosion/)：BREAK / DOUBLE BREAK；Boost 根据破坏表现调整难度。
- [Ikaruga — Steam 官方说明](https://store.steampowered.com/app/253750/Ikaruga/)：同色吸收、极性切换、三连颜色 Chain。
- [Graze Counter GM — Steam 官方说明](https://store.steampowered.com/app/1486440/Graze_Counter_GM/)：擦弹充 Counter，再由 Counter 击破转入 Break。
- [Radiant Silvergun — Steam 官方说明](https://store.steampowered.com/app/2450820/Radiant_Silvergun/)：武器随击破成长，并提供多档难度。
- [Espgaluda — CAVE 官方档案](https://www.cave.co.jp/en/business/espgaluda/) 与 [Shmups Wiki 机制条目](https://shmups.wiki/library/Espgaluda)：Kakusei 状态改变弹速并支持弹幕转换。
- [Jamestown+ — 官方页](https://jamestownplus.com/)：四人合作作为新手容错与现代化路径。
- [Enter the Gungeon — Steam 官方说明](https://store.steampowered.com/app/311690/Enter_the_Gungeon/)：手工房间与程序化迷宫结合的 bullet-hell roguelite。

### 设计理论

- [Hunicke, LeBlanc, Zubek — MDA: A Formal Approach to Game Design and Game Research](https://www.cs.northwestern.edu/~hunicke/MDA.pdf)：用 Mechanics / Dynamics / Aesthetics 对齐规则、涌现行为和目标体验。
- [Hunicke, Chapman — AI for Dynamic Difficulty Adjustment in Games](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf)：静态难度可能与玩家能力错配；动态系统也会让渡部分设计控制，因此必须限制调整维度。
- [Jenova Chen — Flow in Games](https://www.jenovachen.com/flowingames/Flow_in_games_final.pdf)：通过可调挑战与玩家选择扩大 Flow 区间。
- [Steve Swink — Game Feel: The Secret Ingredient](https://www.gamedeveloper.com/design/game-feel-the-secret-ingredient)：输入响应需要由视觉、声音、运动和粒子等冗余线索共同确认。
- [庄司昌彦 — ドパガキとフロー](https://note.com/mshouji/n/ndd14af81d494)：记录“ドパガキ”作为“ドーパミン中毒のガキ”的当代用法，并讨论高频变化、预期与注意力设计。

本作不是上述任一作品的复刻；它把这些结构重新组合为“单资源、低说明、演出峰值优先”的独立规则集。

---

## 13. 发行边界

当前构建拥有完整开始—战斗—Boss—升级—结算—解锁循环，并可离线运行。它没有包含：

- 在线排行榜与反作弊；
- 云存档；
- 多语言本地化；
- 平台成就、支付、商店 SDK；
- 主机输入认证和各平台商店认证；
- 大规模设备矩阵与正式人工可用性测试。

因此更准确的定位是“可直接发布到静态网页平台的发行候选版”，而不是已经通过某一主机或商店认证的最终商业二进制。
