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
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Popover,
  Select,
  TextField,
} from '@mui/material';
import { useRef, useState } from 'react';
import { Trans } from 'react-i18next';

export function SearchSettings({
  maxItemsPerResource,
  setMaxItemsPerResource,
  refetchIntervalMs,
  setRefetchIntervalMs,
}: {
  maxItemsPerResource: number;
  setMaxItemsPerResource: (n: number) => void;
  refetchIntervalMs: number;
  setRefetchIntervalMs: (n: number) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const maxItemsInputRef = useRef<HTMLInputElement>(null);
  const refetchInputRef = useRef<HTMLSelectElement>(null);

  return (
    <>
      <Button
        variant="contained"
        color="secondary"
        startIcon={<Icon icon="mdi:settings" />}
        onClick={e => setAnchorEl(e.currentTarget)}
      >
        Settings
      </Button>
      <Popover
        elevation={4}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        onClose={() => setAnchorEl(null)}
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
      >
        <Box sx={{ padding: 2, width: '400px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <TextField
            label={<Trans>Max items per Resource</Trans>}
            variant="outlined"
            size="small"
            inputRef={maxItemsInputRef}
            helperText={
              <Trans>
                If a resource has more items than this amount they will be excluded from Search.
                Helps reduce memory usage and slowdowns for large clusters.
              </Trans>
            }
            defaultValue={maxItemsPerResource}
            type="number"
          />

          <FormControl fullWidth variant="outlined" size="small">
            <InputLabel id="refetch-label">
              <Trans>Refetch Interval</Trans>
            </InputLabel>
            <Select
              labelId="refetch-label"
              id="refetch-select"
              label="Refetch Interval"
              defaultValue={refetchIntervalMs}
              inputRef={refetchInputRef}
            >
              <MenuItem value={30_000}>
                <Trans>30 seconds</Trans>
              </MenuItem>
              <MenuItem value={60_000}>
                <Trans>1 minute</Trans>
              </MenuItem>
              <MenuItem value={5 * 60_000}>
                <Trans>5 minutes</Trans>
              </MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="contained"
            color="primary"
            sx={{ alignSelf: 'flex-end' }}
            onClick={() => {
              if (maxItemsInputRef.current && refetchInputRef.current) {
                setMaxItemsPerResource(parseInt(maxItemsInputRef.current.value));
                setRefetchIntervalMs(parseInt(refetchInputRef.current.value));
                setAnchorEl(null);
              }
            }}
          >
            <Trans>Save</Trans>
          </Button>
        </Box>
      </Popover>
    </>
  );
}
