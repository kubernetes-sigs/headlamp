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

import { ReactNode } from 'react';
import { GraphSource, Relation } from './graph/graphModel';
import { useGetAllRelations } from './sources/definitions/relations';
import { useGetAllSources } from './sources/definitions/sources';

interface GraphDefinitions {
  sources: GraphSource[];
  relations: Relation[];
}

interface GraphViewDefinitionsProps {
  defaultSources?: GraphSource[];
  defaultRelations?: Relation[];
  children: (definitions: GraphDefinitions) => ReactNode;
}

function DefaultSources({
  relations,
  children,
}: {
  relations: Relation[];
  children: GraphViewDefinitionsProps['children'];
}) {
  const sources = useGetAllSources();
  return children({ sources, relations });
}

function DefaultRelations({
  sources,
  children,
}: {
  sources: GraphSource[];
  children: GraphViewDefinitionsProps['children'];
}) {
  const relations = useGetAllRelations();
  return children({ sources, relations });
}

function DefaultDefinitions({ children }: Pick<GraphViewDefinitionsProps, 'children'>) {
  const sources = useGetAllSources();
  const relations = useGetAllRelations();
  return children({ sources, relations });
}

function getDefinitionsMode(
  defaultSources?: GraphSource[],
  defaultRelations?: Relation[]
): 'explicit' | 'default-sources' | 'default-relations' | 'defaults' {
  if (defaultSources !== undefined) {
    return defaultRelations !== undefined ? 'explicit' : 'default-relations';
  }
  return defaultRelations !== undefined ? 'default-sources' : 'defaults';
}

export function GraphViewDefinitions({
  defaultSources,
  defaultRelations,
  children,
}: GraphViewDefinitionsProps) {
  switch (getDefinitionsMode(defaultSources, defaultRelations)) {
    case 'explicit':
      return children({ sources: defaultSources!, relations: defaultRelations! });
    case 'default-relations':
      return <DefaultRelations sources={defaultSources!}>{children}</DefaultRelations>;
    case 'default-sources':
      return <DefaultSources relations={defaultRelations!}>{children}</DefaultSources>;
    default:
      return <DefaultDefinitions>{children}</DefaultDefinitions>;
  }
}
