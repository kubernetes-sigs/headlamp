# AI Response Renderers Plugin Example

This example plugin demonstrates how to create **custom response renderers** for the Headlamp AI Assistant plugin. Response renderers allow you to create specialized UI components that display specific types of AI responses in a more visual and interactive way.

## What are Response Renderers?

Response renderers are React components that are registered to handle specific types of AI responses. When the AI Assistant generates a response, it checks all registered renderers to find the best match based on the response type and content. This allows for:

- **Rich visualizations** of complex data (charts, tables, graphs)
- **Domain-specific UI** for particular use cases (security scans, cost analysis, compliance reports)
- **Interactive components** that go beyond simple text rendering
- **Extensibility** - any plugin can register its own renderers

## Features

This example includes four custom renderers:

### 1. Cost Analysis Renderer

Displays cost breakdowns with formatted currency and detailed tables.

**Activated when:**

- `response.type === 'cost_analysis'`
- `response.metadata.analysisType === 'cost'`

**Example Response:**

```json
{
  "type": "cost_analysis",
  "content": {
    "totalCost": 1234.56,
    "currency": "USD",
    "period": "Last 30 days",
    "breakdown": [
      { "name": "prod-deployment", "type": "Deployment", "cost": 850.0 },
      { "name": "cache-service", "type": "StatefulSet", "cost": 384.56 }
    ]
  }
}
```

### 2. Security Scan Renderer

Shows vulnerability reports with severity indicators and recommendations.

**Activated when:**

- `response.type === 'security_scan'`
- `response.type === 'vulnerability_report'`
- Response contains `vulnerabilities` field

**Example Response:**

```json
{
  "type": "security_scan",
  "content": {
    "severity": "High",
    "complianceScore": 75,
    "vulnerabilities": [
      {
        "severity": "critical",
        "name": "CVE-2024-1234",
        "description": "Buffer overflow in nginx:1.19"
      }
    ],
    "recommendations": ["Update nginx to version 1.20+", "Enable pod security policies"]
  }
}
```

### 3. Resource Comparison Renderer

Renders side-by-side comparison tables for Kubernetes resources.

**Activated when:**

- `response.type === 'resource_comparison'`
- Response has both `resources` and `comparisonFields`

**Example Response:**

```json
{
  "type": "resource_comparison",
  "content": {
    "resources": [
      { "name": "pod-1", "cpu": "100m", "memory": "256Mi", "replicas": 3 },
      { "name": "pod-2", "cpu": "200m", "memory": "512Mi", "replicas": 2 }
    ],
    "comparisonFields": ["cpu", "memory", "replicas"]
  }
}
```

### 4. Chart Renderer

Visualizes numerical data as charts and graphs.

**Activated when:**

- `response.type === 'chart'`
- `response.type === 'visualization'`
- Response has `chartType` field

**Example Response:**

```json
{
  "type": "chart",
  "content": {
    "chartType": "bar",
    "title": "Pod CPU Usage",
    "labels": ["pod-1", "pod-2", "pod-3"],
    "data": [45, 78, 62]
  }
}
```

## How to Use

### Installation

1. Copy this plugin to your Headlamp plugins directory
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the plugin:
   ```bash
   npm run build
   ```

### Creating Your Own Renderer

```typescript
import { registerAIResponseRenderer } from './responseRendererRegistry';

// 1. Create your renderer component
function MyCustomRenderer({ response, context }: AIResponseRendererProps) {
  return (
    <Box>
      <Typography variant="h6">{response.content.title}</Typography>
      {/* Your custom UI here */}
    </Box>
  );
}

// 2. Register the renderer
registerAIResponseRenderer({
  id: 'my-custom-renderer',
  description: 'Renders my custom data type',
  matcher: response => {
    // Return true if this renderer should handle the response
    return response.type === 'my_custom_type';
  },
  component: MyCustomRenderer,
  priority: 10, // Higher priority = tried first
});
```

### Matcher Function

The matcher function determines if a renderer should be used for a given response. It can check:

- **Response type**: `response.type === 'some_type'`
- **Content structure**: `response.content?.specificField !== undefined`
- **Metadata**: `response.metadata?.category === 'security'`
- **Complex logic**: Any JavaScript condition

**Tips:**

- Be specific in your matchers to avoid conflicts
- Higher priority renderers are tried first
- If no renderer matches, a default text renderer is used

### Priority System

Renderers are tried in order of priority (highest first):

- **10+**: Custom/plugin renderers (recommended for plugins)
- **0**: Default priority
- **-10**: Built-in fallback renderers

## API Reference

### `registerAIResponseRenderer(config)`

Register a custom response renderer.

**Parameters:**

- `config.id` (string): Unique identifier
- `config.matcher` (function): Function that returns true if renderer should be used
- `config.component` (React.ComponentType): React component to render the response
- `config.priority` (number, optional): Priority level (default: 0)
- `config.description` (string, optional): Human-readable description

### `AIResponseRendererProps`

Props passed to your renderer component:

```typescript
interface AIResponseRendererProps {
  response: AIResponse; // The AI response data
  context?: {
    prompt?: string; // Original user prompt
    resource?: any; // Current Kubernetes resource
    view?: string; // Current view (details, list, etc.)
  };
  onUpdate?: () => void; // Callback to request re-render
}
```

### `AIResponse`

Structure of an AI response:

```typescript
interface AIResponse {
  type?: string; // Response type identifier
  content: any; // The actual data
  metadata?: Record<string, any>; // Additional metadata
  raw?: any; // Original AI model response
}
```

## Integration with AI Assistant

To make the AI return responses that use your custom renderers:

1. **Configure AI Prompts**: Instruct the AI to return structured JSON with specific types
2. **Use AI Tools**: Create AI tools that return responses in the expected format
3. **Post-process Responses**: Transform AI responses to match your renderer's expected structure

**Example AI Prompt:**

```
When analyzing costs, return a JSON response with this structure:
{
  "type": "cost_analysis",
  "content": {
    "totalCost": <number>,
    "currency": "USD",
    "breakdown": [...]
  }
}
```

## Testing

To test your renderers:

1. Enable test mode in AI Assistant settings
2. Manually input responses with the correct structure
3. Verify your renderer is triggered and displays correctly

## Best Practices

1. **Specific Matchers**: Make matchers as specific as possible to avoid conflicts
2. **Error Handling**: Wrap content access in try-catch blocks
3. **Graceful Degradation**: Handle missing or malformed data gracefully
4. **Performance**: Memoize expensive computations with `React.useMemo`
5. **Accessibility**: Ensure your renderers are keyboard-navigable and screen-reader friendly
6. **Theming**: Use MUI theme tokens for colors to support dark/light mode

## Examples in Other Plugins

You can use this pattern in any Headlamp plugin:

```typescript
// In your plugin's index.tsx
import { registerAIResponseRenderer } from '@headlamp-plugins/ai-response-renderers';

registerAIResponseRenderer({
  id: 'my-plugin-renderer',
  matcher: response => response.type === 'my_plugin_data',
  component: MyPluginRenderer,
  priority: 10,
});
```

## Contributing

Want to add more example renderers? Submit a PR with:

- New renderer component
- Example response structure
- Documentation in this README

## License

Apache-2.0
