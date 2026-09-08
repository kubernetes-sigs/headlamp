# lib/k8s/gateway

## Classes

| Class | Description |
| ------ | ------ |
| [Gateway](classes/Gateway.md) | - |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [GatewayBackendReference](interfaces/GatewayBackendReference.md) | BackendObjectReference identifies a backend API object to which a route can forward traffic. |
| [GatewayL4RouteRule](interfaces/GatewayL4RouteRule.md) | L4RouteRule defines a TCPRoute or UDPRoute rule and its backend references. |
| [GatewayL4RouteSpec](interfaces/GatewayL4RouteSpec.md) | The common spec shared by Gateway API L4 route resources. |
| [GatewayL4RouteStatus](interfaces/GatewayL4RouteStatus.md) | The common status shared by Gateway API L4 route resources. |
| [GatewayListener](interfaces/GatewayListener.md) | Listener embodies the concept of a logical endpoint where a Gateway accepts network connections. |
| [GatewayListenerStatus](interfaces/GatewayListenerStatus.md) | ListenerStatus is the status associated with a Listener. |
| [GatewayParentReference](interfaces/GatewayParentReference.md) | ParentReference identifies an API object (usually a Gateway) that can be considered a parent of this resource (usually a route). |
| [GatewayRouteParentStatus](interfaces/GatewayRouteParentStatus.md) | RouteParentStatus describes the status of a route as seen by one of its parents. |
| [GatewayStatusAddress](interfaces/GatewayStatusAddress.md) | GatewayStatusAddress describes a network address that is bound to a Gateway. |
| [KubeGateway](interfaces/KubeGateway.md) | Gateway represents an instance of a service-traffic handling infrastructure by binding Listeners to a set of IP addresses. |
| [KubeGatewayL4Route](interfaces/KubeGatewayL4Route.md) | The common Kubernetes object shape shared by Gateway API L4 route resources. |
