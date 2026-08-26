# Function: registerCustomCreateProject()

```ts
function registerCustomCreateProject(customCreateProject: CustomCreateProject): void;
```

Defined in: [plugin/registry.tsx:1113](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L1113)

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
