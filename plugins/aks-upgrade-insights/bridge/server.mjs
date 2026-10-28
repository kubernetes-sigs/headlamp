import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { validateRequest } from './validation.mjs';
import { ArmBridgeError, requestArm } from './arm.mjs';

const argv = process.argv.slice(2);
const subscriptionArg = argv.indexOf('--subscriptions');
const subscriptions = (subscriptionArg >= 0 ? argv[subscriptionArg + 1] ?? '' : '').split(',').filter(Boolean);
if (!subscriptions.length || subscriptions.some(s => !/^[a-f0-9-]{36}$/i.test(s))) {
  console.error('Usage: npm run bridge -- --subscriptions <comma-separated subscription IDs> [--allow-generate] [--preview-opt-in]');
  process.exit(1);
}
const allowGenerate = argv.includes('--allow-generate');
const previewOptIn = argv.includes('--preview-opt-in');
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
const az = process.env.AZURE_CLI_PATH ?? (existsSync('/opt/homebrew/bin/az') ? '/opt/homebrew/bin/az' : 'az');
// Desktop plugin hosts (e.g. Headlamp.app / AKS Desktop) can load plugin code
// into a context where `fetch` does not attach a browser-style Origin header
// at all (unlike a real browser tab, which always sends Origin on a
// cross-origin request). The Origin check is normally a second layer of
// defense on top of the pairing key; this explicit opt-in relaxes it ONLY for
// requests with no Origin header, for exactly that desktop-host scenario,
// while a browser request presenting a DISALLOWED Origin is still rejected.
const allowMissingOrigin = process.env.BRIDGE_ALLOW_MISSING_ORIGIN === '1';
function send(res, status, body, origin, headers = {}) {
  if (res.destroyed) return;
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(origin ? {
      'Access-Control-Allow-Origin': origin, Vary: 'Origin',
      'Access-Control-Expose-Headers': 'x-ms-request-id, x-ms-correlation-request-id, retry-after',
    } : {}),
    ...headers,
  });
  res.end(JSON.stringify(body));
}
const server = http.createServer(async (req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    send(res, 200, { service: 'aks-upgrade-insights', mode: allowGenerate ? 'evaluate' : 'read-only' });
    return;
  }
  const origin = req.headers.origin;
  if (origin ? !origins.has(origin) : !allowMissingOrigin) {
    send(res, 403, { error: 'Origin not allowed.' }); return;
  }
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
  let request;
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk.toString();
      if (raw.length > 16_384) { send(res, 413, { error: 'Request too large.' }, origin); return; }
    }
    request = validateRequest(JSON.parse(raw), subscriptions, allowGenerate);
  } catch (error) {
    send(res, 400, { error: error instanceof Error ? error.message : 'Invalid request.' }, origin);
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    const result = await requestArm(request, { azureCli: az, previewOptIn, signal: controller.signal });
    send(res, result.status, result.body, origin, result.headers);
  } catch (error) {
    if (error instanceof ArmBridgeError) {
      send(res, error.status, { error: { code: error.code, message: error.message } }, origin, error.headers);
    } else {
      console.error('Unexpected ARM bridge failure.');
      send(res, 500, { error: { code: 'BridgeFailure', message: 'Unexpected ARM bridge failure.' } }, origin);
    }
  } finally {
    clearTimeout(timer);
  }
});
server.requestTimeout = 100_000;
server.headersTimeout = 10_000;
server.listen(port, '127.0.0.1', () => {
  console.log(`Upgrade Insights ARM bridge: http://127.0.0.1:${server.address().port}`);
  console.log(`Mode: ${allowGenerate ? 'read + readiness evaluation (no upgrades)' : 'read-only'}`);
  console.log(`Preview opt-in: ${previewOptIn ? 'enabled for approved test subscriptions' : 'disabled'}`);
  console.log(`Allow requests with no Origin header: ${allowMissingOrigin ? 'enabled (desktop plugin host mode)' : 'disabled'}`);
  console.log(`Allowed subscriptions: ${subscriptions.join(', ')}`);
  console.log(`Pairing key (keep local; never commit): ${key}`);
});
