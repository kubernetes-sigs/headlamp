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
import BackendTrafficPolicyList from './BackendTrafficPolicyList';

vi.mock('../../lib/k8s/backendTrafficPolicy', () => ({
  default: class BackendTrafficPolicy {
    static kind = 'XBackendTrafficPolicy';
    static apiName = 'xbackendtrafficpolicies';
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, any>) => {
      let result = key.split('|').pop() || key;
      if (opts) {
        Object.entries(opts).forEach(([k, v]) => {
          result = result.replaceAll(`{{${k}}}`, String(v));
        });
      }
      return result;
    },
  }),
}));

let currentDummyPolicy: any = null;

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    return (
      <div data-testid="mock-resource-list-view">
        <span data-testid="title">{props.title}</span>
        {props.columns.map((col: any, idx: number) => {
          if (typeof col === 'object') {
            const val = col.getValue ? col.getValue(currentDummyPolicy) ?? '' : '';
            const node = col.render ? col.render(currentDummyPolicy) : null;
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

describe('BackendTrafficPolicyList', () => {
  it('renders columns with populated budget constraint', () => {
    currentDummyPolicy = {
      targetRefs: [{ kind: 'Service', name: 'web-service' }],
      retryConstraint: {
        budget: { percent: 15, interval: '20s' },
      },
    };

    render(
      <TestContext>
        <BackendTrafficPolicyList />
      </TestContext>
    );

    expect(screen.getByTestId('title')).toHaveTextContent('Backend Traffic Policies');

    const targetsCol = screen.getByTestId('col-targetRefs');
    expect(targetsCol.querySelector('.value')).toHaveTextContent('Service (web-service)');

    const retryCol = screen.getByTestId('col-retryConstraint');
    expect(retryCol.querySelector('.value')).toHaveTextContent('Retry 15% per 20s');
    expect(retryCol.querySelector('.node')).toHaveTextContent('Retry 15% per 20s');
  });

  it('renders columns with missing budget constraint using default or empty values', () => {
    // 1. empty retryConstraint
    currentDummyPolicy = {
      targetRefs: [],
      retryConstraint: null,
    };

    const { rerender } = render(
      <TestContext>
        <BackendTrafficPolicyList />
      </TestContext>
    );

    const retryCol = screen.getByTestId('col-retryConstraint');
    expect(retryCol.querySelector('.value')).toHaveTextContent('—');
    expect(retryCol.querySelector('.node')).toHaveTextContent('—');

    // 2. retryConstraint with empty budget (will fallback to default or render -)
    currentDummyPolicy = {
      targetRefs: [],
      retryConstraint: {
        budget: {},
      },
    };

    rerender(
      <TestContext>
        <BackendTrafficPolicyList />
      </TestContext>
    );

    const retryColEmpty = screen.getByTestId('col-retryConstraint');
    expect(retryColEmpty.querySelector('.value')).toHaveTextContent('Retry 20% per 10s');
    expect(retryColEmpty.querySelector('.node')).toHaveTextContent('Retry 20% per 10s');
  });
});
