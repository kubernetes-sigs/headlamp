# Function: registerSidebarEntry()

```ts
function registerSidebarEntry(__namedParameters: SidebarEntryProps): void;
```

Defined in: [plugin/registry.tsx:323](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L323)

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
