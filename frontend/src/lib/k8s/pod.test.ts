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

import { Base64 } from 'js-base64';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { post } from './api/v1/clusterRequests';
import { stream } from './api/v1/streamingApi';
import Pod, { LogOptions } from './pod';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

// Module-level capture array for addEphemeralContainer patch tests
const capturedPatchBodies: any[] = [];

vi.mock('./api/v1/clusterRequests', async importOriginal => {
  const actual = await importOriginal<typeof import('./api/v1/clusterRequests')>();
  return {
    ...actual,
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn(async (_url: string, body: any) => {
      capturedPatchBodies.push(body);
    }),
  };
});

vi.mock('./api/v1/streamingApi', async importOriginal => {
  const actual = await importOriginal<typeof import('./api/v1/streamingApi')>();
  return { ...actual, stream: vi.fn(() => ({ cancel: vi.fn(), failed: () => false })) };
});

describe('Pod class', () => {
  const mockPodData = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: 'test-pod',
      namespace: 'default',
      resourceVersion: '123',
    },
    spec: {
      containers: [{ name: 'container-1' }, { name: 'container-2' }],
    },
    status: {
      phase: 'Running',
      containerStatuses: [
        {
          name: 'container-1',
          ready: false,
          restartCount: 0,
          state: { terminated: { reason: 'Completed', exitCode: 0 } },
        },
        {
          name: 'container-2',
          ready: true,
          restartCount: 0,
          state: { running: { startedAt: '2020-01-01T00:00:00Z' } },
        },
      ],
      conditions: [
        {
          type: 'Ready',
          status: 'True',
        },
      ],
    },
  };

  it('correctly identifies a healthy pod with lowercase condition status in edge cases', () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    const pod = new Pod(data);
    const status = pod.getDetailedStatus();
    // hasRunning is true, reason became Completed from container-1, so it checks Ready condition
    expect(status.reason).toBe('Running');
  });

  it('falls back to NotReady if Ready condition is False in edge cases', () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    data.status.conditions[0].status = 'False';
    const pod = new Pod(data);
    const status = pod.getDetailedStatus();
    expect(status.reason).toBe('NotReady');
  });

  it('handles missing conditions gracefully', () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    delete data.status.conditions;
    const pod = new Pod(data);
    expect(() => pod.getDetailedStatus()).not.toThrow();
  });

  it('does not throw when spec and status are missing', () => {
    const dataMissingBoth = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: 'test-pod-missing-fields',
        namespace: 'default',
        resourceVersion: '123',
      },
    };
    const pod = new Pod(dataMissingBoth as any);
    expect(() => pod.getDetailedStatus()).not.toThrow();
  });

  it("sends the eviction request to the pod's own cluster", () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    const pod = new Pod(data, 'other-cluster');

    pod.evict();

    expect(post).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ cluster: 'other-cluster' })
    );
  });

  it('returns ExitCode when a container terminated with empty reason and no signal', () => {
    const data = JSON.parse(JSON.stringify(mockPodData));
    data.status.containerStatuses = [
      {
        name: 'container-1',
        ready: false,
        restartCount: 0,
        state: { terminated: { exitCode: 1, reason: '' } },
      },
    ];
    const pod = new Pod(data);
    const status = pod.getDetailedStatus();
    expect(status.reason).toBe('ExitCode:1');
  });

  describe('a finished container next to a failed one', () => {
    function makePod(containerStatuses: any[], conditions: any[] = []) {
      const data = JSON.parse(JSON.stringify(mockPodData));
      data.spec.containers = containerStatuses.map(c => ({ name: c.name }));
      data.status.phase = 'Failed';
      data.status.containerStatuses = containerStatuses;
      data.status.conditions = conditions;
      return new Pod(data);
    }

    const completed = {
      name: 'main',
      ready: false,
      restartCount: 0,
      state: { terminated: { reason: 'Completed', exitCode: 0 } },
    };
    const failed = {
      name: 'uploader',
      ready: false,
      restartCount: 0,
      state: { terminated: { reason: 'Error', exitCode: 1, message: 'upload failed' } },
    };

    it('shows the failed container, not Completed', () => {
      const status = makePod([completed, failed]).getDetailedStatus();
      expect(status.reason).toBe('Error');
      expect(status.message).toBe('upload failed');
    });

    it('uses ExitCode when the failed container has no reason', () => {
      const noReason = { ...failed, state: { terminated: { exitCode: 2 } } };
      expect(makePod([completed, noReason]).getDetailedStatus().reason).toBe('ExitCode:2');
    });

    it('shows Completed when every container exited with 0', () => {
      const other = { ...completed, name: 'other' };
      expect(makePod([completed, other]).getDetailedStatus().reason).toBe('Completed');
    });

    it('prefers the failed container over NotReady when the running one is not ready', () => {
      const running = {
        name: 'web',
        ready: true,
        restartCount: 0,
        state: { running: { startedAt: '2020-01-01T00:00:00Z' } },
      };
      const status = makePod(
        [completed, running, failed],
        [{ type: 'Ready', status: 'False' }]
      ).getDetailedStatus();
      expect(status.reason).toBe('Error');
    });
  });

  describe('getHealth', () => {
    const makePod = (status: any, metadata: any = {}) =>
      new Pod({
        ...mockPodData,
        metadata: { ...mockPodData.metadata, ...metadata },
        status,
      } as any);

    it('classifies a Running and Ready pod as healthy', () => {
      const pod = makePod({
        phase: 'Running',
        conditions: [{ type: 'Ready', status: 'True' }],
      });
      expect(pod.getHealth()).toBe('healthy');
    });

    it('classifies a Running but NotReady pod as degraded', () => {
      const pod = makePod({
        phase: 'Running',
        conditions: [{ type: 'Ready', status: 'False' }],
      });
      expect(pod.getHealth()).toBe('degraded');
    });

    it('classifies a Pending pod as transitional', () => {
      const pod = makePod({ phase: 'Pending' });
      expect(pod.getHealth()).toBe('transitional');
    });

    it('classifies a terminating (deletionTimestamp) pod as transitional', () => {
      const pod = makePod({ phase: 'Running' }, { deletionTimestamp: '2020-01-01T00:00:00Z' });
      expect(pod.getHealth()).toBe('transitional');
    });

    it('classifies a lost node (NodeLost) pod as failed', () => {
      const pod = makePod(
        { phase: 'Running', reason: 'NodeLost' },
        { deletionTimestamp: '2020-01-01T00:00:00Z' }
      );
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a pod with a CrashLoopBackOff container as failed', () => {
      const pod = makePod({
        phase: 'Running',
        containerStatuses: [{ name: 'c', state: { waiting: { reason: 'CrashLoopBackOff' } } }],
      });
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a pod with an ImagePullBackOff container as failed', () => {
      const pod = makePod({
        phase: 'Pending',
        containerStatuses: [{ name: 'c', state: { waiting: { reason: 'ImagePullBackOff' } } }],
      });
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a terminated container with a non-zero exitCode and empty reason as failed', () => {
      const pod = makePod({
        phase: 'Pending',
        initContainerStatuses: [
          { name: 'init', state: { terminated: { exitCode: 1, reason: '' } } },
        ],
      });
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a Failed pod as failed', () => {
      const pod = makePod({ phase: 'Failed' });
      expect(pod.getHealth()).toBe('failed');
    });

    it('classifies a Succeeded pod as healthy', () => {
      const pod = makePod({ phase: 'Succeeded' });
      expect(pod.getHealth()).toBe('healthy');
    });
  });
  describe('getLogs', () => {
    const chunk =
      '{"level":"info","message":"test0"}\n' +
      '{"level":"warn","message":"test1"}\n' +
      '{"level":"error","message":"test2"}\n';

    function startLogStream(logsOptions: object = {}) {
      let onResults: (item: string) => void = () => {};
      let onFail: () => void = () => {};
      const cancelStream = vi.fn();

      vi.mocked(stream).mockImplementation(((
        _url: string,
        cb: (item: string) => void,
        args: { failCb?: () => void }
      ) => {
        onResults = cb;
        onFail = args.failCb ?? (() => {});
        return { cancel: cancelStream, getSocket: () => null };
      }) as any);

      const pod = new Pod(JSON.parse(JSON.stringify(mockPodData)));
      const updates: string[][] = [];
      const cancel = pod.getLogs('container-1', ({ logs }) => updates.push([...logs]), {
        follow: true,
        ...logsOptions,
      });

      return {
        send: (text: string) => onResults(Base64.encode(text)),
        endStream: () => onFail(),
        cancel,
        cancelStream,
        last: () => updates[updates.length - 1],
        updateCount: () => updates.length,
      };
    }

    it('gives each line of a chunk its own entry', () => {
      const logStream = startLogStream();
      logStream.send(chunk);

      expect(logStream.last()).toEqual([
        '{"level":"info","message":"test0"}\n',
        '{"level":"warn","message":"test1"}\n',
        '{"level":"error","message":"test2"}\n',
      ]);
    });

    it('rejoins the lines to the original text', () => {
      const logStream = startLogStream();
      logStream.send(chunk);

      expect(logStream.last().join('')).toBe(chunk);
    });

    it('waits for the rest of a line split across two chunks', () => {
      const logStream = startLogStream();

      logStream.send('{"level":"error","mess');
      expect(logStream.last()).toEqual([]);

      logStream.send('age":"split"}\n');
      expect(logStream.last()).toEqual(['{"level":"error","message":"split"}\n']);
    });

    it('keeps a fragmented pending line when later chunks contain several lines', () => {
      const logStream = startLogStream();

      for (let index = 0; index < 1000; index++) {
        logStream.send('x');
      }
      logStream.send(' first\nsecond\nthird');
      logStream.endStream();

      expect(logStream.last()).toEqual([`${'x'.repeat(1000)} first\n`, 'second\n', 'third']);
    });

    it('emits a trailing line without a newline once the stream ends', () => {
      const logStream = startLogStream();

      logStream.send('{"level":"error","message":"last"}');
      expect(logStream.last()).toEqual([]);

      logStream.endStream();
      expect(logStream.last()).toEqual(['{"level":"error","message":"last"}']);
    });

    it('does not report logs while being cancelled', () => {
      const logStream = startLogStream();

      logStream.send('{"level":"error","message":"last"}');
      const updatesBeforeCancel = logStream.updateCount();

      logStream.cancel();
      expect(logStream.updateCount()).toBe(updatesBeforeCancel);
      expect(logStream.cancelStream).toHaveBeenCalled();
    });

    it('prettifies every line of a chunk, not only the first', () => {
      const logStream = startLogStream({ prettifyLogs: true });
      logStream.send(chunk);

      const output = logStream.last().join('');
      expect(output).toContain('test0');
      expect(output).toContain('test1');
      expect(output).toContain('test2');
    });
  });
});

