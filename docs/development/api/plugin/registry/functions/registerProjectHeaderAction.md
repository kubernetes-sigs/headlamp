# Function: registerProjectHeaderAction()

```ts
function registerProjectHeaderAction(projectHeaderAction: ProjectHeaderAction): void;
```

Defined in: [plugin/registry.tsx:1198](https://github.com/kehach07/headlamp/blob/7b4a853c98ea719589ddb64289f86ea94e08b877/frontend/src/plugin/registry.tsx#L1198)

Register a new action button in the project details header.

This allows plugins to add custom action buttons next to the delete button
in the project details page header.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `projectHeaderAction` | `ProjectHeaderAction` | The action configuration to register |

## Returns

`void`

## Example

```tsx
registerProjectHeaderAction({
  id: 'deploy-app',
  component: ({ project }) => (
    <Button onClick={() => navigate(`/deploy/${project.id}`)}>
      Deploy App
    </Button>
  )
});
```
