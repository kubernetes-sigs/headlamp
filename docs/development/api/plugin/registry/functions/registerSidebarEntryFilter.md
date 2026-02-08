# Function: registerSidebarEntryFilter()

```ts
function registerSidebarEntryFilter(filterFunc: (entry: SidebarEntryProps) => null | SidebarEntryProps): void
```

Remove sidebar menu items.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `filterFunc` | (`entry`: [`SidebarEntryProps`](../interfaces/SidebarEntryProps.md)) => `null` \| [`SidebarEntryProps`](../interfaces/SidebarEntryProps.md) | a function for filtering sidebar entries. |

## Returns

`void`

## Example

```tsx
import { registerSidebarEntryFilter } from '@kinvolk/headlamp-plugin/lib';

registerSidebarEntryFilter(entry => (entry.name === 'workloads' ? null : entry));
```

## Defined in

[src/plugin/registry.tsx:368](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/registry.tsx#L368)
