
export async function handleHistory(req, res, store) {
  const send = (status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(payload)); };
  const token = undefined;
  const browser = { userAgent: req.headers['user-agent'], platform: req.headers['sec-ch-ua-platform'] };
  if (req.headers.origin) {
    let origin;
    try { origin = new URL(req.headers.origin); } catch { send(403, { error: '来源无效。' }); return; }
    if (origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol)) { send(403, { error: '不允许跨站访问。' }); return; }
  }
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { send(400, { error: '地址无效。' }); return; }
  const match = url.pathname.match(/^\/api\/history\/([a-f0-9-]{36})(\/private-key|\/mnemonic|\/requery)?$/);
  const collection = url.pathname === '/api/history';
  async function jsonBody() {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('需要 JSON 请求。');
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 131072) throw new Error('请求内容过长。');
      chunks.push(chunk);
    }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求格式无效。');
    return value;
  }
  try {
    if (collection && req.method === 'GET') {
      const before = url.searchParams.has('before') ? Number(url.searchParams.get('before')) : undefined;
      send(200, url.searchParams.get('groupBy') === 'wallet' ? store.listWallets(token, before, url.searchParams.get('filter') ?? 'all') : store.list(token, before, url.searchParams.get('filter') ?? 'all')); return;
    }
    if (url.pathname === '/api/history/prepare' && req.method === 'POST') {
      send(200, store.reserveQuery(await jsonBody(), browser)); return;
    }
    if (collection && req.method === 'POST') {
      const body = await jsonBody();
      if (!Array.isArray(body.results) || typeof body.queryTicket !== 'string') throw new Error('需要查询结果和查询版本。');
      send(201, store.create(token, body, browser, { completedResults: body.results, queryTicket: body.queryTicket })); return;
    }
    if (match?.[2] === '/requery' && req.method === 'POST') {
      const record = store.prepareRequery(token, match[1], req.headers['content-length'] === '0' || !req.headers['content-type'] ? {} : await jsonBody(), browser);
      send(record ? 201 : 404, record ?? { error: '记录不存在。' }); return;
    }
    if (match && !match[2] && req.method === 'PATCH') {
      const body = await jsonBody();
      if (typeof body.queryVersion !== 'string' || !/^[a-f0-9-]{36}$/.test(body.queryVersion)) throw new Error('查询版本无效。');
      const found = store.commitRequery(token, match[1], body.results, body.queryVersion);
      send(found ? 200 : 409, found ? found : { error: '该记录已开始更新的查询或已不存在，请刷新历史记录。' }); return;
    }
    if (match?.[2] === '/mnemonic' && req.method === 'GET') {
      const mnemonic = store.mnemonic(token, match[1]);
      send(mnemonic === undefined ? 404 : 200, mnemonic === undefined ? { error: '记录不存在。' } : { mnemonic }); return;
    }
    if (match?.[2] === '/private-key' && req.method === 'GET') {
      const privateKey = store.privateKey(token, match[1]);
      send(privateKey === undefined ? 404 : 200, privateKey === undefined ? { error: '记录不存在。' } : { privateKey }); return;
    }
    send(404, { error: '接口不存在。' });
  } catch {
    // Input and crypto library errors may contain secrets; never echo them.
    send(400, { error: '记录读写失败，请检查输入和本地数据库状态。' });
  }
}
