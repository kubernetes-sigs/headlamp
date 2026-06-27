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

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import BackendTLSPolicyList from './BackendTLSPolicyList';

vi.mock('../../lib/k8s/backendTLSPolicy', () => ({
  default: class BackendTLSPolicy {
    static kind = 'BackendTLSPolicy';
    static apiName = 'backendtlspolicies';
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop() || key,
  }),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    // Simulate rendering the custom columns to verify they render successfully and don't throw
    const dummyPolicy = {
      targetRefs: [{ kind: 'Service', name: 'my-service' }],
      validation: { hostname: 'example.com' },
    };

    return (
      <div data-testid="mock-resource-list-view">
        <span data-testid="title">{props.title}</span>
        {props.columns.map((col: any, idx: number) => {
          if (typeof col === 'object') {
            const val = col.getValue ? col.getValue(dummyPolicy) : '';
            const node = col.render ? col.render(dummyPolicy) : null;
            return (
              <div key={idx} data-testid={`col-${col.id}`}>
                <span className="label">{col.label}</span>
                <span className="value">{val}</span>
                <div className="node">{node}</div>
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  },
}));

describe('BackendTLSPolicyList', () => {
  it('renders title and columns correctly', () => {
    render(
      <TestContext>
        <BackendTLSPolicyList />
      </TestContext>
    );

    expect(screen.getByTestId('title')).toHaveTextContent('Backend TLS Policies');

    // Targets column
    const targetCol = screen.getByTestId('col-targetRefs');
    expect(targetCol).toBeInTheDocument();
    expect(targetCol.querySelector('.label')).toHaveTextContent('Targets');
    expect(targetCol.querySelector('.value')).toHaveTextContent('Service (my-service)');
    expect(targetCol.querySelector('.node')).toHaveTextContent('Service (my-service)');

    // Hostname column
    const hostCol = screen.getByTestId('col-hostname');
    expect(hostCol).toBeInTheDocument();
    expect(hostCol.querySelector('.label')).toHaveTextContent('Hostname');
    expect(hostCol.querySelector('.value')).toHaveTextContent('example.com');
    expect(hostCol.querySelector('.node')).toHaveTextContent('example.com');
  });
});
