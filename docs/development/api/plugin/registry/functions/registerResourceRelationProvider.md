# Function: registerResourceRelationProvider()

```ts
function registerResourceRelationProvider(relation: Relation): void;
```

Defined in: [plugin/registry.tsx:1320](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L1320)

Registers a custom resource relation definition (a Relation object) for the Resource Map.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `relation` | [`Relation`](../interfaces/Relation.md) | The Relation definition object to add. Note: relation.id must be globally unique (across core, CRD, and plugin relations) to prevent silent edge loss and collision-based deduplication issues. It is highly recommended to namespace the ID with the plugin name (e.g., `'my-plugin.deployment-secret'`). |

## Returns

`void`

## Example

```tsx
registerResourceRelationProvider({
  id: 'my-plugin.deployment-secret',
  fromSource: 'apps/Deployment',
  toSource: 'Secret',
  label: 'Uses Secret',
  predicate: (from, to) => ...
});
```
