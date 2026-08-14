# Function: registerRoute()

```ts
function registerRoute(routeSpec: Route): void;
```

Defined in: [plugin/registry.tsx:445](https://github.com/mishradwaterlaw/headlamp/blob/fa170d1f3805256c3d561c39c317801d0e2be4b3/frontend/src/plugin/registry.tsx#L445)

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
