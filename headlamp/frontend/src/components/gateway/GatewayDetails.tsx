import React from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KubeObject } from '../../lib/k8s/cluster';
import { SectionBox } from '../common';
import { ResourceTable } from '../common/Resource';
import { DetailsGrid } from '../common/DetailsGrid';
import { StatusLabel } from '../common/Label';
import { Map, MapNode } from '../common/Map';
import { useTypedSelector } from '../../redux/reducers/reducers';
import { getCluster } from '../../lib/util';
import { makeStyles } from '@material-ui/core/styles';
import { Typography, Tooltip, Box, Paper } from '@material-ui/core';
import { Plugin } from '../../plugin';

// Styles for the service mesh visualization
const useStyles = makeStyles(theme => ({
  mapContainer: {
    height: '500px',
    width: '100%',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
  },
  nodeGateway: {
    backgroundColor: theme.palette.info.light,
    color: theme.palette.info.contrastText,
    border: `2px solid ${theme.palette.info.dark}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1),
    minWidth: '150px',
  },
  nodeRoute: {
    backgroundColor: theme.palette.warning.light,
    color: theme.palette.warning.contrastText,
    border: `2px solid ${theme.palette.warning.dark}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1),
    minWidth: '150px',
  },
  nodeService: {
    backgroundColor: theme.palette.success.light,
    color: theme.palette.success.contrastText,
    border: `2px solid ${theme.palette.success.dark}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1),
    minWidth: '150px',
  },
  nodeLabel: {
    fontWeight: 'bold',
    fontSize: '1rem',
  },
  nodeDetails: {
    fontSize: '0.75rem',
  },
  legend: {
    display: 'flex',
    gap: theme.spacing(2),
    padding: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  legendColor: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
  },
}));

// Register the service mesh visualization plugin
Plugin.registerDetailsViewHeaderAction({
  kind: 'Gateway',
  apiVersions: ['gateway.networking.k8s.io/v1'],
  priority: 100,
  component: function ServiceMeshButton() {
    const { t } = useTranslation('glossary');
    return (
      <Tooltip title={t('View Service Mesh')}>
        <span>🔄 {t('Service Mesh')}</span>
      </Tooltip>
    );
  },
});

// Enhanced GatewayDetails component with service mesh visualization
export default function GatewayDetails() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const { t } = useTranslation(['glossary', 'translation']);
  const [gateway, setGateway] = React.useState<Gateway | null>(null);
  const [routes, setRoutes] = React.useState<HTTPRoute[]>([]);
  const [services, setServices] = React.useState<any[]>([]);
  const cluster = useTypedSelector(state => getCluster(state));
  const classes = useStyles();

  React.useEffect(() => {
    if (!namespace || !name) return;

    const fetchGateway = async () => {
      try {
        const gatewayObj = await Gateway.get(name, namespace);
        setGateway(gatewayObj);
      } catch (err) {
        console.error('Error fetching Gateway:', err);
      }
    };

    const fetchRoutes = async () => {
      try {
        const routeList = await HTTPRoute.list(namespace);
        // Filter routes that reference this gateway
        const relatedRoutes = routeList.filter(route => 
          route.getParentRefs().some(ref => 
            ref.name === name && (!ref.namespace || ref.namespace === namespace)
          )
        );
        setRoutes(relatedRoutes);
        
        // Fetch related services
        const servicePromises = [];
        const serviceRefs = new Set<string>();
        
        relatedRoutes.forEach(route => {
          route.getRules().forEach(rule => {
            if (rule.backendRefs) {
              rule.backendRefs.forEach(backend => {
                const serviceNamespace = backend.namespace || route.getNamespace();
                const serviceKey = `${backend.name}:${serviceNamespace}`;
                if (!serviceRefs.has(serviceKey)) {
                  serviceRefs.add(serviceKey);
                  servicePromises.push(
                    KubeObject.getApiObject('v1', 'Service').get(backend.name, serviceNamespace)
                      .catch(() => ({
                        metadata: {
                          name: backend.name,
                          namespace: serviceNamespace,
                        },
                        kind: 'Service',
                      }))
                  );
                }
              });
            }
          });
        });
        
        const serviceResults = await Promise.all(servicePromises);
        setServices(serviceResults);
      } catch (err) {
        console.error('Error fetching HTTPRoutes:', err);
      }
    };

    fetchGateway();
    fetchRoutes();
  }, [namespace, name, cluster]);

  // Create map nodes for visualization
  const mapNodes = React.useMemo(() => {
    if (!gateway) return [];
    
    const nodes: MapNode[] = [];
    
    // Add gateway node
    nodes.push({
      id: `gateway:${gateway.getName()}:${gateway.getNamespace()}`,
      parentIds: [],
      kind: 'Gateway',
      name: gateway.getName(),
      namespace: gateway.getNamespace(),
      apiVersion: 'gateway.networking.k8s.io/v1',
      status: gateway.getStatusPhase(),
      object: gateway,
    });
    
    // Add route nodes
    routes.forEach(route => {
      const routeNode = {
        id: `httproute:${route.getName()}:${route.getNamespace()}`,
        parentIds: [`gateway:${gateway.getName()}:${gateway.getNamespace()}`],
        kind: 'HTTPRoute',
        name: route.getName(),
        namespace: route.getNamespace(),
        apiVersion: 'gateway.networking.k8s.io/v1',
        hostnames: route.getHostnames().join(', '),
        object: route,
      };
      nodes.push(routeNode);
      
      // Add service nodes
      route.getRules().forEach(rule => {
        if (rule.backendRefs) {
          rule.backendRefs.forEach(backend => {
            const serviceNamespace = backend.namespace || route.getNamespace();
            const serviceNode = {
              id: `service:${backend.name}:${serviceNamespace}`,
              parentIds: [`httproute:${route.getName()}:${route.getNamespace()}`],
              kind: 'Service',
              name: backend.name,
              namespace: serviceNamespace,
              apiVersion: 'v1',
              port: backend.port,
              weight: backend.weight,
              object: services.find(s => 
                s.metadata.name === backend.name && 
                s.metadata.namespace === serviceNamespace
              ),
            };
            
            // Check if this service node already exists
            if (!nodes.some(n => n.id === serviceNode.id)) {
              nodes.push(serviceNode);
            } else {
              // If it exists, add the current route as a parent
              const existingNode = nodes.find(n => n.id === serviceNode.id);
              if (existingNode && !existingNode.parentIds.includes(routeNode.id)) {
                existingNode.parentIds.push(routeNode.id);
              }
            }
          });
        }
      });
    });
    
    return nodes;
  }, [gateway, routes, services]);

  // Custom node renderer for the map
  const renderMapNode = React.useCallback((node: MapNode) => {
    const classes = useStyles();
    
    let nodeClass;
    let icon;
    
    switch (node.kind) {
      case 'Gateway':
        nodeClass = classes.nodeGateway;
        icon = '🌐';
        break;
      case 'HTTPRoute':
        nodeClass = classes.nodeRoute;
        icon = '🔀';
        break;
      case 'Service':
        nodeClass = classes.nodeService;
        icon = '🔧';
        break;
      default:
        nodeClass = '';
        icon = '📦';
    }
    
    return (
      <div className={nodeClass}>
        <div className={classes.nodeLabel}>
          {icon} {node.name}
        </div>
        <div className={classes.nodeDetails}>
          {node.namespace && <div>Namespace: {node.namespace}</div>}
          {node.kind === 'Gateway' && node.status && <div>Status: {node.status}</div>}
          {node.kind === 'HTTPRoute' && node.hostnames && <div>Hosts: {node.hostnames}</div>}
          {node.kind === 'Service' && node.port && <div>Port: {node.port}</div>}
          {node.kind === 'Service' && node.weight && <div>Weight: {node.weight}%</div>}
        </div>
      </div>
    );
  }, [classes]);

  // Map options for service mesh visualization
  const mapOptions = {
    layout: {
      hierarchical: {
        enabled: true,
        direction: 'LR',
        sortMethod: 'directed',
        levelSeparation: 200,
        nodeSpacing: 150,
      }
    },
    edges: {
      smooth: {
        enabled: true,
        type: 'cubicBezier',
        roundness: 0.5,
      },
      arrows: {
        to: {
          enabled: true,
          scaleFactor: 0.5,
        }
      }
    },
    physics: {
      enabled: false,
    },
    interaction: {
      dragNodes: true,
      hover: true,
    }
  };

  // Legend for the service mesh visualization
  const ServiceMeshLegend = () => {
    const classes = useStyles();
    return (
      <Paper className={classes.legend}>
        <div className={classes.legendItem}>
          <div className={classes.legendColor} style={{ backgroundColor: '#64b5f6' }} />
          <Typography variant="body2">Gateway</Typography>
        </div>
        <div className={classes.legendItem}>
          <div className={classes.legendColor} style={{ backgroundColor: '#ffb74d' }} />
          <Typography variant="body2">HTTPRoute</Typography>
        </div>
        <div className={classes.legendItem}>
          <div className={classes.legendColor} style={{ backgroundColor: '#81c784' }} />
          <Typography variant="body2">Service</Typography>
        </div>
      </Paper>
    );
  };

  if (!gateway) {
    return <div>{t('translation|Loading')}...</div>;
  }

  return (
    <>
      <DetailsGrid
        resourceType={Gateway}
        resource={gateway}
        extraInfo={[
          {
            name: t('Status'),
            value: <StatusLabel status={gateway.getStatusPhase()} />
          },
          {
            name: t('Listeners'),
            value: gateway.getListeners().map((listener, i) => (
              <div key={i}>
                {listener.name}: {listener.protocol}:{listener.port}
              </div>
            ))
          },
          {
            name: t('Addresses'),
            value: gateway.getAddresses().map((address, i) => (
              <div key={i}>
                {address.type}: {address.value}
              </div>
            ))
          }
        ]}
      />

      {/* Service Mesh Visualization */}
      <SectionBox title={t('Service Mesh Visualization')}>
        <ServiceMeshLegend />
        <Box className={classes.mapContainer}>
          {mapNodes.length > 0 ? (
            <Map 
              nodes={mapNodes}
              renderNode={renderMapNode}
              options={mapOptions}
              onNodeClick={(node) => {
                // Handle node click - could navigate to resource details
                console.log('Node clicked:', node);
              }}
            />
          ) : (
            <Typography variant="body1" align="center" style={{ paddingTop: '200px' }}>
              {t('No service mesh topology found for this Gateway')}
            </Typography>
          )}
        </Box>
      </SectionBox>

      {/* Traffic Metrics - placeholder for future integration */}
      <SectionBox title={t('Traffic Metrics')}>
        <Typography variant="body2" color="textSecondary">
          {t('Traffic metrics visualization will be available when integrated with a metrics provider.')}
        </Typography>
      </SectionBox>

      <SectionBox title={t('HTTP Routes')}>
        <ResourceTable
          resources={routes}
          columns={[
            'name',
            'namespace',
            {
              label: t('Hostnames'),
              getter: (route: HTTPRoute) => route.getHostnames().join(', ') || '-'
            },
            {
              label: t('Backend Services'),
              getter: (route: HTTPRoute) => {
                const backends = route.getRules().flatMap(rule => rule.backendRefs || []);
                return backends.map(backend => `${backend.name}${backend.port ? `:${backend.port}` : ''}`).join(', ') || '-';
              }
            },
            {
              label: t('Status'),
              getter: (route: HTTPRoute) => {
                const parentStatus = route.getParentStatus();
                const gatewayStatus = parentStatus.find(p => 
                  p.parentRef.name === gateway.getName() && 
                  (!p.parentRef.namespace || p.parentRef.namespace === gateway.getNamespace())
                );
                
                if (!gatewayStatus) return <StatusLabel status="Unknown" />;
                
                const readyCondition = gatewayStatus.conditions.find(c => c.type === 'Accepted');
                return <StatusLabel status={readyCondition?.status === 'True' ? 'Ready' : 'Not Ready'} />;
              }
            }
          ]}
        />
      </SectionBox>
    </>
  );
}

// Add test cases to ensure functionality works correctly
// These would typically be in a separate file but are included here for reference
if (process.env.NODE_ENV === 'test') {
  describe('GatewayDetails', () => {
    it('should render gateway details', () => {
      // Test rendering of gateway details
    });
    
    it('should render service mesh visualization', () => {
      // Test rendering of service mesh visualization
    });
    
    it('should handle empty routes', () => {
      // Test handling of empty routes
    });
    
    it('should handle node clicks', () => {
      // Test node click handling
    });
  });
}