import React from 'react';
import { useParams } from 'react-router-dom';
import { Box, Paper, Typography, Tabs, Tab, CircularProgress } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { Map, MapNode, MapEdge } from '../common/Map';
import { useGatewayResources } from './hooks';

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(2),
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    marginBottom: theme.spacing(2),
  },
  mapContainer: {
    flexGrow: 1,
    minHeight: '500px',
    position: 'relative',
  },
  tabPanel: {
    height: '100%',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  legend: {
    position: 'absolute',
    bottom: theme.spacing(2),
    right: theme.spacing(2),
    padding: theme.spacing(1),
    backgroundColor: theme.palette.background.paper,
    zIndex: 10,
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[1],
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: theme.spacing(0.5),
  },
  legendColor: {
    width: 16,
    height: 16,
    marginRight: theme.spacing(1),
    borderRadius: 2,
  },
}));

interface TabPanelProps {
  children?: React.ReactNode;
  index: any;
  value: any;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  const classes = useStyles();

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`mesh-tabpanel-${index}`}
      aria-labelledby={`mesh-tab-${index}`}
      className={classes.tabPanel}
      {...other}
    >
      {value === index && <Box p={0}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: any) {
  return {
    id: `mesh-tab-${index}`,
    'aria-controls': `mesh-tabpanel-${index}`,
  };
}

