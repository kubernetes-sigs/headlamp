# Function: registerProjectHeaderAction()

```ts
function registerProjectHeaderAction(projectHeaderAction: ProjectHeaderAction): void
```

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

## Defined in

[src/plugin/registry.tsx:1151](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L1151)
