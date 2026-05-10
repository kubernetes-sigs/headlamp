/**
 * Kmesh API abstraction layer.
 * 
 * TODO (Phase 2): Implement real Kubernetes resource fetching using Headlamp's K8s API.
 * This file will export functions or classes to fetch Kmesh-related CRDs, such as
 * Workloads, Waypoints, or custom mesh configuration objects.
 * 
 * Example Headlamp K8s API usage:
 * import { K8s } from '@kinvolk/headlamp-plugin/lib/K8s';
 * export const kmeshWorkloads = K8s.ResourceClasses.CustomResourceDefinition.makeCustomResourceClass(...);
 */

export interface MockResource {
  id: string;
  name: string;
  status: 'Active' | 'Inactive' | 'Pending';
  namespace: string;
}

// Placeholder mock data for Phase 1
export const fetchMockKmeshResources = (): Promise<MockResource[]> => {
  return Promise.resolve([
    { id: '1', name: 'kmesh-gateway', status: 'Active', namespace: 'istio-system' },
    { id: '2', name: 'productpage-workload', status: 'Active', namespace: 'default' },
    { id: '3', name: 'reviews-waypoint', status: 'Pending', namespace: 'default' },
  ]);
};
