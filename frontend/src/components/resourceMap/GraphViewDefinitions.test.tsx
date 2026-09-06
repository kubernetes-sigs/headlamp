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
import { GraphSource, Relation } from './graph/graphModel';
import { GraphViewDefinitions } from './GraphViewDefinitions';
import { useGetAllRelations } from './sources/definitions/relations';
import { useGetAllSources } from './sources/definitions/sources';

vi.mock('./sources/definitions/relations', () => ({
  useGetAllRelations: vi.fn(),
}));

vi.mock('./sources/definitions/sources', () => ({
  useGetAllSources: vi.fn(),
}));

const explicitSources = [{ id: 'explicit-source', label: 'Explicit source' }] as GraphSource[];
const defaultSources = [{ id: 'default-source', label: 'Default source' }] as GraphSource[];
const explicitRelations = [{ fromSource: 'explicit-source' }] as Relation[];
const defaultRelations = [{ fromSource: 'default-source' }] as Relation[];

function Definitions({ sources, relations }: { sources: GraphSource[]; relations: Relation[] }) {
  return <div>{`${sources[0].id}:${relations[0].fromSource}`}</div>;
}

describe('GraphViewDefinitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetAllSources).mockReturnValue(defaultSources);
    vi.mocked(useGetAllRelations).mockReturnValue(defaultRelations);
  });

  test('uses explicit definitions without loading defaults', () => {
    render(
      <GraphViewDefinitions defaultSources={explicitSources} defaultRelations={explicitRelations}>
        {Definitions}
      </GraphViewDefinitions>
    );

    expect(screen.getByText('explicit-source:explicit-source')).toBeInTheDocument();
    expect(useGetAllSources).not.toHaveBeenCalled();
    expect(useGetAllRelations).not.toHaveBeenCalled();
  });

  test('loads default relations only when sources are explicit', () => {
    render(
      <GraphViewDefinitions defaultSources={explicitSources}>{Definitions}</GraphViewDefinitions>
    );

    expect(screen.getByText('explicit-source:default-source')).toBeInTheDocument();
    expect(useGetAllSources).not.toHaveBeenCalled();
    expect(useGetAllRelations).toHaveBeenCalledOnce();
  });

  test('loads default sources only when relations are explicit', () => {
    render(
      <GraphViewDefinitions defaultRelations={explicitRelations}>
        {Definitions}
      </GraphViewDefinitions>
    );

    expect(screen.getByText('default-source:explicit-source')).toBeInTheDocument();
    expect(useGetAllSources).toHaveBeenCalledOnce();
    expect(useGetAllRelations).not.toHaveBeenCalled();
  });

  test('loads both defaults when no definitions are explicit', () => {
    render(<GraphViewDefinitions>{Definitions}</GraphViewDefinitions>);

    expect(screen.getByText('default-source:default-source')).toBeInTheDocument();
    expect(useGetAllSources).toHaveBeenCalledOnce();
    expect(useGetAllRelations).toHaveBeenCalledOnce();
  });
});
