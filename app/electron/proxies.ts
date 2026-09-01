/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ChildProcessWithoutNullStreams, spawn, SpawnOptions } from 'child_process';
import type { BrowserWindow } from 'electron';
import { createServer } from 'net';
import path from 'path';
import { defaultUserPluginsDir } from './plugin-management';

/** Minimum identity shared by every managed cluster proxy target. */
export interface ManagedProxyTarget {
  /** Kubeconfig context that the proxy makes reachable. */
  cluster: string;
}

/** A cluster target accepted by `az connectedk8s proxy`. */
export interface ClusterProxyTarget extends ManagedProxyTarget {
  /** Kubeconfig cluster name. */
  cluster: string;
  /** Azure subscription UUID containing the cluster. */
  subscriptionId: string;
  /** Azure resource group containing the cluster. */
  resourceGroup: string;
}

/** A proxy request carrying the renderer capability. */
export interface StartProxyRequest extends ClusterProxyTarget {
  /** Unpredictable capability injected only into the authorized plugin. */
  capabilitySecret: string;
}

/** Result returned to the authorized renderer plugin. */
export interface StartProxyResult {
  /** Whether the proxy process started or was already running. */
  success: boolean;
  /** Provider endpoint made available after readiness, when needed by the caller. */
  endpoint?: {
    /** Loopback host owned by the shared proxy lifecycle. */
    host: '127.0.0.1';
    /** Allocated local port forwarded to the provider endpoint. */
    port: number;
  };
  /** Stable failure detail when startup was rejected or failed. */
  error?: string;
}

/** Executable, arguments, and fixed options used to launch a proxy. */
export interface ProxySpawnSpec {
  /** Executable passed to Node's process launcher. */
  command: string;
  /** Arguments passed without shell interpolation. */
  args: string[];
  /** Process options required for lifecycle management. */
  options: SpawnOptions;
}

/** Result of validating a provider-specific proxy request. */
export interface ManagedProxyValidation<TTarget extends ManagedProxyTarget> {
  /** Validated target accepted by the provider. */
  target?: TTarget;
  /** Stable error returned when validation rejects the request. */
  error?: string;
}

/** Lifecycle state supplied to a provider-specific readiness strategy. */
export interface ProxyReadinessContext {
  /** Spawned provider process whose readiness must be established. */
  child: ChildProcessWithoutNullStreams;
  /** Loopback port reserved by the shared lifecycle manager. */
  localPort: number;
  /** Maximum time allowed for provider startup. */
  timeoutMs: number;
  /** Adds shared bounded diagnostics to a provider-specific failure. */
  formatError: (message: string) => string;
}

/** Provider-specific behavior hosted by the shared proxy lifecycle. */
export interface ManagedProxyProvider<TTarget extends ManagedProxyTarget> {
  /** Stable provider ID used to isolate target identity across providers. */
  id: string;
  /** Validates and converts an untrusted IPC request into a provider target. */
  validateRequest: (request: unknown) => ManagedProxyValidation<TTarget>;
  /** Returns the provider-specific part of a target's stable identity. */
  targetKey: (target: TTarget) => string;
  /** Builds a shell-free process invocation for the allocated local port. */
  buildSpawnSpec: (target: TTarget, localPort: number) => ProxySpawnSpec;
  /** Waits until the provider has made its local endpoint usable. */
  waitUntilReady: (context: ProxyReadinessContext) => Promise<StartProxyResult>;
}

interface ProxyChildEntry {
  child: ChildProcessWithoutNullStreams;
  group: boolean;
  providerId: string;
  targetKey: string;
  target: ManagedProxyTarget;
  port: number;
  readyResult?: StartProxyResult;
  stderrTail: string;
}

interface ProxyStart {
  result: StartProxyResult;
  entry?: ProxyChildEntry;
}

const proxyChildren = new Set<ProxyChildEntry>();
const startingProxies = new Map<string, Promise<StartProxyResult>>();
let proxyStartQueue: Promise<unknown> = Promise.resolve();
let isShuttingDown = false;

