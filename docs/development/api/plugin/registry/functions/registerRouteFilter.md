# Function: registerRouteFilter()

```ts
function registerRouteFilter(filterFunc: (entry: Route) => Route | null): void;
```

Defined in: [plugin/registry.tsx:440](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L440)

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
