# Function: registerKindIcon()

```ts
function registerKindIcon(
   kind: string, 
   definition: IconDefinition, 
   apiGroup?: string): void;
```

Defined in: [plugin/registry.tsx:909](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L909)

Register Icon for a resource kind

By default, icons are matched only by `kind`.
Optionally, `apiGroup` can be provided to differentiate resources that share the same kind across different API groups.

When `apiGroup` is provided, Headlamp will:
1. First try to match `${apiGroup}/${kind}`.
2. Fall back to `kind` if no match is found.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `kind` | `string` | Resource kind |
| `definition` | [`IconDefinition`](../interfaces/IconDefinition.md) | icon definition |
| `apiGroup?` | `string` | Kubernetes API group, optional |

## Returns

`void`

## Example

Kind only Matching
```tsx
registerKindIcon("MyCustomResource", { icon: <MyIcon />, color: "#FF0000" })
```

Match only networking service
```tsx
registerKindIcon("Service", { icon: <NetworkingServiceIcon /> }, "networking.k8s.io");
```
