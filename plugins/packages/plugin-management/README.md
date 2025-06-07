# @headlamp-k8s/plugin-management

Shared plugin management library for Headlamp.

## Development

This package is part of the Headlamp plugins workspace. To develop locally:

1. Install dependencies:
```bash
cd plugins/packages
npm install
```

2. Build the package:
```bash
npm run build
```

3. Run tests:
```bash
npm run test
```

## Publishing

To publish a new version:

1. Update the version in package.json
2. Build the package
3. Publish to npm:
```bash
npm publish --access public
```

## Usage

```typescript
import { PluginManager } from '@headlamp-k8s/plugin-management';

// List installed plugins
const plugins = PluginManager.list();

// Uninstall a plugin
PluginManager.uninstall('plugin-name');
```

## API Documentation

### PluginManager

Main class for managing plugins.

#### Methods

- `list(folder?: string, progressCallback?: ProgressCallback): PluginData[]`
  - Lists all valid plugins in the specified folder
  - Returns array of plugin data objects

- `uninstall(name: string, folder?: string, progressCallback?: ProgressCallback): void`
  - Uninstalls a plugin from the specified folder
  - Throws error if plugin not found or invalid

### Types

- `PluginData`: Interface for plugin metadata
- `ProgressCallback`: Type for progress update callbacks
- `ArtifactHubHeadlampPkg`: Interface for ArtifactHub package data 