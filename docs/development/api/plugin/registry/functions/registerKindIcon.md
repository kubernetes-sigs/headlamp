# Function: registerKindIcon()

```ts
function registerKindIcon(kind: string, definition: IconDefinition): void
```

Register Icon for a resource kind

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `kind` | `string` | Resource kind |
| `definition` | [`IconDefinition`](../interfaces/IconDefinition.md) | icon definition |

## Returns

`void`

## Example

```tsx
registerKindIcon("MyCustomResource", { icon: <MyIcon />, color: "#FF0000" })
```

## Defined in

[src/plugin/registry.tsx:842](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L842)
