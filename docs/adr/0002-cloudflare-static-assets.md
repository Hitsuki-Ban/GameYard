# ADR 0002: Cloudflare Workers Static Assets 为唯一部署主路径

- 状态：Accepted
- 日期：2026-08-01

## 决策

`vp build` 生成一个纯静态 `dist`，Wrangler 以 Workers Static Assets 发布。初期不使用 Cloudflare Vite plugin，也不维护 GitHub Pages workflow。

## 原因

该路径保留 Vite+ build 的独立性，同时提供响应头、预览、日志和未来小型 API 的扩展空间。Cloudflare plugin 与 Vite+ 0.x 的组合没有明确供应商保证，不进入当前关键路径。

## 后果

静态 artifact 保持相对 URL 与 query route，技术上可被普通服务器读取，但 CI、配置和支持只围绕 Cloudflare 主路径验证。
