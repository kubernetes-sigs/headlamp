# Function: registerRouteFilter()

```ts
function registerRouteFilter(filterFunc: (entry: Route) => null | Route): void
```

Remove routes.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `filterFunc` | (`entry`: `Route`) => `null` \| `Route` | a function for filtering routes. |

## Returns

`void`

## Example

```tsx
import { registerRouteFilter } from '@kinvolk/headlamp-plugin/lib';

registerRouteFilter(route => (route.path === '/workloads' ? null : route));
```

## Defined in

[src/plugin/registry.tsx:387](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L387)
