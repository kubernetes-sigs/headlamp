# Integration Guide: AI Response Renderers

This guide explains how to integrate the Custom Response Renderers functionality into the Headlamp AI Assistant plugin.

## Overview

The Response Renderer system allows any Headlamp plugin to register custom React components that handle rendering specific types of AI responses. This creates an extensible architecture where:

1. The AI Assistant handles AI communication and conversation management
2. Plugins can register specialized renderers for their domain
3. The AI Assistant automatically uses the best matching renderer

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Assistant Plugin                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Response Renderer Registry                            │ │
│  │  - Stores all registered renderers                     │ │
│  │  - Matches responses to renderers                      │ │
│  │  - Manages priority and fallbacks                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                            ▲                                 │
│                            │                                 │
│         ┌──────────────────┼──────────────────┐             │
│         │                  │                  │             │
│    ┌────▼─────┐      ┌────▼─────┐      ┌────▼─────┐       │
│    │ Renderer │      │ Renderer │      │ Renderer │       │
│    │    A     │      │    B     │      │    C     │       │
│    └──────────┘      └──────────┘      └──────────┘       │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │ registerAIResponseRenderer()
                           │
       ┌───────────────────┴───────────────────┐
       │                                       │
  ┌────▼─────────┐                  ┌─────────▼────┐
  │ Plugin 1     │                  │  Plugin 2    │
  │ (Security)   │                  │  (Cost)      │
  └──────────────┘                  └──────────────┘
```

## Integration Steps

### 1. Add the Response Renderer Registry to AI Assistant

Copy the `responseRendererRegistry.ts` file into your AI Assistant plugin:

```
ai-assistant/
  src/
    renderers/
      responseRendererRegistry.ts  <-- Add this
      DefaultRenderer.tsx          <-- Default text renderer
    utils/
      index.ts                     <-- Export renderer functions
```

### 2. Export Renderer Functions

In your AI Assistant's `utils/index.ts` or main export file, add:

```typescript
// Export renderer registration functions
export {
  registerAIResponseRenderer,
  unregisterAIResponseRenderer,
  findResponseRenderer,
  getAllResponseRenderers,
  getResponseRenderer,
} from '../renderers/responseRendererRegistry';

// Export types
export type {
  AIResponse,
  AIResponseRendererConfig,
  AIResponseRendererProps,
} from '../renderers/responseRendererRegistry';
```

### 3. Integrate into Chat Message Rendering

In your chat message component (e.g., `modal.tsx` or `ChatMessage.tsx`), use the renderer:

```typescript
import { findResponseRenderer } from './utils';
import { DefaultResponseRenderer } from './renderers/DefaultRenderer';

function ChatMessage({ message }) {
  // Parse the AI response
  const response: AIResponse = {
    type: message.type,
    content: message.content,
    metadata: message.metadata,
  };

  // Find the best renderer for this response
  const rendererConfig = findResponseRenderer(response);

  // Use the custom renderer if found, otherwise use default
  const RendererComponent = rendererConfig ? rendererConfig.component : DefaultResponseRenderer;

  return (
    <Box>
      <RendererComponent
        response={response}
        context={{
          prompt: message.originalPrompt,
          resource: message.resource,
          view: message.view,
        }}
      />
    </Box>
  );
}
```

### 4. Register Built-in Renderers

In your AI Assistant's initialization, register default renderers:

```typescript
// In index.tsx or a separate file
import { registerAIResponseRenderer } from './utils';
import { DefaultResponseRenderer } from './renderers/DefaultRenderer';

// Register the default text renderer with lowest priority
registerAIResponseRenderer({
  id: 'ai-assistant.default',
  description: 'Default text renderer for all responses',
  matcher: () => true, // Matches everything
  component: DefaultResponseRenderer,
  priority: -100, // Very low priority, only used as fallback
});
```

### 5. Update Plugin Documentation

Add to your AI Assistant README:

```markdown
## Extensibility

### Custom Response Renderers

Plugins can register custom renderers to display AI responses in specialized ways:

