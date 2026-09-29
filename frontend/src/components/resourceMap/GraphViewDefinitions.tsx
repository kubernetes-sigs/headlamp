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

/** Sources and relations resolved for a GraphView. */
interface GraphDefinitions {
  sources: GraphSource[];
  relations: Relation[];
}

interface GraphViewDefinitionsProps {
  /** Sources to use instead of discovering the built-in sources. */
  defaultSources?: GraphSource[];
  /** Relations to use instead of discovering the built-in relations. */
  defaultRelations?: Relation[];
  /** Renders content with the explicit or discovered graph definitions. */
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

/**
 * Resolves the sources and relations used by a GraphView.
 *
 * Explicit arrays, including empty arrays, are used as provided. A discovery
 * hook is invoked only for a definition that the caller omits.
 *
 * @param props - Definition overrides and the render callback.
 * @param props.defaultSources - Sources to use without source discovery.
 * @param props.defaultRelations - Relations to use without relation discovery.
 * @param props.children - Renders with the resolved sources and relations.
 * @returns The content rendered by `children` with the resolved definitions.
 */
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
