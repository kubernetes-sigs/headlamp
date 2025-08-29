# Projects customization example

This plugin demonstrates how to customize projects feature including:

- Custom project creation workflows
- Custom project details tabs
- Custom project overview sections
- Custom project list processors (extend or modify project discovery)

```bash
cd plugins/examples/projects
npm start
```

The main code for the example plugin is in [src/index.tsx](src/index.tsx).

## Project List Processors

The `registerProjectListProcessor` function allows plugins to extend or modify how projects are discovered and listed. Processors receive the current list of projects (from namespaces or previous processors) and can:

- Add new projects from Custom Resources, external APIs, or other sources
- Filter existing projects based on conditions
- Modify project properties like namespaces or clusters
- Completely replace the project list if needed

### Key Features

- **Additive by default**: Processors receive existing projects and can extend the list
- **Chainable**: Multiple processors can be registered and will run in sequence
- **Error handling**: Failed processors don't break the application
- **Duplicate prevention**: Easy to check for existing projects by ID

### Example Usage

```typescript
// Add new projects while keeping existing ones
registerProjectListProcessor((currentProjects) => {
  const newProjects = [
    {
      id: 'my-custom-project',
      namespaces: ['default', 'kube-system'],
      clusters: ['cluster1']
    }
  ];

  // Only add projects that don't already exist
  const existingIds = currentProjects.map(p => p.id);
  const projectsToAdd = newProjects.filter(p => !existingIds.includes(p.id));

  return [...currentProjects, ...projectsToAdd];
});
```

This approach ensures backward compatibility while providing maximum flexibility for project customization.