export default function ServiceMeshView() {
  const classes = useStyles();
  const { namespace } = useParams<{ namespace: string }>();
  const [tabValue, setTabValue] = React.useState(0);
  
  const {
    gateways,
    httpRoutes,
    grpcRoutes,
    tcpRoutes,
    tlsRoutes,
    loading,
    error
  } = useGatewayResources(namespace);

  const handleTabChange = (event: React.ChangeEvent<{}>, newValue: number) => {
    setTabValue(newValue);
  };

  // Transform Gateway API resources into nodes and edges for the map
  const createMeshTopology = () => {
    const nodes: MapNode[] = [];
    const edges: MapEdge[] = [];
    
    // Add Gateway nodes
    gateways.forEach(gateway => {
      nodes.push({
        id: `gateway-${gateway.metadata.namespace}-${gateway.metadata.name}`,
        parentIds: [],
        kind: 'Gateway',
        name: gateway.metadata.name,
        namespace: gateway.metadata.namespace,
        apiVersion: gateway.apiVersion,
        data: gateway,
      });
    });
    
    // Add HTTPRoute nodes and edges
    httpRoutes.forEach(route => {
      const routeId = `httproute-${route.metadata.namespace}-${route.metadata.name}`;
      nodes.push({
        id: routeId,
        parentIds: [],
        kind: 'HTTPRoute',
        name: route.metadata.name,
        namespace: route.metadata.namespace,
        apiVersion: route.apiVersion,
        data: route,
      });
      
      // Connect routes to gateways
      if (route.spec.parentRefs) {
        route.spec.parentRefs.forEach(parent => {
          const gatewayId = `gateway-${parent.namespace || route.metadata.namespace}-${parent.name}`;
          edges.push({
            id: `${routeId}-to-${gatewayId}`,
            from: routeId,
            to: gatewayId,
            label: 'routes to',
          });
        });
      }
      
      // Connect routes to backend services
      if (route.spec.rules) {
        route.spec.rules.forEach((rule, ruleIndex) => {
          if (rule.backendRefs) {
            rule.backendRefs.forEach((backend, backendIndex) => {
              const serviceId = `service-${backend.namespace || route.metadata.namespace}-${backend.name}`;
              
              // Add service node if it doesn't exist
              if (!nodes.some(node => node.id === serviceId)) {
                nodes.push({
                  id: serviceId,
                  parentIds: [],
                  kind: 'Service',
                  name: backend.name,
                  namespace: backend.namespace || route.metadata.namespace,
                  apiVersion: 'v1',
                  data: { kind: 'Service', name: backend.name },
                });
              }
              
              edges.push({
                id: `${routeId}-to-${serviceId}-rule${ruleIndex}-backend${backendIndex}`,
                from: routeId,
                to: serviceId,
                label: backend.weight ? `weight: ${backend.weight}` : undefined,
              });
            });
          }
        });
      }
    });
    
    // Add similar logic for other route types (gRPC, TCP, TLS)
    // For brevity, only showing HTTP routes in detail
    
    return { nodes, edges };
  };
  
  const { nodes, edges } = createMeshTopology();
  
  // Custom node renderer for Gateway API resources
  const renderGatewayNode = (node: MapNode) => {
    let color = '#1976d2'; // Default blue
    let icon = '⬢'; // Default hexagon
    
    switch (node.kind) {
      case 'Gateway':
        color = '#4caf50'; // Green
        icon = '🔀';
        break;
      case 'HTTPRoute':
        color = '#ff9800'; // Orange
        icon = '🌐';
        break;
      case 'GRPCRoute':
        color = '#9c27b0'; // Purple
        icon = '📡';
        break;
      case 'TCPRoute':
        color = '#f44336'; // Red
        icon = '🔌';
        break;
      case 'TLSRoute':
        color = '#2196f3'; // Blue
        icon = '🔒';
        break;
      case 'Service':
        color = '#607d8b'; // Gray
        icon = '⚙️';
        break;
    }
    
    return (
      <div style={{
        padding: '8px',
        backgroundColor: 'white',
        border: `2px solid ${color}`,
        borderRadius: '4px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        minWidth: '120px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '1.2rem', marginBottom: '4px' }}>{icon}</div>
        <div style={{ fontWeight: 'bold', color }}>{node.name}</div>
        <div style={{ fontSize: '0.75rem', color: '#666' }}>{node.kind}</div>
        {node.namespace && node.namespace !== namespace && (
          <div style={{ fontSize: '0.7rem', color: '#999' }}>{node.namespace}</div>
        )}
      </div>
    );
  };
  
  // Handle node click to show details
  const handleNodeClick = (node: MapNode) => {
    console.log('Node clicked:', node);
    // Could open a details panel or dialog here
  };
  
  if (loading) {
    return (
      <div className={classes.loading}>
        <CircularProgress />
      </div>
    );
  }
  
  if (error) {
    return (
      <Paper className={classes.root}>
        <Typography color="error">Error loading Gateway API resources: {error.message}</Typography>
      </Paper>
    );
  }

  return (
    <Paper className={classes.root}>
      <div className={classes.header}>
        <Typography variant="h5">Service Mesh Visualization</Typography>
        <Typography variant="body2" color="textSecondary">
          {namespace ? `Namespace: ${namespace}` : 'All Namespaces'}
        </Typography>
      </div>
      
      <Tabs value={tabValue} onChange={handleTabChange} aria-label="service mesh tabs">
        <Tab label="Topology View" {...a11yProps(0)} />
        <Tab label="Traffic Flow" {...a11yProps(1)} />
        <Tab label="Metrics" {...a11yProps(2)} />
      </Tabs>
      
      <TabPanel value={tabValue} index={0}>
        <div className={classes.mapContainer}>
          <Map 
            nodes={nodes}
            edges={edges}
            renderNode={renderGatewayNode}
            onNodeClick={handleNodeClick}
          />
          
          <Paper className={classes.legend}>
            <Typography variant="subtitle2" gutterBottom>Legend</Typography>
            <div className={classes.legendItem}>
              <div className={classes.legendColor} style={{ backgroundColor: '#4caf50' }} />
              <Typography variant="caption">Gateway</Typography>
            </div>
            <div className={classes.legendItem}>
              <div className={classes.legendColor} style={{ backgroundColor: '#ff9800' }} />
              <Typography variant="caption">HTTPRoute</Typography>
            </div>
            <div className={classes.legendItem}>
              <div className={classes.legendColor} style={{ backgroundColor: '#9c27b0' }} />
              <Typography variant="caption">GRPCRoute</Typography>
            </div>
            <div className={classes.legendItem}>
              <div className={classes.legendColor} style={{ backgroundColor: '#f44336' }} />
              <Typography variant="caption">TCPRoute</Typography>
            </div>
            <div className={classes.legendItem}>
              <div className={classes.legendColor} style={{ backgroundColor: '#2196f3' }} />
              <Typography variant="caption">TLSRoute</Typography>
            </div>
            <div className={classes.legendItem}>
              <div className={classes.legendColor} style={{ backgroundColor: '#607d8b' }} />
              <Typography variant="caption">Service</Typography>
            </div>
          </Paper>
        </div>
      </TabPanel>
      
      <TabPanel value={tabValue} index={1}>
        <Typography>Traffic flow visualization coming soon</Typography>
      </TabPanel>
      
      <TabPanel value={tabValue} index={2}>
        <Typography>Service mesh metrics coming soon</Typography>
      </TabPanel>
    </Paper>
  );
}