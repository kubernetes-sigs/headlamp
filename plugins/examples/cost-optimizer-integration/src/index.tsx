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
 * Example Plugin: Cost Optimizer
 *
 * This plugin demonstrates how to integrate with the AI Response Renderers
 * to display custom AI responses in a visual way.
 */

import { registerAppBarAction } from '@kinvolk/headlamp-plugin/lib';
import { Box, Button } from '@mui/material';
import React from 'react';
// Import the response renderer registration function
// In a real scenario, this would be imported from the AI Assistant plugin
// or from a shared package
import { registerAIResponseRenderer } from '../../ai-response-renderers/src/responseRendererRegistry';

/**
 * Custom renderer for pod optimization recommendations
 */
function PodOptimizationRenderer({ response }: any) {
  const { recommendations, potentialSavings } = response.content;

  return (
    <Box sx={{ p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
      <h3>💡 Optimization Recommendations</h3>

      {potentialSavings && (
        <p>
          <strong>Potential Savings:</strong> ${potentialSavings}/month
        </p>
      )}

      <ul>
        {recommendations?.map((rec: string, i: number) => (
          <li key={i}>{rec}</li>
        ))}
      </ul>
    </Box>
  );
}

// Register the custom renderer when this plugin loads
registerAIResponseRenderer({
  id: 'cost-optimizer.pod-optimization',
  description: 'Renders pod optimization recommendations',
  matcher: response => {
    return response.type === 'pod_optimization' || response.metadata?.plugin === 'cost-optimizer';
  },
  component: PodOptimizationRenderer,
  priority: 15, // Higher than default to take precedence
});

/**
 * Example component that triggers AI with structured responses
 */
function CostOptimizerButton() {
  const handleOptimize = async () => {
    // In a real implementation, this would:
    // 1. Call an AI service with a specialized prompt
    // 2. The AI would return a structured response
    // 3. The response would be rendered by our custom renderer

    console.log('This would trigger AI analysis and return:');
    console.log({
      type: 'pod_optimization',
      content: {
        potentialSavings: 450,
        recommendations: [
          'Reduce CPU requests for frontend pods by 30%',
          'Enable horizontal pod autoscaling for api-gateway',
          'Consolidate similar workloads to reduce pod count',
        ],
      },
      metadata: {
        plugin: 'cost-optimizer',
      },
    });
  };

  return (
    <Button size="small" variant="outlined" onClick={handleOptimize}>
      Optimize Costs
    </Button>
  );
}

registerAppBarAction(CostOptimizerButton);

export { PodOptimizationRenderer };
