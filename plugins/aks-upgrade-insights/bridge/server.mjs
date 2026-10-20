import http from 'node:http';
import { execFile } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { validateRequest } from './validation.mjs';

const argv = process.argv.slice(2);
const subscriptionArg = argv.indexOf('--subscriptions');
const subscriptions = (subscriptionArg >= 0 ? argv[subscriptionArg + 1] ?? '' : '').split(',').filter(Boolean);
if (!subscriptions.length || subscriptions.some(s => !/^[a-f0-9-]{36}$/i.test(s))) {
  console.error('Usage: npm run bridge -- --subscriptions <comma-separated subscription IDs> [--allow-generate]');
  process.exit(1);
}
const allowGenerate = argv.includes('--allow-generate');
const origins = new Set((process.env.BRIDGE_ALLOWED_ORIGINS ?? 'http://127.0.0.1:5178,http://localhost:5178').split(','));
for (const origin of origins) {
  const url = new URL(origin);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.origin !== origin) {
    throw new Error('BRIDGE_ALLOWED_ORIGINS must contain exact loopback origins only.');
  }
}
const key = randomBytes(32).toString('hex');
const port = Number(process.env.BRIDGE_PORT ?? '4319');
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid bridge port.');
const az = existsSync('/opt/homebrew/bin/az') ? '/opt/homebrew/bin/az' : 'az';
function send(res, status, body, origin) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  });
  res.end(JSON.stringify(body));
}
const server = http.createServer(async (req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    send(res, 200, { service: 'aks-upgrade-insights', mode: allowGenerate ? 'evaluate' : 'read-only' });
    return;
  }
  const origin = req.headers.origin;
  if (!origin || !origins.has(origin)) { send(res, 403, { error: 'Origin not allowed.' }); return; }
  if (req.method === 'OPTIONS' && req.url === '/arm') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type, X-Bridge-Key',
      'Access-Control-Allow-Private-Network': 'true', Vary: 'Origin',
    });
    res.end(); return;
  }
  const supplied = Buffer.from(String(req.headers['x-bridge-key'] ?? ''));
  const expected = Buffer.from(key);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    send(res, 401, { error: 'Invalid local bridge pairing key.' }, origin); return;
  }
  if (req.url !== '/arm' || req.method !== 'POST') { send(res, 404, { error: 'Not found.' }, origin); return; }
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk.toString();
      if (raw.length > 16_384) { send(res, 413, { error: 'Request too large.' }, origin); return; }
    }
    const request = validateRequest(JSON.parse(raw), subscriptions, allowGenerate);
    const args = ['rest', '--method', request.method.toLowerCase(), '--url', `https://management.azure.com${request.path}`, '--output', 'json', '--only-show-errors'];
    if (request.body) args.push('--headers', 'Content-Type=application/json', '--body', JSON.stringify(request.body));
    const child = execFile(az, args, { timeout: 90_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (res.destroyed) return;
      if (error) {
        send(res, 502, { error: `Azure CLI request failed. ${stderr.trim().slice(0, 2000) || error.message}` }, origin);
        return;
      }
      try { send(res, 200, JSON.parse(stdout), origin); }
      catch { send(res, 502, { error: 'Azure CLI returned a non-JSON response.' }, origin); }
    });
    res.on('close', () => { if (!res.writableEnded) child.kill(); });
  } catch (error) {
    send(res, 400, { error: error instanceof Error ? error.message : 'Invalid request.' }, origin);
  }
});
server.requestTimeout = 100_000;
server.headersTimeout = 10_000;
server.listen(port, '127.0.0.1', () => {
  console.log(`Upgrade Insights ARM bridge: http://127.0.0.1:${server.address().port}`);
  console.log(`Mode: ${allowGenerate ? 'read + readiness evaluation (no upgrades)' : 'read-only'}`);
  console.log(`Allowed subscriptions: ${subscriptions.join(', ')}`);
  console.log(`Pairing key (keep local; never commit): ${key}`);
});
