# 本地多链钱包余额查询

支持网页与命令行，按各网络的地址/密钥格式查询链上余额。助记词「全部」支持 10 条 EVM 主网以及 Bitcoin、Solana、TRON。
EVM 主网：Ethereum、BNB Smart Chain、Base、Arbitrum One、Optimism、Linea、Scroll、ZKsync Era、Mantle、X Layer。Polygon（POL）与 Avalanche（AVAX）已停用，不再查询或参与余额展示与汇总，旧数据保留。

## 网页操作

```bash
cd /Users/jearton/projects/personal/homelab/tools/wallet-balance
npm run build
npm run web
```

打开 <http://127.0.0.1:4173>。页面默认生成 24 个 BIP-39 英文助记词，可切换「12 个助记词」标签，逐个编辑、粘贴完整助记词、隐藏显示或重新生成。两个标签在当前页面中分别保留编辑内容，切换不会截断或补齐助记词。12 词使用 128 位随机熵，24 词使用 256 位随机熵。
页面支持 H5 自适应布局：手机上标签默认排列为一行，极窄屏分成两列，助记词按屏宽排列，余额区位于输入区下方，输入框与按钮适合触屏操作。
编辑后会校验词数、词库和校验和；确认后点击查询。生成使用浏览器安全随机数，整个过程在本地浏览器完成。
页面也保留私钥和公开地址查询模式。生成及编辑操作不会发起 RPC 查询。

助记词按各链的标准路径推导第一个账户或接收地址，无额外 BIP-39 口令。新生成的钱包通常没有余额。
点击查询后先分配不含密钥的查询版本，再读取余额；至少一个网络成功（含零余额）后，才将成功结果与对应助记词/私钥加密写入 SQLite 历史。全部失败不会新增历史。刷新或重新生成会替换编辑区内容；已保存的查询记录不会被清除。
依赖由本机服务提供，不加载 CDN 或第三方脚本；服务默认只监听 `127.0.0.1:4173`，并提供本地历史记录接口。
查询由浏览器直接访问 RPC，公共节点可能受限流、网络或 CORS 限制；失败会显示提示，可以换用支持浏览器请求的 HTTPS RPC。

## OrbStack 容器与局域网访问

使用官方 Node 运行时镜像挂载本地源码，无需构建应用镜像，也不使用 QEMU。依赖需先按锁文件安装，并运行 `npm run build` 生成浏览器本地密码库。该步骤是 JS 资源打包，不构建容器镜像；在 Dev Container 或官方 Node 容器中执行。

```bash
cd /Users/jearton/projects/personal/homelab/tools/wallet-balance
docker run --rm --user 1000:1000 -v "$PWD:/app" -w /app node:24-alpine sh -c 'npm ci --ignore-scripts --cache /tmp/npm-cache && npm run build'
docker compose up -d
docker compose ps
```

容器将 `0.0.0.0:4173` 发布到宿主机。局域网设备访问 `http://宿主机局域网IP:4173`，本机仍可访问 <http://127.0.0.1:4173>。OrbStack 本机域名为 <http://wallet-balance.orb.local:4173>。
如果 4173 已有本地 Node 服务，需要先停止原服务，再启动容器。
局域网模式允许 RFC1918 私有 IPv4 地址作为 Host；其他域名需通过 `ALLOWED_HOSTS` 明确配置。
助记词仍在访问页面的设备浏览器内生成，助记词和私钥仅发送到本地历史接口，不发送到 RPC。局域网 HTTP 未加密，保存和显示私钥时的网络传输也未加密，请仅在可信局域网使用。

```bash
docker compose logs --tail=30
docker compose restart
docker compose down
```

更新 React/CSS 后先运行 `npm run build:web`，然后刷新浏览器；修改 Node 服务或 Compose 配置后重新执行 `docker compose up -d --force-recreate`。

## 支持的主网

