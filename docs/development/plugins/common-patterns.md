---
title: Common Plugin Patterns
sidebar_position: 3
---

# Common Plugin Patterns

This guide shows common patterns for Headlamp plugins with examples.

## Using the Examples

Each pattern has a working example in the `plugins/examples/` directory. To try an example:

1. Go to the example directory: `cd plugins/examples/[example-name]`
2. Install dependencies: `npm install`
3. Start the server: `npm start`
4. Open Headlamp to see the plugin.

You can also find all examples on [GitHub](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples).

## UI Extension Patterns

### 1. Adding to the App Bar

Show dynamic information in the top navigation bar.

**Use Cases:**
- Cluster statistics
- System health
- Quick actions
- Global information

**Example: Pod Counter**

See the [Pod Counter example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/pod-counter/). It shows how to:
- Use the K8s API to count pods.
- Show the count in the app bar with status colors.
- Handle loading and errors.

The example uses `registerAppBarAction`.

### 2. Custom Sidebar Navigation

Add new sections to the sidebar.

**Use Cases:**
- Custom dashboards
- External tool links
- Special resource views
- Admin tools
- New sidebars

**Example: Sidebar Items**

See the [Sidebar example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/sidebar/). It shows how to:
- Add top-level sidebar items.
- Add nested items.
- Remove sidebar items and routes.
- Create custom routes.

The example uses `registerSidebarEntry`, `registerSidebarEntryFilter`, `registerRoute`, and `registerRouteFilter`.

### 3. Enhancing Resource Details

Add custom sections to resource detail pages.

**Use Cases:**
- Extra resource metadata
- External system links
- Custom actions
- Related resource info

**Example: Details View Enhancements**

See the [Details View example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/details-view/). It shows how to:
- Add custom sections to detail pages.
- Add action buttons to the header.
- Access and show resource data.
- Work with ConfigMaps.

The example uses `registerDetailsViewSection` and `registerDetailsViewHeaderAction`.

### 4. Customizing Tables

Add custom actions to resource tables.

**Use Cases:**
- Context menus for table rows
- Custom table columns
- Row-level actions
- Better data display

**Example: Table Customization**

See the [Tables example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/tables/). It shows how to:
- Override existing table views.
- Add context menus to rows.
- Implement custom row actions.
- Work with table data.

### 5. App Integration

Integrate with external tools and desktop app features.

**Use Cases:**
- Run local commands
- Desktop app menus
- External tool shortcuts
- System integrations

**Example: App Menus**

See the [App Menus example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/app-menus/). It shows how to:
- Add custom menus to the desktop app.
- Run local commands from the app.
- Handle app-specific functions.
- Create desktop app integrations.

The example uses `Headlamp.setAppMenu`.

### 6. Dynamic Cluster Management

Manage cluster connections dynamically.

**Use Cases:**
- Custom cluster discovery
- Dynamic cluster registration
- Cluster management UIs
- Multi-cluster setups

**Example: Dynamic Clusters**

See the [Dynamic Clusters example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/dynamic-clusters/). It shows how to:
- Add and remove clusters dynamically.
- Manage cluster configurations.
- Handle cluster selection.
- Create cluster management UIs.

### 7. Plugin Settings

Create plugins with user settings.

**Use Cases:**
- User preferences
- Feature toggles
- Configuration forms
- Persistent settings

**Example: Configurable Logo**

See the [Change Logo example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/change-logo/). It shows how to:
- Create plugin settings forms.
- Handle user configuration.
- Persist settings.
- Make plugins customizable.

The example uses `registerPluginSettings`.

## Styling and Theming Patterns

### 1. Custom Themes

Create custom themes for Headlamp.

**Use Cases:**
- Corporate branding
- Custom color schemes
- Accessibility
- Dark/light themes

**Example: Custom Theme**

See the [Custom Theme example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/custom-theme/). It shows how to:
- Create custom color palettes.
- Define typography styles.
- Register new themes.
- Handle theme switching.

The example uses `registerAppTheme`.

### 2. Custom App Logo

Replace the default Headlamp logo.

**Use Cases:**
- Corporate branding
- Custom visual identity
- Theme-aware logos
- Responsive logos

**Example: Custom Logo**

See the [Change Logo example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/change-logo/). It shows how to:
- Create responsive logos.
- Handle different logo sizes.
- Support theme-aware logos.
- Make logos user-configurable.
- Use image and text logos.

The example uses `registerAppLogo`.

## Advanced Patterns

### 1. Data Visualization

Create custom charts for cluster data.

**Use Cases:**
- Resource usage charts
- Cluster health dashboards
- Performance metrics
- Custom monitoring

**Example: Resource Charts**

See the [Resource Charts example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/resource-charts/). It shows how to:
- Create interactive charts.
- Visualize Kubernetes data.
- Implement custom dashboards.
- Handle real-time data.

### 2. UI Panels

Build custom UI panels and reusable components.

**Use Cases:**
- Custom dashboards
- Specialized views
- Reusable UI components
- Complex data displays

**Example: UI Panels**

See the [UI Panels example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/ui-panels/). It shows how to:
- Create custom UI panels.
- Build reusable components.
- Handle complex layouts.
- Integrate with existing UI.

### 3. Custom Cluster Chooser

Customize the cluster selection UI.

**Use Cases:**
- Custom cluster discovery
- Enhanced cluster metadata
- Specialized cluster views
- Multi-environment management

**Example: Cluster Chooser**

See the [Cluster Chooser example](https://github.com/kubernetes-sigs/headlamp/tree/main/plugins/examples/cluster-chooser/). It shows how to:
- Customize the cluster selection UI.
- Add custom cluster metadata.
- Implement cluster filtering.
- Handle cluster connections.
