# 参与贡献

欢迎提交问题报告、文档改进和 Pull Request。本项目采用 [MIT License](LICENSE)，提交贡献时请保留所涉及的第三方许可。

## 报告问题

在 [Issues](https://github.com/jearton/wallet-balance/issues) 中说明预期行为、实际行为、复现步骤，以及 Node/浏览器版本、网络名称与运行方式。只使用明确公开的教学样例或公开地址；截图与日志应去掉真实密钥、助记词、RPC API key 和个人钱包数据。

涉及密钥泄露或未授权读取的问题，请勿在公开 Issue 中附利用细节或敏感材料；优先使用仓库 Security 页提供的私密报告入口（若已启用），否则先联系维护者确认私密渠道。

## 开发与验证

Node.js 24+；macOS 请在 Dev Container 中执行源码，不在宿主机构建应用镜像。

```bash
git clone https://github.com/jearton/wallet-balance.git
cd wallet-balance
```

macOS 在此处用 VS Code 的 **Reopen in Container** 打开项目，再在容器终端执行：

```bash
npm ci --ignore-scripts
npm run check
npm run web
```

打开 <http://127.0.0.1:4173>。`npm run check` 会完成以下检查及打包：

```bash
npm run typecheck     # TypeScript strict 类型检查
npm run lint          # ESLint（零警告）
npm run format:check  # Prettier 格式检查
npm test              # 离线自动化测试
npm run build         # 浏览器资源、服务端与 CLI 打包
```

`npm run format` 自动格式化，`npm run lint:fix` 修复可自动修复的问题。首次打包后，`npm run dev` 可直接运行并监听 TypeScript 服务端；浏览器资源仍需另行打包。`npm run web` 和 CLI `npm start -- --help` 使用 `dist/` 中编译后的 JavaScript。

应用源码统一使用 `.ts/.tsx`，`tsconfig.json` 开启 `strict`；开发和测试可使用 Node 24 原生类型擦除，正式运行使用 esbuild 生成的 JavaScript。类型检查由 `tsc --noEmit` 单独执行，打包不能替代类型检查。ESLint 使用 flat config 和 typescript-eslint，Prettier 负责格式。

测试使用公开测试向量和本地模拟 RPC，不需要真实私钥或外部 RPC。请按改动范围运行测试；前端改动需打包并检查桌面及手机布局。`npm run build:web` 只更新界面，`npm run build:crypto` 更新浏览器密码学包。

如需验证真实公共节点，先启动独立的测试服务，再显式运行：

```bash
node scripts/check-public-wallets.mjs
node scripts/check-public-wallets.mjs --community
```

这两个命令会联网并向目标服务写入公开测试历史，不属于离线测试。通过 `WALLET_TEST_URL` 指定实例，默认 `http://127.0.0.1:4173`。不要将公开样例用于实际资产。

## 项目结构

| 路径                                               | 职责                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `src/client/main.tsx`                              | 浏览器初始化、CSP nonce、能力记忆与 React 挂载                    |
| `src/client/App.tsx`                               | 页面状态和业务界面组合                                            |
| `src/client/features/wallet/`                      | 网络选择、助记词输入与补全                                        |
| `src/client/features/balances/`                    | 代币分组与网络余额明细                                            |
| `src/client/features/history/`                     | 历史列表、钱包详情与密钥按需显示                                  |
| `src/client/features/generation/`、`features/pwa/` | 定时任务控制与 PWA 安装                                           |
| `src/client/components/`、`lib/`、`styles/`        | 通用 UI、客户端 API/剪贴板工具、样式                              |
| `src/server/`                                      | HTTP 路由、SQLite、加密历史、定时创建与历史补查                   |
| `src/shared/`                                      | 地址、密钥派生、网络、代币、余额查询与能力记忆                    |
| `src/cli/index.ts`                                 | 交互式 CLI 入口                                                   |
| `public/`                                          | 页面模板、Service Worker、Manifest、离线页与图标                  |
| `tests/`                                           | Node 自动化测试与模拟 RPC                                         |
| `scripts/`                                         | 显式执行的开发维护脚本，见 [scripts/README.md](scripts/README.md) |
| `docs/`                                            | 使用说明、部署备份、截图与第三方许可                              |

前端只从 `src/shared/` 引入通用逻辑，不引入包含 Node/SQLite 的 `src/server/` 模块。`main.tsx` 负责启动，业务组件放到相应 `features/`，可复用组件放到 `components/`。`tsconfig.json` 提供 `@/` 与 `@shared/` 编辑器/构建别名，`components.json` 与同一套路径保持一致。

浏览器打包产物仍输出到 `dist/`，不会提交到 Git。服务端以项目根目录为静态资源和默认数据目录基准；移动源码不会创建新的历史数据位置。

## 提交要求

- 一个 PR 聚焦一个可评审的问题，描述变化及实际验证结果。
- 余额与金额保持整数/精确单位处理，失败不能转换成零。
- 保留成功后保存、输入唯一键、查询版本检查和旧记录密钥的兼容性。
- 新增链或代币需提供原始来源、链 ID/合约地址与小数位；不得发送密钥给 RPC。
- 不提交 `data/`、数据库、服务端密钥、`.env`、`node_modules/` 或 `dist/`。
- 保留第三方许可；README 的界面截图仅使用独立实例中的公开样例，不显示助记词或私钥。

## 截图

截图放在 `docs/screenshots/`。当前图片来自真实页面与公开教学钱包，余额为截图时的结果；主服务与其历史不用于截图。更新时保持同样的数据隔离，检查桌面、历史详情和手机视图后，再同步 README 图片说明。

## 发布

更新 `package.json` 版本和 `CHANGELOG.md`，运行 `npm run check` 并提交。创建与版本一致的 `vX.Y.Z` 标签并推送后，Release workflow 会在 Linux runner 上检查、构建 `linux/amd64` 镜像、推送 GHCR、运行镜像冒烟测试，并创建 GitHub Release。发布失败时先检查 Actions 日志，不覆盖已有版本标签。

应用镜像只由 CI 构建；macOS 不执行 Dockerfile 构建，也不拉取或运行应用镜像。开发使用 `.devcontainer/` 或官方 Node 运行时挂载源码。
