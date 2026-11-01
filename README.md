# Wallet Balance

**本地运行的多链钱包余额工具。** 输入公开地址、私钥或 12/24 词助记词，查询 13 条主网的原生币与常见代币，按输入保存历史并随时重新查询。

[快速开始](#快速开始) · [使用指南](docs/usage.md) · [部署与备份](docs/operations.md) · [参与开发](CONTRIBUTING.md) · [反馈问题](https://github.com/jearton/wallet-balance/issues) · [MIT License](LICENSE)

![Wallet Balance 桌面端：公开地址查询与代币余额](docs/screenshots/overview.jpg)

## 功能

- **多链查询**：10 条 EVM 主网，以及 Bitcoin、Solana、TRON；按币种汇总，展开查看各网络结果。
- **三种输入**：公开地址、私钥、BIP-39 英文助记词；支持助记词校验、导入和前缀补全。
- **一份输入，一条历史**：重复查询更新原记录；多链地址归入同一个钱包，成功后才保存，零余额也保留。
- **本地持久化**：SQLite 保存历史，助记词与私钥使用 AES-256-GCM 加密，按需显示。
- **后台任务**：定时创建并查询钱包；自动补查历史中未完成的查询，支持暂停与恢复创建。
- **网页与 CLI**：React 自适应界面、PWA 安装入口，以及支持隐藏输入私钥的命令行。

> 适用于本机或可信内网。服务没有账号认证，能访问服务的人可以查看历史并显示已保存的密钥。仅查余额时优先使用公开地址；不要直接暴露到公网。

## 界面预览

### 查询历史与钱包详情

![同一钱包的多链余额、统一助记词入口与各链地址](docs/screenshots/history.jpg)

<details>
<summary>查看手机界面</summary>

<img src="docs/screenshots/mobile.jpg" alt="Wallet Balance 手机端公开地址查询" width="390" />

</details>

截图来自独立演示实例，仅使用公开教学钱包。余额为截图时的查询结果，不代表实时余额，也不代表转账权限；截图未展示助记词或私钥。

## 快速开始

需要 **Node.js 24+**、npm，以及能访问公共 RPC 的网络。

```bash
git clone https://github.com/jearton/wallet-balance.git
cd wallet-balance
npm ci --ignore-scripts
npm run build
npm run web
```

打开 **<http://127.0.0.1:4173>**，选择「公开地址」，输入钱包地址，点击「查询钱包余额」。原生运行默认仅监听本机，定时创建默认关闭。

macOS 开发请在项目 Dev Container 中执行 Node 命令。不要在 macOS 构建应用容器镜像；现有 Compose 使用官方 Node 运行时挂载源码，不需要 `docker build`。容器运行、局域网和 HTTPS 配置见[部署说明](docs/operations.md)。

### 命令行

```bash
# 公开开发账户，只读查询 Ethereum
npm start -- --chain ethereum --address 0x627306090abaB3A6e1400e9345bC60c78a8BEf57

# 交互式隐藏输入私钥
npm start -- --chain ethereum

# 查看全部参数
npm start -- --help
```

CLI 不保存密钥或历史，默认查询原生币；指定 ERC-20 合约时使用 `--chain` 和 `--token`。助记词输入与常见代币自动查询在网页提供。

## 支持的网络

| 地址体系 | 主网 | 原生币 |
| --- | --- | --- |
| EVM | Ethereum、Base、Arbitrum One、Optimism、Linea、Scroll、ZKsync Era | ETH |
| EVM | BNB Smart Chain | BNB |
| EVM | Mantle | MNT |
| EVM | X Layer | OKB |
| Bitcoin | Bitcoin | BTC |
| Solana | Solana | SOL |
| TRON | TRON | TRX |

自动查询的代币由[显式白名单](src/shared/common-tokens.mjs)维护，合约条目附原始来源。未收录的 EVM 代币可手填合约。Polygon、Avalanche 与 WSOL 已停用，旧结果不参与展示或汇总。

## 查询与存储规则

1. **本地推导**：助记词按默认路径派生第一个地址，公开地址只匹配兼容网络。
2. **只读查询**：RPC 只接收公开地址及查询参数，不接收助记词或私钥；没有签名、转账功能。
3. **成功后保存**：至少一个网络成功才写入历史；失败结果跳过，全部失败时保留原有历史。
4. **按输入去重**：一组助记词、一个私钥或一个公开地址各为唯一记录；助记词与其派生私钥属于不同输入。

网页会把助记词和私钥发送给本地服务加密保存。RPC 提供方仍能看到查询地址与来源 IP。加密不能防御同时取得数据库与服务端密钥的访问者；详见[数据与访问边界](docs/operations.md#数据与访问边界)。

## 使用限制

- **不等于完整钱包资产**：不扫描 HD 账户、找零地址或其他派生路径；不统计 NFT、DeFi、交易所资产或法币估值。
- **不自动发现所有代币**：仅查询白名单与指定合约。Solana 代币必须完整枚举账户；节点不支持时跳过，不展示部分余额。
- **失败不等于零**：超时、限流或不可查询的网络/代币会跳过；成功返回的零余额正常显示。明确不支持的能力记忆 24 小时。
- **公共节点可能受限**：手动查询还可能受浏览器 CORS 影响；支持的 EVM 网络可指定 HTTPS RPC。
- **PWA 仍需本地服务**：手机完整安装需可信 HTTPS；普通局域网 IP 的 HTTP 访问可能只能添加快捷方式。离线不缓存钱包、历史或余额。

## 项目结构

```text
src/
  client/       # React 应用：入口、页面组合、业务组件、UI 与样式
  server/       # HTTP、SQLite、加密存储与后台任务
  shared/       # 浏览器与 Node 共用的地址、派生和余额逻辑
  cli/          # 命令行入口
public/         # HTML、PWA、离线页与图标
tests/          # 自动化测试
scripts/        # 开发维护工具，不参与应用启动
docs/           # 使用、部署、截图与第三方许可
```

前端 `main.jsx` 只负责初始化与挂载，`App.jsx` 组合业务界面；`features/` 按钱包输入、余额、历史、定时任务和 PWA 划分，通用 UI 放在 `components/`。详见[贡献指南](CONTRIBUTING.md#项目结构)。

## 文档与贡献

| 文档 | 内容 |
| --- | --- |
| [使用指南](docs/usage.md) | 输入格式、派生路径、历史重查、代币和 PWA |
| [部署与备份](docs/operations.md) | 配置、Compose、定时任务、数据卷与故障排查 |
| [贡献指南](CONTRIBUTING.md) | 开发命令、项目结构、测试及提交要求 |

欢迎通过 [Issues](https://github.com/jearton/wallet-balance/issues) 反馈问题或提交 Pull Request。请只提供公开测试样例，不要提交真实助记词、私钥、数据库或 RPC 凭据。

## 许可证与致谢

本项目采用 [MIT License](LICENSE)。

界面基于 React、Tailwind CSS 与 shadcn/ui（Radix），密码学与地址处理使用 ethers、Noble 和 Scure。shadcn/ui 的 MIT 许可保留在 [SHADCN-LICENSE](docs/licenses/SHADCN-LICENSE)，其他依赖遵循各自许可证。公开演示样例的出处见 [public-community-wallets.mjs](src/shared/public-community-wallets.mjs)。
