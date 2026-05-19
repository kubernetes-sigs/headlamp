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

import { Icon } from '@iconify/react';
import { Button, Divider, Menu, MenuItem } from '@mui/material';
import { Dispatch, MouseEvent, SetStateAction, useId, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

const ALL_SEVERITIES = ['info', 'error', 'warning', 'fatal', 'trace', 'debug'] as const;

const useSeverityLabels = () => {
  const { t } = useTranslation();

  const labels: Record<(typeof ALL_SEVERITIES)[number], string> = {
    info: t('Info'),
    error: t('Error'),
    warning: t('Warning'),
    fatal: t('Fatal'),
    trace: t('Trace'),
    debug: t('Debug'),
  };

  return labels;
};

/** Show a dropdown picker with different severity levels and their counts */
export function SeveritySelector({
  severityStats,
  severities: severityFilter,
  setSeverities: setSeverityFilter,
}: {
  /** Severity count per type */
  severityStats?: Map<string, number>;
  severities?: Set<string>;
  setSeverities: Dispatch<SetStateAction<Set<string> | undefined>>;
}) {
  const selectorId = useId();
  const severityLabels = useSeverityLabels();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSeverityClick = (severity: string) => {
    setSeverityFilter(f => {
      const newFilter = f ? new Set(f) : new Set(ALL_SEVERITIES);
      if (newFilter.has(severity)) {
        newFilter.delete(severity);
      } else {
        newFilter.add(severity);
      }
      return newFilter;
    });
  };

  const allLevels = severityFilter === undefined || severityFilter.size === ALL_SEVERITIES.length;

  const buttonId = selectorId + 'severity-button';
  const menuId = selectorId + 'severity-menu';

  return (
    <>
      <Button
        id={buttonId}
        aria-controls={open ? menuId : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        onClick={handleClick}
        endIcon={<Icon icon="mdi:chevron-down" />}
        startIcon={<Icon icon="mdi:format-list-bulleted" />}
        sx={{ lineHeight: 1.5, textTransform: 'capitalize' }}
        variant="contained"
        color="secondary"
      >
        {allLevels ? (
          <Trans>All levels</Trans>
        ) : severityFilter!.size === 0 ? (
          <Trans>No levels</Trans>
        ) : (
          [...severityFilter!].join(', ')
        )}
      </Button>
      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          'aria-labelledby': buttonId,
        }}
      >
        <MenuItem
          onClick={() => {
            setSeverityFilter(undefined);
            handleClose();
          }}
        >
          {(severityFilter === undefined || severityFilter.size === ALL_SEVERITIES.length) && (
            <Icon icon="mdi:check" style={{ marginRight: '0.5em' }} />
          )}
          <Trans>All levels</Trans>
        </MenuItem>
        <Divider />
        {ALL_SEVERITIES.map(severity => (
          <MenuItem
            onClick={() => handleSeverityClick(severity)}
            key={severity}
            sx={{ textTransform: 'capitalize' }}
          >
            {(severityFilter === undefined || severityFilter.has(severity)) && (
              <Icon icon="mdi:check" style={{ marginRight: '0.5em' }} />
            )}
            {severityLabels[severity]} {severityStats && `(${severityStats.get(severity) ?? 0})`}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
