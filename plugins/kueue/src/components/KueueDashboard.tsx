import {
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
import { ClusterQueue, Workload } from '../lib/kueue-types';

export const KueueDashboard = () => {
  const [queues] = ClusterQueue.useList();
  const [workloads] = Workload.useList();

  return (
    <div style={{ padding: '24px' }}>
      <Typography variant="h4" gutterBottom>
        Kueue Batch Observability
      </Typography>

      {/* --- SECTION 1: QUEUE STATUS --- */}
      <Typography variant="h6" style={{ marginTop: '20px' }}>
        Cluster Queues
      </Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Namespace</TableCell>
              <TableCell>Pending Workloads</TableCell>
              <TableCell>Quota Usage</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(queues || []).map(q => (
              <TableRow key={q.metadata.uid}>
                <TableCell>{q.metadata.name}</TableCell>

                <TableCell>{q.metadata.namespace || 'Cluster Scope'}</TableCell>
                <TableCell>
                  {
                    (workloads || []).filter(
                      w => (w as any).spec?.queueName === q.metadata.name && w.isPending
                    ).length
                  }
                </TableCell>
                <TableCell>
                  <LinearProgress variant="determinate" value={60} style={{ width: '100px' }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="h6" style={{ marginTop: '30px', color: '#d32f2f' }}>
        Pending Workloads (Needs Attention)
      </Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Job Name</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(workloads || [])
              .filter(w => w.isPending)
              .map(w => (
                <TableRow key={w.metadata.uid}>
                  <TableCell>{w.metadata.name}</TableCell>
                  <TableCell style={{ color: 'red' }}>{w.pendingReason}</TableCell>
                  <TableCell>
                    <Chip label="Pending" color="secondary" size="small" />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};
