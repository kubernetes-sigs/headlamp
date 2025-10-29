# Quick Start: Creating Your First Response Renderer

This guide will walk you through creating a custom response renderer in 5 minutes.

## Step 1: Create Your Renderer Component (2 min)

```typescript
// src/MyRenderer.tsx
import { Box, Typography, Chip } from '@mui/material';
import React from 'react';

export function PodHealthRenderer({ response }) {
  const { podName, status, healthScore, issues } = response.content;

  return (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
      <Typography variant="h6">Pod Health: {podName}</Typography>

      <Box sx={{ my: 2 }}>
        <Chip label={status} color={status === 'Healthy' ? 'success' : 'error'} />
        <Typography variant="body2" sx={{ mt: 1 }}>
          Health Score: {healthScore}/100
        </Typography>
      </Box>

      {issues && issues.length > 0 && (
        <Box>
          <Typography variant="subtitle2">Issues:</Typography>
          <ul>
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </Box>
      )}
    </Box>
  );
}
```

## Step 2: Register Your Renderer (1 min)

```typescript
// src/index.tsx
import { registerAIResponseRenderer } from '@kinvolk/headlamp-ai-assistant';
import { PodHealthRenderer } from './MyRenderer';

registerAIResponseRenderer({
  id: 'my-plugin.pod-health',
  description: 'Displays pod health information',
  matcher: response => response.type === 'pod_health',
  component: PodHealthRenderer,
  priority: 10,
});
```

## Step 3: Test It (2 min)

In the AI Assistant, configure your AI to return responses like:

```json
{
  "type": "pod_health",
  "content": {
    "podName": "frontend-abc123",
    "status": "Healthy",
    "healthScore": 92,
    "issues": []
  }
}
```

Or use the AI Assistant's test mode to manually input this response.

## That's It! 🎉

Your renderer is now active. When the AI returns a response with `type: 'pod_health'`, your custom renderer will display it.

---

## Next Steps

### Make It Better

1. **Add Error Handling**

   ```typescript
   if (!response.content?.podName) {
     return <Alert severity="error">Invalid pod health data</Alert>;
   }
   ```

2. **Use Theme Colors**

   ```typescript
   import { useTheme } from '@mui/material';

   const theme = useTheme();
   // Use theme.palette.primary.main, etc.
   ```

3. **Add Interactivity**
   ```typescript
   const [expanded, setExpanded] = React.useState(false);
   // Add expand/collapse, tooltips, etc.
   ```

### Advanced Features

- **Multiple Matchers**: Handle different response types
- **Context Usage**: Access Kubernetes resource context
- **Custom Icons**: Use @iconify/react for better visuals
- **Data Visualization**: Integrate Chart.js or Recharts
- **Async Data**: Load additional data when rendered

### Examples to Study

Check out these example renderers:

- `CostAnalysisRenderer` - Tables and formatted currency
- `SecurityScanRenderer` - Severity indicators and progress bars
- `ChartDataRenderer` - Data visualization
- `ResourceComparisonRenderer` - Comparison tables

### Common Patterns

**Conditional Rendering:**

```typescript
matcher: response => {
  return response.type === 'my_type' || response.metadata?.category === 'my_category';
};
```

**Fallback Content:**

```typescript
function MyRenderer({ response }) {
  const data = response.content;

  if (!data) {
    return <Typography>No data available</Typography>;
  }

  return <YourComponent data={data} />;
}
```

**Memoization:**

```typescript
const processedData = React.useMemo(() => {
  return heavyComputation(response.content);
}, [response.content]);
```

## Troubleshooting

**Not seeing your renderer?**

- Check the matcher function returns `true`
- Verify renderer is registered before AI response arrives
- Look in browser console for errors

**Type errors?**

```typescript
import type { AIResponseRendererProps } from '@kinvolk/headlamp-ai-assistant';

function MyRenderer({ response, context }: AIResponseRendererProps) {
  // TypeScript will now help you
}
```

**Conflicts with other renderers?**

- Make your matcher more specific
- Increase priority if needed
- Use unique response types

## Resources

- [Full README](./README.md) - Complete documentation
- [Integration Guide](./INTEGRATION.md) - For AI Assistant developers
- [Example Renderers](./src/components/ExampleRenderers.tsx) - Reference implementations

Happy rendering! 🚀
