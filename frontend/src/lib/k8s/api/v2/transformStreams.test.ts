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

import { describe, expect, it } from 'vitest';
import App from '../../../../App';
import { makeBatchingStream, makeLineSplitStream } from './transformStreams';

// eslint-disable-next-line no-unused-vars -- Keep this to avoid circular dependency issues
const _App = App;

const collectStream = async <T>(readable: ReadableStream<T>): Promise<T[]> => {
  const results: T[] = [];
  const reader = readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    results.push(value);
  }
  return results;
};

describe('makeLineSplitStream', () => {
  it('splits a single chunk with multiple lines', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('line1\nline2\nline3');
        controller.close();
      },
    });

    const result = await collectStream(stream.pipeThrough(makeLineSplitStream()));
    expect(result).toEqual(['line1', 'line2', 'line3']);
  });

  it('handles chunks split mid-line', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('hello wo');
        controller.enqueue('rld\nfoo');
        controller.close();
      },
    });

    const result = await collectStream(stream.pipeThrough(makeLineSplitStream()));
    expect(result).toEqual(['hello world', 'foo']);
  });

  it('handles empty stream', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.close();
      },
    });

    const result = await collectStream(stream.pipeThrough(makeLineSplitStream()));
    expect(result).toEqual([]);
  });

  it('handles chunk with trailing newline', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('line1\nline2\n');
        controller.close();
      },
    });

    const result = await collectStream(stream.pipeThrough(makeLineSplitStream()));
    expect(result).toEqual(['line1', 'line2']);
  });

  it('flushes leftover content on close', async () => {
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('line1\npartial');
        controller.close();
      },
    });

    const result = await collectStream(stream.pipeThrough(makeLineSplitStream()));
    expect(result).toEqual(['line1', 'partial']);
  });
});

describe('makeBatchingStream', () => {
  it('batches items within the buffer time', async () => {
    const controller = new AbortController();
    const batchingStream = makeBatchingStream(controller.signal, 10);

    const results: string[][] = [];

    const writer = batchingStream.writable.getWriter();
    const readerPromise = (async () => {
      const reader = batchingStream.readable.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        results.push(value);
      }
    })();

    writer.write('item1');
    writer.write('item2');

    await new Promise(res => setTimeout(res, 5));
    expect(results).toEqual([]);

    await new Promise(res => setTimeout(res, 15));
    expect(results).toEqual([['item1', 'item2']]);

    writer.write('item3');
    await new Promise(res => setTimeout(res, 15));

    expect(results).toEqual([['item1', 'item2'], ['item3']]);

    writer.close();
    await readerPromise;
  });

  it('flushes remaining items on close', async () => {
    const controller = new AbortController();
    const batchingStream = makeBatchingStream(controller.signal, 100);

    const results: string[][] = [];

    const writer = batchingStream.writable.getWriter();
    const readerPromise = (async () => {
      const reader = batchingStream.readable.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        results.push(value);
      }
    })();

    writer.write('item1');
    writer.write('item2');
    writer.close();

    await readerPromise;

    expect(results).toEqual([['item1', 'item2']]);
  });
});
