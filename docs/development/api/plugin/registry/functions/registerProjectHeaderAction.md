# Function: registerProjectHeaderAction()

```ts
function registerProjectHeaderAction(projectHeaderAction: ProjectHeaderAction): void;
```

Defined in: [plugin/registry.tsx:1196](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L1196)

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