describe('Pod.addEphemeralContainer targetContainerName', () => {
  beforeEach(() => {
    capturedPatchBodies.length = 0;
  });

  it('includes targetContainerName in PATCH body when provided', async () => {
    const pod = new Pod({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'test-pod', namespace: 'default', uid: 'uid-1' },
      spec: { containers: [{ name: 'main', image: 'nginx' }], ephemeralContainers: [] },
      status: {},
    } as any);

    await pod.addEphemeralContainer('headlamp-debug-1', 'busybox', ['sh'], 'main');

    const ephemeralContainers = capturedPatchBodies[0]?.spec?.ephemeralContainers;
    expect(ephemeralContainers).toBeDefined();
    expect(ephemeralContainers[0].targetContainerName).toBe('main');
  });

  it('omits targetContainerName from PATCH body when not provided', async () => {
    const pod = new Pod({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'test-pod', namespace: 'default', uid: 'uid-2' },
      spec: { containers: [{ name: 'main', image: 'nginx' }], ephemeralContainers: [] },
      status: {},
    } as any);

    await pod.addEphemeralContainer('headlamp-debug-2', 'busybox', ['sh']);

    const ephemeralContainers = capturedPatchBodies[0]?.spec?.ephemeralContainers;
    expect(ephemeralContainers).toBeDefined();
    expect(ephemeralContainers[0].targetContainerName).toBeUndefined();
  });
});

