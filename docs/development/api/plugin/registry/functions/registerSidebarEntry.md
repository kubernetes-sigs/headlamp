# Function: registerSidebarEntry()

```ts
function registerSidebarEntry(__namedParameters: SidebarEntryProps): void
```

Add a Sidebar Entry to the menu (on the left side of Headlamp).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `__namedParameters` | [`SidebarEntryProps`](../interfaces/SidebarEntryProps.md) |

## Returns

`void`

## Example

```tsx
import { registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';
registerSidebarEntry({ parent: 'cluster', name: 'traces', label: 'Traces', url: '/traces' });

```

## See

[Sidebar Example](http://github.com/kinvolk/headlamp/plugins/examples/sidebar/)

## Defined in

[src/plugin/registry.tsx:293](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L293)
