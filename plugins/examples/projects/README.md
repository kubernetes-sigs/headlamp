# Projects customization example

This plugin demonstrates how to customize projects feature, including:

- Replacing a built-in project creation choice
- Adding custom tabs to project details
- Overriding default tabs with custom implementations
- Removing default tabs entirely

## Features Demonstrated

### 1. Project Creation Replacement

Replaces Headlamp's built-in "New Project" choice by registering a custom
creator with `DefaultCreateProject.NEW_PROJECT`.

### 2. Custom Tab Addition

Adds a new "Metrics" tab to show custom project metrics.

### 3. Default Tab Override

Replaces the default "Access" tab with a completely custom implementation that shows:

- Project information summary
- Custom access control interface mockup
- Implementation guidance

### 4. Tab Removal (commented example)

Shows how to remove default tabs by setting `component: undefined`.

### 5. Conditional Tab

Shows how to register a Tab that is only displayed for certain projects.

## Running the Example

```bash
cd plugins/examples/projects
npm start
```

Navigate to any project details page to see the customizations in action.

## Key Implementation Details

- **Tab IDs**: Uses predefined IDs like `headlamp-projects.tabs.access` to override defaults
- **Project creation IDs**: Uses `DefaultCreateProject.NEW_PROJECT` to replace a built-in choice
- **Custom Components**: Shows how to create rich custom tab content
- **Project Data**: Demonstrates accessing project and resource information
- **Styling**: Examples of inline styling for custom interfaces

The main code for the example plugin is in [src/index.tsx](src/index.tsx).
