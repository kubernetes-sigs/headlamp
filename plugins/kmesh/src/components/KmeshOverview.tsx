import { SectionBox } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import React from 'react';
import { KmeshResourceTable } from './KmeshResourceTable';

/**
 * Main Kmesh Overview component.
 * Rendered when the user navigates to the `/kmesh` route.
 * 
 * TODO (Phase 2 & 3): 
 * - Add a real overview of the mesh (e.g., number of workloads, waypoints, traffic status).
 * - Add health and status badges dynamically sourced from the cluster.
 */
export function KmeshOverview() {
  return (
    <SectionBox title="Kmesh Overview" paddingTop={2}>
      <Grid container spacing={3}>
        {/* Placeholder Status Cards */}
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Mesh Status
              </Typography>
              <Typography variant="h5" component="h2" color="success.main">
                Healthy
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Active Workloads
              </Typography>
              <Typography variant="h5" component="h2">
                24
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Resource Table */}
      <div style={{ marginTop: '32px' }}>
        <Typography variant="h6" gutterBottom>
          Recent Kmesh Resources
        </Typography>
        <KmeshResourceTable />
      </div>
    </SectionBox>
  );
}
