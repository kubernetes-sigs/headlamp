# Manual Testing Steps for Plugin Reloading Fix

This document outlines the steps to manually verify that the plugin reloading fix works correctly on non-cluster pages like settings.

## Prerequisites

1. Headlamp development environment set up
2. Node.js and npm installed
3. A test plugin (we'll use the podcounter example plugin)

## Test Steps

### 1. Initial Setup

1. Start Headlamp in development mode:
   ```
   cd frontend
   npm start
   ```

2. In a separate terminal, prepare the podcounter plugin:
   ```
   cd plugins/examples/podcounter
   npm install
   ```

### 2. Test Plugin Reloading on Cluster Pages (Should Already Work)

1. Start the plugin in development mode:
   ```
   npm start
   ```

2. In Headlamp, navigate to a cluster page (e.g., Pods)
3. Verify the pod counter plugin is visible
4. Make a change to the plugin code in `src/index.tsx` (e.g., change the text or color)
5. Save the file
6. Verify the plugin is automatically reloaded and the changes are visible

### 3. Test Plugin Reloading on Non-Cluster Pages (Should Now Work with Fix)

1. In Headlamp, navigate to a non-cluster page (e.g., Settings)
2. Make a change to the plugin code in `src/index.tsx`
3. Save the file
4. Verify the plugin is automatically reloaded (you may need to navigate back to a page where the plugin is visible to see the changes)

### 4. Test Plugin Reloading on Settings Page

1. In Headlamp, navigate to Settings > Plugins
2. Make a change to the plugin code in `src/index.tsx`
3. Save the file
4. Verify the plugin is automatically reloaded and appears in the plugins list with the correct status

### 5. Test Plugin Cache Clearing

1. Stop the plugin development server
2. Delete the plugin's build files
3. Rebuild the plugin with changes:
   ```
   npm run build
   ```
4. In Headlamp, navigate between different pages (cluster and non-cluster)
5. Verify the plugin is loaded with the new changes on all pages

### 6. Edge Cases to Test

1. **Multiple Plugins**: If you have multiple plugins, verify that changes to one plugin don't affect others
2. **Plugin Errors**: Introduce an error in the plugin code and verify that Headlamp handles it gracefully
3. **Rapid Changes**: Make multiple changes in quick succession and verify all changes are applied
4. **Browser Refresh**: Verify that plugins still work correctly after a browser refresh

## Expected Results

- Plugin changes should be detected and applied regardless of which page you're on in Headlamp
- The plugin cache should be properly cleared when changes are detected
- No errors should appear in the browser console related to plugin loading
- The application should remain stable throughout the testing process

## Troubleshooting

If the plugin reloading doesn't work:

1. Check the browser console for errors
2. Verify the plugin watcher is running (look for "Watching for plugin changes" in the console)
3. Make sure the plugin is properly built and the changes are saved
4. Try restarting Headlamp and the plugin development server