# ADR 0005: TUMBLEDRUM 单一运行路径

- 状态：Accepted
- 日期：2026-08-01

## 决策

TUMBLEDRUM 只维护 `games/tumbledrum/src/*` 一份运行源码。生产入口只在 exact INIT 完成后构造 Game；pause、resume、input、locale、settings、fullscreen、diagnostics 与 dispose 全部经既有 GameYard v1 bridge。旧 standalone 单文件与 builder 不再是产品或测试运行路径。

浏览器基线通过 test-only 同源 Host harness 启动同一份 Vite stage。Harness 可以在 INIT 前包裹 Game 构造器以取得测试实例，但不会进入 manifest 或 production artifact。游戏专属存档只有严格的 `gameyard.game.tumbledrum.save.v1`；旧键不读取、不删除、不迁移。

## 原因

复制 legacy/runtime 源码或保留单文件 runner 会形成会漂移的第二实现，无法证明测试覆盖实际展品。测试 Host 既保留原 simulation 断言，又覆盖真实 INIT、命令 ACK 与资源生命周期。

## 后果

TUMBLEDRUM 的 Vite stage、Hub iframe 与 Python 综合基线共享同一生产源码。公共 locale/audio/motion 只有 Hub 一份事实源；contrast 与游戏进度留在严格 game save。未知 save schema、错误 INIT 或缺失运行输入都会显式失败，不提供 standalone fallback。
