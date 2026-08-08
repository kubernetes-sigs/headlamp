# Function: registerProjectDetailsTab()

```ts
function registerProjectDetailsTab(projectDetailsTab: ProjectDetailsTab): void;
```

Defined in: [plugin/registry.tsx:1137](https://github.com/SaikiaMan/headlamp/blob/ee95cceb66fcc81536dc274d41f70372e38b6d87/frontend/src/plugin/registry.tsx#L1137)

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
