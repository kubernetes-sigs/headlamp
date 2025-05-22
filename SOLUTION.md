# Fix for Plugin Reloading on Non-Cluster Pages

## Issue Description
Plugin reloading was broken on non-cluster pages like settings. When developing plugins with `npm start`, changes were not being detected and applied when the user was on pages that don't make backend requests.

## Root Cause Analysis
The issue was occurring because:

1. Plugin hot-reloading was only working on pages that make backend requests
2. Non-cluster pages like settings don't regularly poll the backend
3. The plugin cache wasn't being properly cleared when plugins were updated
4. There was no mechanism to detect plugin changes and trigger a reload on non-cluster pages

## Solution Implemented

### 1. Enhanced Plugin Loading Mechanism
- Modified `fetchAndExecutePlugins` in `plugin/index.ts` to clear existing plugins before reloading
- Added tracking of successfully loaded plugins for better debugging
- Ensured plugins are properly initialized regardless of the current page

### 2. Added Plugin Hot-Reloading Support
- Created a plugin watcher in the Electron main process that monitors plugin directories for changes
- Implemented IPC communication between main and renderer processes to notify about plugin changes
- Added event listeners in the Plugins component to handle plugin change events

### 3. Plugin Cache Management
- Added functionality to clear the plugin cache when changes are detected
- Ensured the cache is properly cleared before reloading plugins

### 4. Improved Plugin Component
- Updated the Plugins component to handle hot-reloading on all pages
- Used a ref to ensure the plugin change listener is only set up once
- Made the component location-aware to handle different page contexts

## Files Modified
1. `frontend/src/plugin/index.ts` - Enhanced plugin loading mechanism
2. `frontend/src/plugin/Plugins.tsx` - Added hot-reloading support
3. `frontend/src/plugin/types.d.ts` - Added TypeScript definitions for plugin-related globals
4. `app/electron/plugin-watcher.js` - Created plugin watcher for the main process

## Testing
The solution can be tested by:
1. Starting Headlamp in development mode
2. Navigating to a non-cluster page like Settings
3. Making changes to a plugin (e.g., in `plugins/examples/podcounter/`)
4. Verifying that the changes are detected and the plugin is reloaded

This fix ensures that plugin development is seamless regardless of which page the user is on in the Headlamp UI.