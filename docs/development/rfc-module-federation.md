# RFC: Migrate Plugin Loading to Webpack 5 Module Federation (or Rspack)

## Context
Headlamp's plugin architecture allows developers to extend its functionality by injecting UI components (e.g., custom sidebar items, resource views) into the core application. Currently, this relies on a custom plugin loading mechanism.

## The Problem
As Headlamp's plugin ecosystem continues to grow, plugin developers increasingly want to use their own third-party libraries (different versions of React components, charts, or utility libraries). Currently, managing these dependencies without bloating the main bundle or causing global scope conflicts is tricky and error-prone. This creates a brittle dependency structure that hinders independent plugin evolution.

## The Solution
We propose migrating the plugin loading mechanism to utilize Webpack 5 Module Federation (or Rspack's equivalent plugin). This allows plugins to operate as truly independent micro-frontends.

### Key Benefits
1. **Dependency Sharing and Isolation**: Common dependencies (like `react`, `react-dom`, `@mui/material`) can be shared with the host application (Headlamp), ensuring a small payload. Meanwhile, plugin-specific versions of libraries can be safely isolated.
2. **True Micro-frontends**: Plugins can be built, deployed, and tested entirely independently of the host application, adhering to modern micro-frontend principles.
3. **Future Proofing**: Module Federation is the industry standard for micro-frontends, backed by strong community support in Webpack 5 and Rsbuild/Rspack.

## Technical Details
- **Host (Headlamp)**: The main `rsbuild.config.ts` will expose shared libraries and configure the `ModuleFederationPlugin`.
- **Remote (Plugins)**: The `@headlamp-k8s/plugin` build script will be updated to output an independent remote bundle with its exposed modules, defining Headlamp as its host.
- **Dynamic Loading**: Headlamp will dynamically load plugin remote entries at runtime (e.g., from a URL or local file path) instead of standard JS script injection.

## Implementation Plan
1. **Proof of Concept**: Add `@module-federation/rsbuild-plugin` to Headlamp's frontend and expose a shared React instance.
2. **Plugin SDK Update**: Modify the plugin template and build scripts to generate Module Federation remotes.
3. **Dynamic Loader**: Update Headlamp's plugin registry to resolve and mount remote modules.

## Questions for Discussion
- Do we enforce a strict minimum version of React across all plugins?
- How do we handle plugin asset routing and CSS scoping with Module Federation?