describe('Pod.getLogs sinceSeconds', () => {
  const getStreamUrl = (logOptions: LogOptions) => {
    vi.mocked(stream).mockClear();
    new Pod({
      kind: 'Pod',
      metadata: { name: 'test-pod', namespace: 'default', uid: 'uid-1' },
    } as any).getLogs('container-1', () => {}, logOptions);
    return vi.mocked(stream).mock.calls[0][0];
  };

  it('does not add sinceSeconds by default', () => {
    expect(getStreamUrl({})).not.toContain('sinceSeconds');
  });

  it('does not add sinceSeconds when it is zero', () => {
    expect(getStreamUrl({ sinceSeconds: 0 })).not.toContain('sinceSeconds');
  });

  it('adds sinceSeconds to the log URL', () => {
    expect(getStreamUrl({ sinceSeconds: 900 })).toContain('&sinceSeconds=900');
  });

  it('combines sinceSeconds with tailLines, previous and follow', () => {
    const url = getStreamUrl({
      sinceSeconds: 300,
      tailLines: 1000,
      showPrevious: true,
      follow: false,
    });
    expect(url).toContain('previous=true');
    expect(url).toContain('follow=false');
    expect(url).toContain('&tailLines=1000');
    expect(url).toContain('&sinceSeconds=300');
  });
});

