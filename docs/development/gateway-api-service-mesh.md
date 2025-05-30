# Gateway API Service Mesh Visualization

Headlamp now includes support for visualizing Gateway API resources as a service mesh. This feature allows users to understand the relationships between Gateway API resources and services in their Kubernetes cluster.

## Overview

The Gateway API is becoming the standard for Kubernetes service networking, including ingress, traffic routing, and service mesh use cases. Headlamp's service mesh visualization provides an interactive map of Gateway API resources and their relationships.

## Features

- **Visual Topology Map**: See the relationships between Gateways, Routes, and Services
- **Resource Details**: View detailed information about each resource in the mesh
- **Traffic Flow Visualization**: Understand how traffic flows through your service mesh
- **Filtering**: Filter the view by namespace or resource type

## Supported Gateway API Resources

The following Gateway API resources are supported:

- Gateways
- HTTPRoutes
- GRPCRoutes
- TCPRoutes
- TLSRoutes

## Using the Service Mesh Visualization

1. Navigate to the "Gateway API" section in the sidebar
2. Select "Service Mesh" to view the service mesh visualization
3. Use the tabs to switch between different views:
   - **Topology View**: Shows the relationships between resources
   - **Traffic Flow**: Visualizes traffic patterns (coming soon)
   - **Metrics**: Shows performance metrics (coming soon)

## Extending the Service Mesh Visualization

Plugins can extend the service mesh visualization by registering custom node renderers for Gateway API resources. See the [Extending the Map](./plugins/functionality/extending-the-map.md) documentation for more details.

## Implementation Details

The service mesh visualization is built on top of Headlamp's Map component, which provides a flexible framework for visualizing relationships between resources. The Gateway API resources are fetched using the Kubernetes API and transformed into nodes and edges for the map.

### Key Components

- `ServiceMeshView.tsx`: The main component for the service mesh visualization
- `hooks.ts`: Custom hooks for fetching Gateway API resources
- `GatewayNodeRenderers.tsx`: Custom renderers for Gateway API resources

## Future Enhancements

- Real-time traffic flow visualization
- Integration with metrics providers (Prometheus, etc.)
- Support for additional Gateway API resources
- Detailed policy visualization