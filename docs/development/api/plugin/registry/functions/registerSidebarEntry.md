# Function: registerSidebarEntry()

```ts
function registerSidebarEntry(__namedParameters: SidebarEntryProps): void;
```

Defined in: [plugin/registry.tsx:301](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L301)

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
