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
import GRPCRouteList from './GRPCRouteList';

vi.mock('../../lib/k8s/grpcRoute', () => ({
  default: class GRPCRoute {
    static kind = 'GRPCRoute';
    static apiName = 'grpcroutes';
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop() || key,
  }),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    return (
      <div data-testid="mock-resource-list-view">
        <span data-testid="title">{props.title}</span>
        <span data-testid="columns">{props.columns.join(', ')}</span>
      </div>
    );
  },
}));

describe('GRPCRouteList', () => {
  it('renders title and columns correctly', () => {
    render(
      <TestContext>
        <GRPCRouteList />
      </TestContext>
    );

    expect(screen.getByTestId('title')).toHaveTextContent('GRPCRoutes');
    expect(screen.getByTestId('columns')).toHaveTextContent('name, namespace, cluster, age');
  });
});
