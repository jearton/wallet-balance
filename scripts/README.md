# 开发维护脚本

这里存放显式执行的工具，应用启动和余额查询的运行代码位于 `src/`。这些脚本不会在启动服务时自动执行。

| 脚本                       | 用途                                                                   | 执行方式                                                            |
| -------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `check-public-wallets.mjs` | 使用明确公开的教学钱包实查公共节点，验证成功保存、去重和列表不泄露明文 | `node scripts/check-public-wallets.mjs`，第三方样例加 `--community` |
| `generate-pwa-icons.py`    | 用 Python 标准库生成 `public/icons/` 下的 PWA 图标                     | `python3 scripts/generate-pwa-icons.py`                             |

联网检查会向本地历史写入公开测试数据，默认目标是 `http://127.0.0.1:4173`。请先启动独立测试实例，通过 `WALLET_TEST_URL` 指定地址。测试用例在 `tests/`，普通离线验证运行 `npm test`。

`build-server.mjs` 由 `npm run build:server` 调用，编译服务端和 CLI；`release-notes.mjs` 仅供 GitHub Release 工作流生成发布说明。

前端资源由 `npm run build:web` 生成；密码学包由 `npm run build:crypto` 生成。两者都属于资源打包，不构建 Docker 镜像。
