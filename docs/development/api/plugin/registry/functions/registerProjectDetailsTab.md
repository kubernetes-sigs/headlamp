# Function: registerProjectDetailsTab()

```ts
function registerProjectDetailsTab(projectDetailsTab: ProjectDetailsTab): void;
```

Defined in: [plugin/registry.tsx:1185](https://github.com/mishradwaterlaw/headlamp/blob/5944f5d61f18c73406d793336db6720caacb9130/frontend/src/plugin/registry.tsx#L1185)

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
