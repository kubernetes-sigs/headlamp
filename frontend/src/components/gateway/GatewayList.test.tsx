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
import GatewayList from './GatewayList';

vi.mock('../../lib/k8s/gateway', () => ({
  default: class Gateway {
    static kind = 'Gateway';
    static apiName = 'gateways';
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop() || key,
  }),
}));

vi.mock('../common/Link', () => ({
  default: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('./ClassList', () => ({
  makeGatewayStatusLabel: (conditions: any) => (
    <div data-testid="mock-gateway-status-label">{conditions ? 'with-conditions' : 'null'}</div>
  ),
}));

let currentDummyGateway: any = null;

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    return (
      <div data-testid="mock-resource-list-view">
        <span data-testid="title">{props.title}</span>
        {props.columns.map((col: any, idx: number) => {
          if (typeof col === 'object') {
            const val = col.getValue ? col.getValue(currentDummyGateway) ?? '' : '';
            const node = col.render ? col.render(currentDummyGateway) : null;
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

describe('GatewayList', () => {
  it('renders columns correctly on happy path', () => {
    currentDummyGateway = {
      spec: {
        gatewayClassName: 'my-gateway-class',
        listeners: [{}, {}],
      },
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
      },
      cluster: 'main-cluster',
    };

    render(
      <TestContext>
        <GatewayList />
      </TestContext>
    );

    expect(screen.getByTestId('title')).toHaveTextContent('Gateways');

    // Class Name column
    const classCol = screen.getByTestId('col-class');
    expect(classCol.querySelector('.label')).toHaveTextContent('Class Name');
    expect(classCol.querySelector('.value')).toHaveTextContent('my-gateway-class');
    expect(classCol.querySelector('.node')).toHaveTextContent('my-gateway-class');

    // Conditions column
    const condCol = screen.getByTestId('col-conditions');
    expect(condCol.querySelector('.label')).toHaveTextContent('Conditions');
    expect(condCol.querySelector('.value')).toHaveTextContent('Ready');
    expect(condCol.querySelector('.node')).toHaveTextContent('with-conditions');

    // Listeners column
    const listCol = screen.getByTestId('col-listeners');
    expect(listCol.querySelector('.label')).toHaveTextContent('Listeners');
    expect(listCol.querySelector('.value')).toHaveTextContent('2');
  });

  it('renders correctly when details are missing or empty', () => {
    currentDummyGateway = {
      spec: {
        gatewayClassName: '',
        listeners: [],
      },
      status: {},
      cluster: 'main-cluster',
    };

    render(
      <TestContext>
        <GatewayList />
      </TestContext>
    );

    // Class column has no value/node
    const classCol = screen.getByTestId('col-class');
    expect(classCol.querySelector('.value')).toHaveTextContent('');
    expect(classCol.querySelector('.node')).toBeEmptyDOMElement();

    // Conditions column is empty
    const condCol = screen.getByTestId('col-conditions');
    expect(condCol.querySelector('.value')).toHaveTextContent('');
    expect(condCol.querySelector('.node')).toHaveTextContent('null');

    // Listeners column is 0
    const listCol = screen.getByTestId('col-listeners');
    expect(listCol.querySelector('.value')).toHaveTextContent('0');
  });
});