describe('Pod.resourceClaims', () => {
  const makePod = (spec: Record<string, unknown> = {}, status: Record<string, unknown> = {}) =>
    new Pod({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'trainer', namespace: 'default', uid: 'pod-uid', creationTimestamp: '' },
      spec: { containers: [], nodeName: '', ...spec },
      status: { conditions: [], containerStatuses: [], phase: 'Running', startTime: '', ...status },
    } as any);

  const using = (name: string, ...claims: string[]) => ({
    name,
    image: 'trainer',
    imagePullPolicy: 'IfNotPresent',
    resources: { claims: claims.map(claim => ({ name: claim })) },
  });

  it('holds no claims when it names none', () => {
    expect(makePod().resourceClaims).toEqual([]);
  });

  it('resolves a claim it names directly, with the containers that use it', () => {
    const pod = makePod({
      resourceClaims: [{ name: 'gpu', resourceClaimName: 'shared-gpu' }],
      initContainers: [using('setup', 'gpu')],
      containers: [using('train', 'gpu'), using('sidecar')],
    });

    expect(pod.resourceClaims).toEqual([
      {
        source: 'claim',
        podClaimName: 'gpu',
        claimName: 'shared-gpu',
        containers: ['setup', 'train'],
      },
    ]);
  });

  it('reads the name of a claim generated from a template from the status', () => {
    const pod = makePod(
      {
        resourceClaims: [{ name: 'gpu', resourceClaimTemplateName: 'single-gpu' }],
        containers: [using('train', 'gpu')],
      },
      { resourceClaimStatuses: [{ name: 'gpu', resourceClaimName: 'trainer-gpu-x7k2q' }] }
    );

    expect(pod.resourceClaims).toEqual([
      {
        source: 'template',
        podClaimName: 'gpu',
        claimName: 'trainer-gpu-x7k2q',
        templateName: 'single-gpu',
        containers: ['train'],
      },
    ]);
  });

  it('leaves a template claim unresolved until it has been generated', () => {
    const pod = makePod({
      resourceClaims: [{ name: 'gpu', resourceClaimTemplateName: 'single-gpu' }],
    });

    expect(pod.resourceClaims[0].claimName).toBeUndefined();
  });

  it('finds the claim made for extended resources, which the spec does not name', () => {
    const pod = makePod(
      { containers: [using('train')] },
      {
        extendedResourceClaimStatus: {
          resourceClaimName: 'trainer-extended-resources-p26fr',
          requestMappings: [
            { containerName: 'train', resourceName: 'example.com/gpu', requestName: 'container-0' },
            { containerName: 'train', resourceName: 'example.com/nic', requestName: 'container-1' },
          ],
        },
      }
    );

    expect(pod.resourceClaims).toEqual([
      {
        source: 'extendedResource',
        claimName: 'trainer-extended-resources-p26fr',
        containers: ['train'],
      },
    ]);
  });
});

