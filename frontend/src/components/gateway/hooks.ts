import { useEffect, useState } from 'react';
import { apiFactoryWithNamespace } from '../../lib/k8s/apiProxy';

// Define Gateway API resource types
interface GatewayResource {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
    [key: string]: any;
  };
  spec: any;
  status?: any;
}

interface GatewaySpec {
  gatewayClassName: string;
  listeners: {
    name: string;
    port: number;
    protocol: string;
    [key: string]: any;
  }[];
  [key: string]: any;
}

interface RouteSpec {
  parentRefs?: {
    name: string;
    namespace?: string;
    sectionName?: string;
    [key: string]: any;
  }[];
  rules?: {
    backendRefs?: {
      name: string;
      namespace?: string;
      port?: number;
      weight?: number;
      [key: string]: any;
    }[];
    [key: string]: any;
  }[];
  [key: string]: any;
}

interface Gateway extends GatewayResource {
  spec: GatewaySpec;
}

interface HTTPRoute extends GatewayResource {
  spec: RouteSpec;
}

interface GRPCRoute extends GatewayResource {
  spec: RouteSpec;
}

interface TCPRoute extends GatewayResource {
  spec: RouteSpec;
}

interface TLSRoute extends GatewayResource {
  spec: RouteSpec;
}

// Create API factories for Gateway API resources
const gatewayAPI = apiFactoryWithNamespace({
  apiVersion: 'gateway.networking.k8s.io/v1beta1',
  kind: 'Gateway',
});

const httpRouteAPI = apiFactoryWithNamespace({
  apiVersion: 'gateway.networking.k8s.io/v1beta1',
  kind: 'HTTPRoute',
});

const grpcRouteAPI = apiFactoryWithNamespace({
  apiVersion: 'gateway.networking.k8s.io/v1alpha2',
  kind: 'GRPCRoute',
});

const tcpRouteAPI = apiFactoryWithNamespace({
  apiVersion: 'gateway.networking.k8s.io/v1alpha2',
  kind: 'TCPRoute',
});

const tlsRouteAPI = apiFactoryWithNamespace({
  apiVersion: 'gateway.networking.k8s.io/v1alpha2',
  kind: 'TLSRoute',
});

// Hook to fetch Gateway API resources
export function useGatewayResources(namespace?: string) {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [httpRoutes, setHttpRoutes] = useState<HTTPRoute[]>([]);
  const [grpcRoutes, setGrpcRoutes] = useState<GRPCRoute[]>([]);
  const [tcpRoutes, setTcpRoutes] = useState<TCPRoute[]>([]);
  const [tlsRoutes, setTlsRoutes] = useState<TLSRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchResources = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch all Gateway API resources in parallel
        const [
          gatewaysResponse,
          httpRoutesResponse,
          grpcRoutesResponse,
          tcpRoutesResponse,
          tlsRoutesResponse
        ] = await Promise.all([
          gatewayAPI.list(namespace),
          httpRouteAPI.list(namespace),
          grpcRouteAPI.list(namespace).catch(() => []), // Alpha resources might not be available
          tcpRouteAPI.list(namespace).catch(() => []),
          tlsRouteAPI.list(namespace).catch(() => [])
        ]);
        
        setGateways(gatewaysResponse);
        setHttpRoutes(httpRoutesResponse);
        setGrpcRoutes(grpcRoutesResponse);
        setTcpRoutes(tcpRoutesResponse);
        setTlsRoutes(tlsRoutesResponse);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch Gateway API resources'));
      } finally {
        setLoading(false);
      }
    };
    
    fetchResources();
  }, [namespace]);
  
  return {
    gateways,
    httpRoutes,
    grpcRoutes,
    tcpRoutes,
    tlsRoutes,
    loading,
    error
  };
}

// Hook to fetch metrics for Gateway API resources (placeholder for future implementation)
export function useGatewayMetrics(namespace?: string, resourceName?: string, resourceKind?: string) {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // This would be implemented to fetch metrics from Prometheus or other sources
  // For now, it's just a placeholder
  
  return { metrics, loading, error };
}