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
import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import {
  ALL_SEVERITIES,
  filterLogsBySeverity,
  LogSeverity,
} from '../../components/common/Resource/logSeverityFilter';
import { stream } from './api/v1/streamingApi';
import Pod from './pod';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

vi.mock('./api/v1/streamingApi', async () => {
  const actual = await vi.importActual<typeof import('./api/v1/streamingApi')>(
    './api/v1/streamingApi'
  );
  return { ...actual, stream: vi.fn() };
});

describe('pod log severity filtering', () => {
  const REPRO =
    '{"level":"info","message":"test0"}\n' +
    '{"level":"warn","message":"test1"}\n' +
    '{"level":"error","message":"test2"}\n' +
    '{"level":"warn","message":"test3"}\n' +
    '{"level":"debug","message":"test4"}\n';

  function streamLogs(chunks: string[], logsOptions: object = {}): string[] {
    let onResults: (item: string) => void = () => {};
    vi.mocked(stream).mockImplementation(((_url: string, cb: (item: string) => void) => {
      onResults = cb;
      return { cancel: vi.fn(), getSocket: () => null };
    }) as any);

    const pod = new Pod({
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: { name: 'test-pod', namespace: 'default', resourceVersion: '123' },
      spec: { containers: [{ name: 'container-1' }] },
      status: {},
    } as any);

    let received: string[] = [];
    pod.getLogs('container-1', ({ logs }) => (received = [...logs]), {
      follow: true,
      ...logsOptions,
    });
    chunks.forEach(chunk => onResults(Base64.encode(chunk)));

    return received;
  }

  const messagesFor = (logs: string[], severities: LogSeverity[]) =>
    filterLogsBySeverity(logs, severities)
      .join('')
      .match(/test\d/g) ?? [];

  const arrivals: Record<string, string[]> = {
    'a single chunk': [REPRO],
    'two chunks split mid-line': [REPRO.slice(0, 80), REPRO.slice(80)],
    'one message per line': REPRO.split(/(?<=\n)/).filter(Boolean),
  };

  Object.entries(arrivals).forEach(([name, chunks]) => {
    describe(`arriving as ${name}`, () => {
      const logs = streamLogs(chunks);

      it('shows every line when all severities are selected', () => {
        expect(messagesFor(logs, ALL_SEVERITIES)).toEqual([
          'test0',
          'test1',
          'test2',
          'test3',
          'test4',
        ]);
      });

      it('shows only the error line', () => {
        expect(messagesFor(logs, ['error'])).toEqual(['test2']);
      });

      it('shows only the warn lines', () => {
        expect(messagesFor(logs, ['warn'])).toEqual(['test1', 'test3']);
      });

      it('shows only the info line', () => {
        expect(messagesFor(logs, ['info'])).toEqual(['test0']);
      });

      it('shows only the debug line', () => {
        expect(messagesFor(logs, ['debug'])).toEqual(['test4']);
      });

      it('rejoins the lines to the original text', () => {
        expect(logs.join('')).toBe(REPRO);
      });
    });
  });

  describe('with prettified logs', () => {
    const logs = streamLogs([REPRO], { prettifyLogs: true });

    it('gives each message its own prettified entry', () => {
      expect(logs).toHaveLength(5);
    });

    it('shows only the error message', () => {
      expect(messagesFor(logs, ['error'])).toEqual(['test2']);
    });

    it('shows only the warn messages', () => {
      expect(messagesFor(logs, ['warn'])).toEqual(['test1', 'test3']);
    });

    it('keeps each shown object intact', () => {
      const shown = filterLogsBySeverity(logs, ['error']).join('');
      expect(JSON.parse(shown)).toEqual({ level: 'error', message: 'test2' });
    });

    it('leaks no fragment of a filtered-out object', () => {
      const shown = filterLogsBySeverity(logs, ['error']).join('');
      ['test0', 'test1', 'test3', 'test4'].forEach(message => expect(shown).not.toContain(message));
    });
  });
});
