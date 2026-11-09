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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { stream } from './streamingApi';

/** A WebSocket the test opens, feeds messages to and inspects. */
class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(public url: string, public protocols: string[]) {
    FakeSocket.instances.push(this);
  }

  addEventListener() {}

  send(data: string) {
    this.sent.push(data);
  }

  // Like a browser, which reports the reason of the close frame the server echoes back.
  close(code = 1000) {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code, reason: '' });
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const url = '/api/v1/namespaces/ns/pods/p/attach?container=c&stdin=1';
const path = '/api/v1/namespaces/ns/pods/p/attach';
const query = 'container=c&stdin=1';

function openStream(cb = vi.fn()) {
  const handle = stream(url, cb, { cluster: 'c1', multiplexed: true });
  const socket = FakeSocket.instances.at(-1)!;
  socket.open();
  return { handle, socket, cb };
}

describe('multiplexed streams', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('requests the stream through the multiplexer once connected', () => {
    const { socket } = openStream();

    // Under the cluster's path, so the browser sends the cluster's auth cookie.
    expect(socket.url.endsWith('/clusters/c1/wsMultiplexer')).toBe(true);
    expect(socket.protocols).toContain('headlamp.multiplexer.k8s.io');
    expect(JSON.parse(socket.sent[0])).toEqual({
      clusterId: 'c1',
      path,
      query,
      userId: getUserIdFromLocalStorage(),
      type: 'REQUEST',
    });
  });

  it('opens once the backend has connected the session', () => {
    const { handle, socket } = openStream();
    const terminal = handle.getSocket()!;
    const onOpen = vi.fn();
    terminal.addEventListener('open', onOpen);

    // The multiplexer connection is open, but the session is not connected yet.
    expect(terminal.readyState).toBe(FakeSocket.CONNECTING);

    socket.receive({ clusterId: 'c1', path, type: 'STATUS', data: '{"state":"connected"}' });

    expect(terminal.readyState).toBe(FakeSocket.OPEN);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('delivers the decoded output of its own stream', () => {
    const { socket, cb } = openStream();

    socket.receive({ clusterId: 'c1', path: '/other', query, binary: true, data: 'AA==' });
    expect(cb).not.toHaveBeenCalled();

    const output = Uint8Array.from([1, ...new TextEncoder().encode('hi')]);
    socket.receive({
      clusterId: 'c1',
      path,
      query,
      binary: true,
      data: Base64.fromUint8Array(output),
    });

    expect(cb).toHaveBeenCalledOnce();
    expect(new Uint8Array(cb.mock.calls[0][0])).toEqual(output);
  });

  it('sends input as binary data', () => {
    const { handle, socket } = openStream();
    const input = Uint8Array.from([0, ...new TextEncoder().encode('ls\r')]);

    handle.getSocket()!.send(input.buffer);

    const message = JSON.parse(socket.sent[1]);
    expect(message).toMatchObject({ clusterId: 'c1', path, query, type: 'REQUEST', binary: true });
    expect(Base64.toUint8Array(message.data)).toEqual(input);
  });

  it('closes cleanly when the session completes', () => {
    const { handle, socket } = openStream();
    const onclose = vi.fn();
    handle.getSocket()!.onclose = onclose;

    socket.receive({ clusterId: 'c1', path, query, type: 'COMPLETE' });

    expect(socket.readyState).toBe(FakeSocket.CLOSED);
    expect(onclose).toHaveBeenCalledWith(expect.objectContaining({ code: 1000 }));
  });

  it('closes cleanly when the backend ends the session', () => {
    const { handle, socket } = openStream();
    const onclose = vi.fn();
    handle.getSocket()!.onclose = onclose;

    // Status messages carry no query.
    socket.receive({
      clusterId: 'c1',
      path,
      type: 'STATUS',
      data: '{"state":"error","error":"x"}',
    });
    expect(onclose).not.toHaveBeenCalled();

    socket.receive({
      clusterId: 'c1',
      path,
      type: 'STATUS',
      data: '{"state":"closed","error":""}',
    });
    expect(onclose).toHaveBeenCalledWith(expect.objectContaining({ code: 1000 }));
  });

  it('passes on why the backend closed the session', () => {
    const { handle, socket } = openStream();
    const onclose = vi.fn();
    handle.getSocket()!.onclose = onclose;

    socket.receive({
      clusterId: 'c1',
      path,
      type: 'STATUS',
      data: '{"state":"closed","error":"opened in another window"}',
    });

    expect(onclose).toHaveBeenCalledOnce();
    expect(onclose).toHaveBeenCalledWith(
      expect.objectContaining({ code: 1000, reason: 'opened in another window' })
    );
  });

  it('reports a backend error as a dropped connection, so the caller retries', () => {
    const { handle, socket } = openStream();
    const onclose = vi.fn();
    handle.getSocket()!.onclose = onclose;

    socket.receive({
      clusterId: 'c1',
      path,
      query,
      type: 'ERROR',
      data: '{"error":"dial failed"}',
    });

    expect(onclose).toHaveBeenCalledOnce();
    expect(onclose.mock.calls[0][0].code).not.toBe(1000);
    expect(onclose.mock.calls[0][0].reason).toBe('dial failed');
  });

  it('ends the session when cancelled', () => {
    const { handle, socket } = openStream();

    handle.cancel();

    expect(JSON.parse(socket.sent.at(-1)!)).toMatchObject({
      clusterId: 'c1',
      path,
      query,
      type: 'CLOSE',
    });
    expect(socket.readyState).toBe(FakeSocket.CLOSED);
  });
});
