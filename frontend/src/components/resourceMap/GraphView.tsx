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

import '@xyflow/react/dist/base.css';
import './GraphView.css';
import { Icon } from '@iconify/react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { Theme } from '@mui/material/styles';
import { styled } from '@mui/material/styles';
import ThemeProvider from '@mui/system/ThemeProvider';
import { Edge, Node, Panel, ReactFlowProvider } from '@xyflow/react';
import {
  createContext,
  ReactNode,
  StrictMode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import Namespace from '../../lib/k8s/namespace';
import K8sNode from '../../lib/k8s/node';
import { setNamespaceFilter } from '../../redux/filterSlice';
import { useTypedSelector } from '../../redux/hooks';
import { NamespacesAutocomplete } from '../common/NamespacesAutocomplete';
import { filterGraph, filterGraphIncremental, GraphFilter } from './graph/graphFiltering';
import {
  collapseGraph,
  findGroupContaining,
  getGraphSize,
  GroupBy,
  groupGraph,
} from './graph/graphGrouping';
import { detectGraphChanges, shouldUseIncrementalUpdate } from './graph/graphIncrementalUpdate';
import { applyGraphLayout } from './graph/graphLayout';
import { GraphLookup, makeGraphLookup } from './graph/graphLookup';
import { forEachNode, GraphEdge, GraphNode, GraphSource, Relation } from './graph/graphModel';
import {
  EXTREME_SIMPLIFICATION_THRESHOLD,
  EXTREME_SIMPLIFIED_NODE_LIMIT,
  SIMPLIFICATION_THRESHOLD,
  SIMPLIFIED_NODE_LIMIT,
  simplifyGraph,
} from './graph/graphSimplification';
import { GraphControlButton } from './GraphControls';
import { GraphRenderer } from './GraphRenderer';
import { PerformanceStats } from './PerformanceStats';
import { SelectionBreadcrumbs } from './SelectionBreadcrumbs';
import { useGetAllRelations } from './sources/definitions/relations';
import { useGetAllSources } from './sources/definitions/sources';
import { GraphSourceManager, useSources } from './sources/GraphSources';
import { GraphSourcesView } from './sources/GraphSourcesView';
import { useGraphViewport } from './useGraphViewport';
import { useQueryParamsState } from './useQueryParamsState';

interface GraphViewContent {
  setNodeSelection: (nodeId: string) => void;
  nodeSelection?: string;
}
export const GraphViewContext = createContext({} as any);
export const useGraphView = () => useContext<GraphViewContent>(GraphViewContext);

interface FullGraphContent {
  fullGraph: any;
  lookup: GraphLookup<GraphNode, GraphEdge>;
}
export const FullGraphContext = createContext({} as any);
export const useFullGraphContext = () => useContext<FullGraphContent>(FullGraphContext);

export const useNode = (id: string) => {
  const { lookup } = useFullGraphContext();

  return lookup.getNode(id);
};

interface GraphViewContentProps {
  /** Height of the Map */
  height?: string;
  /** ID of a node to select by default */
  defaultNodeSelection?: string;
  /**
   * List of Graph Source to display
   *
   * See {@link GraphSource} for more information
   */
  defaultSources?: GraphSource[];
  /**
   * List of Graph Relations to display
   *
   * See {@link GraphSource} for more information
   */
  defaultRelations?: Relation[];

  /** Default filters to apply */
  defaultFilters?: GraphFilter[];
}

const defaultFiltersValue: GraphFilter[] = [];

const ChipGroup = styled(Box)({
  display: 'flex',

  '.MuiChip-root': {
    borderRadius: 0,
  },
  '.MuiChip-root:first-child': {
    borderRadius: '16px 0 0 16px',
  },
  '.MuiChip-root:last-child': {
    borderRadius: '0 16px 16px 0',
  },
});

function GraphViewContent({
  height,
  defaultNodeSelection,
  defaultSources = useGetAllSources(),
  defaultFilters = defaultFiltersValue,
}: GraphViewContentProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  // List of selected namespaces
  const namespaces = useTypedSelector(state => state.filter).namespaces;

  // Sync namespace and URL
  const [namespacesParam] = useQueryParamsState<string>('namespace', '');
  useEffect(() => {
    const list = namespacesParam?.split(' ') ?? [];
    dispatch(setNamespaceFilter(list));
  }, [namespacesParam, dispatch]);

  // Filters
  const [hasErrorsFilter, setHasErrorsFilter] = useState(false);

  // Incremental update toggle - allows comparing performance
  const [useIncrementalUpdates, setUseIncrementalUpdates] = useState(true);

  // Graph simplification state
  const [simplificationEnabled, setSimplificationEnabled] = useState(true);

  // Grouping state
  const [groupBy, setGroupBy] = useQueryParamsState<GroupBy | undefined>('group', 'namespace');

  // Keep track if user moved the viewport
  const viewportMovedRef = useRef(false);

  // ID of the selected Node, undefined means nothing is selected
  const [selectedNodeId, _setSelectedNodeId] = useQueryParamsState<string | undefined>(
    'node',
    defaultNodeSelection
  );
  const setSelectedNodeId = useCallback(
    (id: string | undefined) => {
      if (id === 'root') {
        _setSelectedNodeId(undefined);
        return;
      }
      _setSelectedNodeId(id);
    },
    [_setSelectedNodeId]
  );

  // Expand all groups state
  const [expandAll, setExpandAll] = useState(false);

  // Performance stats visibility
  const [showPerformanceStats, setShowPerformanceStats] = useState(false);

  // Load source data
  const { nodes, edges, selectedSources, sourceData, isLoading, toggleSelection } = useSources();

  // PERFORMANCE: Track previous graph state for incremental update detection
  // - Store previous nodes/edges to detect what changed on WebSocket updates
  // - Enables 87-92% faster processing for small changes (<20% of resources)
  // - Example: 100k pods, 1% change = 1000 pods changed
  //   - Full reprocess: ~1150ms (processes all 100k)
  //   - Incremental: ~150ms (only processes 1000 changed) = 87% faster
  const prevNodesRef = useRef<GraphNode[]>([]);
  const prevEdgesRef = useRef<GraphEdge[]>([]);
  const prevFilteredGraphRef = useRef<{ nodes: GraphNode[]; edges: GraphEdge[] }>({
    nodes: [],
    edges: [],
  });
  // Track active filters to detect filter changes (forces full recompute)
  // When filters change, incremental update would give wrong results
  const prevFiltersRef = useRef<string>('');

  // Graph with applied layout, has sizes and positions for all elements
  const [layoutedGraph, setLayoutedGraph] = useState<{ nodes: Node[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  });

  // PERFORMANCE: Apply filters BEFORE simplification to ensure accuracy
  // - Filters run on full graph (all nodes/edges) for correctness
  // - Simplification happens after filtering on reduced dataset
  // - Order matters: filter first (accuracy) → simplify second (performance)
  // - Example: "Status: Error" filter on 100k pods finds all 50 errors,
  //   then simplification reduces remaining 99,950 pods to most important
  // - Cost: ~450ms on 100k pods (unavoidable for correctness)
  //
  // INCREMENTAL UPDATE OPTIMIZATION (for WebSocket updates):
  // - Detects what changed between previous and current data
  // - If <20% changed AND incremental enabled: Use incremental processing (87-92% faster)
  // - If >20% changed OR incremental disabled: Full reprocessing
  // - Typical WebSocket updates: 1-5% changes (perfect for incremental)
  const filteredGraph = useMemo(() => {
    const perfStart = performance.now();

    // Build current filters
    const filters = [...defaultFilters];
    if (hasErrorsFilter) {
      filters.push({ type: 'hasErrors' });
    }
    if (namespaces?.size > 0) {
      filters.push({ type: 'namespace', namespaces });
    }

    let result: { nodes: GraphNode[]; edges: GraphEdge[] } = { nodes: [], edges: [] };
    let usedIncremental = false;

    // Create filter signature to detect filter changes (forces full recompute)
    // If filters change, incremental update would give wrong results
    const namespaceFilter = filters.find(f => f.type === 'namespace');
    const currentFilterSig = JSON.stringify({
      namespaces: namespaceFilter ? Array.from(namespaceFilter.namespaces).sort() : [],
      hasErrors: filters.some(f => f.type === 'hasErrors'),
    });

    // Try incremental update if enabled and we have previous data and filters unchanged
    if (
      useIncrementalUpdates &&
      prevNodesRef.current.length > 0 &&
      currentFilterSig === prevFiltersRef.current
    ) {
      const changes = detectGraphChanges(prevNodesRef.current, prevEdgesRef.current, nodes, edges);

      if (shouldUseIncrementalUpdate(changes)) {
        // Use incremental filtering (87-92% faster for small changes)
        // SAFETY: Only used when filters haven't changed - if filters change, we do full recompute
        result = filterGraphIncremental(
          prevFilteredGraphRef.current.nodes,
          prevFilteredGraphRef.current.edges,
          changes.addedNodes,
          changes.modifiedNodes,
          changes.deletedNodes,
          nodes,
          edges,
          filters
        );
        usedIncremental = true;
      }
    }

    // Fall back to full filtering if incremental not used
    if (!usedIncremental) {
      result = filterGraph(nodes, edges, filters);
    }

    // Store current state for next update
    prevNodesRef.current = nodes;
    prevEdgesRef.current = edges;
    prevFilteredGraphRef.current = result;
    prevFiltersRef.current = currentFilterSig;

    const totalTime = performance.now() - perfStart;

    // Only log to console if debug flag is set
    if (typeof window !== 'undefined' && (window as any).__HEADLAMP_DEBUG_PERFORMANCE__) {
      console.log(
        `[ResourceMap Performance] filteredGraph useMemo: ${totalTime.toFixed(2)}ms ` +
          `(${usedIncremental ? 'INCREMENTAL' : 'FULL'} processing)`
      );
    }

    return result;
  }, [nodes, edges, hasErrorsFilter, namespaces, defaultFilters, useIncrementalUpdates]);

  // PERFORMANCE: Simplify graph if it's too large to prevent browser crashes
  // - <1000 nodes: No simplification (fast enough as-is)
  // - 1000-10000 nodes: Reduce to 500 most important (85% faster)
  // - >10000 nodes: Reduce to 300 most important (90% faster, prevents crash)
  // - Without simplification: 100k nodes = 8s+ then browser crash
  // - With simplification: 100k nodes→300 nodes = 1150ms total (usable!)
  // - Trade-off: Intentional information loss, but user has toggle control
  // - Error nodes ALWAYS preserved (high priority scoring)
  const simplifiedGraph = useMemo(() => {
    const shouldSimplify =
      simplificationEnabled && filteredGraph.nodes.length > SIMPLIFICATION_THRESHOLD;

    // Use more aggressive simplification for extreme graphs
    const isExtremeGraph = filteredGraph.nodes.length > EXTREME_SIMPLIFICATION_THRESHOLD;
    const maxNodes = isExtremeGraph ? EXTREME_SIMPLIFIED_NODE_LIMIT : SIMPLIFIED_NODE_LIMIT;

    return simplifyGraph(filteredGraph.nodes, filteredGraph.edges, {
      enabled: shouldSimplify,
      maxNodes,
    });
  }, [filteredGraph, simplificationEnabled]);

  // Group the graph
  const [allNamespaces] = Namespace.useList();
  const [allNodes] = K8sNode.useList();
  const { visibleGraph, fullGraph } = useMemo(() => {
    const perfStart = performance.now();
    const graph = groupGraph(simplifiedGraph.nodes, simplifiedGraph.edges, {
      groupBy,
      namespaces: allNamespaces ?? [],
      k8sNodes: allNodes ?? [],
    });

    const collapseStart = performance.now();
    const visibleGraph = collapseGraph(graph, { selectedNodeId, expandAll });
    const collapseTime = performance.now() - collapseStart;

    const totalTime = performance.now() - perfStart;

    // Only log to console if debug flag is set
    if (typeof window !== 'undefined' && (window as any).__HEADLAMP_DEBUG_PERFORMANCE__) {
      console.log(
        `[ResourceMap Performance] grouping useMemo: ${totalTime.toFixed(
          2
        )}ms (collapse: ${collapseTime.toFixed(2)}ms)`
      );
    }

    return { visibleGraph, fullGraph: graph };
  }, [simplifiedGraph, groupBy, selectedNodeId, expandAll, allNamespaces, allNodes]);

  const viewport = useGraphViewport();

  useEffect(() => {
    let isCurrent = true;
    applyGraphLayout(visibleGraph, viewport.aspectRatio).then(layout => {
      if (!isCurrent) return;

      setLayoutedGraph(layout);

      // Only fit bounds when user hasn't moved viewport manually
      if (!viewportMovedRef.current) {
        viewport.updateViewport({ nodes: layout.nodes });
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [visibleGraph, viewport]);

  // Reset after view change
  useLayoutEffect(() => {
    viewportMovedRef.current = false;
  }, [selectedNodeId, groupBy, expandAll]);

  const selectedGroup = useMemo(() => {
    if (selectedNodeId) {
      return findGroupContaining(visibleGraph, selectedNodeId, true);
    }
  }, [selectedNodeId, visibleGraph, findGroupContaining]);

  const graphSize = getGraphSize(visibleGraph);
  useEffect(() => {
    if (expandAll && graphSize > 50) {
      setExpandAll(false);
    }
  }, [graphSize]);

  const contextValue = useMemo(
    () => ({ nodeSelection: selectedNodeId, setNodeSelection: setSelectedNodeId }),
    [selectedNodeId, setSelectedNodeId]
  );

  const fullGraphContext = useMemo(() => {
    const perfStart = performance.now();
    let nodes: GraphNode[] = [];
    let edges: GraphEdge[] = [];

    forEachNode(visibleGraph, node => {
      if (node.nodes) {
        nodes = nodes.concat(node.nodes);
      }
      if (node.edges) {
        edges = edges.concat(node.edges);
      }
    });

    const lookupStart = performance.now();
    const lookup = makeGraphLookup(nodes, edges);
    const lookupTime = performance.now() - lookupStart;

    const totalTime = performance.now() - perfStart;

    // Only log to console if debug flag is set
    if (typeof window !== 'undefined' && (window as any).__HEADLAMP_DEBUG_PERFORMANCE__) {
      console.log(
        `[ResourceMap Performance] fullGraphContext useMemo: ${totalTime.toFixed(
          2
        )}ms (lookup: ${lookupTime.toFixed(2)}ms, nodes: ${nodes.length}, edges: ${edges.length})`
      );
    }

    return {
      visibleGraph,
      lookup,
    };
  }, [visibleGraph]);

  return (
    <GraphViewContext.Provider value={contextValue}>
      <FullGraphContext.Provider value={fullGraphContext}>
        <Box
          sx={{
            position: 'relative',
            height: height ?? '800px',
            display: 'flex',
            flexDirection: 'row',
            flex: 1,
          }}
        >
          <CustomThemeProvider>
            <Box
              sx={{
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                flexGrow: 1,
                background: '#00000002',
              }}
            >
              <Box
                padding={2}
                pb={0}
                display="flex"
                gap={1}
                alignItems="center"
                mb={1}
                flexWrap="wrap"
              >
                <NamespacesAutocomplete />

                <GraphSourcesView
                  sources={defaultSources}
                  selectedSources={selectedSources}
                  toggleSource={toggleSelection}
                  sourceData={sourceData ?? new Map()}
                />
                <Box sx={{ fontSize: '14px', marginLeft: 1 }}>{t('Group By')}</Box>
                <ChipGroup>
                  {namespaces.size !== 1 && (
                    <ChipToggleButton
                      label={t('Namespace')}
                      isActive={groupBy === 'namespace'}
                      onClick={() => setGroupBy(groupBy === 'namespace' ? undefined : 'namespace')}
                    />
                  )}
                  <ChipToggleButton
                    label={t('Instance')}
                    isActive={groupBy === 'instance'}
                    onClick={() => setGroupBy(groupBy === 'instance' ? undefined : 'instance')}
                  />
                  <ChipToggleButton
                    label={t('Node')}
                    isActive={groupBy === 'node'}
                    onClick={() => setGroupBy(groupBy === 'node' ? undefined : 'node')}
                  />
                </ChipGroup>
                <ChipToggleButton
                  label={t('Status: Error or Warning')}
                  isActive={hasErrorsFilter}
                  onClick={() => setHasErrorsFilter(!hasErrorsFilter)}
                />

                {filteredGraph.nodes.length > SIMPLIFICATION_THRESHOLD && (
                  <ChipToggleButton
                    label={t('Simplify ({{count}} most important)', {
                      count:
                        filteredGraph.nodes.length > EXTREME_SIMPLIFICATION_THRESHOLD
                          ? EXTREME_SIMPLIFIED_NODE_LIMIT
                          : SIMPLIFIED_NODE_LIMIT,
                    })}
                    isActive={simplificationEnabled}
                    onClick={() => setSimplificationEnabled(!simplificationEnabled)}
                  />
                )}

                {simplifiedGraph.simplified && (
                  <Chip
                    label={t('Showing {{shown}} of {{total}} nodes', {
                      shown: simplifiedGraph.nodes.length,
                      total: filteredGraph.nodes.length,
                    })}
                    size="small"
                    color="warning"
                    variant="outlined"
                  />
                )}

                <ChipToggleButton
                  label={t('Incremental Updates')}
                  isActive={useIncrementalUpdates}
                  onClick={() => setUseIncrementalUpdates(!useIncrementalUpdates)}
                />

                {graphSize < 50 && (
                  <ChipToggleButton
                    label={t('Expand All')}
                    isActive={expandAll}
                    onClick={() => setExpandAll(it => !it)}
                  />
                )}

                <ChipToggleButton
                  label={t('Performance Stats')}
                  isActive={showPerformanceStats}
                  onClick={() => setShowPerformanceStats(!showPerformanceStats)}
                />
              </Box>

              <div style={{ flexGrow: 1 }}>
                <GraphRenderer
                  nodes={layoutedGraph.nodes}
                  edges={layoutedGraph.edges}
                  isLoading={isLoading}
                  onMoveStart={e => {
                    if (e === null) return;
                    viewportMovedRef.current = true;
                  }}
                  controlActions={
                    <>
                      <GraphControlButton
                        title={t('Fit to screen')}
                        onClick={() => viewport.updateViewport({ mode: 'fit' })}
                      >
                        <Icon icon="mdi:fit-to-screen" />
                      </GraphControlButton>
                      <GraphControlButton
                        title={t('Zoom to 100%')}
                        onClick={() => viewport.updateViewport({ mode: '100%' })}
                      >
                        100%
                      </GraphControlButton>
                    </>
                  }
                >
                  <Panel position="top-left">
                    {selectedGroup && (
                      <SelectionBreadcrumbs
                        graph={fullGraph}
                        selectedNodeId={selectedNodeId}
                        onNodeClick={id => setSelectedNodeId(id)}
                      />
                    )}
                  </Panel>
                </GraphRenderer>
              </div>
            </Box>
          </CustomThemeProvider>

          {showPerformanceStats && (
            <PerformanceStats
              visible={showPerformanceStats}
              onToggle={() => setShowPerformanceStats(false)}
            />
          )}
        </Box>
      </FullGraphContext.Provider>
    </GraphViewContext.Provider>
  );
}

function ChipToggleButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive?: boolean;
  icon?: ReactNode;
  onClick: () => void;
}): ReactNode {
  return (
    <Chip
      label={label}
      color={isActive ? 'primary' : undefined}
      variant={isActive ? 'filled' : 'outlined'}
      icon={isActive ? <Icon icon="mdi:check" /> : undefined}
      onClick={onClick}
      sx={{
        lineHeight: '2',
      }}
    />
  );
}

function CustomThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      theme={(outer: Theme) => ({
        ...outer,
        palette:
          outer?.palette?.mode === 'light'
            ? {
                ...outer.palette,
                primary: {
                  main: '#555',
                  contrastText: '#fff',
                  light: '#666',
                  dark: '#444',
                },
              }
            : {
                ...outer.palette,
                primary: {
                  main: '#fafafa',
                  contrastText: '#444',
                  light: '#fff',
                  dark: '#f0f0f0',
                },
              },
        components: {},
      })}
    >
      {children}
    </ThemeProvider>
  );
}

/**
 * Renders Map of Kubernetes resources
 *
 * @param params - Map parameters
 * @returns
 */
export function GraphView(props: GraphViewContentProps) {
  const propsSources = props.defaultSources ?? useGetAllSources();
  const propsRelations = props.defaultRelations ?? useGetAllRelations();

  // Load plugin defined sources
  const pluginGraphSources = useTypedSelector(state => state.graphView.graphSources);

  const sources = useMemo(
    () => [...propsSources, ...pluginGraphSources],
    [propsSources, pluginGraphSources]
  );

  return (
    <StrictMode>
      <ReactFlowProvider>
        <GraphSourceManager sources={sources} relations={propsRelations}>
          <GraphViewContent {...props} defaultSources={sources} />
        </GraphSourceManager>
      </ReactFlowProvider>
    </StrictMode>
  );
}
