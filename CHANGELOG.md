# Changelog

## 1.0.0 — 2026-11-01

首次正式发布。

- 支持 13 条主网、公开地址/私钥/12 或 24 词助记词输入。
- 按代币展示余额，历史按原始输入去重，查询成功后加密保存。
- 提供历史重查、后台创建与历史补查、PWA 及 CLI。
- 前后端应用源码统一为 TypeScript，开启 strict 类型检查。
- 加入 ESLint、Prettier、Dev Container、Linux CI 和多阶段 Dockerfile。
- 版本标签触发 GHCR 的 linux/amd64 镜像发布、镜像冒烟测试与 GitHub Release。
