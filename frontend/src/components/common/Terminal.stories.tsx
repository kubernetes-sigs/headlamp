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

import { Meta, StoryFn } from '@storybook/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Pod from '../../lib/k8s/pod';
import { TestContext } from '../../test';
import Terminal from './Terminal';

const encoder = new TextEncoder();

/** Channel bytes for exec/attach stream (matches Terminal.tsx Channel enum) */
const Channel = {
  StdIn: 0,
  StdOut: 1,
  StdErr: 2,
  ServerError: 3,
  Resize: 4,
} as const;

function buildMessage(channel: number, text: string): ArrayBuffer {
  const encoded = encoder.encode(text);
  const buffer = new Uint8Array([channel, ...encoded]);
  return buffer.buffer;
}

function createMockPodSpec(overrides?: {
  nodeSelector?: Record<string, string>;
  initContainers?: { name: string; image: string; imagePullPolicy?: string }[];
  ephemeralContainers?: { name: string; image: string; imagePullPolicy?: string }[];
}) {
  const spec = {
    containers: [{ name: 'main', image: 'busybox', imagePullPolicy: 'IfNotPresent' as const }],
    initContainers: (overrides?.initContainers ?? []).map(c => ({
      ...c,
      imagePullPolicy: c.imagePullPolicy ?? 'IfNotPresent',
    })),
    ephemeralContainers: (overrides?.ephemeralContainers ?? []).map(c => ({
      ...c,
      imagePullPolicy: c.imagePullPolicy ?? 'IfNotPresent',
    })),
    nodeName: 'mock-node',
    nodeSelector: overrides?.nodeSelector ?? { 'kubernetes.io/os': 'linux' },
    restartPolicy: 'Always' as const,
    serviceAccountName: 'default',
    serviceAccount: 'default',
    tolerations: [],
  };
  return spec;
}

function createBaseMockPod(overrides?: Parameters<typeof createMockPodSpec>[0]) {
  const spec = createMockPodSpec(overrides);
  return new Pod(
    {
      kind: 'Pod',
      apiVersion: 'v1',
      metadata: {
        name: 'mock-pod',
        namespace: 'default',
        creationTimestamp: '2023-01-01T00:00:00Z',
        uid: 'mock-uid',
        resourceVersion: '123',
      },
      status: {
        phase: 'Running',
        ephemeralContainerStatuses: [],
        conditions: [],
        containerStatuses: [
          {
            name: 'main',
            image: 'busybox',
            imageID: 'docker-pullable://busybox@sha256:mock',
            containerID: 'containerd://mock-main',
            ready: true,
            restartCount: 0,
            state: {
              running: {
                startedAt: '2023-01-01T00:00:00Z',
              },
            },
            lastState: {},
          },
        ],
        startTime: '2023-01-01T00:00:00Z',
        hostIP: '192.168.1.1',
        podIP: '10.0.0.1',
      },
      spec,
    },
    'default'
  );
}

/**
 * Wraps the story so that requestAnimationFrame callbacks scheduled by xterm
 * are cancelled on unmount. In jsdom, rAF is implemented with setTimeout; when
 * the test unmounts the component, xterm is disposed but pending rAF timers
 * can still fire and access disposed internals (e.g. RenderService.dimensions).
 * This decorator clears all pending rAF timers on unmount to prevent those errors.
 */
function ClearRafOnUnmount({ children }: { children: React.ReactNode }) {
  const pending = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const originalRaf = useRef<typeof requestAnimationFrame | null>(null);
  const originalCaf = useRef<typeof cancelAnimationFrame | null>(null);

  useEffect(() => {
    originalRaf.current = window.requestAnimationFrame;
    originalCaf.current = window.cancelAnimationFrame;

    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      const id = setTimeout(() => callback(performance.now()), 0);
      pending.current.push(id);
      return id as unknown as number;
    };
    window.cancelAnimationFrame = (id: number) => {
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
      const idx = pending.current.indexOf(id as unknown as ReturnType<typeof setTimeout>);
      if (idx >= 0) pending.current.splice(idx, 1);
    };

    return () => {
      pending.current.forEach(t => clearTimeout(t));
      pending.current.length = 0;
      if (originalRaf.current !== null) window.requestAnimationFrame = originalRaf.current;
      if (originalCaf.current !== null) window.cancelAnimationFrame = originalCaf.current;
    };
  }, []);

  return <>{children}</>;
}

