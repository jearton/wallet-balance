# 部署与备份

[返回 README](../README.md)

## 本机运行

在 Node.js 24+ 环境执行：

```bash
npm ci --ignore-scripts
npm run build
npm run web
```

服务固定使用 4173 端口，默认绑定 `127.0.0.1`。`npm start` 是命令行查询入口，`npm run web` 才启动网页。首次启动必须生成浏览器资源。

## Compose 运行

仓库使用官方 `node:24-alpine` 运行时挂载本地源码，不构建应用镜像。先在开发环境安装依赖并打包，再启动：

```bash
npm ci --ignore-scripts
npm run build
docker compose up -d
docker compose ps
```

macOS 开发请在 Dev Container 中执行源码与构建命令；不要运行 `docker build`、`docker buildx`、BuildKit 或 `docker compose up --build`。如需发布应用镜像，应在 Linux CI 构建，当前仅使用 `linux/amd64`，不使用 QEMU 模拟构建。

Compose 将 4173 发布到宿主机的所有接口，允许私有 IPv4 局域网访问，并**默认启用定时创建**。只需手动查询时，可在首次启动前将 Compose 中 `WALLET_GENERATION_ENABLED` 改为 `"false"`。已有持久化暂停状态时，请通过界面暂停任务，环境变量不会覆盖已保存的状态。

- 本机：`http://127.0.0.1:4173`
- 局域网：`http://<宿主机局域网IP>:4173`
- 支持 OrbStack 本机域名：`http://wallet-balance.orb.local:4173`

```bash
docker compose logs --tail=50
docker compose stop
docker compose start
```

更新前端后运行 `npm run build:web` 并刷新页面。更新服务端或 Compose 配置后，执行 `docker compose up -d --force-recreate`。这不构建镜像，保留原数据卷。

## 运行配置

以下是 Node 服务的环境变量；Compose 已显式设置部分值。

| 变量                            | 原生运行默认值 | 说明                                                 |
| ------------------------------- | -------------- | ---------------------------------------------------- |
| `HOST`                          | `127.0.0.1`    | Compose 使用 `0.0.0.0`                               |
| `DATA_DIR`                      | 项目下 `data/` | 数据库、密钥与迁移备份目录                           |
| `ALLOW_LAN`                     | 未启用         | 设置 `true` 后接受私有 IPv4 Host                     |
| `ALLOWED_HOSTS`                 | 空             | 额外允许的域名，逗号分隔；Compose 预设 OrbStack 域名 |
| `WALLET_GENERATION_ENABLED`     | 未启用         | `true` 时首次默认启用定时创建，已有持久化状态优先    |
| `WALLET_GENERATION_INTERVAL_MS` | `5000`         | 每轮结束后的等待时间，至少 `1000` 毫秒               |

定时任务生成 24 词助记词，在内存查询后保存成功结果。每轮结束才等待下一个周期，不重叠、不补跑停机期间的任务；全部失败时不新增记录或累计数。

暂停不会取消正在进行的查询，也不会停止已有历史的补查。暂停状态和累计数持久化，重启后保留。手动操作可在历史面板进行，也可调用：

```bash
curl http://127.0.0.1:4173/api/generation
curl -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:4173/api/generation/pause
curl -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:4173/api/generation/resume
```

补查处理历史中的未查询和超时未完成记录，仅使用公开地址，不解密助记词或私钥。默认最多同时处理 4 条内部地址记录，每条最多并行查询 3 个网络。结果按查询版本校验，避免旧请求覆盖新结果。

## 数据与访问边界

- 网页会向本地服务提交助记词和私钥，以 AES-256-GCM 加密保存在 SQLite；RPC 仅接收公开地址与只读参数。
- 原生数据在 `data/`；Compose 数据在容器 `/home/node/wallet-data/`，位于命名卷 `wallet-balance_wallet-data`。
- `history.sqlite` 与 `history.key` 必须配套保留。密钥文件权限为 0600；拥有二者的人可解密历史，不能防御宿主机管理员。
- 没有账号、鉴权或设备隔离。能访问该服务的人都可查看历史、显示已存密钥；Host/Origin 校验不是用户认证。
- 局域网 HTTP 不加密传输。仅在可信网络使用；远程访问需要额外的访问控制与可信 HTTPS，不应直接开放端口到公网。
- 页面、API 和 RPC 响应不由 Service Worker 缓存；浏览器仅缓存通用离线页和公开图标。
- RPC 提供方可看到查询地址及来源 IP。程序不签名、不广播交易，没有遥测功能。

