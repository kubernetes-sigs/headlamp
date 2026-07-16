# Function: registerHomeSidebarEntryFilter()

```ts
function registerHomeSidebarEntryFilter(filterFunc: (entry: SidebarEntryProps) => SidebarEntryProps | null): void;
```

Defined in: [plugin/registry.tsx:399](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L399)

Filter HOME sidebar menu items (return null to remove, or return a modified entry to update it).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `filterFunc` | (`entry`: [`SidebarEntryProps`](../interfaces/SidebarEntryProps.md)) => [`SidebarEntryProps`](../interfaces/SidebarEntryProps.md) \| `null` | a function for filtering or modifying HOME sidebar entries. Return null to remove the entry, or the (optionally modified) entry to keep it. |

## Returns

`void`

## Example

```tsx
import { registerHomeSidebarEntryFilter } from '@kinvolk/headlamp-plugin/lib';

registerHomeSidebarEntryFilter(entry => (entry.name === 'settings' ? null : entry));
```
