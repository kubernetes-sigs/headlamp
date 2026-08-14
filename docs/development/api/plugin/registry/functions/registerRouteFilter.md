# Function: registerRouteFilter()

```ts
function registerRouteFilter(filterFunc: (entry: Route) => Route | null): void;
```

Defined in: [plugin/registry.tsx:418](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L418)

Filter or modify routes.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `filterFunc` | (`entry`: `Route`) => `Route` \| `null` | a function for filtering or modifying routes. Return null to remove the route, or the (optionally modified) route to keep it. |

## Returns

`void`

## Example

```tsx
import { registerRouteFilter } from '@kinvolk/headlamp-plugin/lib';

registerRouteFilter(route => (route.path === '/workloads' ? null : route));
```
