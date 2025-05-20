import React from 'react';
import { MapNode } from '../common/Map';
import { Tooltip } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(theme => ({
  nodeContainer: {
    padding: '8px',
    backgroundColor: 'white',
    borderRadius: '4px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    minWidth: '120px',
    textAlign: 'center',
    cursor: 'pointer',
  },
  icon: {
    fontSize: '1.2rem',
    marginBottom: '4px',
  },
  name: {
    fontWeight: 'bold',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '120px',
  },
  kind: {
    fontSize: '0.75rem',
    color: '#666',
  },
  namespace: {
    fontSize: '0.7rem',
    color: '#999',
  },
  badge: {
    position: 'absolute',
    top: '-8px',
    right: '-8px',
    backgroundColor: theme.palette.secondary.main,
    color: 'white',
    borderRadius: '50%',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.75rem',
    fontWeight: 'bold',
  },
  statusIndicator: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    position: 'absolute',
    bottom: '4px',
    right: '4px',
  },
}));

// Gateway node renderer
export function GatewayNodeRenderer(node: MapNode) {
  const classes = useStyles();
  const gateway = node.data;
  
  // Determine status color
  let statusColor = '#9e9e9e'; // Gray for unknown status
  if (gateway.status?.conditions) {
    const readyCondition = gateway.status.conditions.find(
      (c: any) => c.type === 'Ready' || c.type === 'Accepted'
    );
    if (readyCondition) {
      statusColor = readyCondition.status === 'True' ? '#4caf50' : '#f44336';
    }
  }
  
  // Count listeners
  const listenerCount = gateway.spec?.listeners?.length || 0;
  
  return (
    <Tooltip title={`Gateway: ${node.name} (${listenerCount} listeners)`}>
      <div className={classes.nodeContainer} style={{ border: '2px solid #4caf50' }}>
        <div className={classes.icon}>🔀</div>
        <div className={classes.name}>{node.name}</div>
        <div className={classes.kind}>{node.kind}</div>
        {node.namespace && <div className={classes.namespace}>{node.namespace}</div>}
        {listenerCount > 0 && <div className={classes.badge}>{listenerCount}</div>}
        <div className={classes.statusIndicator} style={{ backgroundColor: statusColor }} />
      </div>
    </Tooltip>
  );
}

// HTTPRoute node renderer
export function HTTPRouteNodeRenderer(node: MapNode) {
  const classes = useStyles();
  const route = node.data;
  
  // Determine status color
  let statusColor = '#9e9e9e'; // Gray for unknown status
  if (route.status?.conditions) {
    const acceptedCondition = route.status.conditions.find(
      (c: any) => c.type === 'Accepted'
    );
    if (acceptedCondition) {
      statusColor = acceptedCondition.status === 'True' ? '#4caf50' : '#f44336';
    }
  }
  
  // Count rules and backends
  const ruleCount = route.spec?.rules?.length || 0;
  let backendCount = 0;
  if (route.spec?.rules) {
    route.spec.rules.forEach((rule: any) => {
      backendCount += rule.backendRefs?.length || 0;
    });
  }
  
  return (
    <Tooltip title={`HTTPRoute: ${node.name} (${ruleCount} rules, ${backendCount} backends)`}>
      <div className={classes.nodeContainer} style={{ border: '2px solid #ff9800' }}>
        <div className={classes.icon}>🌐</div>
        <div className={classes.name}>{node.name}</div>
        <div className={classes.kind}>{node.kind}</div>
        {node.namespace && <div className={classes.namespace}>{node.namespace}</div>}
        {ruleCount > 0 && <div className={classes.badge}>{ruleCount}</div>}
        <div className={classes.statusIndicator} style={{ backgroundColor: statusColor }} />
      </div>
    </Tooltip>
  );
}

// GRPCRoute node renderer
export function GRPCRouteNodeRenderer(node: MapNode) {
  const classes = useStyles();
  
  return (
    <Tooltip title={`GRPCRoute: ${node.name}`}>
      <div className={classes.nodeContainer} style={{ border: '2px solid #9c27b0' }}>
        <div className={classes.icon}>📡</div>
        <div className={classes.name}>{node.name}</div>
        <div className={classes.kind}>{node.kind}</div>
        {node.namespace && <div className={classes.namespace}>{node.namespace}</div>}
      </div>
    </Tooltip>
  );
}

// TCPRoute node renderer
export function TCPRouteNodeRenderer(node: MapNode) {
  const classes = useStyles();
  
  return (
    <Tooltip title={`TCPRoute: ${node.name}`}>
      <div className={classes.nodeContainer} style={{ border: '2px solid #f44336' }}>
        <div className={classes.icon}>🔌</div>
        <div className={classes.name}>{node.name}</div>
        <div className={classes.kind}>{node.kind}</div>
        {node.namespace && <div className={classes.namespace}>{node.namespace}</div>}
      </div>
    </Tooltip>
  );
}

// TLSRoute node renderer
export function TLSRouteNodeRenderer(node: MapNode) {
  const classes = useStyles();
  
  return (
    <Tooltip title={`TLSRoute: ${node.name}`}>
      <div className={classes.nodeContainer} style={{ border: '2px solid #2196f3' }}>
        <div className={classes.icon}>🔒</div>
        <div className={classes.name}>{node.name}</div>
        <div className={classes.kind}>{node.kind}</div>
        {node.namespace && <div className={classes.namespace}>{node.namespace}</div>}
      </div>
    </Tooltip>
  );
}

// Service node renderer
export function ServiceNodeRenderer(node: MapNode) {
  const classes = useStyles();
  
  return (
    <Tooltip title={`Service: ${node.name}`}>
      <div className={classes.nodeContainer} style={{ border: '2px solid #607d8b' }}>
        <div className={classes.icon}>⚙️</div>
        <div className={classes.name}>{node.name}</div>
        <div className={classes.kind}>{node.kind}</div>
        {node.namespace && <div className={classes.namespace}>{node.namespace}</div>}
      </div>
    </Tooltip>
  );
}

// Register all Gateway API node renderers
export function registerGatewayNodeRenderers() {
  // This function would be called to register all the node renderers with the Plugin system
  // It would be imported and called in the main app initialization
  return {
    Gateway: GatewayNodeRenderer,
    HTTPRoute: HTTPRouteNodeRenderer,
    GRPCRoute: GRPCRouteNodeRenderer,
    TCPRoute: TCPRouteNodeRenderer,
    TLSRoute: TLSRouteNodeRenderer,
    Service: ServiceNodeRenderer,
  };
}