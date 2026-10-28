import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const endpoint = 'https://management.azure.com';
export class ArmBridgeError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

async function readResponse(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16 * 1024 * 1024) {
        await reader.cancel();
        throw new ArmBridgeError(502, 'ArmResponseTooLarge', 'ARM response exceeded the 16 MiB bridge limit.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export async function requestArm(request, {
  azureCli, previewOptIn = false, signal, run = execute, fetchImpl = fetch,
}) {
  const subscription = request.path.match(/^\/subscriptions\/([^/]+)\//i)?.[1];
  if (!subscription) throw new ArmBridgeError(400, 'InvalidSubscription', 'An explicit subscription is required.');
  let token;
  try {
    const result = await run(azureCli, [
      'account', 'get-access-token', '--subscription', subscription,
      '--resource', `${endpoint}/`, '--query', 'accessToken', '--output', 'tsv', '--only-show-errors',
    ], { signal, timeout: 30_000, maxBuffer: 1024 * 1024 });
    token = result.stdout.trim();
  } catch (error) {
    if (signal?.aborted) throw new ArmBridgeError(504, 'ArmRequestTimeout', 'ARM authentication timed out or was canceled.');
    const detail = typeof error.stderr === 'string' ? error.stderr.trim().slice(0, 2000) : '';
    throw new ArmBridgeError(401, 'AzureAuthenticationFailed',
      `Azure CLI sign-in failed for the selected subscription.${detail ? ` ${detail}` : ''}`);
  }
  if (!token) throw new ArmBridgeError(401, 'AzureAuthenticationFailed', 'Azure CLI returned no access token.');
  const url = new URL(request.path, endpoint);
  const headers = { Authorization: `Bearer ${token}` };
  if (request.body) headers['Content-Type'] = 'application/json';
  if (previewOptIn && /\/(?:upgradeInsights(?:\/[^/]+)?|generateUpgradeInsights)$/i.test(url.pathname)) {
    headers.AKSHTTPCustomFeatures = 'Microsoft.ContainerService/AKSUpgradeInsightsPreview';
  }
  let response, text;
  try {
    response = await fetchImpl(url.href, {
      method: request.method, headers, signal, redirect: 'error',
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
    });
    text = await readResponse(response);
  } catch (error) {
    if (error instanceof ArmBridgeError) throw error;
    if (signal?.aborted) throw new ArmBridgeError(504, 'ArmRequestTimeout', 'ARM request timed out or was canceled.');
    console.error(`ArmConnectionFailed for ${request.method} ${url.pathname}: ${error?.name ?? 'Error'}: ${error?.message ?? error}${error?.cause ? ` (cause: ${error.cause})` : ''}`);
    throw new ArmBridgeError(502, 'ArmConnectionFailed', 'Could not connect to Azure Resource Manager.');
  }
  const diagnostics = {};
  for (const name of ['x-ms-request-id', 'x-ms-correlation-request-id', 'retry-after']) {
    const value = response.headers.get(name);
    if (value) diagnostics[name] = value;
  }
  let body;
  try { body = JSON.parse(text); }
  catch {
    throw new ArmBridgeError(response.ok ? 502 : response.status, 'InvalidArmResponse',
      'Azure Resource Manager returned a non-JSON response.', diagnostics);
  }
  return { status: response.status, body, headers: diagnostics };
}
