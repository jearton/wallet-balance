# 参与贡献

欢迎提交问题报告、文档改进和 Pull Request。本项目采用 [MIT License](LICENSE)，提交贡献时请保留所涉及的第三方许可。

## 报告问题

在 [Issues](https://github.com/jearton/wallet-balance/issues) 中说明预期行为、实际行为、复现步骤，以及 Node/浏览器版本、网络名称与运行方式。只使用明确公开的教学样例或公开地址；截图与日志应去掉真实密钥、助记词、RPC API key 和个人钱包数据。

涉及密钥泄露或未授权读取的问题，请勿在公开 Issue 中附利用细节或敏感材料；优先使用仓库 Security 页提供的私密报告入口（若已启用），否则先联系维护者确认私密渠道。

## 开发与验证

Node.js 24+；macOS 请在 Dev Container 中执行源码，不在宿主机构建应用镜像。

```bash
npm ci --ignore-scripts
npm test
npm run build
npm run web
```

测试使用公开测试向量和本地模拟 RPC，不需要真实私钥或外部 RPC。请按改动范围运行测试；前端改动需打包并检查桌面及手机布局。`npm run build:web` 只更新界面，`npm run build:crypto` 更新浏览器密码学包。

如需验证真实公共节点，先启动独立的测试服务，再显式运行：

```bash
node scripts/check-public-wallets.mjs
node scripts/check-public-wallets.mjs --community
```

这两个命令会联网并向目标服务写入公开测试历史，不属于离线测试。通过 `WALLET_TEST_URL` 指定实例，默认 `http://127.0.0.1:4173`。不要将公开样例用于实际资产。

## 项目结构

| 路径 | 职责 |
| --- | --- |
| `web/react/`、`web/pwa/` | React 界面、样式、安装入口与离线资源 |
| `wallet.mjs`、`non-evm.mjs`、`mnemonic.mjs` | 网络、地址、密钥和派生规则 |
| `asset-query.mjs`、`common-tokens.mjs` | 原生币/代币查询与合约来源 |
| `query-plan.mjs`、`query-results.mjs` | 输入匹配与有效结果过滤 |
| `history.mjs`、`history-api.mjs` | SQLite、加密、唯一键及 HTTP 历史接口 |
| `wallet-generation.mjs`、`balance-automation.mjs` | 定时创建与历史补查 |
| `rpc-capabilities.mjs`、`node-retry.mjs` | 明确不支持的能力记忆与临时失败重试 |
| `*.test.mjs` | Node 原生测试 |

## 提交要求

- 一个 PR 聚焦一个可评审的问题，描述变化及实际验证结果。
- 余额与金额保持整数/精确单位处理，失败不能转换成零。
- 保留成功后保存、输入唯一键、查询版本检查和旧记录密钥的兼容性。
- 新增链或代币需提供原始来源、链 ID/合约地址与小数位；不得发送密钥给 RPC。
- 不提交 `data/`、数据库、服务端密钥、`.env`、`node_modules/` 或 `dist/`。
- 保留第三方许可；README 的界面截图仅使用独立实例中的公开样例，不显示助记词或私钥。

## 截图

截图放在 `docs/screenshots/`。当前图片来自真实页面与公开教学钱包，余额为截图时的结果；主服务与其历史不用于截图。更新时保持同样的数据隔离，检查桌面、历史详情和手机视图后，再同步 README 图片说明。
