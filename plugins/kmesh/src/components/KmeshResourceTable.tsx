import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import React, { useEffect, useState } from 'react';
import { fetchMockKmeshResources, MockResource } from '../api/kmesh';

/**
 * Placeholder component to display Kmesh resources.
 * 
 * TODO (Phase 2): Replace this simple Material UI table with Headlamp's
 * `Table` or `ResourceListView` components from `@kinvolk/headlamp-plugin/lib/CommonComponents`.
 * Also, wire this up to use the actual `useList()` hook from the K8s API
 * instead of mock data.
 */
export function KmeshResourceTable() {
  const [resources, setResources] = useState<MockResource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Phase 1: Fetch mock data
    fetchMockKmeshResources().then(data => {
      setResources(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <Typography>Loading Kmesh Resources...</Typography>;
  }

  if (resources.length === 0) {
    return <Typography>No Kmesh resources found.</Typography>;
  }

  return (
    <TableContainer component={Paper} sx={{ mt: 2 }}>
      <Table sx={{ minWidth: 650 }} aria-label="kmesh resources table">
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Namespace</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {resources.map((row) => (
            <TableRow key={row.id}>
              <TableCell component="th" scope="row">{row.name}</TableCell>
              <TableCell>{row.namespace}</TableCell>
              <TableCell>{row.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
