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
 * Demo Component for Testing Response Renderers
 *
 * This component provides example responses and buttons to test each renderer.
 */

import { Icon } from '@iconify/react';
import { Box, Button, Card, CardContent, Divider, Paper, Stack, Typography } from '@mui/material';
import React from 'react';
import { AIResponse } from '../responseRendererRegistry';
import {
  ChartDataRenderer,
  CostAnalysisRenderer,
  ResourceComparisonRenderer,
  SecurityScanRenderer,
} from './ExampleRenderers';

// Example response data for each renderer
const exampleResponses: Record<string, AIResponse> = {
  costAnalysis: {
    type: 'cost_analysis',
    content: {
      totalCost: 1834.67,
      currency: 'USD',
      period: 'Last 30 days',
      breakdown: [
        { name: 'production-web', type: 'Deployment', cost: 950.0 },
        { name: 'cache-redis', type: 'StatefulSet', cost: 384.56 },
        { name: 'worker-queue', type: 'Deployment', cost: 300.11 },
        { name: 'database-pg', type: 'StatefulSet', cost: 200.0 },
      ],
    },
  },
  securityScan: {
    type: 'security_scan',
    content: {
      severity: 'High',
      complianceScore: 72,
      vulnerabilities: [
        {
          severity: 'critical',
          name: 'CVE-2024-1234',
          description: 'Buffer overflow in nginx:1.19 allows remote code execution',
        },
        {
          severity: 'high',
          name: 'CVE-2024-5678',
          description: 'Privilege escalation in kubelet < 1.28.4',
        },
        {
          severity: 'medium',
          name: 'CVE-2024-9012',
          description: 'Information disclosure in container runtime',
        },
      ],
      recommendations: [
        'Update nginx image to version 1.20 or later',
        'Enable pod security policies in the namespace',
        'Implement network policies to restrict egress traffic',
        'Run containers as non-root user',
      ],
    },
  },
  resourceComparison: {
    type: 'resource_comparison',
    content: {
      resources: [
        { name: 'frontend-prod', cpu: '500m', memory: '1Gi', replicas: 5, restarts: 0 },
        { name: 'frontend-staging', cpu: '250m', memory: '512Mi', replicas: 2, restarts: 3 },
        { name: 'api-gateway', cpu: '1000m', memory: '2Gi', replicas: 3, restarts: 1 },
        { name: 'worker-service', cpu: '2000m', memory: '4Gi', replicas: 1, restarts: 0 },
      ],
      comparisonFields: ['cpu', 'memory', 'replicas', 'restarts'],
    },
  },
  chart: {
    type: 'chart',
    content: {
      chartType: 'bar',
      title: 'Pod CPU Usage (Percentage)',
      labels: ['frontend-1', 'frontend-2', 'api-1', 'worker-1', 'database-1'],
      data: [45, 67, 89, 34, 56],
    },
  },
};

interface RendererDemoProps {
  title: string;
  description: string;
  icon: string;
  response: AIResponse;
  RendererComponent: React.ComponentType<any>;
}

function RendererDemo({
  title,
  description,
  icon,
  response,
  RendererComponent,
}: RendererDemoProps) {
  const [showRenderer, setShowRenderer] = React.useState(false);
  const [showJson, setShowJson] = React.useState(false);

  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Icon icon={icon} width={28} style={{ marginRight: 12 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6">{title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          </Box>
        </Box>

        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <Button
            variant={showRenderer ? 'contained' : 'outlined'}
            size="small"
            onClick={() => {
              setShowRenderer(!showRenderer);
              setShowJson(false);
            }}
          >
            {showRenderer ? 'Hide' : 'Show'} Renderer
          </Button>
          <Button
            variant={showJson ? 'contained' : 'outlined'}
            size="small"
            onClick={() => {
              setShowJson(!showJson);
              setShowRenderer(false);
            }}
          >
            {showJson ? 'Hide' : 'Show'} JSON
          </Button>
        </Stack>

        {showRenderer && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            <RendererComponent response={response} />
          </Box>
        )}

        {showJson && (
          <Paper sx={{ mt: 2, p: 2, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.secondary" gutterBottom>
              Example Response Structure:
            </Typography>
            <pre
              style={{
                margin: 0,
                fontSize: '0.75rem',
                overflow: 'auto',
                fontFamily: 'monospace',
              }}
            >
              {JSON.stringify(response, null, 2)}
            </pre>
          </Paper>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Main demo component showing all renderers
 */
export function RenderersDemo() {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        AI Response Renderers Demo
      </Typography>
      <Typography variant="body1" paragraph color="text.secondary">
        This demo shows how custom response renderers transform structured AI responses into rich,
        interactive UI components. Click the buttons below to see each renderer in action.
      </Typography>

      <Divider sx={{ my: 3 }} />

      <RendererDemo
        title="Cost Analysis Renderer"
        description="Displays cost breakdowns with formatted currency and detailed tables"
        icon="mdi:currency-usd"
        response={exampleResponses.costAnalysis}
        RendererComponent={CostAnalysisRenderer}
      />

      <RendererDemo
        title="Security Scan Renderer"
        description="Shows vulnerability reports with severity indicators and compliance scores"
        icon="mdi:shield-check"
        response={exampleResponses.securityScan}
        RendererComponent={SecurityScanRenderer}
      />

      <RendererDemo
        title="Resource Comparison Renderer"
        description="Renders side-by-side comparison tables for Kubernetes resources"
        icon="mdi:compare"
        response={exampleResponses.resourceComparison}
        RendererComponent={ResourceComparisonRenderer}
      />

      <RendererDemo
        title="Chart Renderer"
        description="Visualizes numerical data as charts and graphs"
        icon="mdi:chart-line"
        response={exampleResponses.chart}
        RendererComponent={ChartDataRenderer}
      />
    </Box>
  );
}
