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
import ReferenceGrantList from './ReferenceGrantList';

vi.mock('../../lib/k8s/referenceGrant', () => ({
  default: class ReferenceGrant {
    static kind = 'ReferenceGrant';
    static apiName = 'referencegrants';
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop() || key,
  }),
}));

let currentDummyGrant: any = null;

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    return (
      <div data-testid="mock-resource-list-view">
        <span data-testid="title">{props.title}</span>
        {props.columns.map((col: any, idx: number) => {
          if (typeof col === 'object') {
            const val = col.getValue ? col.getValue(currentDummyGrant) : '';
            const node = col.render ? col.render(currentDummyGrant) : null;
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

describe('ReferenceGrantList', () => {
  it('renders columns correctly with complete From and To definitions', () => {
    currentDummyGrant = {
      from: [
        { kind: 'Gateway', namespace: 'infra-ns' },
        { kind: 'HTTPRoute', namespace: 'app-ns' },
      ],
      to: [
        { kind: 'Secret', name: 'my-secret' },
        { kind: 'Service', name: '' },
      ],
    };

    render(
      <TestContext>
        <ReferenceGrantList />
      </TestContext>
    );

    expect(screen.getByTestId('title')).toHaveTextContent('Reference Grants');

    // From column
    const fromCol = screen.getByTestId('col-from');
    expect(fromCol.querySelector('.label')).toHaveTextContent('From');
    expect(fromCol.querySelector('.value')).toHaveTextContent(
      'Gateway (infra-ns), HTTPRoute (app-ns)'
    );
    expect(fromCol.querySelector('.node')).toHaveTextContent(
      'Gateway (infra-ns), HTTPRoute (app-ns)'
    );

    // To column
    const toCol = screen.getByTestId('col-to');
    expect(toCol.querySelector('.label')).toHaveTextContent('To');
    expect(toCol.querySelector('.value')).toHaveTextContent('Secret (my-secret), Service');
    expect(toCol.querySelector('.node')).toHaveTextContent('Secret (my-secret), Service');
  });
});