| 网络参数 | 网络 | Chain ID | 原生币 |
| --- | --- | --- | --- |
| ethereum | Ethereum | 1 | ETH |
| bsc | BNB Smart Chain | 56 | BNB |
| base | Base | 8453 | ETH |
| arbitrum | Arbitrum One | 42161 | ETH |
| optimism | Optimism | 10 | ETH |
| linea | Linea | 59144 | ETH |
| scroll | Scroll | 534352 | ETH |
| zksync | ZKsync Era | 324 | ETH |
| mantle | Mantle | 5000 | MNT |

网页下拉选项、命令行和 SQLite 历史校验共享同一网络配置；「全部」表示按输入匹配的已支持主网。
上述 EVM 网络列于 [Binance Wallet 支持网络](https://www.binance.com/en/support/faq/detail/80f7c26912c24bd4a005a9bc44f2bf51)。Binance Wallet 支持不代表交易所对所有币种都开放相同网络的充值/提现，实际以对应币种页面为准。
Polygon 显示原生币 POL；Optimism、Linea、Scroll、ZKsync Era 显示原生币 ETH，不代表自动查询 OP、LINEA、SCR、ZK 等 ERC-20 代币，未收录的 EVM 代币可手动提供合约。

网络参考：[Polygon](https://docs.polygon.technology/pos/reference/rpc-endpoints)、[Avalanche](https://build.avax.network/docs/primary-network)、[Linea](https://docs.linea.build/network/build/connect)、[Scroll](https://docs.scroll.io/en/developers)、[ZKsync Era](https://docs.zksync.io/zksync-network/zksync-era/network-details)。

## Bitcoin、Solana、TRON

| 网络 | 助记词默认派生路径 | 支持的私钥格式 | 查询内容 |
| --- | --- | --- | --- |
| Bitcoin | `m/84'/0'/0'/0/0` | 主网压缩 WIF / 32 字节 hex | 第一个原生 SegWit 接收地址的已确认 BTC；单独展示未确认净变化 |
| Solana | `m/44'/501'/0'/0'`（SLIP-0010 / Ed25519） | Base58 或 JSON，32 字节 seed / 64 字节密钥对 | finalized SOL，附 slot；自动查询已收录 SPL 代币，不含质押账户 |
| TRON | `m/44'/195'/0'/0/0` | 32 字节 hex | 已确认 TRX、USDT（TRC-20）；不含 TRC-10、质押或资源 |

网页助记词「全部」会派生四套地址：EVM 10 网共享一个地址，BTC、SOL、TRON 各自独立。历史按地址体系保存为四条记录，分别加密对应私钥；已有 EVM 记录兼容保留。
单个公开地址「全部」只查询格式匹配的网络。十六进制私钥「全部」查询 EVM、BTC 原生 SegWit、TRON；不能把 secp256k1 私钥当成 Solana 的 Ed25519 私钥。
Bitcoin 不进行账户、找零地址或 gap limit 扫描，不表示整个 HD 钱包的总余额。遗留 P2PKH/P2SH、Taproot 等地址可用「公开地址」查询；私钥模式固定生成原生 SegWit 地址。
不同钱包可能使用其他账户索引或派生路径，不支持自定义派生路径时请直接使用已有公开地址。
这三条网络当前不支持页面中的 ERC-20 或自定义 RPC 选项。

数据服务：[Mempool / Esplora API](https://mempool.space/docs/api/rest)、[Solana PublicNode](https://solana.publicnode.com/)、[TRON Solidity API](https://developers.tron.network/reference/walletsolidity-getaccount)。都由浏览器直接访问，仅发送公开地址。
新增密码学依赖打包为本机 `/vendor/crypto.mjs`，不从 CDN 加载。

## SQLite 查询历史

新查询在成功读取至少一个网络余额后才写入历史，成功的零余额也会保存；失败网络与失败代币不写入本次结果。全部查询失败时不新增历史，重复输入仍按唯一键更新原记录。仅输入公开地址查询时，私钥字段为空。
点击右侧「查看历史记录」按时间倒序查看，列表直接显示「有私钥 / 无私钥」和余额摘要，支持分页、展开余额及单独显示/隐藏私钥。余额按网络、币种分别展示，不跨链加总；未知、失败、未完成和代币读取失败会单独标注，不当作零余额。
每条历史提供「重新查询余额」：沿用原记录的地址、网络、代币合约，通过内置节点重新读取余额，更新同一条记录；页面只替换当前行，不改变位置、展开状态或已加载分页。有无私钥的记录都能重查；重查只读取公开地址，不需要把私钥读回浏览器。查询期间旧余额仍保留；全部失败时不更新历史，成功后才原子替换为本次成功结果，可再次重试。
「导入助记词」支持 12 或 24 个英文单词，自动切换对应标签，通过校验后替换编辑区。可识别空格、换行、Tab、逗号/中文标点、引号数组、全角英文字母、大小写、零宽字符及从 1 开始的连续序号。输入时即时提示词数、错误单词位置和校验和问题；序号缺失、重复或乱序时拒绝导入。不会猜词、重排、补词或修复校验和。导入失败保留原钱包和原始导入文本，且不发起余额查询。

- 容器数据：`/home/node/wallet-data/history.sqlite`，私钥使用 AES-256-GCM 加密。
- 服务端密钥：同目录的 `history.key`，文件权限为 0600。拥有数据卷和此密钥的人可以解密记录；这不防御宿主机管理员访问。
- 数据卷：`wallet-balance_wallet-data`，容器重建和普通 `docker compose down` 不删除历史。不要使用 `docker compose down -v`，它会删除数据卷。
- 备份时需同时保留数据库及密钥，运行中数据库还涉及 WAL 文件。建议先停止容器，再备份整个数据卷。
- 内网共享历史，无账号或浏览器隔离；换浏览器、设备、访问地址仍可读同一服务的记录和已存密钥。首次/最近查询的 User-Agent 与浏览器平台记录为来源信息，不作为访问凭据。
- 不提供公开共享历史接口，也不在列表响应中返回私钥；需点击「显示私钥」才读取单条私钥。

## 运行

需要 Node.js 24 或更新版本。在交互式终端执行：

```bash
cd /Users/jearton/projects/personal/homelab/tools/wallet-balance
npm ci --ignore-scripts
npm start
```

按提示输入或粘贴私钥，按 Enter 查询。输入不会回显，支持退格删除、Ctrl+U 清空、Ctrl+C 取消。
支持带或不带 `0x` 的 64 位十六进制私钥；无效私钥会在发起网络请求前被拒绝。
不要把实际私钥发到聊天中。

只查一条链：

```bash
npm start -- --chain ethereum
```

查询指定链的原生币和指定 ERC-20 代币（将占位地址替换为实际代币合约）：

```bash
npm start -- --chain bsc --token 0x代币合约地址
```

也支持直接查询公开地址：

```bash
npm start -- --address 0x钱包地址
```

公共 RPC 可能限流或在当前网络不可达。可指定其他 HTTPS RPC；链 ID 必须匹配：

```bash
npm start -- --chain base --rpc https://你的RPC地址
```

## 数据与私钥处理

- 命令行私钥仅在当前进程内用于推导地址，不保存或上传。网页版查询会将私钥发送到本地容器加密持久化；没有遥测、签名或交易功能。
- 不支持通过命令行参数、环境变量、文件或管道提供私钥。
- 推导后会清除程序保留的私钥变量，但 JavaScript 运行时无法保证内存被物理擦除。
- RPC 请求仅包含公开地址、代币合约、区块及只读方法参数。RPC 服务可看到地址和来源 IP。
- 同条链的原生币、代币余额使用相同区块查询；不同链的查询时间不保证完全一致。
- 数值使用整数和精确单位转换，不经浮点数计算。失败会明确显示，并返回非零退出码；不会显示成零余额。

## 范围

支持上述 13 条主网。不支持智能账户地址推导、HD 账户/地址扫描或多钱包批量扫描。命令行不支持助记词输入；网页版支持 12 或 24 个英文助记词。
命令行默认只显示原生币。网页版自动查询常见代币。命令行 ERC-20 需用 `--chain` 和 `--token` 指定合约，并且合约需提供 `balanceOf` 和 `decimals`。
不会自动发现全部代币，也不统计 NFT、DeFi 仓位、交易所资产或法币估值。
同一私钥关联的智能合约钱包需要用 `--address` 指定合约钱包地址。

## 验证

```bash
npm test
```

测试使用公开的无资金测试向量与本地模拟 RPC，不需要真实私钥或外网。

实现参考：[ethers 文档](https://docs.ethers.org/v6/)、[Ethereum PublicNode](https://ethereum.publicnode.com/)、[BNB RPC 文档](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/)、[Base 网络信息](https://docs.base.org/get-started/connect-to-base)、[Arbitrum 网络信息](https://docs.arbitrum.io/chain-info)。

助记词查询会将原词组以 AES-256-GCM 加密保存，历史中可单独显示/隐藏；列表不返回明文。重新查询保留已保存的助记词。升级前的旧记录未保存助记词，无法从私钥还原，需重新导入并查询。

历史记录支持筛选全部、有私钥且有余额、有私钥、有余额、零余额、余额未知/查询失败。筛选覆盖服务端全部共享历史，支持筛选后分页；有私钥且至少一项已确认余额大于零的记录高亮显示（包括代币余额，微小余额也保留）。

助记词编辑框支持本地 BIP-39 英文词库前缀补全（12/24 词均可），最多显示 8 个候选，可继续输入缩小范围；点击选择，或用上下键选择、Enter 确认，Esc 关闭。不会自动替换，Tab 仅切换输入框。隐藏单词时关闭补全；整组仍需通过校验和，输入和补全不会联网。

私钥记录按「地址体系 + 规范化私钥的 HMAC-SHA256 指纹」建立 SQLite 唯一索引。同一私钥重复查询更新原记录，保留已存助记词，网络/代币及余额替换为本次查询范围；不同地址体系分别保存。仅公开地址的新查询仍单独保存。旧重复私钥记录自动合并为最新记录，迁移前生成加密备份 `history-before-dedup.sqlite`（与原 `history.key` 配套保管）。并行查询使用版本号防止较早结果覆盖较新查询。

Mantle 主网配置参考[官方仓库](https://github.com/mantlenetworkio/mantle)：Chain ID 5000，原生币 MNT，RPC `https://rpc.mantle.xyz`。支持助记词、私钥、公开地址及指定 ERC-20 合约查询。

历史记录自动标记内置已知公开 BIP-39 测试词组（12/24 词，重复 00/7f/80/ff 熵，无额外口令及本程序默认路径）对应的地址，显示橙色「公开测试钱包」标签，只有有私钥且有余额才整行高亮。仅地址、私钥查询和旧记录同样可识别；不需要在列表接口解密助记词。此列表不是完整泄露库，未标记不代表私钥安全。链上余额也不表示拥有普通转账权限或可支出余额。

同时识别 [Anvil 默认助记词](https://www.getfoundry.sh/anvil/index.html)、[公开开发私钥及示例地址](https://github.com/circlefin/arc-node/blob/main/ACCOUNTS.md)和 [Solana Cookbook 示例私钥](https://solana.com/developers/cookbook/wallets/restore-keypair)在本程序默认路径下的地址。运行 `node scripts/check-public-wallets.mjs` 可对两组助记词、两个私钥和两个公开地址进行真实节点查询，验证成功保存、失败跳过、重复输入复用记录和列表不暴露密钥；该脚本会写入本地历史，不属于离线测试。可用 `WALLET_TEST_URL` 指定本地服务地址。

使用 `node scripts/check-public-wallets.mjs --community` 可查询额外的四个第三方教学样例（两组助记词、一个十六进制私钥和一个 Bitcoin WIF 私钥）。样例及原始出处保存在 `public-community-wallets.mjs`，来自 DEV Community 教程、大学课程讲义和社区多链钱包库的使用示例；同样会标记公开测试钱包，并验证多链地址合为一条历史和重复查询复用原记录。

## 前端组件与构建

前端使用 React + shadcn/ui（Radix）+ Tailwind CSS 4。组件源代码保存在 `web/react/components/ui`，来自 shadcn 官方 new-york registry；主题变量和 H5 布局位于 `web/react/theme.css`。网络选择为支持搜索/分组的 Combobox（Popover + Command），历史筛选为 Select，来源为 Tabs，导入为 Dialog。构建产物 `dist/app.js` / `dist/app.css` 由本地服务提供，无 CDN。修改前端后运行 `npm run build:web`，服务端修改后重启本地服务。

使用青绿主色、蓝紫辅助色、绿色余额状态和橙色测试钱包标签。沿用 SQLite API，旧数据会迁移为内网共享历史，迁移前备份为 `history-before-shared.sqlite`。旧密钥的加密关联信息保留，不会丢失解密能力。Radix 动态样式使用每次页面响应生成的 CSP nonce，不允许第三方脚本。

## 自动查询常见代币与共享历史

网页版和历史重查默认启用 `common-tokens.mjs` 的显式主网白名单，不需要手填合约。代币以网络与合约/mint 地址区分，按币种分组，稳定币优先；同一明确版本跨链精确合计，桥接币、包装币、Binance-Peg 版本分别列出，不混加。名单核实于 2026-10-31，来源包含 Paxos、Circle、Tether、Mantle、Scroll 官方资料以及 Uniswap/PancakeSwap 维护的 token list；每个合约记录来源 URL。Bitcoin 只查询 BTC，不把其他链的包装 BTC 当成原生 BTC。

EVM 按原生币查询时的区块读取各合约 `balanceOf`，按核实的小数位精确转换。Solana 使用 `getTokenAccountsByOwner` 分别完整枚举 SPL 和 Token-2022 账户，按代币合并所有匹配账户。某个程序的枚举不可用时，直接跳过对应代币，不查询标准 ATA 子集，不展示部分余额；另一个程序完整返回的结果仍可独立显示。TRON 用 Solidity 节点只读 `balanceOf` 查询 USDT，不签名、不广播、不消耗能量。单个代币失败不会影响已查到的原生币和其他代币，失败不当作零。

历史不再使用浏览器 localStorage 令牌；同一内网服务的所有访问者可查看、重查和按需显示已存私钥/助记词。跨站 Origin 与 Host 校验保留。重复私钥在共享空间合并，保留最新记录及可用助记词。浏览器信息仅记录 User-Agent/平台，无指纹追踪。

点击历史「重新查询余额」先选择同地址体系的网络：EVM 可选单链或全部 EVM 网络，BTC/SOL/TRON 只选各自网络。更换网络清除旧手填合约，自动代币照常查询。成功或失败后只更新该行，保留列表位置、展开状态与已加载分页；“加载更多”仍每次追加 20 条。更改后的筛选可通过刷新列表重新应用。

余额列表直接显示常见币种（包括零余额）：USDT、USDC、USDG、SOL、ETH、BNB、TRX、MNT、OKB。BTC 只读取 Bitcoin 原生币，自动白名单不再查询 WBTC/BTCB，旧结果仍保存在数据库。Mantle 读取原生 MNT，X Layer（chain ID 196，官方 RPC https://xlayerrpc.okx.com）读取原生 OKB；USDG 按 Paxos 官方主网地址覆盖 Ethereum、Arbitrum、Mantle、Solana、X Layer。Solana USDG 使用 Token-2022，独立扫描该程序并按正确程序推导 ATA，不能使用旧 SPL 程序代替。

每个只读节点请求首次失败后最多重试 3 次（最多 4 次请求，短暂递增间隔）。失败的网络/币种不出现在余额列表，也不计入合计；成功的零余额仍直接显示。失败原因继续保存在历史详情中。Solana 不完整的关联账户旧结果不再展示、汇总或参与余额筛选。

公开地址记录也使用服务端 SQLite 唯一索引：按地址体系 + 规范化地址去重，不以浏览器、查询网络或代币合约区分。EVM 地址忽略大小写，Bitcoin Bech32 规范为小写，Solana/TRON Base58 保留大小写。重复查询复用同一记录 ID、产生新的查询版本，旧请求不能覆盖新结果。已有公开地址重复行迁移时保留最新一条，最初浏览器信息沿用旧记录，完整迁移前数据库备份为 `history-before-address-dedup.sqlite`。含私钥的记录继续使用独立的私钥唯一键，公开地址查询不会覆盖或删除其密钥与助记词。

历史列表按最近一次查询显示触发方式：网页点击查询、重新查询为“手动触发”；调用创建或重查接口时可通过 `triggerType: "automatic"` 标记自动触发，默认 `manual`。触发方式单独持久化，不改变私钥/助记词/公开地址等钱包来源字段；重复查询复用记录时同步更新。旧记录没有可靠的触发信息，显示“触发方式未记录”，不会凭空标为手动。

## 定时批量创建钱包

本地配置启用 `WALLET_GENERATION_ENABLED=true`、`WALLET_GENERATION_INTERVAL_MS=5000`：服务端安全随机生成一组 24 词 BIP-39 助记词，派生 EVM、Bitcoin、Solana、TRON 四类地址，先在内存查询原生币和白名单代币，再将成功的地址结果加密写入同一个钱包历史条目。每轮完成后等待 5 秒再生成下一组，不重叠执行；全部失败时不保存、不增加新累计数。关闭浏览器不影响运行。

历史区域的任务面板显示累计创建组数、最近创建时间及余额待完成/处理中地址记录数，提供暂停/恢复创建按钮。暂停仅停止生成新钱包，余额补查继续。暂停状态和累计计数持久化到 SQLite，服务重启会保留；恢复后等待一个周期再创建，不补跑停机期间任务，不重叠执行。`GET /api/generation` 获取状态，`POST /api/generation/pause`、`POST /api/generation/resume` 控制运行；接口保留 Host 和同源检查。

历史网页以“一组助记词 = 一个钱包”分页展示。服务器只用助记词的带密钥 HMAC 关联四类地址，不在分组标识中存明文；旧记录启动时自动回填分组，原记录 ID、私钥和助记词密文不变。列表显示覆盖网络/地址数量，展开后查看按币种汇总的已有余额及各地址详情。`GET /api/history?groupBy=wallet` 返回每页 20 个完整钱包，按钱包整体筛选，不会把同组地址拆到不同页；不加此参数的旧接口继续返回地址记录。单地址重查后只更新该钱包摘要，保留其他记录和展开状态。


### 服务端自动余额查询与历史补偿

服务启动后自动处理全部历史中的 `unqueried`，以及超过 10 分钟未完成的 `pending` 网络（包括网页关闭或服务重启中断的查询），无需打开网页。按原历史顺序领取记录，每轮最多处理 4 条地址记录，每条记录最多并行查询 3 个网络，轮次间隔 1 秒。生成速度超过公共节点吞吐量时会形成积压，可暂停创建让补查继续。

补查仅使用公开地址和已保存的网络/代币合约，不解密私钥或助记词；保留原 ID、历史位置、钱包分组、密钥及已完成网络的结果。每完成一个网络即持久化，查询版本防止覆盖后续手动查询；领取记录标记为自动触发，10 分钟租约避免重复领取，进程中断后自动续查。失败会在节点自身最多 3 次重试后保存为错误，不作为零余额，也不会无限重试已完成的失败结果；可在网页重新查询。旧的成功/失败网络不会被本次补偿重查。

更新本地运行时容器（不构建应用镜像）：先在现有 Node 开发容器执行 `npm test && npm run build`，再运行 `docker compose up -d --force-recreate`，保留原数据卷。刷新历史列表可查看最新补查结果，任务面板每 5 秒更新待完成数量。


### 历史记录的唯一性与详情

列表以原始输入为唯一键：一组规范化助记词、一个规范化私钥、一个规范化公开地址各对应一条记录；重复点击查询更新原记录，不按查询时间或网络新建重复条目。同一私钥的 hex/WIF 等等价表示归为同一个输入，Solana 的 Ed25519 私钥与 secp256k1 私钥分别识别。公开地址沿用地址体系及规范化地址去重。助记词与其某个派生私钥是不同的输入，可分别有一条记录。

服务端只保存带密钥 HMAC 唯一标识。助记词/私钥下的多链地址归属于同一记录，按记录整体分页；内部地址结果分别更新，避免旧请求覆盖新结果。升级时自动归并旧私钥地址记录，保留 ID、结果与密钥密文，迁移前备份 `history-before-input-grouping.sqlite`。SQLite 对输入标识与地址密钥指纹施加联合唯一约束。

三种来源共用同一详情结构：代币余额 → 各网络明细 → 地址与密钥详情。每条记录外层固定提供“重新查询余额”，可选择全部适用网络或单一网络；选择全部时依次更新该输入关联的地址结果，原地刷新同一条记录。AVAX/POL 不在网络选项、自动查询、余额展示或筛选统计中，旧密文及结果仍保留。


WSOL 已从自动代币白名单移除，旧 WSOL 结果不展示、不汇总、不影响历史余额状态；原生 SOL 查询保留。


余额展示仅包含成功读到的结果。未查到、失败、尚未完成或格式无效的结果直接跳过，不进入代币列表或金额汇总；不再显示“部分余额未知”或未完整扫描提示。只读取标准关联账户的旧结果也直接排除。历史状态仅概括已查到的结果：有正数显示“有余额”，成功结果均为零显示“已查余额为 0”；没有任何成功结果时显示“暂无成功结果”，不会把查询失败当成零。原始查询状态和扫描范围继续保存在数据库中。

## 手机 PWA 安装

网页已提供 Web App Manifest、192/512 像素图标、Android maskable 图标、Apple Touch 图标、独立窗口模式和手机安全区适配。页头“安装应用”按钮在浏览器允许时弹出系统安装窗口，其他情况显示安装方法；已在独立窗口运行时隐藏安装按钮。

- iPhone/iPad：使用 Safari 打开 → 分享 → 添加到主屏幕 → 添加；如有“作为 Web App 打开”选项，保持开启。
- Android：使用 Chrome/Edge 打开 → 点击本站“安装应用”，或浏览器菜单中的“安装应用 / 添加到主屏幕”。
- 手机完整 PWA 安装与 Service Worker 需要手机信任的 HTTPS 地址；普通局域网 IP 的 HTTP 访问不满足安全上下文要求。当前本地 Compose 保留原 HTTP 4173 服务，不会伪装为已完成 HTTPS 配置。手机通过 HTTP 时可能只能创建浏览器快捷方式，实际表现取决于系统/浏览器。
- 后续可用现有可信 HTTPS 反向代理接入，并将域名加入 `ALLOWED_HOSTS`（Compose 的 `ALLOWED_HOSTS` 可通过同名环境变量追加逗号分隔域名）。保持同一外部域名访问页面和 `/api/`，无需修改 API 的同源检查。
- 安装后的余额查询及历史记录仍需连接本地服务，浏览器关闭后原服务端定时任务继续运行。PWA 不会把后台查询移到手机执行。

Service Worker 只缓存通用断线页面及公开图标/断线样式，不缓存钱包编辑页、助记词、私钥、历史接口或 RPC 响应。主页面和 JS/CSS 包始终联网加载，避免旧界面与新接口不匹配；断线时显示连接提示，恢复网络后点击“重新连接”。已有输入不会因 Worker 更新而自动刷新或丢失。图标可用 `python3 scripts/generate-pwa-icons.py` 重新生成，无额外依赖。

安装要求参考：[MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)、[Apple 添加到主屏幕](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)。


### 先查询，成功后保存

网页新查询先 `POST /api/history/prepare` 获取查询版本；这一步只在 `query_reservations` 保存输入的带密钥指纹、查询范围和版本等元数据，不保存私钥/助记词，不创建历史。读取余额后，再 `POST /api/history` 提交 `queryTicket` 和 `results`，服务端在同一事务中校验版本、筛掉失败结果、按唯一键加密新增/更新。旧版本不能覆盖更新的请求，预备元数据超过 24 小时清理。

历史重查的预备接口保留旧余额、时间与触发信息，`PATCH` 时只在新结果成功后更新。无成功结果返回 `saved: false`。已有待查历史仍由补偿任务处理，但不会用新失败结果清空旧成功余额。定时生成也遵循先查后存，不再制造新的“未查询”历史。

### 记忆明确不可查询的能力

查询能力按网络、RPC 节点、方法及合约/Token Program 区分。明确的 JSON-RPC `-32601`、Solana `-32010` 且明确说明程序被排除在索引之外、确定不支持的 HTTP 404/405/501 路由，以及代币查询失败后经 `eth_getCode` 确认合约不存在的情况，记忆 24 小时，后续直接跳过对应方法或代币。Solana 不支持完整索引时直接跳过对应代币，不查询标准关联账户子集，不重复探测明确不支持的完整索引。节点/合约切换后独立判断，到期后可重新探测。

超时、CORS、限流、网络错误和临时节点故障不会形成长期跳过规则。单次 EVM revert 不会全局禁用代币，必须进一步确认没有合约代码才记忆。明确不支持的请求立即停止内部重试；临时错误仍保留最多 3 次重试。

服务端能力记忆存入 SQLite 的 `app_settings`，浏览器存入当前站点的 localStorage；仅含能力的哈希标识、原因码与到期时间，不含钱包输入、地址或 RPC URL/API 密钥。刷新页面或重启服务后仍保留各自已确认的能力记录，存储受限时退回内存，不阻断余额查询。


### Solana 仅展示完整枚举的代币余额

已删除标准 ATA 回退查询。Solana 代币余额只接受完整的 owner-token-account 枚举结果；程序枚举失败、要求个人 API token、返回过旧 slot 或结果无法校验时，跳过对应程序下的代币，保留成功的原生 SOL。SPL 与 Token-2022 分别判断，成功枚举时会精确合计同一 mint 下的所有账户，而非只读标准关联账户。

旧历史里 `scope: "associated"` 的不完整余额从列表、汇总、筛选和新结果持久化中排除，原始历史密文不删除。当前 PublicNode 对索引请求要求个人 API token 的明确 HTTP 403 响应会记忆 24 小时，避免每个钱包重复试错；单纯限流、超时或含义不明确的 403 不形成这条规则。无需提供付费 API key；当前无法完整枚举的代币直接跳过。


公开地址钱包在历史列表中直接显示完整公开地址，手机窄屏自动换行，无需展开详情查看。公开地址“全部”只查询格式兼容的网络：Solana 地址查询 Solana；`0x` EVM 地址可查询已支持的多条 EVM 网络。公开地址不能派生其他地址体系的钱包，历史仍只保存查询成功的网络。


助记词在每条助记词钱包记录展开后的顶部“钱包助记词”区域统一查看，每条记录只有一份入口；点击“显示助记词”后按顺序编号展示 12/24 词，可隐藏或复制。各链地址卡片只提供对应私钥，不重复放助记词。默认不读取明文，收起记录或查询版本更新后隐藏并清除当前显示，过期请求不会再次显示密钥。