const READY_MATCH_TAIL_CHARS = 256;
const STDERR_TAIL_CHARS = 2_048;
const PROXY_READY_TIMEOUT_MS = 30_000;
const PROXY_TERMINATION_TIMEOUT_MS = 5_000;
const FIRST_PROXY_PORT = 47_011;
const PROXY_PORT_STEP = 2;
const SUBSCRIPTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOURCE_GROUP_PATTERN = /^[A-Za-z0-9_().-]{1,90}$/;
const CLUSTER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$/;

/**
 * Removes user-plugin executable directories from a proxy child environment.
 *
 * @param environment - Shell environment resolved for the proxy process.
 * @param userPluginsDir - Root containing user-installed plugins.
 * @returns A copied environment whose PATH variants exclude the user-plugin root.
 */
export function sanitizeProxyEnvironment(
  environment: NodeJS.ProcessEnv,
  userPluginsDir: string = defaultUserPluginsDir()
): NodeJS.ProcessEnv {
  const sanitizedEnvironment = { ...environment };
  const resolvedUserPluginsDir = path.resolve(userPluginsDir);

  for (const [name, value] of Object.entries(sanitizedEnvironment)) {
    if (name.toLowerCase() !== 'path' || value === undefined) {
      continue;
    }
    sanitizedEnvironment[name] = value
      .split(path.delimiter)
      .filter(entry => {
        if (!entry) {
          return true;
        }
        const relative = path.relative(resolvedUserPluginsDir, path.resolve(entry));
        return (
          relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
        );
      })
      .join(path.delimiter);
  }

  return sanitizedEnvironment;
}

/** Quotes a validated dynamic value for an explicit `cmd.exe` command string. */
function quoteWindowsCommandArg(value: string): string {
  return `"${value}"`;
}

/**
 * Builds the platform-specific proxy process invocation.
 *
 * Windows installs Azure CLI as `az.cmd`, which Node cannot execute directly.
 * The validated target values contain no shell metacharacters, so an explicit
 * `cmd.exe` invocation can execute that entry point without accepting arbitrary
 * shell input.
 *
 * @param target - Validated Azure cluster target.
 * @param port - Local API server port reserved for this proxy target.
 * @param platform - Host platform, overridable for tests.
 * @param commandShell - Windows command interpreter path.
 * @returns Process launch specification.
 */
export function buildProxySpawnSpec(
  target: ClusterProxyTarget,
  port: number,
  platform: NodeJS.Platform = process.platform,
  commandShell: string = process.env.ComSpec || 'cmd.exe'
): ProxySpawnSpec {
  const proxyArgs = [
    'connectedk8s',
    'proxy',
    '--subscription',
    target.subscriptionId,
    '--resource-group',
    target.resourceGroup,
    '--name',
    target.cluster,
    '--port',
    String(port),
  ];
  const options = { detached: true, shell: false, windowsHide: true };

  if (platform === 'win32') {
    const windowsProxyArgs = [
      'connectedk8s',
      'proxy',
      '--subscription',
      quoteWindowsCommandArg(target.subscriptionId),
      '--resource-group',
      quoteWindowsCommandArg(target.resourceGroup),
      '--name',
      quoteWindowsCommandArg(target.cluster),
      '--port',
      quoteWindowsCommandArg(String(port)),
    ];
    return {
      command: commandShell,
      args: ['/d', '/s', '/c', ['az.cmd', ...windowsProxyArgs].join(' ')],
      options: { ...options, windowsVerbatimArguments: true },
    };
  }

  return { command: 'az', args: proxyArgs, options };
}

/** Returns a stable identity for a complete provider and target pair. */
function proxyTargetKey<TTarget extends ManagedProxyTarget>(
  provider: ManagedProxyProvider<TTarget>,
  target: TTarget
): string {
  return JSON.stringify([provider.id, provider.targetKey(target)]);
}

/** Returns a live child associated with the complete provider target. */
function liveChildForTarget<TTarget extends ManagedProxyTarget>(
  provider: ManagedProxyProvider<TTarget>,
  target: TTarget
): ProxyChildEntry | undefined {
  const key = proxyTargetKey(provider, target);
  for (const entry of proxyChildren) {
    if (entry.providerId === provider.id && entry.targetKey === key) {
      return entry;
    }
  }
  return undefined;
}

/** Returns live children using the kubeconfig context that a replacement will rewrite. */
function liveChildrenForCluster(cluster: string): ProxyChildEntry[] {
  return [...proxyChildren].filter(entry => entry.target.cluster === cluster);
}

