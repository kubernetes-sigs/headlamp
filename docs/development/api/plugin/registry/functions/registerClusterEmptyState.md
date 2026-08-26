# Function: registerClusterEmptyState()

```ts
function registerClusterEmptyState(component: ClusterEmptyStateComponent): void;
```

Defined in: [plugin/registry.tsx:990](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L990)

Replace the empty state shown on the Home page when no clusters are configured.

The component receives Headlamp's default content so a product can wrap it.
Registering another component replaces the previous registration.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `component` | `ClusterEmptyStateComponent` | Product-owned empty state component. |

## Returns

`void`

Nothing.

## Example

```tsx
import { registerClusterEmptyState } from '@kinvolk/headlamp-plugin/lib';

registerClusterEmptyState(({ defaultContent }) => (
  <section>
    <p>Choose how to connect your first cluster.</p>
    {defaultContent}
  </section>
));
```
