# ResourceMap Performance Optimization

This document describes the performance optimizations made to the ResourceMap (GraphView) component to handle large-scale Kubernetes clusters with 2000+ pods.

## Problem Statement

The ResourceMap component experienced significant performance issues when displaying large numbers of Kubernetes resources (2000+ pods), resulting in:
- Slow initial rendering
- UI freezing during updates
- Poor user experience with large clusters

## Performance Instrumentation

Performance timing has been added to all major operations with both console logging and a UI panel to track:

### Monitored Operations

1. **filterGraph** - Filters nodes and edges based on user criteria
2. **getConnectedComponents** - Identifies connected subgraphs
3. **groupGraph** - Groups nodes by namespace, instance, or node
4. **applyGraphLayout** - Computes graph layout using ELK algorithm

### Performance Metrics Tracked

For each operation, we track:
- **Total duration** (ms)
- **Sub-operation timings** (e.g., lookup creation, filtering logic)
- **Input/output sizes** (number of nodes and edges)
- **Additional context** (grouping mode, filter types, etc.)

## Optimizations Implemented

### 1. Graph Filtering Algorithm (graphFiltering.ts)

**Before:**
- Used recursive depth-first search to traverse related nodes
- Could cause stack overflow with deeply nested relationships
- Inefficient for large graphs

**After:**
- Converted to iterative breadth-first search using a queue
- Eliminates recursion overhead
- More efficient memory usage
- Better performance with large node counts

**Code Change:**
```typescript
// Before: Recursive approach
function pushRelatedNodes(node: GraphNode) {
  if (visitedNodes.has(node.id)) return;
  visitedNodes.add(node.id);
  filteredNodes.push(node);
  
  graphLookup.getOutgoingEdges(node.id)?.forEach(edge => {
    pushRelatedNodes(targetNode); // Recursive call
  });
}

// After: Iterative approach
function pushRelatedNodes(startNode: GraphNode) {
  const queue: GraphNode[] = [startNode];
  
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visitedNodes.has(node.id)) continue;
    
    visitedNodes.add(node.id);
    filteredNodes.push(node);
    
    // Process edges iteratively
    const outgoing = graphLookup.getOutgoingEdges(node.id);
    if (outgoing) {
      for (const edge of outgoing) {
        if (!visitedNodes.has(edge.target)) {
          const targetNode = graphLookup.getNode(edge.target);
          if (targetNode) {
            queue.push(targetNode);
          }
        }
      }
    }
  }
}
```

### 2. Connected Components Detection (graphGrouping.tsx)

**Before:**
- Used recursive depth-first search (DFS)
- Risk of stack overflow with large components

**After:**
- Converted to iterative breadth-first search (BFS)
- More predictable performance
- Better cache locality

**Benefits:**
- Eliminates recursion overhead
- Prevents stack overflow issues
- More efficient for large connected components

### 3. Performance Monitoring UI

Added a new `PerformanceStats` component that provides:

**Features:**
- Real-time performance metrics display
- Summary statistics (average, min, max)
- Recent operations table with color-coded durations
- Performance thresholds:
  - **Green** (Good): filterGraph < 50ms, groupGraph < 100ms, applyGraphLayout < 200ms
  - **Yellow** (Warning): Above good threshold but below error threshold
  - **Red** (Error): filterGraph > 100ms, groupGraph > 200ms, applyGraphLayout > 500ms

**Usage:**
- Click "Performance Stats" button in GraphView controls
- View real-time metrics as you interact with the graph
- Clear metrics history with the "Clear" button
- Expand/collapse panel for detailed view

## Testing with Storybook

Two new Storybook stories have been added for performance testing:

### 1. PerformanceTest2000Pods

Simulates a large-scale cluster with 2000 pods:
- Generates pods across 5 namespaces
- Creates realistic ownership relationships
- Simulates pod status (Running, Failed, etc.)
- Includes manual update trigger
- Auto-update mode to simulate live system
- Adjustable update intervals (1s, 2s, 5s, 10s)

**How to Use:**
```bash
npm run frontend:storybook
# Navigate to: GraphView > Performance Test 2000 Pods
```