/** Returns whether a loopback port can be reserved by this process. */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer();
    const onError = () => resolve(false);
    server.once('error', onError);
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.off('error', onError);
      server.close(() => resolve(true));
    });
  });
}

/** Allocates an API/client port pair not used by this module or another process. */
async function nextProxyPort(): Promise<number | undefined> {
  const usedPorts = new Set([...proxyChildren].map(entry => entry.port));
  let port = FIRST_PROXY_PORT;
  while (port <= 65_535) {
    if (
      !usedPorts.has(port) &&
      (await isPortAvailable(port - 1)) &&
      (await isPortAvailable(port))
    ) {
      return port;
    }
    port += PROXY_PORT_STEP;
  }
  return undefined;
}

/** Waits until Azure reports readiness, or returns a stable startup failure. */
function waitForAzureProxyReady({
  child,
  timeoutMs,
  formatError,
}: ProxyReadinessContext): Promise<StartProxyResult> {
  return new Promise(resolve => {
    let settled = false;
    let tail = '';

    function cleanup() {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      child.off('error', onError);
    }

    function finish(result: StartProxyResult) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (result.success) {
        child.stdout.on('data', () => {});
      }
      resolve(result);
    }

    function onData(data: string | Buffer) {
      const combined = tail + data.toString();
      if (/Start sending kubectl requests/i.test(combined)) {
        finish({ success: true });
        return;
      }
      tail = combined.slice(-READY_MATCH_TAIL_CHARS);
    }

    function onExit(code: number | null, signal: NodeJS.Signals | null) {
      const reason = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
      finish({
        success: false,
        error: formatError(`Cluster proxy exited before reporting readiness (${reason}).`),
      });
    }

    function onError(error: Error) {
      finish({ success: false, error: `Cluster proxy failed before readiness: ${error.message}` });
    }

    const timer = setTimeout(
      () =>
        finish({
          success: false,
          error: formatError(`Cluster proxy did not report readiness within ${timeoutMs}ms.`),
        }),
      timeoutMs
    );
    timer.unref?.();
    child.stdout.on('data', onData);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

/** Azure Connected Kubernetes behavior hosted by the shared proxy lifecycle. */
export const azureConnectedK8sProxyProvider: ManagedProxyProvider<ClusterProxyTarget> = {
  id: 'azure-connectedk8s',
  validateRequest: request => {
    const data = (request ?? {}) as Partial<StartProxyRequest>;
    if (!data.cluster || !data.subscriptionId || !data.resourceGroup) {
      return { error: 'Cluster proxy target is incomplete.' };
    }
    if (
      typeof data.cluster !== 'string' ||
      typeof data.subscriptionId !== 'string' ||
      typeof data.resourceGroup !== 'string' ||
      !SUBSCRIPTION_ID_PATTERN.test(data.subscriptionId) ||
      !RESOURCE_GROUP_PATTERN.test(data.resourceGroup) ||
      !CLUSTER_NAME_PATTERN.test(data.cluster)
    ) {
      return { error: 'Cluster proxy target is invalid.' };
    }
    return {
      target: {
        cluster: data.cluster,
        subscriptionId: data.subscriptionId,
        resourceGroup: data.resourceGroup,
      },
    };
  },
  targetKey: target =>
    JSON.stringify([target.subscriptionId, target.resourceGroup, target.cluster]),
  buildSpawnSpec: (target, localPort) => buildProxySpawnSpec(target, localPort),
  waitUntilReady: waitForAzureProxyReady,
};

/** Adds the bounded Azure CLI diagnostic tail to an actionable startup error. */
function startupError(message: string, entry: ProxyChildEntry): string {
  return entry.stderrTail ? `${message}\n${entry.stderrTail}` : message;
}

/** Signals a proxy child and the daemon process tree it owns. */
function signalChildEntry(
  { child, group }: ProxyChildEntry,
  signal: NodeJS.Signals
): Promise<'signaled' | 'gone' | 'failed'> {
  const pid = child.pid;
  if (!pid) {
    return Promise.resolve('gone');
  }
  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F']);
      return new Promise(resolve => {
        const finish = (result: 'signaled' | 'failed') => {
          clearTimeout(timer);
          killer.off('exit', onExit);
          killer.off('error', onError);
          resolve(result);
        };
        const onExit = (code: number | null) => finish(code === 0 ? 'signaled' : 'failed');
        const onError = () => finish('failed');
        const timer = setTimeout(() => finish('failed'), PROXY_TERMINATION_TIMEOUT_MS);
        timer.unref?.();
        killer.once('exit', onExit);
        killer.once('error', onError);
      });
    } else if (group) {
      process.kill(-pid, signal);
      return Promise.resolve('signaled');
    }
    return Promise.resolve(child.kill(signal) ? 'signaled' : 'failed');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return Promise.resolve('gone');
    }
    console.error(`[AKS][main] failed to ${signal} proxy pid ${pid}:`, error);
    return Promise.resolve('failed');
  }
}

