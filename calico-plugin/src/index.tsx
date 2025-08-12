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

import { registerSidebarEntry, registerRoute } from '@kinvolk/headlamp-plugin/lib';

// Below are some imports you may want to use.
//   See README.md for links to plugin development documentation.
// Import the icon setup
import './utils/customIcons.tsx';

import { SectionBox } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Button, CircularProgress, Alert, Box, Grid, Paper, Typography } from '@mui/material';
import { Icon } from '@iconify/react';
import React from 'react';
// @ts-ignore
import { CalicoIcon } from './utils/customIcons.tsx';

const FlowsViewer = () => {
  const [flows, setFlows] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const fetchFlows = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Fetching flows from Whisker API...');

      const response = await fetch('http://localhost:3002/flows', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setFlows(data);
      console.log('Flows received:', data);
    } catch (err) {
      console.error('Error fetching flows:', err);
      setError(err.message || 'Failed to fetch flows');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchFlows();
  }, []);

  return (
    <SectionBox paddingTop={2} marginTop={2}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center" justifyContent="space-between">
          <Grid item>
            <Box display="flex" alignItems="center" gap={2}>
              <Icon icon="custom:calico" width={32} height={32} />
              <Typography variant="h5" component="h1">
                Calico Flows via Whisker APIs Colm
              </Typography>
            </Box>
          </Grid>
          <Grid item>
            <Button variant="contained" onClick={fetchFlows} disabled={loading}>
              {loading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
              Refresh Flows
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <strong>Error:</strong> {error}
          <br />
          <Typography variant="body2" sx={{ mt: 1 }}>
            Make sure Whisker is running and accessible. You may need to port-forward:
            <br />
            <code>kubectl port-forward -n calico-system svc/calico-whisker 3002:8080</code>
          </Typography>
        </Alert>
      )}

      {flows && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Flow Data:
          </Typography>
          <pre
            style={{
              background: '#f5f5f5',
              padding: '16px',
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '600px',
              fontSize: '12px',
              border: '1px solid #ddd',
            }}
          >
            {JSON.stringify(flows, null, 2)}
          </pre>
        </Box>
      )}

      {!flows && !loading && !error && (
        <Alert severity="info">
          <strong>Getting Started:</strong>
          <br />
          1. Ensure Calico and Whisker are deployed in your cluster
          <br />
          2. Port-forward the Whisker service:
          <br />
          <code>kubectl port-forward -n calico-system svc/calico-whisker 3002:8080</code>
          <br />
          3. Click "Refresh Flows" to retrieve flow data
        </Alert>
      )}
    </SectionBox>
  );
};

registerRoute({
  path: '/calico',
  sidebar: 'calico',
  name: 'calico',
  exact: true,
  component: FlowsViewer,
});

registerSidebarEntry({
  parent: null,
  name: 'calico',
  label: 'Calico',
  url: '/calico',
  icon: CalicoIcon,
});