\`\`\`typescript
import { registerAIResponseRenderer } from '@ai-assistant/plugin';

registerAIResponseRenderer({
id: 'my-plugin.custom-renderer',
matcher: (response) => response.type === 'my_type',
component: MyCustomComponent,
priority: 10
});
\`\`\`

See the [Response Renderers Example](../examples/ai-response-renderers) for more details.
```

## Usage from Other Plugins

### Basic Example

```typescript
// In any Headlamp plugin
import { registerAIResponseRenderer } from '@kinvolk/headlamp-ai-assistant';

registerAIResponseRenderer({
  id: 'security-plugin.vulnerability-renderer',
  matcher: response => response.type === 'vulnerability_scan',
  component: VulnerabilityScanRenderer,
  priority: 10,
});
```

### Advanced Example with Multiple Matchers

```typescript
registerAIResponseRenderer({
  id: 'monitoring-plugin.metrics-renderer',
  matcher: response => {
    // Match multiple conditions
    if (response.type === 'metrics') return true;
    if (response.type === 'performance_analysis') return true;
    if (response.content?.chartType === 'timeseries') return true;
    return false;
  },
  component: MetricsChartRenderer,
  priority: 15,
});
```

## Best Practices

### 1. Namespaced IDs

Use namespaced IDs to avoid conflicts:

```typescript
id: 'my-plugin-name.renderer-name';
```

### 2. Specific Matchers

Make matchers as specific as possible:

```typescript
// ❌ Too broad
matcher: response => response.content !== undefined;

// ✅ Specific
matcher: response => response.type === 'cost_analysis' && response.content?.totalCost !== undefined;
```

### 3. Error Handling

Handle missing or malformed data:

```typescript
function MyRenderer({ response }: AIResponseRendererProps) {
  const data = response.content;

  if (!data || !data.requiredField) {
    return <Typography color="error">Invalid data format</Typography>;
  }

  return <YourComponent data={data} />;
}
```

### 4. Performance

Memoize expensive operations:

```typescript
function MyRenderer({ response }: AIResponseRendererProps) {
  const processedData = React.useMemo(() => {
    return expensiveProcessing(response.content);
  }, [response.content]);

  return <YourComponent data={processedData} />;
}
```

## Testing

### Unit Tests

```typescript
import { registerAIResponseRenderer, findResponseRenderer } from './registry';

describe('Response Renderer', () => {
  it('matches correct responses', () => {
    registerAIResponseRenderer({
      id: 'test-renderer',
      matcher: r => r.type === 'test',
      component: TestComponent,
    });

    const response = { type: 'test', content: 'data' };
    const renderer = findResponseRenderer(response);

    expect(renderer?.id).toBe('test-renderer');
  });
});
```

### Integration Tests

Test with the AI Assistant in test mode:

1. Enable test mode in settings
2. Input structured responses manually
3. Verify renderer is triggered and displays correctly

## Examples

See the `/plugins/examples/` directory for complete examples:

- `ai-response-renderers/` - Complete renderer implementation with demos
- `cost-optimizer-integration/` - How to use renderers from another plugin

## API Reference

See `responseRendererRegistry.ts` for full API documentation.

## Troubleshooting

### Renderer Not Being Used

1. Check matcher function returns true for your response
2. Verify renderer is registered before response is rendered
3. Check if another renderer with higher priority is matching
4. Look for errors in browser console

### Type Errors

Ensure you're using the correct TypeScript types:

```typescript
import type { AIResponseRendererProps } from '@kinvolk/headlamp-ai-assistant';
```

### Multiple Renderers Conflicting

Use priority to control which renderer is used:

```typescript
// Higher priority wins
registerAIResponseRenderer({ ...config, priority: 20 });
```

## Future Enhancements

Potential improvements to the renderer system:

1. **Async Renderers**: Support for renderers that load data asynchronously
2. **Renderer Composition**: Allow multiple renderers to contribute to one response
3. **Renderer Lifecycle**: Add hooks for mount/unmount/update events
4. **Theme Support**: Built-in theming system for consistent renderer styling
5. **Analytics**: Track which renderers are used most frequently
