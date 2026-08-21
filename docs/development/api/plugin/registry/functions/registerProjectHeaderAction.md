# Function: registerProjectHeaderAction()

```ts
function registerProjectHeaderAction(projectHeaderAction: ProjectHeaderAction): void;
```

Defined in: [plugin/registry.tsx:1247](https://github.com/Rucha0901/headlamp/blob/db946f8d81732ed8fbecf4752fa84b86cab70c8b/frontend/src/plugin/registry.tsx#L1247)

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
  id: 'view-resources',
  component: ({ setSelectedTab }) => (
    <Button onClick={() => setSelectedTab?.('headlamp-projects.tabs.resources')}>
      View resources
    </Button>
  )
});
```
