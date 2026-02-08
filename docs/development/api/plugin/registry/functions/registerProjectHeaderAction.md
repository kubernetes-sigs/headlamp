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

[src/plugin/registry.tsx:1151](https://github.com/zyzzmohit/headlamp/blob/5c039e27e936e8174f45bbfcab8979134d6fb3fc/frontend/src/plugin/registry.tsx#L1151)
