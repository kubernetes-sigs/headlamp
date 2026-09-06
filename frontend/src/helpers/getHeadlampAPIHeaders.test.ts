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

import {
  getHeadlampAPIHeaders,
  getHeadlampWebSocketProtocol,
  setBackendToken,
} from './getHeadlampAPIHeaders';

describe('Headlamp backend token transports', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setBackendToken(null);
  });

  it('returns no credentials without a backend token', () => {
    setBackendToken(null);

    expect(getHeadlampAPIHeaders()).toEqual({});
    expect(getHeadlampWebSocketProtocol()).toBeNull();
  });

  it('returns the token as a header and an encoded WebSocket protocol', () => {
    setBackendToken('desktop-token');

    expect(getHeadlampAPIHeaders()).toEqual({
      'X-HEADLAMP_BACKEND-TOKEN': 'desktop-token',
    });
    expect(getHeadlampWebSocketProtocol()).toBe(
      'base64url.headlamp.backend.authorization.k8s.io.ZGVza3RvcC10b2tlbg'
    );
    expect(getHeadlampWebSocketProtocol()).not.toContain('desktop-token');
  });

  it('supports unicode tokens and repeated updates', () => {
    setBackendToken('first');
    setBackendToken('tökén');

    expect(getHeadlampWebSocketProtocol()).toBe(
      'base64url.headlamp.backend.authorization.k8s.io.dMO2a8Opbg'
    );
  });

  it('prefers the development environment token', () => {
    vi.stubEnv('REACT_APP_HEADLAMP_BACKEND_TOKEN', 'environment-token');
    setBackendToken('renderer-token');

    expect(getHeadlampAPIHeaders()).toEqual({
      'X-HEADLAMP_BACKEND-TOKEN': 'environment-token',
    });
  });
});
