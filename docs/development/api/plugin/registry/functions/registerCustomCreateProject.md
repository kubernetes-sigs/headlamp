# Function: registerCustomCreateProject()

```ts
function registerCustomCreateProject(customCreateProject: CustomCreateProject): void
```

Register a new way to create Headlamp 'Projects'

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `customCreateProject` | `CustomCreateProject` | Definition for custom creator |

## Returns

`void`

## Example

```tsx
registerCustomCreateProject({
  id: "custom-create",
  name: "Create Helm Project",
  description: "Create new project from Helm chart",
  Component: ({onBack}) => <div>
    Create project
    <input name="helm-chart-id" />
    <button>Create</button>
    <button onClick={onBack}>Back</button>
  </div>,
})
```

## Defined in

[src/plugin/registry.tsx:1066](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L1066)
