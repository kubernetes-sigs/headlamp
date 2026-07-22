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
import HTTPRouteList from './HTTPRouteList';

vi.mock('../../lib/k8s/httpRoute', () => ({
  default: class HTTPRoute {
    static kind = 'HTTPRoute';
    static apiName = 'httproutes';
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop() || key,
  }),
}));

let currentDummyRoute: any = null;

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    return (
      <div data-testid="mock-resource-list-view">
        <span data-testid="title">{props.title}</span>
        {props.columns.map((col: any, idx: number) => {
          if (typeof col === 'object') {
            const val = col.getValue ? col.getValue(currentDummyRoute) ?? '' : '';
            const node = col.render ? col.render(currentDummyRoute) : null;
            return (
              <div key={idx} data-testid={`col-${col.id}`}>
                <span className="label">{col.label}</span>
                <span className="value">{String(val)}</span>
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

describe('HTTPRouteList', () => {
  it('renders columns correctly with hostnames and rules', () => {
    currentDummyRoute = {
      hostnames: ['app.example.com', 'api.example.com'],
      spec: {
        rules: [{}, {}, {}],
      },
    };

    render(
      <TestContext>
        <HTTPRouteList />
      </TestContext>
    );

    expect(screen.getByTestId('title')).toHaveTextContent('HttpRoutes');

    // Hostnames column
    const hostCol = screen.getByTestId('col-hostnames');
    expect(hostCol.querySelector('.label')).toHaveTextContent('Hostnames');
    expect(hostCol.querySelector('.value')).toHaveTextContent('app.example.com, api.example.com');
    expect(hostCol.querySelector('.node')).toHaveTextContent('app.example.com, api.example.com');

    // Rules column
    const rulesCol = screen.getByTestId('col-rules');
    expect(rulesCol.querySelector('.label')).toHaveTextContent('rules');
    expect(rulesCol.querySelector('.value')).toHaveTextContent('3');
  });

  it('handles empty/wildcard hostnames and rules', () => {
    currentDummyRoute = {
      hostnames: [''],
      spec: {},
    };

    render(
      <TestContext>
        <HTTPRouteList />
      </TestContext>
    );

    const hostCol = screen.getByTestId('col-hostnames');
    expect(hostCol.querySelector('.value')).toHaveTextContent('');
    // empty hostnames fallback to *
    expect(hostCol.querySelector('.node')).toHaveTextContent('*');

    const rulesCol = screen.getByTestId('col-rules');
    expect(rulesCol.querySelector('.value')).toHaveTextContent('');
  });
});
