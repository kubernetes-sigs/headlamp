/*
 * Copyright 2026 The Kubernetes Authors
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

import { expect, Page, test as base, WebSocketRoute } from '@playwright/test';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { HeadlampPage } from './headlampPage';

const execFileAsync = promisify(execFile);
const cluster = process.env.HEADLAMP_WATCH_E2E_CLUSTER || 'test';
const context = process.env.HEADLAMP_WATCH_E2E_CONTEXT || 'kind-test';

async function kubectl(...args: string[]) {
  return execFileAsync('kubectl', ['--context', context, '--request-timeout=15s', ...args], {
    timeout: 20000,
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

const test = base.extend<{ namespace: string }>({
  namespace: async ({ page }, run) => {
    const namespace = `headlamp-watch-e2e-${randomUUID().slice(0, 8)}`;
    await kubectl('create', 'namespace', namespace);
    try {
      for (const name of ['kept', 'removed']) {
        await kubectl('create', 'configmap', name, '-n', namespace, '--from-literal=initial=one');
      }
      if (process.env.HEADLAMP_SA_TOKEN) {
        await new HeadlampPage(page).setAuthCookie(cluster, process.env.HEADLAMP_SA_TOKEN);
      }
      await run(namespace);
    } finally {
      await kubectl('delete', 'namespace', namespace, '--ignore-not-found', '--wait=false');
    }
  },
});

interface WatchEvent {
  type: string;
  object: {
    metadata?: { name: string; resourceVersion: string };
    code?: number;
  };
}

interface Subscription {
  socket: WebSocketRoute;
  query: string;
  closed: boolean;
  ready: boolean;
}

interface MultiplexerSession {
  route: WebSocketRoute;
  requests: Array<{ requestId?: string; path?: string; query?: string }>;
  statuses: string[];
}

// Forward real backend traffic; only the expiry event is injected.
async function observeWatch(page: Page, path: string, name?: string) {
  const subscriptions: Subscription[] = [];
  const events: WatchEvent[] = [];
  const matches = (query: string) =>
    new URLSearchParams(query).get('fieldSelector') === (name ? `metadata.name=${name}` : null);
  await page.routeWebSocket(
    url => url.pathname.endsWith(path) && matches(url.search),
    socket => {
      const server = socket.connectToServer();
      const subscription = {
        socket,
        query: new URL(socket.url()).search,
        closed: false,
        ready: false,
      };
      subscriptions.push(subscription);
      server.onMessage(message => {
        const event: WatchEvent = JSON.parse(String(message));
        subscription.ready = true;
        events.push(event);
        socket.send(message);
      });
      socket.onClose((code, reason) => {
        subscription.closed = true;
        server.close({ code, reason });
      });
    }
  );
  return {
    subscriptions,
    events,
    active: () => subscriptions.findLast(subscription => !subscription.closed),
    expire() {
      const subscription = subscriptions.findLast(candidate => !candidate.closed);
      if (!subscription) throw new Error('No active legacy watch to expire');
      const data = JSON.stringify({
        type: 'ERROR',
        object: { kind: 'Status', apiVersion: 'v1', code: 410 },
      });
      subscription.socket.send(data);
    },
  };
}

async function observeMultiplexer(page: Page) {
  const sessions: MultiplexerSession[] = [];
  await page.routeWebSocket(
    url => url.pathname.endsWith('/wsMultiplexer'),
    socket => {
      const server = socket.connectToServer();
      const session: MultiplexerSession = {
        route: server,
        requests: [],
        statuses: [],
      };
      sessions.push(session);
      socket.onMessage(message => {
        const request = JSON.parse(String(message));
        if (request.type === 'REQUEST') {
          session.requests.push(request);
        }
        server.send(message);
      });
      server.onMessage(message => {
        const frame = JSON.parse(String(message));
        if (frame.type === 'STATUS') {
          session.statuses.push(frame.data);
        }
        socket.send(message);
      });
    }
  );
  return sessions;
}

test.describe('real-cluster watch recovery', () => {
  test.skip(
    process.env.HEADLAMP_WATCH_E2E !== 'true',
    'Set HEADLAMP_WATCH_E2E=true to mutate an explicitly selected test cluster'
  );
  test.setTimeout(45000);

  test('authenticated v2 browser sessions isolate aliases and reconnect across tabs', async ({
    page,
    namespace,
  }) => {
    test.skip(
      !process.env.HEADLAMP_SA_TOKEN,
      'Set HEADLAMP_SA_TOKEN to a token with ConfigMap LIST/WATCH permission'
    );
    const listSessions = await observeMultiplexer(page);
    const path = `/api/v1/namespaces/${namespace}/configmaps`;
    await page.context().clearCookies();
    await page.goto(`/c/${cluster}/configmaps?namespace=${namespace}`);
    await new HeadlampPage(page).authenticate(process.env.HEADLAMP_SA_TOKEN);
    const cookies = await page.context().cookies();
    expect(
      cookies.some(
        cookie =>
          cookie.name.startsWith('headlamp-multiplexer-auth-') &&
          cookie.path.endsWith('/wsMultiplexer') &&
          cookie.httpOnly
      )
    ).toBe(true);
    await expect(page.getByRole('link', { name: 'kept', exact: true })).toBeVisible();
    await expect
      .poll(() =>
        listSessions.flatMap(session => session.requests).find(request => request.path === path)
      )
      .toMatchObject({ requestId: expect.any(String) });

    const peer = await page.context().newPage();
    const detailSessions = await observeMultiplexer(peer);
    await peer.goto(`/c/${cluster}/configmaps/${namespace}/kept`);
    await expect(peer.getByRole('heading', { name: 'ConfigMap: kept' })).toBeVisible();
    await expect
      .poll(() =>
        detailSessions
          .flatMap(session => session.requests)
          .find(request => {
            const params = new URLSearchParams(request.query);
            return request.path === path && params.get('fieldSelector') === 'metadata.name=kept';
          })
      )
      .toMatchObject({ requestId: expect.any(String) });

    await peer.close();
    await kubectl('create', 'configmap', 'surviving-tab', '-n', namespace);
    await expect(page.getByRole('link', { name: 'surviving-tab', exact: true })).toBeVisible();

    const beforeReconnect = listSessions.length;
    const active = listSessions.at(-1)!;
    active.route.close({
      code: 1001,
      reason: 'E2E force authenticated v2 reconnect',
    });
    await expect.poll(() => listSessions.length).toBeGreaterThan(beforeReconnect);
    await expect
      .poll(() =>
        listSessions
          .at(-1)!
          .requests.some(request => request.path === path && request.requestId !== undefined)
      )
      .toBe(true);

    await kubectl('create', 'configmap', 'after-v2-reconnect', '-n', namespace);
    await expect(page.getByRole('link', { name: 'after-v2-reconnect', exact: true })).toBeVisible();
  });

  test('expired lists retain usable rows until a fresh snapshot resumes watching', async ({
    page,
    namespace,
  }) => {
    const path = `/api/v1/namespaces/${namespace}/configmaps`;
    const watch = await observeWatch(page, path);
    const releaseRecovery = deferred();
    let blockRecovery = false;
    let recoveryPending = false;
    let snapshotVersion = '';
    await page.route(
      url => url.pathname === `/clusters/${cluster}${path}` && !url.searchParams.has('watch'),
      async route => {
        if (blockRecovery) {
          recoveryPending = true;
          await releaseRecovery.promise;
          await route.fulfill({
            status: 403,
            json: {
              kind: 'Status',
              code: 403,
              message: 'E2E snapshot temporarily forbidden',
            },
          });
        } else {
          const response = await route.fetch();
          snapshotVersion = (await response.json()).metadata.resourceVersion;
          await route.fulfill({ response });
        }
      }
    );
    const row = (name: string) => page.getByRole('link', { name, exact: true });
    await page.clock.install();
    await page.goto(`/c/${cluster}/configmaps?namespace=${namespace}`);
    await expect(row('kept')).toBeVisible();
    await expect
      .poll(() => watch.active() !== undefined, {
        message: 'Build the frontend with REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER=false',
      })
      .toBe(true);
    await kubectl('create', 'configmap', 'live', '-n', namespace);
    await expect(row('live')).toBeVisible();
    expect(watch.active()?.ready).toBe(true);

    blockRecovery = true;
    watch.expire();
    try {
      await expect.poll(() => recoveryPending).toBe(true);
      const subscriptionsAtExpiry = watch.subscriptions.length;
      await page.clock.fastForward(10000);
      expect(watch.subscriptions).toHaveLength(subscriptionsAtExpiry);
      await expect(row('kept')).toBeVisible();
      await expect(row('removed')).toBeVisible();
      await kubectl('delete', 'configmap', 'removed', '-n', namespace);
      await kubectl('create', 'configmap', 'gap', '-n', namespace);

      releaseRecovery.resolve();
      await expect(page.getByRole('alert').first()).toBeVisible();
      await expect(row('removed')).toBeVisible();
      await expect(row('gap')).toBeHidden();
      await page.clock.fastForward(60000);
      expect(watch.subscriptions).toHaveLength(subscriptionsAtExpiry);

      blockRecovery = false;
      await page.context().setOffline(true);
      await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
      await page.context().setOffline(false);
      await expect(row('gap')).toBeVisible();
      await expect(row('removed')).toBeHidden();
      await expect.poll(() => watch.active() !== undefined).toBe(true);
      expect(new URLSearchParams(watch.active()!.query).get('resourceVersion')).toBe(
        snapshotVersion
      );
      await expect(page.getByRole('alert')).toHaveCount(0);
      await kubectl('create', 'configmap', 'resumed', '-n', namespace);
      await expect(row('resumed')).toBeVisible();
      expect(watch.active()?.ready).toBe(true);
    } finally {
      releaseRecovery.resolve();
    }
  });

  test('late detail GETs cannot restore deletion; recreation and another tab remain live', async ({
    page,
    namespace,
  }) => {
    const path = `/api/v1/namespaces/${namespace}/configmaps`;
    const detailURL = `/c/${cluster}/configmaps/${namespace}/kept`;
    const watch = await observeWatch(page, path, 'kept');
    const releaseRead = deferred();
    let held = false;
    await page.route(`**/clusters/${cluster}${path}/kept`, async route => {
      const response = await route.fetch();
      if (watch.subscriptions.length && !held) {
        held = true;
        await releaseRead.promise;
        await route.fulfill({ response });
      } else {
        await route.fulfill({ response });
      }
    });
    try {
      await page.goto(detailURL);
      await expect(page.getByRole('heading', { name: 'ConfigMap: kept' })).toBeVisible();
      await expect.poll(() => held).toBe(true);
      await expect.poll(() => watch.events.some(event => event.type === 'ADDED')).toBe(true);
      await kubectl('delete', 'configmap', 'kept', '-n', namespace);
      await expect(page.getByText(/Not found/i).first()).toBeVisible();
      const lateRead = page.waitForResponse(
        response => new URL(response.url()).pathname === `/clusters/${cluster}${path}/kept`
      );
      releaseRead.resolve();
      await (await lateRead).finished();
      await page.evaluate(
        () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      await expect(page.getByRole('heading', { name: 'ConfigMap: kept' })).toBeHidden();
      await kubectl('create', 'configmap', 'kept', '-n', namespace, '--from-literal=recreated=yes');
      await expect(page.getByText('recreated', { exact: true })).toBeVisible();

      const peer = await page.context().newPage();
      await peer.goto(detailURL);
      await expect(peer.getByText('recreated', { exact: true })).toBeVisible();
      await page.close();
      await kubectl(
        'patch',
        'configmap',
        'kept',
        '-n',
        namespace,
        '--type=merge',
        '-p',
        JSON.stringify({ data: { 'surviving-tab': 'live' } })
      );
      await expect(peer.getByText('surviving-tab', { exact: true })).toBeVisible();
      await peer.close();
    } finally {
      releaseRead.resolve();
    }
  });

  test('LIST-allowed WATCH-denied keeps rows visible and exhausts a finite recovery budget', async ({
    page,
    namespace,
  }) => {
    await kubectl('create', 'serviceaccount', 'reader', '-n', namespace);
    await kubectl(
      'create',
      'role',
      'reader',
      '-n',
      namespace,
      '--verb=get,list',
      '--resource=configmaps'
    );
    await kubectl(
      'create',
      'rolebinding',
      'reader',
      '-n',
      namespace,
      '--role=reader',
      `--serviceaccount=${namespace}:reader`
    );
    const { stdout: token } = await kubectl(
      'create',
      'token',
      'reader',
      '-n',
      namespace,
      '--duration=10m'
    );
    await page.context().clearCookies();
    await new HeadlampPage(page).setAuthCookie(cluster, token.trim());
    const path = `/clusters/${cluster}/api/v1/namespaces/${namespace}/configmaps`;
    const attempts: string[] = [];
    const failures: string[] = [];
    const snapshots: string[] = [];
    page.on('websocket', socket => {
      if (new URL(socket.url()).pathname === path) {
        attempts.push(socket.url());
        socket.on('socketerror', error => failures.push(error));
      }
    });
    page.on('response', response => {
      if (new URL(response.url()).pathname === path && response.status() === 200) {
        snapshots.push(response.url());
      }
    });
    await page.clock.install();
    await page.goto(`/c/${cluster}/configmaps?namespace=${namespace}`);
    await expect(page.getByRole('link', { name: 'kept', exact: true })).toBeVisible();
    const exhausted = page.getByRole('alert').filter({ hasText: /watch recovery exhausted/i });
    for (let step = 0; step < 20 && !(await exhausted.isVisible()); step++) {
      await expect.poll(() => failures.length).toBe(attempts.length);
      const before = attempts.length;
      await page.clock.fastForward(8000);
      await expect
        .poll(async () => attempts.length > before || (await exhausted.isVisible()))
        .toBe(true);
    }
    await expect(exhausted).toBeVisible();
    expect(snapshots).toHaveLength(4);
    await expect(page.getByRole('link', { name: 'kept', exact: true })).toBeVisible();
    const stopped = { attempts: attempts.length, snapshots: snapshots.length };
    await page.clock.fastForward(120000);
    expect({ attempts: attempts.length, snapshots: snapshots.length }).toEqual(stopped);
  });
});