/** Observes child termination for a bounded period and supports early cancellation. */
function waitForChildExit(child: ChildProcessWithoutNullStreams): {
  promise: Promise<boolean>;
  cancel: () => void;
} {
  let finish!: (exited: boolean) => void;
  const promise = new Promise<boolean>(resolve => {
    let settled = false;
    finish = exited => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.off('exit', onExit);
      child.off('error', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), PROXY_TERMINATION_TIMEOUT_MS);
    timer.unref?.();
    child.once('exit', onExit);
    child.once('error', onExit);
  });
  return { promise, cancel: () => finish(false) };
}

/** Signals a proxy tree and reports whether its child terminated. */
async function terminateChildEntry(
  entry: ProxyChildEntry,
  releaseOnFailure = false
): Promise<boolean> {
  const { child } = entry;
  if (child.exitCode !== null && child.exitCode !== undefined) {
    proxyChildren.delete(entry);
    return true;
  }

  const exitWait = waitForChildExit(child);
  const signalResult = await signalChildEntry(entry, 'SIGKILL');
  if (signalResult === 'gone') {
    exitWait.cancel();
    proxyChildren.delete(entry);
    return true;
  }
  if (signalResult === 'failed') {
    exitWait.cancel();
    if (releaseOnFailure) {
      proxyChildren.delete(entry);
    }
    return false;
  }

  const exited = await exitWait.promise;
  if (exited || releaseOnFailure) {
    proxyChildren.delete(entry);
  }
  return exited;
}