const streamReturn = {
  cancel: () => {},
  getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
};

export default {
  title: 'common/Terminal',
  component: Terminal,
  decorators: [
    Story => (
      <ClearRafOnUnmount>
        <TestContext>
          <Story />
        </TestContext>
      </ClearRafOnUnmount>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
} as Meta<typeof Terminal>;

const Template: StoryFn<React.ComponentProps<typeof Terminal>> = args => {
  const [open, setOpen] = useState(args.open ?? true);
  return (
    <Terminal
      {...args}
      open={open}
      onClose={() => {
        setOpen(false);
        args.onClose?.();
      }}
    />
  );
};

/** Terminal connected and ready: shows prompt as if shell is ready for input */
export const TerminalConnectedAndReady: StoryFn<React.ComponentProps<typeof Terminal>> = () => {
  const pod = useMemo(() => {
    const p = createBaseMockPod();
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const stream = {
      cancel: () => timeouts.forEach(t => clearTimeout(t)),
      getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
    };
    const emitPrompt = (onData: (data: ArrayBuffer) => void) => {
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, 'user@mock-pod:~$ ')), 0));
    };
    (p as any).exec = async (
      _container: string,
      onData: (data: ArrayBuffer) => void,
      opts?: { command?: string[]; failCb?: () => void }
    ) => {
      void opts;
      await Promise.resolve();
      emitPrompt(onData);
      return stream;
    };
    (p as any).attach = async (
      _container: string,
      onData: (data: ArrayBuffer) => void,
      opts?: { failCb?: () => void }
    ) => {
      void opts;
      await Promise.resolve();
      emitPrompt(onData);
      return stream;
    };
    return p;
  }, []);

  return <Template item={pod} open onClose={() => {}} />;
};

/** Terminal connection loading: shows "Trying to run..." and never receives data */
export const TerminalConnectionLoading: StoryFn<React.ComponentProps<typeof Terminal>> = () => {
  const pod = useMemo(() => {
    const p = createBaseMockPod();
    (p as any).exec = async () => {
      await new Promise(() => {}); // never resolve – simulates loading
      return streamReturn;
    };
    (p as any).attach = async () => {
      await new Promise(() => {});
      return streamReturn;
    };
    return p;
  }, []);

  return <Template item={pod} open onClose={() => {}} />;
};

/** Terminal connection failed: shows "Failed to connect..." and reconnect hint */
export const TerminalConnectionFailed: StoryFn<React.ComponentProps<typeof Terminal>> = () => {
  const pod = useMemo(() => {
    const p = createBaseMockPod();
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const stream = {
      cancel: () => timeouts.forEach(t => clearTimeout(t)),
      getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
    };
    (p as any).exec = async (
      _container: string,
      _onData: (data: ArrayBuffer) => void,
      opts?: { command?: string[]; failCb?: () => void }
    ) => {
      await Promise.resolve();
      timeouts.push(setTimeout(() => opts?.failCb?.(), 100));
      return stream;
    };
    (p as any).attach = async (
      _container: string,
      _onData: (data: ArrayBuffer) => void,
      opts?: { failCb?: () => void }
    ) => {
      await Promise.resolve();
      timeouts.push(setTimeout(() => opts?.failCb?.(), 100));
      return stream;
    };
    return p;
  }, []);

  return <Template item={pod} open onClose={() => {}} />;
};

/** Terminal with command output: prompt, command echo, and output lines */
export const TerminalWithCommandOutput: StoryFn<React.ComponentProps<typeof Terminal>> = () => {
  const pod = useMemo(() => {
    const p = createBaseMockPod();
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const stream = {
      cancel: () => timeouts.forEach(t => clearTimeout(t)),
      getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
    };
    (p as any).exec = async (_container: string, onData: (data: ArrayBuffer) => void) => {
      await Promise.resolve();
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, 'user@mock-pod:~$ ')), 0));
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, 'ls -la\r\n')), 50));
      timeouts.push(
        setTimeout(
          () =>
            onData(
              buildMessage(
                Channel.StdOut,
                'total 12\ndrwxr-xr-x  2 root root 4096 Jan  1 00:00 .\ndrwxr-xr-x 5 root root 4096 Jan  1 00:00 ..\n-rw-r--r--  1 root root  220 Jan  1 00:00 .bashrc\r\n'
              )
            ),
          150
        )
      );
      timeouts.push(
        setTimeout(() => onData(buildMessage(Channel.StdOut, 'user@mock-pod:~$ ')), 200)
      );
      return stream;
    };
    (p as any).attach = async (_container: string, onData: (data: ArrayBuffer) => void) => {
      await Promise.resolve();
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, 'user@mock-pod:~$ ')), 0));
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, 'ls -la\r\n')), 50));
      timeouts.push(
        setTimeout(
          () => onData(buildMessage(Channel.StdOut, 'file1.txt  file2.txt  file3.txt\r\n')),
          150
        )
      );
      timeouts.push(
        setTimeout(() => onData(buildMessage(Channel.StdOut, 'user@mock-pod:~$ ')), 200)
      );
      return stream;
    };
    return p;
  }, []);

  return <Template item={pod} open onClose={() => {}} />;
};

