# ADR 0001: 单一 iframe 运行边界

- 状态：Accepted
- 日期：2026-08-01

## 决策

所有游戏都在同源 iframe 中运行，同时最多一个。Hub/game 业务通信只使用版本化 MessagePort；不提供直接 DOM mount、Shadow DOM、remote legacy embed 或 Module Federation 路径。

## 原因

三个上游均有页面级 CSS、全局监听、RAF、Web Audio、storage 或 Service Worker；直接同 DOM 挂载会让生命周期和输入所有权不可证明。iframe 是浏览器原生、低成本且符合 HTML game portal 经验的长期隔离单元。

## 后果

每个 game 需要 adapter；公共设置与诊断必须消息化。调试跨 frame 略复杂，但可以用严格 schema、ACK 和结构化诊断解决。此边界不等于对恶意第一方代码的安全沙箱。
