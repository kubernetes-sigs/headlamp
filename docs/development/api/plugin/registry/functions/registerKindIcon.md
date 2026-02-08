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

[src/plugin/registry.tsx:842](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/registry.tsx#L842)