/** Terminal disconnected: was connected then connection failed (reconnect hint) */
export const TerminalDisconnected: StoryFn<React.ComponentProps<typeof Terminal>> = () => {
  const pod = useMemo(() => {
    const p = createBaseMockPod();
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const stream = {
      cancel: () => timeouts.forEach(t => clearTimeout(t)),
      getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
    };
    (p as any).exec = async (
      _container: string,
      onData: (data: ArrayBuffer) => void,
      opts?: { command?: string[]; failCb?: () => void }
    ) => {
      await Promise.resolve();
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, 'user@mock-pod:~$ ')), 0));
      timeouts.push(setTimeout(() => opts?.failCb?.(), 400));
      return stream;
    };
    (p as any).attach = async (
      _container: string,
      onData: (data: ArrayBuffer) => void,
      opts?: { failCb?: () => void }
    ) => {
      await Promise.resolve();
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, 'user@mock-pod:~$ ')), 0));
      timeouts.push(setTimeout(() => opts?.failCb?.(), 400));
      return stream;
    };
    return p;
  }, []);

  return <Template item={pod} open onClose={() => {}} />;
};

/** Successful exit: channel 3 Success closes terminal and calls onClose */
export const TerminalSuccessfulExit: StoryFn<React.ComponentProps<typeof Terminal>> = () => {
  const pod = useMemo(() => {
    const p = createBaseMockPod();
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const stream = {
      cancel: () => timeouts.forEach(t => clearTimeout(t)),
      getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
    };
    (p as any).exec = async (_container: string, onData: (data: ArrayBuffer) => void) => {
      await Promise.resolve();
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, 'user@mock-pod:~$ ')), 0));
      timeouts.push(
        setTimeout(() => {
          onData(buildMessage(Channel.ServerError, '{"status":"Success","metadata":{}}'));
        }, 50)
      );
      return stream;
    };
    (p as any).attach = (p as any).exec;
    return p;
  }, []);

  return <Template item={pod} open onClose={() => {}} />;
};

/** Attach mode with empty first output: shows "Any new output..." message */
export const TerminalAttachEmptyFirstOutput: StoryFn<
  React.ComponentProps<typeof Terminal>
> = () => {
  const pod = useMemo(() => {
    const p = createBaseMockPod();
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const stream = {
      cancel: () => timeouts.forEach(t => clearTimeout(t)),
      getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
    };
    (p as any).attach = async (_container: string, onData: (data: ArrayBuffer) => void) => {
      await Promise.resolve();
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, '')), 0));
      return stream;
    };
    (p as any).exec = (p as any).attach;
    return p;
  }, []);

  return <Template item={pod} open onClose={() => {}} isAttach />;
};

/** Shell not found: tries next shell (linux has 4 shells, not last so tryNextShell runs) */
export const TerminalShellNotFoundTryNext: StoryFn<React.ComponentProps<typeof Terminal>> = () => {
  const pod = useMemo(() => {
    const p = createBaseMockPod();
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const stream = {
      cancel: () => timeouts.forEach(t => clearTimeout(t)),
      getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
    };
    let callCount = 0;
    (p as any).exec = async (
      _container: string,
      onData: (data: ArrayBuffer) => void,
      opts?: { command?: string[]; failCb?: () => void }
    ) => {
      void opts;
      await Promise.resolve();
      if (callCount === 0) {
        callCount += 1;
        timeouts.push(
          setTimeout(
            () =>
              onData(
                buildMessage(
                  Channel.ServerError,
                  '{"code":500,"status":"Failure","reason":"InternalError"}'
                )
              ),
            0
          )
        );
      } else {
        timeouts.push(
          setTimeout(() => onData(buildMessage(Channel.StdOut, 'user@mock-pod:~$ ')), 0)
        );
      }
      return stream;
    };
    (p as any).attach = (p as any).exec;
    return p;
  }, []);

  return <Template item={pod} open onClose={() => {}} />;
};

