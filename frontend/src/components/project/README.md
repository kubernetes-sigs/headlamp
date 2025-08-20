# Projects Feature

This document describes the new Projects feature in Headlamp, which allows users to organize and group Kubernetes resources into logical projects.

## Overview

The Projects feature provides a user-friendly way to:

- Define custom projects with label and namespace selectors
- View all resources that belong to a project
- Filter and organize resources by project
- Create, edit, and delete project definitions

## Components

### ProjectList.tsx

- **Purpose**: Displays all user-defined projects in a card-based layout
- **Features**:
  - Shows project name, description, and icon with custom colors
  - Displays resource counts and namespace summaries
  - Provides "Create Project" button for new projects
  - Clickable cards navigate to project details

### ProjectForm.tsx

- **Purpose**: Form for creating and editing project definitions
- **Features**:
  - Basic project information (name, description, color, icon)
  - Label selector configuration with operators (Equals, NotEquals, Exists, NotExists)
  - Namespace selector configuration
  - Form validation for required fields
  - Support for both create and edit modes

### ProjectDetails.tsx

- **Purpose**: Detailed view of a single project
- **Features**:
  - Project overview with metadata
  - Resource statistics by type
  - List of all matching resources
  - Edit and delete actions
  - Confirmation dialogs for destructive actions

### projectUtils.ts

- **Purpose**: Utility functions for project operations
- **Functions**:
  - `matchesProject()`: Check if a resource matches a project
  - `getProjectResources()`: Get all resources for a project
  - `getProjectsForResource()`: Get all projects for a resource
  - `matchesLabelSelector()`: Check if labels match a selector

## Redux Integration

### projectsSlice.ts

- **State Structure**:
  - `projects`: Object mapping project IDs to ProjectDefinition objects
- **Actions**:
  - `createProject`: Create a new project
  - `updateProject`: Update an existing project
  - `deleteProject`: Delete a project
  - `importProjects`: Import projects from external source
  - `clearProjects`: Clear all projects
- **Persistence**: Projects are automatically saved to localStorage

## Project Definition Schema

```typescript
interface ProjectDefinition {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;

  // Selection criteria
  labelSelectors: ProjectLabelSelector[];
  namespaceSelectors: ProjectNamespaceSelector[];

  // Metadata
  createdAt: string;
  updatedAt: string;
}

interface ProjectLabelSelector {
  key: string;
  value?: string;
  operator: 'Equals' | 'NotEquals' | 'Exists' | 'NotExists';
}

interface ProjectNamespaceSelector {
  name: string;
}
```

## Navigation and Routing

Projects are accessible from both the home sidebar and the in-cluster sidebar:

- `/projects` - Project list
- `/project/create` - Create new project
- `/project/:projectId` - Project details
- `/project/:projectId/edit` - Edit project

## Usage Examples

### Creating a Project

1. Navigate to Projects from the sidebar
2. Click "Create Project"
3. Fill in project details:
   - Name: "My Web App"
   - Description: "Frontend and backend services"
   - Color: Blue
   - Icon: mdi:application
4. Add label selectors:
   - Key: "app.kubernetes.io/name", Operator: "Equals", Value: "my-web-app"
   - Key: "component", Operator: "Exists"
5. Add namespace selectors:
   - Namespace: "production"
6. Save the project

### Viewing Project Resources

1. Click on a project card from the project list
2. View project overview with resource counts
3. See all matching resources organized by type
4. Edit or delete the project as needed

## Implementation Notes

- Projects are stored in localStorage using the key `headlamp-projects`
- Resource matching is performed client-side using the Kubernetes API
- The UI supports both light and dark themes
- All components are fully internationalized using react-i18next
- TypeScript provides full type safety for project definitions

## Future Enhancements

Potential improvements that could be added:

- Export/import project definitions
- Project templates for common use cases
- Resource filtering by project in other views
- Project-based RBAC integration
- Project dashboards with metrics and alerts
