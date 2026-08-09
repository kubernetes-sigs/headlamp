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

import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FixedSizeList as List } from 'react-window';

export interface AuditEvent {
  user: string;
  verb: string;
  resource: string;
  statusCode: number;
  timestamp: string;
  message: string;
}

interface VirtualizedTableProps {
  events: AuditEvent[];
  regexFilter?: string;
}

export default function VirtualizedTable({ events, regexFilter }: VirtualizedTableProps) {
  const { t } = useTranslation();

  const filteredEvents = React.useMemo(() => {
    if (!regexFilter) return events;
    try {
      const regex = new RegExp(regexFilter, 'i');
      return events.filter(
        e => regex.test(e.message) || regex.test(e.user) || regex.test(e.resource)
      );
    } catch {
      return events;
    }
  }, [events, regexFilter]);

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const event = filteredEvents[index];
    return (
      <TableRow component="div" style={style} role="row">
        <TableCell component="div" sx={{ width: '20%' }} role="cell">
          {event.timestamp}
        </TableCell>
        <TableCell component="div" sx={{ width: '20%' }} role="cell">
          {event.user}
        </TableCell>
        <TableCell component="div" sx={{ width: '10%' }} role="cell">
          {event.verb}
        </TableCell>
        <TableCell component="div" sx={{ width: '15%' }} role="cell">
          {event.resource}
        </TableCell>
        <TableCell component="div" sx={{ width: '10%' }} role="cell">
          {event.statusCode}
        </TableCell>
        <TableCell component="div" sx={{ width: '25%' }} role="cell">
          {event.message}
        </TableCell>
      </TableRow>
    );
  };

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <Table component="div" size="small" role="table">
        <TableHead component="div" role="rowgroup">
          <TableRow component="div" role="row">
            <TableCell component="div" sx={{ width: '20%' }} role="columnheader">
              {t('Timestamp')}
            </TableCell>
            <TableCell component="div" sx={{ width: '20%' }} role="columnheader">
              {t('User')}
            </TableCell>
            <TableCell component="div" sx={{ width: '10%' }} role="columnheader">
              {t('Verb')}
            </TableCell>
            <TableCell component="div" sx={{ width: '15%' }} role="columnheader">
              {t('Resource')}
            </TableCell>
            <TableCell component="div" sx={{ width: '10%' }} role="columnheader">
              {t('Status')}
            </TableCell>
            <TableCell component="div" sx={{ width: '25%' }} role="columnheader">
              {t('Message')}
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody component="div" role="rowgroup">
          <List height={600} itemCount={filteredEvents.length} itemSize={35} width="100%">
            {Row}
          </List>
        </TableBody>
      </Table>
      {filteredEvents.length === 0 && (
        <Typography sx={{ p: 2 }}>{t('No audit events found.')}</Typography>
      )}
    </Box>
  );
}
