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
 * Example Custom Response Renderers
 *
 * These are example renderers that demonstrate how plugins can create
 * custom visualizations for specific types of AI responses.
 */

import { Icon } from '@iconify/react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import React from 'react';
import { AIResponseRendererProps } from '../responseRendererRegistry';

/**
 * Renderer for cost analysis responses
 */
export function CostAnalysisRenderer({ response }: AIResponseRendererProps) {
  const { totalCost, currency, breakdown, period } = response.content;

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Icon icon="mdi:currency-usd" width={24} style={{ marginRight: 8 }} />
          <Typography variant="h6">Cost Analysis</Typography>
        </Box>

        <Typography variant="h4" color="primary" gutterBottom>
          {currency} {totalCost.toFixed(2)}
        </Typography>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          {period || 'Current period'}
        </Typography>

        {breakdown && breakdown.length > 0 && (
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Resource</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Cost</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {breakdown.map((item: any, index: number) => (
                  <TableRow key={index}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell align="right">
                      {currency} {item.cost.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Renderer for security scan results
 */
export function SecurityScanRenderer({ response }: AIResponseRendererProps) {
  const { severity, vulnerabilities, complianceScore, recommendations } = response.content;

  const getSeverityColor = (sev: string) => {
    switch (sev.toLowerCase()) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      default:
        return 'success';
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Icon icon="mdi:shield-check" width={24} style={{ marginRight: 8 }} />
          <Typography variant="h6">Security Scan Results</Typography>
        </Box>

        {severity && (
          <Alert severity={getSeverityColor(severity)} sx={{ mb: 2 }}>
            Overall Severity: <strong>{severity}</strong>
          </Alert>
        )}

        {complianceScore !== undefined && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" gutterBottom>
              Compliance Score: {complianceScore}%
            </Typography>
            <LinearProgress
              variant="determinate"
              value={complianceScore}
              color={
                complianceScore >= 80 ? 'success' : complianceScore >= 60 ? 'warning' : 'error'
              }
            />
          </Box>
        )}

        {vulnerabilities && vulnerabilities.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Vulnerabilities Found:
            </Typography>
            {vulnerabilities.map((vuln: any, index: number) => (
              <Box key={index} sx={{ mb: 1, pl: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    label={vuln.severity}
                    size="small"
                    color={getSeverityColor(vuln.severity)}
                  />
                  <Typography variant="body2">{vuln.name || vuln.id}</Typography>
                </Box>
                {vuln.description && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.5 }}
                  >
                    {vuln.description}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}

        {recommendations && recommendations.length > 0 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Recommendations:
            </Typography>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {recommendations.map((rec: string, index: number) => (
                <li key={index}>
                  <Typography variant="body2">{rec}</Typography>
                </li>
              ))}
            </ul>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Renderer for resource comparison responses
 */
export function ResourceComparisonRenderer({ response }: AIResponseRendererProps) {
  const { resources, comparisonFields } = response.content;

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Icon icon="mdi:compare" width={24} style={{ marginRight: 8 }} />
          <Typography variant="h6">Resource Comparison</Typography>
        </Box>

        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Resource</TableCell>
                {comparisonFields?.map((field: string) => (
                  <TableCell key={field}>{field}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {resources?.map((resource: any, index: number) => (
                <TableRow key={index}>
                  <TableCell>
                    <strong>{resource.name}</strong>
                  </TableCell>
                  {comparisonFields?.map((field: string) => (
                    <TableCell key={field}>
                      {resource[field] !== undefined ? String(resource[field]) : '-'}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}

/**
 * Renderer for chart/visualization data
 */
export function ChartDataRenderer({ response }: AIResponseRendererProps) {
  const { chartType, title, data, labels } = response.content;

  // This is a simple visualization - in a real implementation,
  // you would use a charting library like Chart.js or Recharts
  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Icon icon="mdi:chart-line" width={24} style={{ marginRight: 8 }} />
          <Typography variant="h6">{title || 'Chart'}</Typography>
        </Box>

        <Typography variant="caption" color="text.secondary" gutterBottom>
          Chart Type: {chartType}
        </Typography>

        {/* Simple bar chart representation */}
        <Box sx={{ mt: 2 }}>
          {data?.map((value: number, index: number) => (
            <Box key={index} sx={{ mb: 1 }}>
              <Typography variant="caption">{labels?.[index] || `Item ${index + 1}`}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    height: 24,
                    width: `${(value / Math.max(...data)) * 100}%`,
                    bgcolor: 'primary.main',
                    borderRadius: 1,
                    minWidth: 20,
                  }}
                />
                <Typography variant="caption">{value}</Typography>
              </Box>
            </Box>
          ))}
        </Box>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="caption">
            This is a simple representation. For production use, integrate a proper charting
            library.
          </Typography>
        </Alert>
      </CardContent>
    </Card>
  );
}
