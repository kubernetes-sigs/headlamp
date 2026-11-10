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

import { afterEach, expect, it, vi } from 'vitest';
import { getAppUrl } from '../helpers/getAppUrl';
import { backendFetch } from './k8s/api/v2/fetch';
import { redirectToOIDCLogout } from './oidcLogout';

vi.mock('../helpers/getAppUrl', () => ({ getAppUrl: vi.fn() }));
vi.mock('./k8s/api/v2/fetch', () => ({ backendFetch: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it('uses trusted desktop IPC rather than navigating the file renderer', async () => {
  const oidcLogout = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('desktopApi', { oidcLogout });
  await redirectToOIDCLogout('team/cluster');
  expect(oidcLogout).toHaveBeenCalledWith('team/cluster');
  expect(backendFetch).not.toHaveBeenCalled();
});

it('resolves a backend-relative transition against the application backend origin', async () => {
  vi.stubGlobal('desktopApi', undefined);
  vi.stubGlobal('location', { href: '' });
  vi.mocked(getAppUrl).mockReturnValue('https://headlamp.example/base/');
  vi.mocked(backendFetch).mockResolvedValue({
    json: async () => ({
      redirectURL: '/base/encoded-clusters/bWFpbg/oidc-logout/redirect?state=signed',
    }),
  } as Response);
  await redirectToOIDCLogout('main');
  expect(window.location.href).toBe(
    'https://headlamp.example/base/encoded-clusters/bWFpbg/oidc-logout/redirect?state=signed'
  );
});
