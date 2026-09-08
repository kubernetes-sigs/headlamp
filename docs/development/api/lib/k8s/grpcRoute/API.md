# lib/k8s/grpcRoute

## Classes

| Class | Description |
| ------ | ------ |
| [GRPCRoute](classes/GRPCRoute.md) | - |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [GRPCRouteMatch](interfaces/GRPCRouteMatch.md) | GRPCRouteMatch defines the predicate used to match requests to a given action. |
| [GRPCRouteRule](interfaces/GRPCRouteRule.md) | GRPCRouteRule defines semantics for matching a gRPC request based on conditions (matches), processing it (filters), and forwarding the request to an API object (backendRefs). |
| [KubeGRPCRoute](interfaces/KubeGRPCRoute.md) | GRPCRoute is a Gateway API type for specifying routing behavior of gRPC requests from a Gateway listener to an API object, i.e. Service. |
