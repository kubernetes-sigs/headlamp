# Function: registerCustomCreateProject()

```ts
function registerCustomCreateProject(customCreateProject: CustomCreateProject): void;
```

Defined in: [plugin/registry.tsx:1159](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L1159)

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