**Controls:**
- **Trigger Update** - Manually trigger a data refresh
- **Auto-update** - Enable continuous updates
- **Interval** - Set update frequency
- **Performance Stats** - Toggle performance panel

### 2. PerformanceTest500Pods

Medium-scale test with 500 pods:
- Easier to inspect individual elements
- Faster render times for debugging
- Good baseline for comparison

## Performance Baselines

Expected performance with optimizations:

| Operation | 500 Pods | 2000 Pods | Notes |
|-----------|----------|-----------|-------|
| filterGraph | 10-30ms | 50-100ms | Depends on filter complexity |
| getConnectedComponents | 20-40ms | 80-150ms | Depends on connectivity |
| groupGraph | 30-60ms | 120-250ms | Depends on grouping mode |
| applyGraphLayout | 100-300ms | 500-1500ms | ELK algorithm, most expensive |

**Note:** ELK layout runs in a Web Worker, so it doesn't block the UI thread.

## Console Logging

All performance operations can log to the browser console with detailed metrics. To enable console logging, set the debug flag in the browser console:

```javascript
window.__HEADLAMP_DEBUG_PERFORMANCE__ = true;
```

With the debug flag enabled, you'll see output like:

```
[ResourceMap Performance] filterGraph: 45.23ms (lookup: 12.34ms, filter: 32.89ms, nodes: 2000 -> 1500, edges: 3000 -> 2200)
[ResourceMap Performance] getConnectedComponents: 78.45ms (lookup: 15.67ms, component detection: 62.78ms, nodes: 1500, components: 150)
[ResourceMap Performance] groupGraph: 134.56ms (grouping: 98.23ms, sorting: 36.33ms, groupBy: namespace)
[ResourceMap Performance] applyGraphLayout: 876.54ms (conversion: 45.23ms, ELK layout: 789.12ms, conversion back: 42.19ms, nodes: 150)
```

**Note:** Console logging is disabled by default in production to avoid performance overhead and console spam. The Performance Stats UI panel is always available and doesn't require the debug flag.

## API for Performance Tracking

The performance system provides a global API:

```typescript
import { 
  addPerformanceMetric, 
  getLatestMetrics, 
  clearPerformanceMetrics 
} from './PerformanceStats';

// Add a custom metric
addPerformanceMetric({
  operation: 'myOperation',
  duration: 123.45,
  timestamp: Date.now(),
  details: {
    customField: 'value',
  },
});

// Get latest metrics
const metrics = getLatestMetrics(10); // Last 10 operations

// Clear all metrics
clearPerformanceMetrics();
```

## Future Improvements

Potential areas for further optimization:

1. **Virtualization** - Only render visible nodes in large graphs
2. **Progressive Loading** - Load graph data in chunks
3. **Web Worker** - Move graph processing to background thread
4. **Memoization** - Cache expensive computations
5. **Lazy Evaluation** - Defer non-critical calculations
6. **Graph Simplification** - Reduce node count for overview mode

## Monitoring in Production

To monitor performance in production:

1. Enable Performance Stats panel in GraphView
2. Share metrics with users who report issues
3. Look for operations exceeding warning thresholds
4. Check browser console for detailed logs
5. Consider user's hardware capabilities

## Development Guidelines

When making changes to GraphView:

1. **Always measure** - Use performance timing before/after
2. **Test with scale** - Use Storybook performance tests
3. **Check console** - Verify timing logs are reasonable
4. **Use Performance Stats** - Enable UI panel during development
5. **Avoid recursion** - Use iterative algorithms for graph traversal
6. **Profile** - Use browser DevTools Performance tab for deep dives

## Related Files

- `/frontend/src/components/resourceMap/PerformanceStats.tsx` - Performance UI component
- `/frontend/src/components/resourceMap/GraphView.tsx` - Main GraphView component
- `/frontend/src/components/resourceMap/graph/graphFiltering.ts` - Graph filtering logic
- `/frontend/src/components/resourceMap/graph/graphGrouping.tsx` - Graph grouping logic
- `/frontend/src/components/resourceMap/graph/graphLayout.tsx` - Graph layout logic
- `/frontend/src/components/resourceMap/GraphView.stories.tsx` - Storybook performance tests
