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

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import CertificateSigningRequestList from './List';

const { mockListView } = vi.hoisted(() => ({ mockListView: vi.fn() }));

vi.mock('../../lib/k8s/certificateSigningRequest', () => ({
  default: { kind: 'CertificateSigningRequest', apiName: 'certificatesigningrequests' },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

function renderList() {
  render(
    <TestContext>
      <CertificateSigningRequestList />
    </TestContext>
  );
  return mockListView.mock.calls[0][0];
}

describe('CertificateSigningRequestList', () => {
  beforeEach(() => mockListView.mockReset());

  it('renders the expected columns', () => {
    const columnIds = renderList().columns.map((column: any) =>
      typeof column === 'string' ? column : column.id
    );

    expect(columnIds).toEqual(['name', 'cluster', 'state', 'signerName', 'requestor', 'age']);
  });

  it('sorts and filters the status column by the state, not by the rendered label', () => {
    const state = renderList().columns.find((column: any) => column?.id === 'state');

    expect(state.getValue({ state: 'Pending' })).toBe('Pending');
  });
});
