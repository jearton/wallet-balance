# Changelog

## [1.0.2](https://github.com/jearton/wallet-balance/compare/v1.0.1...v1.0.2) (2026-11-01)

### Features

- **tooling:** ✨ add emoji commits and generate release changelogs ([26b8565](https://github.com/jearton/wallet-balance/commit/26b8565a81b50a9375066749f2d303874af1e318))

## 1.0.1 — 2026-11-01

- GHCR 同一版本标签提供 linux/amd64 和 linux/arm64 镜像，Docker 自动选择架构。
- 使用原生 amd64/arm64 GitHub runner 分别检查、构建并验证启动，不使用 QEMU。
- README 改为镜像快速开始，明确容器平台与宿主机系统的区别，整理使用及开发入口。

## 1.0.0 — 2026-11-01

首次正式发布。

- 支持 13 条主网、公开地址/私钥/12 或 24 词助记词输入。
- 按代币展示余额，历史按原始输入去重，查询成功后加密保存。
- 提供历史重查、后台创建与历史补查、PWA 及 CLI。
- 前后端应用源码统一为 TypeScript，开启 strict 类型检查。
- 加入 ESLint、Prettier、Dev Container、Linux CI 和多阶段 Dockerfile。
- 版本标签触发 GHCR 的 linux/amd64 镜像发布、镜像冒烟测试与 GitHub Release。
