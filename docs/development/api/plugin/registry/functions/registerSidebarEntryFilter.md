# Function: registerSidebarEntryFilter()

```ts
function registerSidebarEntryFilter(filterFunc: (entry: SidebarEntryProps) => SidebarEntryProps | null): void;
```

Defined in: [plugin/registry.tsx:402](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L402)

Filter or modify IN_CLUSTER sidebar menu items.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `filterFunc` | (`entry`: [`SidebarEntryProps`](../interfaces/SidebarEntryProps.md)) => [`SidebarEntryProps`](../interfaces/SidebarEntryProps.md) \| `null` | a function for filtering or modifying IN_CLUSTER sidebar entries. Return null to remove the entry, or the (optionally modified) entry to keep it. |

## Returns

`void`

## Example

```tsx
import { registerSidebarEntryFilter } from '@kinvolk/headlamp-plugin/lib';

registerSidebarEntryFilter(entry => (entry.name === 'workloads' ? null : entry));
```
