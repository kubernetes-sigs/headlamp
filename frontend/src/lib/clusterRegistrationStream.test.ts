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

import { waitFor } from '@testing-library/react';
import nock from 'nock';
import { afterEach, describe, expect, it } from 'vitest';
import { setBackendToken } from '../helpers/getHeadlampAPIHeaders';
import { makeRegisteredCluster } from '../test/clusterRegistration';
import { getClusterRoute, setRegisteredClusterSnapshot } from './clusterRegistration';
import { startClusterRegistrationStream } from './clusterRegistrationStream';
import { BASE_HTTP_URL } from './k8s/api/v2/fetch';

describe('startClusterRegistrationStream', () => {
  afterEach(() => {
    setBackendToken(null);
    setRegisteredClusterSnapshot(undefined);
    nock.cleanAll();
  });

  it('refreshes registrations from SSE using the backend token', async () => {
    const registration = makeRegisteredCluster({ id: 'hr-v1-streamed' });

    nock(BASE_HTTP_URL)
      .get('/cluster-registrations/events')
      .matchHeader('X-HEADLAMP_BACKEND-TOKEN', 'desktop-token')
      .reply(200, 'event: registration\ndata: {}\n\n')
      .get('/cluster-registrations')
      .matchHeader('X-HEADLAMP_BACKEND-TOKEN', 'desktop-token')
      .reply(200, { items: [registration] });

    setBackendToken('desktop-token');
    setRegisteredClusterSnapshot({
      items: [makeRegisteredCluster({ id: 'hr-v1-before-restart' })],
    });

    const stop = startClusterRegistrationStream();

    await waitFor(() =>
      expect(getClusterRoute(registration.id)).toBe(`hub/federated/${registration.id}`)
    );
    expect(getClusterRoute('hr-v1-before-restart')).toBe('hr-v1-before-restart');

    stop();
  });
});
