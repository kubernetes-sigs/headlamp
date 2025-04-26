/**
 * This plugin shows how to add a custom overview chart on the overview page.
 */
import { K8s, registerOverviewChartsProcessor } from '@kinvolk/headlamp-plugin/lib';
import { TileChart } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Box, Paper } from '@mui/material';
import { useTheme } from '@mui/material';
import React from 'react';

/**
 * PodFailureChart shows the percentage of failing pods.
 * Failing pods are those in 'Failed' or 'Unknown' states.
 */
function PodFailureChart() {
  const [pods, error] = K8s.ResourceClasses.Pod.useList();
  const theme = useTheme();
  // Calculate failed pods
  const failedPods = (pods || []).filter(pod => {
    const phase = pod.status?.phase;
    return phase === 'Failed' || phase === 'Unknown';
  });

  if (error) {
    return (
      <Box p={2}>
        <Paper>
          <Box p={2}>{`Error loading pods: ${error}`}</Box>
        </Paper>
      </Box>
    );
  }

  const totalPods = pods?.length || 0;
  const failedCount = failedPods.length;

  return (
    <TileChart
      title="Pods Failed"
      data={[{ name: 'failed', value: failedCount, fill: theme.palette.error.main }]}
      total={totalPods}
      label={totalPods === 0 ? '0' : `${((failedCount / totalPods) * 100).toFixed(1)}%`}
      legend={totalPods === 0 ? 'No pods found' : `${failedCount} failed / ${totalPods} total`}
    />
  );
}

// Register the chart using the overview charts processor
registerOverviewChartsProcessor({
  id: 'pod-failed',
  processor: charts => {
    return [
      ...charts,
      {
        id: 'pod-failed',
        component: () => <PodFailureChart />,
      },
    ];
  },
});
