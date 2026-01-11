# Function: registerRoute()

```ts
function registerRoute(routeSpec: Route): void
```

Add a Route for a component.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `routeSpec` | `Route` | details of URL, highlighted sidebar and component to use. |

## Returns

`void`

## Example

```tsx
import { registerRoute } from '@kinvolk/headlamp-plugin/lib';

// Add a route that will display the given component and select
// the "traces" sidebar item.
registerRoute({
  path: '/traces',
  sidebar: 'traces',
  component: () => <TraceList />
});
```

## See

 - [Route examples](https://github.com/kinvolk/headlamp/blob/main/frontend/src/lib/router.tsx)
 - [Sidebar Example](http://github.com/kinvolk/headlamp/plugins/examples/sidebar/)

## Defined in

[src/plugin/registry.tsx:414](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L414)
