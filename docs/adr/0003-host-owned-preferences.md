# ADR 0003: Hub 唯一拥有公共偏好

- 状态：Accepted
- 日期：2026-08-01

## 决策

Hub 唯一持有公共 locale、audio 与 motion 偏好，使用 `gameyard.settings.v1`。持久化设置明确保存 master、music、sfx 三路音量。Game adapter 消费完整快照与单调 safe-integer revision；游戏只保留专属设置和 save/run schema。

Hub 将 locale preference 与 resolved locale 组成完整 `LocaleContext`，通过需 ACK 的 `locale.apply` 命令发送；audio 与 motion 则映射为完整 `HostSettings` 快照。两类更新都不发送 patch。

## 原因

三款现有游戏对语言标签、音量类型和 motion 命名不同。如果同时保留 guest 与 Hub 两套公共设置，会产生竞态和不确定覆盖顺序。

## 后果

迁移 slice 必须删除被触及的 guest 公共设置所有权，不保留双写或旧键导入。缺字段或旧 shape 会按契约失败，只能通过 Hub 的显式 reset 替换。未来旧存档导入只能作为单独、可见、显式授权的功能。
