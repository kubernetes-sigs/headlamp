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

[src/plugin/registry.tsx:387](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/registry.tsx#L387)