describe('Pod.getLogs streaming and formatting', () => {
  const makePod = () =>
    new Pod({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'log-pod', namespace: 'default', uid: 'uid-log' },
      spec: { containers: [{ name: 'app' }], nodeName: 'n1' },
      status: { conditions: [], containerStatuses: [], phase: 'Running', startTime: '' },
    } as any);

  beforeEach(() => {
    vi.mocked(stream).mockClear();
  });

  it('supports deprecated 4-argument getLogs signature', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onLogs = vi.fn();
    makePod().getLogs('app', 50, true, onLogs);

    expect(warnSpy).toHaveBeenCalled();
    const url = vi.mocked(stream).mock.calls[0][0];
    expect(url).toContain('tailLines=50');
    expect(url).toContain('previous=true');
    warnSpy.mockRestore();
  });

  it('omits tailLines when tailLines is -1', () => {
    makePod().getLogs('app', () => {}, { tailLines: -1 });
    expect(vi.mocked(stream).mock.calls[0][0]).not.toContain('tailLines=');
  });

  it('decodes, prettifies, unescapes JSON logs, and resets on reconnect', () => {
    const onLogs = vi.fn();
    makePod().getLogs('app', onLogs, {
      prettifyLogs: true,
      formatJsonValues: true,
      showTimestamps: true,
    });

    const [, onResults, opts] = vi.mocked(stream).mock.calls[0];
    // An empty item is ignored
    onResults('');
    expect(onLogs).not.toHaveBeenCalled();

    // Non-JSON log line
    onResults(btoa('plain message\n'));
    expect(onLogs).toHaveBeenLastCalledWith({ logs: ['plain message\n'], hasJsonLogs: false });

    // Timestamped JSON log with escaped characters
    const jsonLine = '2025-01-01T00:00:00Z {"msg":"line1\\nline2\\r\\n\\t\\"q\\"\\\\b"}';
    onResults(btoa(jsonLine + '\n'));
    const lastCall = onLogs.mock.calls.at(-1)?.[0];
    expect(lastCall.hasJsonLogs).toBe(true);
    expect(lastCall.logs[1]).toContain('2025-01-01T00:00:00Z\n');
    expect(lastCall.logs[1]).toContain('line1\nline2');

    // Invalid JSON falls back to original line
    onResults(btoa('{not-valid-json}\n'));
    expect(onLogs.mock.calls.at(-1)?.[0].logs[2]).toBe('{not-valid-json}\n');

    // connectCb resets logs and hasJsonLogs
    opts.connectCb?.();
    onResults(btoa('after reconnect\n'));
    expect(onLogs.mock.calls.at(-1)?.[0]).toEqual({
      logs: ['after reconnect\n'],
      hasJsonLogs: false,
    });
  });

  it('prettifies JSON logs without timestamps or formatJsonValues', () => {
    const onLogs = vi.fn();
    makePod().getLogs('app', onLogs, {
      prettifyLogs: true,
      formatJsonValues: false,
      showTimestamps: false,
    });
    const [, onResults] = vi.mocked(stream).mock.calls[0];
    onResults(btoa('{"a":1}\n'));
    expect(onLogs).toHaveBeenLastCalledWith({
      logs: ['{\n  "a": 1\n}\n'],
      hasJsonLogs: true,
    });
  });

  it('calls onReconnectStop once on failCb when follow is true', () => {
    const onReconnectStop = vi.fn();
    makePod().getLogs('app', () => {}, { follow: true, onReconnectStop });
    const opts = vi.mocked(stream).mock.calls[0][2];
    opts.failCb?.();
    opts.failCb?.();
    expect(onReconnectStop).toHaveBeenCalledTimes(1);
  });
});