/** Starts and tracks one validated proxy process. */
async function startProxy<TTarget extends ManagedProxyTarget>(
  provider: ManagedProxyProvider<TTarget>,
  target: TTarget,
  port: number,
  getEnvironment: () => Promise<NodeJS.ProcessEnv>
): Promise<ProxyStart> {
  const spec = provider.buildSpawnSpec(target, port);
  let child: ChildProcessWithoutNullStreams;
  try {
    if (isShuttingDown) {
      return { result: { success: false, error: 'The app is shutting down.' } };
    }
    const env = sanitizeProxyEnvironment(await getEnvironment());
    if (isShuttingDown) {
      return { result: { success: false, error: 'The app is shutting down.' } };
    }
    child = spawn(spec.command, spec.args, {
      ...spec.options,
      env,
    }) as ChildProcessWithoutNullStreams;
  } catch (error) {
    return {
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const entry = {
    child,
    group: !!spec.options.detached,
    providerId: provider.id,
    targetKey: proxyTargetKey(provider, target),
    target,
    port,
    stderrTail: '',
  };
  if (isShuttingDown) {
    void signalChildEntry(entry, 'SIGKILL');
    return { result: { success: false, error: 'The app is shutting down.' } };
  }
  proxyChildren.add(entry);
  child.stderr.on('data', data => {
    entry.stderrTail = (entry.stderrTail + data.toString()).slice(-STDERR_TAIL_CHARS);
  });
  const untrack = () => proxyChildren.delete(entry);
  child.once('exit', untrack);
  child.once('error', untrack);

  if (child.pid) {
    return { result: { success: true }, entry };
  }

  return new Promise(resolve => {
    child.once('spawn', () => resolve({ result: { success: true }, entry }));
    child.once('error', error => resolve({ result: { success: false, error: error.message } }));
  });
}

/**
 * Kills all proxies and their shared daemon when the desktop app quits.
 *
 * @returns A promise that settles after every tracked proxy tree terminates.
 */
export async function killAllProxies(): Promise<void> {
  isShuttingDown = true;
  await Promise.all([...proxyChildren].map(entry => terminateChildEntry(entry, true)));
}

/**
 * Registers a capability-protected IPC handler for one managed proxy provider.
 *
 * Provider adapters own request validation, target identity, process arguments,
 * and readiness. The shared lifecycle owns serialization, ports, replacement,
 * diagnostics, failure cleanup, and application shutdown.
 *
 * @param ipcMain - Electron IPC registrar.
 * @param channel - Provider-specific invocation channel.
 * @param capabilitySecret - Unpredictable capability granted to authorized callers.
 * @param provider - Main-process provider behavior.
 * @param getEnvironment - Resolves the user's shell environment.
 * @returns Nothing.
 */
export function setupManagedProxyHandler<TTarget extends ManagedProxyTarget>(
  ipcMain: Electron.IpcMain,
  channel: string,
  capabilitySecret: string,
  provider: ManagedProxyProvider<TTarget>,
  getEnvironment: () => Promise<NodeJS.ProcessEnv>
): void {
  isShuttingDown = false;

  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (_event, request): Promise<StartProxyResult> => {
    const data = (request ?? {}) as { capabilitySecret?: unknown };
    if (data.capabilitySecret !== capabilitySecret) {
      return { success: false, error: 'Cluster proxy capability is invalid.' };
    }
    const validation = provider.validateRequest(request);
    if (!validation.target) {
      return { success: false, error: validation.error ?? 'Cluster proxy target is invalid.' };
    }
    if (isShuttingDown) {
      return { success: false, error: 'The app is shutting down.' };
    }

    const target = validation.target;
    const targetKey = proxyTargetKey(provider, target);
    const existingStart = startingProxies.get(targetKey);
    if (existingStart) {
      return existingStart;
    }
    const started = proxyStartQueue.then(async () => {
      const sameClusterEntries = liveChildrenForCluster(target.cluster);
      const exactTarget = liveChildForTarget(provider, target);
      const reusableTarget = exactTarget?.readyResult?.success ? exactTarget : undefined;
      for (const entry of sameClusterEntries) {
        if (entry === reusableTarget) {
          continue;
        }
        if (!(await terminateChildEntry(entry))) {
          return {
            success: false,
            error: 'The previous cluster proxy could not be terminated.',
          };
        }
      }
      if (reusableTarget) {
        return reusableTarget.readyResult!;
      }

      const port = await nextProxyPort();
      if (!port) {
        return { success: false, error: 'No local port pair is available for the cluster proxy.' };
      }
      const proxyStart = await startProxy(provider, target, port, getEnvironment);
      if (!proxyStart.result.success || !proxyStart.entry) {
        return proxyStart.result;
      }

      const entry = proxyStart.entry;
      let result: StartProxyResult;
      try {
        result = await provider.waitUntilReady({
          child: entry.child,
          localPort: port,
          timeoutMs: PROXY_READY_TIMEOUT_MS,
          formatError: message => startupError(message, entry),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result = {
          success: false,
          error: startupError(`Cluster proxy readiness failed: ${message}`, entry),
        };
      }
      if (result.success) {
        entry.readyResult = result;
      }
      if (!result.success && proxyChildren.has(entry)) {
        await terminateChildEntry(entry);
      }
      return result;
    });
    startingProxies.set(targetKey, started);
    proxyStartQueue = started.then(() => undefined).catch(() => undefined);

    try {
      return await started;
    } finally {
      startingProxies.delete(targetKey);
    }
  });
}

/**
 * Registers the capability-protected cluster proxy IPC handler.
 *
 * @param mainWindow - Desktop window owning the authorized renderer.
 * @param ipcMain - Electron IPC registrar.
 * @param capabilitySecret - Secret injected only into the AKS Desktop plugin.
 * @param getEnvironment - Resolves the user's shell environment.
 * @returns Nothing.
 */
export function setupProxyHandlers(
  mainWindow: BrowserWindow,
  ipcMain: Electron.IpcMain,
  capabilitySecret: string,
  getEnvironment: () => Promise<NodeJS.ProcessEnv>
): void {
  void mainWindow;
  setupManagedProxyHandler(
    ipcMain,
    'start-cluster-proxy',
    capabilitySecret,
    azureConnectedK8sProxyProvider,
    getEnvironment
  );
}
