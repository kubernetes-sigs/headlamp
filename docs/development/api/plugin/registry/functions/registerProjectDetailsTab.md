# Function: registerProjectDetailsTab()

```ts
function registerProjectDetailsTab(projectDetailsTab: ProjectDetailsTab): void
```

Register a new tab in the project details view.

This allows plugins to add custom tabs to the project details page,
extending the information displayed about a project.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `projectDetailsTab` | `ProjectDetailsTab` | The tab configuration to register |

## Returns

`void`

## Example

```tsx
registerProjectDetailsTab({
  id: 'custom-metrics',
  label: 'Metrics',
  component: ({ project }) => <ProjectMetrics project={project} />
});
```

## Defined in

[src/plugin/registry.tsx:1092](https://github.com/kubernetes-sigs/headlamp/blob/4f6ccb46282ab9a5d4439bf075672ad3d4cd1113/frontend/src/plugin/registry.tsx#L1092)