describe('Pod.attach, Pod.exec, and Pod.getBaseObject', () => {
  const makePod = () =>
    new Pod({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'exec-pod', namespace: 'ns1', uid: 'uid-exec' },
      spec: { containers: [{ name: 'app' }], nodeName: 'n1' },
      status: { conditions: [], containerStatuses: [], phase: 'Running', startTime: '' },
    } as any);

  beforeEach(() => {
    vi.mocked(stream).mockClear();
  });

  it('calls stream with attach URL and channel protocols', () => {
    const cb = vi.fn();
    makePod().attach('app', cb);
    const [url, handler, opts] = vi.mocked(stream).mock.calls[0];
    expect(url).toBe(
      '/api/v1/namespaces/ns1/pods/exec-pod/attach?container=app&stdin=true&stderr=true&stdout=true&tty=true'
    );
    expect(handler).toBe(cb);
    expect(opts.additionalProtocols).toContain('v4.channel.k8s.io');
    expect(opts.isJson).toBe(false);
  });

  it('calls stream with exec URL using default and custom options', () => {
    const cb = vi.fn();
    makePod().exec('app', cb);
    expect(vi.mocked(stream).mock.calls[0][0]).toBe(
      '/api/v1/namespaces/ns1/pods/exec-pod/exec?container=app&command=sh&stdin=1&stderr=1&stdout=1&tty=1'
    );

    vi.mocked(stream).mockClear();
    makePod().exec('app', cb, {
      command: ['ls', '-la'],
      stdin: false,
      stderr: false,
      stdout: false,
      tty: false,
    });
    expect(vi.mocked(stream).mock.calls[0][0]).toBe(
      '/api/v1/namespaces/ns1/pods/exec-pod/exec?container=app&command=ls&command=-la&stdin=0&stderr=0&stdout=0&tty=0'
    );
  });

  it('returns default base object', () => {
    const base = Pod.getBaseObject();
    expect(base.metadata.labels).toEqual({ app: 'headlamp' });
    expect(base.spec.containers[0].ports).toEqual([{ containerPort: 80 }]);
  });
});

