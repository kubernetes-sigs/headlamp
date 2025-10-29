/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * AI Response Renderers Plugin Example
 *
 * This example plugin demonstrates how to register custom response renderers
 * for the AI Assistant plugin. Other plugins can use this pattern to create
 * specialized visualizations for different types of AI responses.
 */

import { registerPluginSettings } from '@kinvolk/headlamp-plugin/lib';
import { Box, Divider, Paper, Typography } from '@mui/material';
import React from 'react';
import {
  ChartDataRenderer,
  CostAnalysisRenderer,
  ResourceComparisonRenderer,
  SecurityScanRenderer,
} from './components/ExampleRenderers';
import { registerAIResponseRenderer } from './responseRendererRegistry';

// Register custom response renderers
// These will be automatically picked up by the AI Assistant when rendering responses

// 1. Cost Analysis Renderer
registerAIResponseRenderer({
  id: 'cost-analysis-renderer',
  description: 'Renders cost analysis data with formatted tables and totals',
  matcher: response => {
    return response.type === 'cost_analysis' || response.metadata?.analysisType === 'cost';
  },
  component: CostAnalysisRenderer,
  priority: 10,
});

// 2. Security Scan Renderer
registerAIResponseRenderer({
  id: 'security-scan-renderer',
  description: 'Renders security vulnerability scans with severity indicators',
  matcher: response => {
    return (
      response.type === 'security_scan' ||
      response.type === 'vulnerability_report' ||
      response.content?.vulnerabilities !== undefined
    );
  },
  component: SecurityScanRenderer,
  priority: 10,
});

// 3. Resource Comparison Renderer
registerAIResponseRenderer({
  id: 'resource-comparison-renderer',
  description: 'Renders side-by-side comparison of Kubernetes resources',
  matcher: response => {
    return (
      response.type === 'resource_comparison' ||
      (response.content?.resources && response.content?.comparisonFields)
    );
  },
  component: ResourceComparisonRenderer,
  priority: 10,
});

// 4. Chart/Visualization Renderer
registerAIResponseRenderer({
  id: 'chart-renderer',
  description: 'Renders chart data as visual graphs',
  matcher: response => {
    return (
      response.type === 'chart' ||
      response.type === 'visualization' ||
      response.content?.chartType !== undefined
    );
  },
  component: ChartDataRenderer,
  priority: 10,
});

/**
 * Settings component that shows registered renderers
 */
function AIResponseRenderersSettings() {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        AI Response Renderers
      </Typography>

      <Typography variant="body2" paragraph>
        This plugin demonstrates how to register custom response renderers for the AI Assistant.
        When the AI returns responses with specific types or structures, these renderers will
        automatically be used to display them in a more visual and interactive way.
      </Typography>

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" gutterBottom>
        Registered Renderers
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold">
            Cost Analysis Renderer
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Displays cost breakdowns with formatted tables and currency symbols. Activated when
            response type is "cost_analysis".
          </Typography>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold">
            Security Scan Renderer
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Shows vulnerability reports with severity indicators and compliance scores. Activated
            when response contains vulnerability data.
          </Typography>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold">
            Resource Comparison Renderer
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Renders side-by-side comparison tables for Kubernetes resources. Activated when response
            type is "resource_comparison".
          </Typography>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight="bold">
            Chart Renderer
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Visualizes data as charts and graphs. Activated when response contains chart data.
          </Typography>
        </Paper>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Typography variant="h6" gutterBottom>
        Usage Example
      </Typography>

      <Paper sx={{ p: 2, bgcolor: 'action.hover' }}>
        <Typography
          variant="body2"
          component="pre"
          sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
        >
          {`// In your plugin's index.tsx:
import { registerAIResponseRenderer } from '@ai-assistant/renderers';

registerAIResponseRenderer({
  id: 'my-custom-renderer',
  matcher: (response) => response.type === 'my_type',
  component: MyCustomComponent,
  priority: 10
});`}
        </Typography>
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        Note: To test these renderers, the AI Assistant needs to return responses with the
        appropriate structure. You can configure your AI prompts to return structured data that
        matches these renderers.
      </Typography>
    </Box>
  );
}

// Register plugin settings
registerPluginSettings('ai-response-renderers', AIResponseRenderersSettings);

export {
  registerAIResponseRenderer,
  findResponseRenderer,
  getAllResponseRenderers,
} from './responseRendererRegistry';
