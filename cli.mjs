import { parseArgs } from 'node:util';
import { emitKeypressEvents } from 'node:readline';
import { getAddress } from 'ethers';
import { CHAINS, CHAIN_ORDER, queryBalance, validateRpc } from './wallet.mjs';
import { createQueryPlan } from './query-plan.mjs';

const help = `本地多链钱包余额查询（Node.js 24+）

  npm start                                  隐藏输入私钥，查询匹配的内置链
  npm start -- --chain ethereum              仅查询 Ethereum
  npm start -- --address 0x...                使用公开地址查询，无需私钥
  npm start -- --chain bsc --token 0x...      同时查询指定 ERC-20 代币
  npm start -- --chain base --rpc https://... 使用自定义 RPC

链：${CHAIN_ORDER.join(', ')}；默认 all。
支持 EVM/TRON 十六进制私钥、BTC 压缩 WIF、Solana Base58/JSON 私钥。
命令行不支持助记词；网页支持 12/24 词。BTC 只查第一个原生 SegWit 地址。
私钥仅在本机推导地址，不保存、不上传，不签名、不发交易。
RPC 会接收公开地址及来源 IP。代币需指定合约，不会自动发现全部资产。
不要将私钥写在命令行参数、环境变量或文件中。`;

function readPrivateKey() {
  const input = process.stdin;
  if (!input.isTTY || !process.stdout.isTTY) {
    throw new Error('私钥必须在交互式终端中隐藏输入；也可使用 --address 查询公开地址。');
  }
  process.stdout.write('输入私钥（不回显，Enter 查询，Ctrl+C 取消）：');
  emitKeypressEvents(input);
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let secret = '';
    function finish(error) {
      input.removeListener('keypress', onKey);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
      process.stdout.write('\n');
      const value = secret;
      secret = '';
      if (error) reject(error);
      else resolve(value);
    }
    function onKey(text, key = {}) {
      if (key.ctrl && ['c', 'd'].includes(key.name)) return finish(new Error('已取消。'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') { secret = secret.slice(0, -1); return; }
      if (key.ctrl && key.name === 'u') { secret = ''; return; }
      if (text && !key.ctrl && !key.meta && !text.includes('\x1b')) {
        secret += text;
        if (secret.length > 1024) finish(new Error('输入过长，请输入单个有效私钥。'));
      }
    }
    input.on('keypress', onKey);
  });
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({ options: {
      chain: { type: 'string', default: 'all' },
      address: { type: 'string' },
      token: { type: 'string' },
      rpc: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    } }));
  } catch {
    throw new Error('参数无效，运行 npm start -- --help 查看用法。私钥不能作为参数传入。');
  }
  if (values.help) { console.log(help); return; }
  const candidates = values.chain === 'all' ? CHAIN_ORDER : [values.chain];
  if (candidates.some(name => !CHAIN_ORDER.includes(name))) throw new Error('链名称无效，使用 --help 查看支持的链。');
  if ((values.rpc || values.token) && candidates.length !== 1) throw new Error('--rpc 和 --token 需要使用 --chain 指定单条链。');
  if (values.rpc) validateRpc(values.rpc);
  let token;
  let plan;
  try {
    if (values.token) token = getAddress(values.token);
    if (values.address) plan = createQueryPlan({mode: 'address', selected: values.chain, address: values.address});
  } catch { throw new Error('钱包地址或代币合约地址格式无效。'); }
  if (!plan) {
    console.log('私钥只在本机推导公开地址；不会保存或发送至 RPC。');
    let secret = await readPrivateKey();
    try { plan = createQueryPlan({mode: 'private', selected: values.chain, privateKey: secret}); } finally { secret = ''; }
  }
  const {names,wallets} = plan;
  plan.groups.forEach(group => {group.privateKey = null;});
  Object.values(wallets).forEach(wallet => {wallet.privateKey = null;});
  console.log('正在查询链上余额……');
  const rows = await Promise.all(names.map(async name => {
    const chain = CHAINS[name];
    try {
      const result = await queryBalance({ chain, address: wallets[name].address, token, endpoint: values.rpc ?? chain.rpc });
      if (result.tokenError) process.exitCode = 1;
      return { '网络': chain.name, '地址': wallets[name].address, '原生币余额': `${result.native} ${result.symbol}`,
        '区块': result.block,
        ...(token ? { '代币余额': result.token?.balance ?? result.tokenError } : {}) };
    } catch (error) {
      process.exitCode = 1;
      return { '网络': chain.name, '地址': wallets[name].address, '原生币余额': '查询失败', '原因': error.message };
    }
  }));
  console.table(rows);
  if (token) console.log(`代币合约：${token}`);
  console.log('原生币余额不包含其他代币、NFT、DeFi 仓位或交易所账户余额。');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
