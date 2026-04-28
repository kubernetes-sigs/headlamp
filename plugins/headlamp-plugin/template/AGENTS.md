# AGENTS.md

This file provides guidance for AI coding agents working on this Headlamp plugin.

## Available Scripts

The following npm scripts are available for development and testing:

- **`npm run format`** - Format code with prettier
- **`npm run lint`** - Lint code with eslint for coding issues
- **`npm run lint-fix`** - Automatically fix linting issues
- **`npm run build`** - Build the plugin for production
- **`npm run tsc`** - Type check code with TypeScript compiler
- **`npm run test`** - Run tests with vitest
- **`npm start`** - Start development server watching for changes
- **`npm run storybook`** - Start Storybook for component development
- **`npm run storybook-build`** - Build static Storybook
- **`npm run i18n`** - Extract translatable strings for internationalization
- **`npm run package`** - Create a tarball of the plugin package

## Plugin Development Resources

### Example Plugins

Explore these example plugins in `node_modules/@kinvolk/headlamp-plugin/examples/` to learn common patterns:

- **activity** - Shows how to add activity tracking and monitoring
- **app-menus** - Demonstrates adding custom menus to the app bar
- **change-logo** - Shows how to customize the Headlamp logo
- **cluster-chooser** - Demonstrates cluster selection UI
- **custom-theme** - Shows how to create custom themes
- **customizing-map** - Demonstrates customizing resource visualization maps
- **details-view** - Shows how to customize resource detail views
- **dynamic-clusters** - Demonstrates dynamic cluster configuration
- **headlamp-events** - Shows how to work with Kubernetes events
- **pod-counter** - Simple example counting pods and displaying in app bar
- **projects** - Demonstrates project/namespace organization
- **resource-charts** - Shows how to add custom charts for resources
- **sidebar** - Demonstrates customizing the sidebar navigation
- **tables** - Shows how to create custom resource tables
- **ui-panels** - Demonstrates adding custom UI panels

### Official Plugins

Check out production-ready plugins in `node_modules/@kinvolk/headlamp-plugin/official-plugins/` for advanced patterns:

#### Using Custom Resource Definitions (CRDs)

- **cert-manager** - Complete CRD integration for cert-manager resources
  - Files: `official-plugins/cert-manager/src/resources/` (certificate.ts, issuer.ts, clusterIssuer.ts, etc.)
  - Shows how to register and display custom resources for certificates, issuers, challenges, and orders
- **flux** - GitOps CRDs for Flux resources
  - Files: `official-plugins/flux/src/` (kustomization, helmrelease, gitrepository resources)
  - Demonstrates working with Flux CRDs for GitOps workflows
- **keda** - Kubernetes Event Driven Autoscaling CRDs
  - Files: `official-plugins/keda/src/resources/` (scaledobject.ts, scaledjob.ts, triggerauthentication.ts)
  - Shows CRD integration for event-driven autoscaling
- **karpenter** - Node provisioning CRDs
  - Files: `official-plugins/karpenter/src/` (NodeClass, EC2NodeClass resources)
  - Demonstrates multiple CRD deployment types (EKS Auto Mode, self-installed)

#### Visualizing Relationships with Maps

- **keda** - Map view showing KEDA resource relationships
  - File: `official-plugins/keda/src/mapView.tsx`
  - Uses edge creation (`makeKubeToKubeEdge`) to visualize connections between ScaledObjects, ScaledJobs, and TriggerAuthentications
  - Shows how to build graph visualizations of resource dependencies

#### Adding Metrics and Charts

- **prometheus** - Advanced charts for workload resources
  - Files: `official-plugins/prometheus/src/components/Chart/`
  - Provides CPU, memory, network, and disk charts using Prometheus metrics
  - Includes specialized charts for Karpenter (KarpenterChart, KarpenterNodeClaimCreationChart)
  - Shows KEDA metrics (KedaActiveJobsChart, KedaScalerMetricsChart, KedaHPAReplicasChart)
  - File: `official-plugins/prometheus/src/request.tsx` for fetching Prometheus data
- **opencost** - Cost metrics and visualization
  - File: `official-plugins/opencost/src/detail.tsx`
  - Uses `recharts` library (AreaChart, CartesianGrid, Tooltip) to display cost data
  - Shows how to fetch and display custom metrics from external services
  - Demonstrates time-series data visualization with stacked area charts

#### Other Advanced Patterns

- **ai-assistant** - AI integration for cluster management
- **app-catalog** - Helm chart catalog powered by ArtifactHub
- **backstage** - Integration with Backstage developer portal

### Key Topics and Examples

#### Adding Items to the App Bar

- **Example:** `pod-counter` - Shows `registerAppBarAction` to add items to top bar
- **File:** `examples/pod-counter/src/index.tsx`

#### Customizing the Sidebar

- **Example:** `sidebar` - Demonstrates `registerSidebarEntry` and `registerSidebarEntryFilter`
- **File:** `examples/sidebar/src/index.tsx`

#### Working with Resource Details

- **Example:** `details-view` - Shows how to customize resource detail pages
- **File:** `examples/details-view/src/index.tsx`

#### Creating Custom Tables

- **Example:** `tables` - Demonstrates custom table implementations
- **File:** `examples/tables/src/index.tsx`

#### Adding Charts and Visualizations

- **Example:** `resource-charts` - Shows how to add custom charts
- **File:** `examples/resource-charts/src/index.tsx`

#### Theme Customization

- **Example:** `custom-theme` - Demonstrates theme customization
- **File:** `examples/custom-theme/src/index.tsx`

#### Internationalization (i18n)

- Use `npm run i18n <locale>` to add new locales (e.g., `npm run i18n es` for Spanish)
- Translation files are in `locales/<locale>/translation.json`
- Use `useTranslation()` hook from `@kinvolk/headlamp-plugin/i18n`

## Development Workflow

1. **Start Development:** Run `npm start` to watch for changes
2. **Make Changes:** Edit files in `src/`
3. **Type Check:** Run `npm run tsc` to check for TypeScript errors
4. **Lint:** Run `npm run lint` to check for code quality issues
5. **Format:** Run `npm run format` to format code
6. **Test:** Run `npm run test` to run tests
7. **Build:** Run `npm run build` to create production build

## Best Practices

- Follow the patterns shown in the example plugins
- Use TypeScript for type safety
- Keep plugins focused on a single feature or enhancement
- Document your plugin's functionality in the README.md

## API Documentation

For detailed API documentation, visit:

- [Headlamp Plugin API Reference](https://headlamp.dev/docs/latest/development/api/)
- [Plugin Development Guide](https://headlamp.dev/docs/latest/development/plugins/)
- [UI Component Storybook](https://headlamp.dev/docs/latest/development/frontend/#storybook)