/** Windows nodeSelector: uses powershell.exe / cmd.exe shells */
export const TerminalWindowsNodeSelector: StoryFn<React.ComponentProps<typeof Terminal>> = () => {
  const pod = useMemo(() => {
    const p = createBaseMockPod({
      nodeSelector: { 'kubernetes.io/os': 'windows' },
    });
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const stream = {
      cancel: () => timeouts.forEach(t => clearTimeout(t)),
      getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
    };
    (p as any).exec = async (_container: string, onData: (data: ArrayBuffer) => void) => {
      await Promise.resolve();
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, 'PS C:\\> ')), 0));
      return stream;
    };
    (p as any).attach = (p as any).exec;
    return p;
  }, []);

  return <Template item={pod} open onClose={() => {}} />;
};

/** No nodeSelector: getAvailableShells returns default (linux + windows list) */
export const TerminalDefaultNodeSelector: StoryFn<React.ComponentProps<typeof Terminal>> = () => {
  const pod = useMemo(() => {
    const p = createBaseMockPod({ nodeSelector: {} });
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const stream = {
      cancel: () => timeouts.forEach(t => clearTimeout(t)),
      getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
    };
    (p as any).exec = async (_container: string, onData: (data: ArrayBuffer) => void) => {
      await Promise.resolve();
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, 'user@mock-pod:~$ ')), 0));
      return stream;
    };
    (p as any).attach = (p as any).exec;
    return p;
  }, []);

  return <Template item={pod} open onClose={() => {}} />;
};

/** Pod with initContainers and ephemeralContainers: container dropdown shows all */
export const TerminalInitAndEphemeralContainers: StoryFn<
  React.ComponentProps<typeof Terminal>
> = () => {
  const pod = useMemo(() => {
    const p = createBaseMockPod({
      initContainers: [{ name: 'init-a', image: 'busybox' }],
      ephemeralContainers: [{ name: 'debug', image: 'busybox' }],
    });
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const stream = {
      cancel: () => timeouts.forEach(t => clearTimeout(t)),
      getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
    };
    (p as any).exec = async (_container: string, onData: (data: ArrayBuffer) => void) => {
      await Promise.resolve();
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, 'user@mock-pod:~$ ')), 0));
      return stream;
    };
    (p as any).attach = (p as any).exec;
    return p;
  }, []);

  return <Template item={pod} open onClose={() => {}} />;
};

/** No dialog: renders terminal content only, no Dialog wrapper */
export const TerminalNoDialog: StoryFn<React.ComponentProps<typeof Terminal>> = () => {
  const pod = useMemo(() => {
    const p = createBaseMockPod();
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const stream = {
      cancel: () => timeouts.forEach(t => clearTimeout(t)),
      getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
    };
    (p as any).exec = async (_container: string, onData: (data: ArrayBuffer) => void) => {
      await Promise.resolve();
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, 'user@mock-pod:~$ ')), 0));
      return stream;
    };
    (p as any).attach = (p as any).exec;
    return p;
  }, []);

  return <Template item={pod} open onClose={() => {}} noDialog />;
};

/** Windows shell not found: channel 1 with "The system cannot find the file specified" */
export const TerminalWindowsShellNotFound: StoryFn<React.ComponentProps<typeof Terminal>> = () => {
  const pod = useMemo(() => {
    const p = createBaseMockPod({
      nodeSelector: { 'kubernetes.io/os': 'windows' },
    });
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const stream = {
      cancel: () => timeouts.forEach(t => clearTimeout(t)),
      getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
    };
    (p as any).exec = async (_container: string, onData: (data: ArrayBuffer) => void) => {
      await Promise.resolve();
      timeouts.push(setTimeout(() => onData(buildMessage(Channel.StdOut, 'user@mock-pod:~$ ')), 0));
      timeouts.push(
        setTimeout(() => {
          onData(buildMessage(Channel.StdOut, 'The system cannot find the file specified'));
        }, 50)
      );
      return stream;
    };
    (p as any).attach = (p as any).exec;
    return p;
  }, []);

  return <Template item={pod} open onClose={() => {}} />;
};
