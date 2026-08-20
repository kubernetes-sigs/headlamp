# Function: registerRoute()

```ts
function registerRoute(routeSpec: Route): void;
```

Defined in: [plugin/registry.tsx:467](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L467)

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