## 备份与恢复

停止服务后备份整个数据目录，包括数据库、密钥和可能存在的 SQLite WAL 文件。普通重建与 `docker compose down` 保留命名卷，`docker compose down -v` 会删除它。

以下示例把备份写到项目外，避免误提交：

```bash
docker compose stop -t 300
mkdir -p "$HOME/wallet-balance-backups"
docker run --rm --volumes-from wallet-balance:ro \
  -v "$HOME/wallet-balance-backups:/backup" \
  node:24-alpine sh -c 'umask 077; tar -czf /backup/wallet-data-$(date +%Y%m%d-%H%M%S).tar.gz -C /home/node wallet-data'
docker compose start
```

恢复时先停止服务并备份当前卷，再将完整 `wallet-data` 目录还原到 `/home/node/`，保留 `history.key` 的 0600 权限及 Node 用户的读写权限。不要单独替换密钥文件。迁移备份同样需要原密钥才能解密。

## HTTPS 与 PWA

在可信 HTTPS 反向代理后部署时，将外部域名加入 `ALLOWED_HOSTS`，页面和 `/api/` 保持同源。域名校验可用 Compose 的同名环境变量追加，例如 `ALLOWED_HOSTS=wallet.example.com docker compose up -d`；HTTPS 证书和代理需自行配置。

iOS/Android 完整 PWA 安装依赖手机信任的 HTTPS。普通局域网 IP 的 HTTP 访问不满足安全上下文要求。安装不替代服务端，离线时只能看到连接提示。

## 常见问题

| 现象                   | 排查方式                                                                        |
| ---------------------- | ------------------------------------------------------------------------------- |
| 服务启动后资源加载失败 | 确认执行过 `npm ci --ignore-scripts` 和 `npm run build`                         |
| 端口被占用             | 检查已有本地服务或容器是否使用 4173                                             |
| 域名访问返回 403       | 检查 `ALLOWED_HOSTS`；跨站写入还会校验 Origin                                   |
| 余额缺项、查询超时     | 公共节点可能限流或受 CORS 限制；失败不代表零余额，可稍后重查或换 EVM HTTPS RPC  |
| Solana 只有 SOL        | 节点未能完整枚举代币账户，对应代币已跳过，不用部分 ATA 余额替代                 |
| 私钥/历史无法解密      | 检查数据库与 `history.key` 是否匹配、卷挂载及文件权限，不要生成新密钥覆盖旧文件 |
| 暂停后查询仍在执行     | 暂停只阻止下一轮创建，已有查询与历史补查会继续                                  |

## 发布镜像部署（Linux）

`Dockerfile` 使用多阶段构建，运行镜像仅包含生产依赖、编译后的 Node 程序、浏览器资源和 PWA 文件。应用镜像由 GitHub Actions 的 Linux runner 构建、发布并冒烟测试，目前仅支持 `linux/amd64`。

在 Linux 主机上执行：

```bash
WALLET_VERSION=1.0.0 docker compose -f compose.production.yaml up -d
```

此配置默认绑定 `127.0.0.1:4173`，首次启动不启用随机钱包创建。已有卷中的暂停状态优先。需要局域网访问时再设置 `BIND_ADDRESS` 和访问控制；不要直接对公网开放未认证的服务。数据卷仍位于 `/home/node`，需要保留数据库与密钥。

macOS 使用源码开发配置 `compose.yaml` 或 Dev Container，不运行发布镜像，不进行本机 Dockerfile 构建。`compose.yaml` 的源码入口与 `npm run dev` 使用 `.ts`；发布镜像运行 `dist/server/index.js`。