describe('Pod.getDetailedStatus init containers, signals, restarts, and cache', () => {
  const makePod = (overrides: Record<string, any> = {}) =>
    new Pod({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'p', namespace: 'default', resourceVersion: 'rv1', ...overrides.metadata },
      spec: { containers: [{ name: 'c1' }], nodeName: 'n1', ...overrides.spec },
      status: {
        phase: 'Pending',
        conditions: [],
        containerStatuses: [],
        startTime: '',
        ...overrides.status,
      },
    } as any);

  it('caches detailed status for identical resourceVersion', () => {
    const pod = makePod();
    const first = pod.getDetailedStatus();
    const second = pod.getDetailedStatus();
    expect(second).toBe(first);
  });

  it('handles init container terminated with signal, exitCode, reason, waiting, and default', () => {
    expect(
      makePod({
        spec: { initContainers: [{ name: 'i1' }], containers: [{ name: 'c1' }] },
        status: {
          initContainerStatuses: [
            {
              name: 'i1',
              restartCount: 1,
              state: { terminated: { exitCode: 1, signal: 9, reason: '' } },
              lastState: { terminated: { finishedAt: '2025-01-01T00:00:00Z' } },
            },
          ],
        },
      }).getDetailedStatus().reason
    ).toBe('Init:Signal:9');

    expect(
      makePod({
        spec: { initContainers: [{ name: 'i1' }], containers: [{ name: 'c1' }] },
        status: {
          initContainerStatuses: [
            {
              name: 'i1',
              restartCount: 0,
              state: { terminated: { exitCode: 2, signal: 0, reason: '' } },
            },
          ],
        },
      }).getDetailedStatus().reason
    ).toBe('Init:ExitCode:2');

    expect(
      makePod({
        spec: { initContainers: [{ name: 'i1' }], containers: [{ name: 'c1' }] },
        status: {
          initContainerStatuses: [
            {
              name: 'i1',
              restartCount: 0,
              state: { terminated: { exitCode: 1, reason: 'OOMKilled', message: 'oom' } },
            },
          ],
        },
      }).getDetailedStatus()
    ).toMatchObject({ reason: 'Init:OOMKilled', message: 'oom' });

    expect(
      makePod({
        spec: { initContainers: [{ name: 'i1' }], containers: [{ name: 'c1' }] },
        status: {
          initContainerStatuses: [
            {
              name: 'i1',
              restartCount: 0,
              state: { waiting: { reason: 'CrashLoopBackOff', message: 'loop' } },
            },
          ],
        },
      }).getDetailedStatus()
    ).toMatchObject({ reason: 'Init:CrashLoopBackOff', message: 'loop' });

    expect(
      makePod({
        spec: { initContainers: [{ name: 'i1' }], containers: [{ name: 'c1' }] },
        status: {
          initContainerStatuses: [
            {
              name: 'i1',
              restartCount: 0,
              state: { waiting: { reason: 'PodInitializing' } },
            },
          ],
        },
      }).getDetailedStatus().reason
    ).toBe('Init:0/1');
  });

  it('handles restartable init containers and Initialized condition', () => {
    const details = makePod({
      spec: {
        initContainers: [{ name: 'sidecar', restartPolicy: 'Always' }],
        containers: [{ name: 'c1' }],
      },
      status: {
        phase: 'Running',
        conditions: [{ type: 'Initialized', status: 'True' }],
        initContainerStatuses: [
          {
            name: 'sidecar',
            started: true,
            ready: true,
            restartCount: 2,
            state: { running: {} },
            lastState: { terminated: { finishedAt: '2025-01-02T00:00:00Z' } },
          },
        ],
        containerStatuses: [
          {
            name: 'c1',
            ready: true,
            restartCount: 1,
            state: { running: {} },
            lastState: { terminated: { finishedAt: '2025-01-03T00:00:00Z' } },
          },
        ],
      },
    }).getDetailedStatus();

    expect(details.totalContainers).toBe(2);
    expect(details.readyContainers).toBe(2);
    expect(details.restarts).toBe(3);
    expect(details.lastRestartDate).toEqual(new Date('2025-01-03T00:00:00Z'));
  });

  it('handles container waiting, signal termination, and Terminating/Unknown deletion states', () => {
    expect(
      makePod({
        status: {
          containerStatuses: [
            {
              name: 'c1',
              restartCount: 0,
              state: { waiting: { reason: 'ImagePullBackOff', message: 'pull' } },
            },
          ],
        },
      }).getDetailedStatus()
    ).toMatchObject({ reason: 'ImagePullBackOff', message: 'pull' });

    expect(
      makePod({
        status: {
          containerStatuses: [
            { name: 'c1', restartCount: 0, state: { terminated: { exitCode: 137, signal: 9 } } },
          ],
        },
      }).getDetailedStatus().reason
    ).toBe('Signal:9');

    expect(
      makePod({
        metadata: { deletionTimestamp: '2025-01-01T00:00:00Z' },
        status: { phase: 'Running' },
      }).getDetailedStatus().reason
    ).toBe('Terminating');

    expect(
      makePod({
        metadata: { deletionTimestamp: '2025-01-01T00:00:00Z' },
        status: { phase: 'Running', reason: 'NodeLost' },
      }).getDetailedStatus().reason
    ).toBe('Unknown');
  });

  it('classifies Unknown phase pod as failed in getHealth', () => {
    const pod = makePod({ status: { phase: 'Unknown' } });
    expect(pod.getHealth()).toBe('failed');
  });
});
