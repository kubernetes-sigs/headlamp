# Function: registerSidebarEntry()

```ts
function registerSidebarEntry(__namedParameters: SidebarEntryProps): void;
```

Defined in: [plugin/registry.tsx:303](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L303)

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
