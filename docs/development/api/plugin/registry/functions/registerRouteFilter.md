# Function: registerRouteFilter()

```ts
function registerRouteFilter(filterFunc: (entry: Route) => Route | null): void;
```

Defined in: [plugin/registry.tsx:418](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/plugin/registry.tsx#L418)

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
