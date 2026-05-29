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

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultWebsocketMultiplexerEnabled,
  getWebsocketMultiplexerEnabled,
} from './websocketMultiplexer';

describe('websocketMultiplexer helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses env default when REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER is true', () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    expect(getDefaultWebsocketMultiplexerEnabled()).toBe(true);
  });

  it('uses env default when REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER is false', () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'false');
    expect(getDefaultWebsocketMultiplexerEnabled()).toBe(false);
  });

  it('returns explicit user setting when provided', () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'false');
    expect(getWebsocketMultiplexerEnabled(true)).toBe(true);
  });

  it('inherits env default when user setting is undefined', () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    expect(getWebsocketMultiplexerEnabled(undefined)).toBe(true);
  });

  it('inherits env default when user setting is null', () => {
    vi.stubEnv('REACT_APP_ENABLE_WEBSOCKET_MULTIPLEXER', 'true');
    expect(getWebsocketMultiplexerEnabled(null)).toBe(true);
  });
});
