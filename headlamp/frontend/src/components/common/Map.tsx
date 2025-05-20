import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useTheme } from '@material-ui/core';
import { Plugin } from '../../plugin';

// Define the MapNode interface if it doesn't exist
export interface MapNode {
  id: string;
  parentIds: string[];
  kind: string;
  name: string;
  namespace?: string;
  apiVersion?: string;
  [key: string]: any;
}

// Define the MapEdge interface if it doesn't exist
export interface MapEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  [key: string]: any;
}

// Define the Map component props
interface MapProps {
  nodes: MapNode[];
  edges?: MapEdge[];
  renderNode?: (node: MapNode) => React.ReactNode;
  options?: any;
  onNodeClick?: (node: MapNode) => void;
  onEdgeClick?: (edge: MapEdge) => void;
}

const useStyles = makeStyles(theme => ({
  mapContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  node: {
    position: 'absolute',
    cursor: 'pointer',
    transition: 'transform 0.3s ease',
    '&:hover': {
      transform: 'scale(1.05)',
      zIndex: 10,
    },
  },
  edge: {
    position: 'absolute',
    pointerEvents: 'none',
    zIndex: 1,
  },
  edgePath: {
    fill: 'none',
    strokeWidth: 2,
    stroke: theme.palette.primary.main,
  },
  edgeLabel: {
    fontSize: '0.75rem',
    fill: theme.palette.text.secondary,
    textAnchor: 'middle',
  },
  arrowHead: {
    fill: theme.palette.primary.main,
  },
}));

// Allow plugins to register custom node renderers
const nodeRenderers = new Map<string, (node: MapNode) => React.ReactNode>();

// Register a plugin API for custom node renderers
Plugin.registerPluginExtension('map.nodeRenderer', (kindName: string, renderer: (node: MapNode) => React.ReactNode) => {
  nodeRenderers.set(kindName, renderer);
});

// Map component implementation
export function Map({ nodes, edges = [], renderNode, options = {}, onNodeClick, onEdgeClick }: MapProps) {
  const classes = useStyles();
  const theme = useTheme();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });
  const [nodePositions, setNodePositions] = React.useState<Record<string, { x: number; y: number }>>({});
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [dragging, setDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });

  // Calculate node positions based on hierarchical layout
  React.useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return;
    
    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();
    setDimensions({ width, height });
    
    // Create a map of nodes by ID for quick lookup
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    
    // Create a map of edges
    const calculatedEdges: MapEdge[] = [];
    nodes.forEach(node => {
      if (node.parentIds && node.parentIds.length > 0) {
        node.parentIds.forEach(parentId => {
          calculatedEdges.push({
            id: `${parentId}-${node.id}`,
            from: parentId,
            to: node.id,
          });
        });
      }
    });
    
    // Combine provided edges with calculated edges
    const allEdges = [...calculatedEdges, ...edges.filter(edge => 
      !calculatedEdges.some(e => e.from === edge.from && e.to === edge.to)
    )];
    
    // Determine levels (for hierarchical layout)
    const nodeLevels = new Map<string, number>();
    const rootNodes = nodes.filter(node => !node.parentIds || node.parentIds.length === 0);
    
    // Assign level 0 to root nodes
    rootNodes.forEach(node => nodeLevels.set(node.id, 0));
    
    // Assign levels to other nodes
    let changed = true;
    while (changed) {
      changed = false;
      allEdges.forEach(edge => {
        const sourceLevel = nodeLevels.get(edge.from);
        if (sourceLevel !== undefined && !nodeLevels.has(edge.to)) {
          nodeLevels.set(edge.to, sourceLevel + 1);
          changed = true;
        }
      });
    }
    
    // Group nodes by level
    const nodesByLevel = new Map<number, string[]>();
    nodeLevels.forEach((level, nodeId) => {
      if (!nodesByLevel.has(level)) {
        nodesByLevel.set(level, []);
      }
      nodesByLevel.get(level)!.push(nodeId);
    });
    
    // Calculate positions
    const positions: Record<string, { x: number; y: number }> = {};
    const maxLevel = Math.max(...Array.from(nodeLevels.values()));
    const levelWidth = width / (maxLevel + 2); // +2 for padding
    
    nodesByLevel.forEach((nodeIds, level) => {
      const levelHeight = height / (nodeIds.length + 1);
      nodeIds.forEach((nodeId, index) => {
        positions[nodeId] = {
          x: levelWidth * (level + 1),
          y: levelHeight * (index + 1),
        };
      });
    });
    
    setNodePositions(positions);
  }, [nodes, edges, options]);

  // Handle container resize
  React.useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle mouse wheel for zooming
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(0.5, Math.min(2, zoom + delta));
    setZoom(newZoom);
  };

  // Handle mouse down for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { // Left mouse button
      setDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  // Handle mouse move for panning
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  // Handle mouse up to stop panning
  const handleMouseUp = () => {
    setDragging(false);
  };

  // Handle node click
  const handleNodeClick = (node: MapNode) => {
    if (onNodeClick) {
      onNodeClick(node);
    }
  };

  // Calculate edge paths
  const calculateEdgePath = (edge: MapEdge) => {
    const source = nodePositions[edge.from];
    const target = nodePositions[edge.to];
    
    if (!source || !target) return '';
    
    // Calculate control points for curved edges
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const controlPoint1 = {
      x: source.x + dx / 2,
      y: source.y,
    };
    const controlPoint2 = {
      x: target.x - dx / 2,
      y: target.y,
    };
    
    return `M ${source.x} ${source.y} C ${controlPoint1.x} ${controlPoint1.y}, ${controlPoint2.x} ${controlPoint2.y}, ${target.x} ${target.y}`;
  };

  // Render a node
  const renderNodeElement = (node: MapNode) => {
    // Check if there's a custom renderer for this kind
    if (nodeRenderers.has(node.kind)) {
      return nodeRenderers.get(node.kind)!(node);
    }
    
    // Use the provided renderNode function
    if (renderNode) {
      return renderNode(node);
    }
    
    // Default node rendering
    return (
      <div style={{
        padding: '8px',
        backgroundColor: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: theme.shape.borderRadius,
        boxShadow: theme.shadows[1],
      }}>
        <div style={{ fontWeight: 'bold' }}>{node.name}</div>
        <div style={{ fontSize: '0.75rem' }}>{node.kind}</div>
      </div>
    );
  };

  return (
    <div 
      ref={containerRef}
      className={classes.mapContainer}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg width="100%" height="100%" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" className={classes.arrowHead} />
          </marker>
        </defs>
        {Object.keys(nodePositions).length > 0 && edges.map(edge => {
          const path = calculateEdgePath(edge);
          if (!path) return null;
          
          return (
            <g key={edge.id} className={classes.edge}>
              <path
                d={path}
                className={classes.edgePath}
                markerEnd="url(#arrowhead)"
              />
              {edge.label && (
                <text
                  className={classes.edgeLabel}
                  dy="-5"
                >
                  <textPath href={`#${edge.id}`} startOffset="50%">
                    {edge.label}
                  </textPath>
                </text>
              )}
            </g>
          );
        })}
      </svg>
      
      {nodes.map(node => {
        const position = nodePositions[node.id];
        if (!position) return null;
        
        return (
          <div
            key={node.id}
            className={classes.node}
            style={{
              transform: `translate(${position.x * zoom + pan.x}px, ${position.y * zoom + pan.y}px) scale(${zoom})`,
              transformOrigin: 'center',
            }}
            onClick={() => handleNodeClick(node)}
          >
            {renderNodeElement(node)}
          </div>
        );
      })}
    </div>
  );
}

// Export the Map component
export default Map;