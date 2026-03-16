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

import Grid from '@mui/material/Grid';
import { MRT_TableInstance } from 'material-react-table';
import { useCallback } from 'react';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import DeleteMultipleButton from './DeleteMultipleButton';
import { isRestartableResource } from './RestartButton';
import RestartMultipleButton from './RestartMultipleButton';

export interface ResourceTableMultiActionsProps<RowItem extends Record<string, any>> {
  table: MRT_TableInstance<RowItem>;
}

export default function ResourceTableMultiActions<RowItem extends Record<string, any>>(
  props: ResourceTableMultiActionsProps<RowItem>
) {
  const { table } = props;

  const items = table.getSelectedRowModel().rows.map(t => t.original as unknown as KubeObject);
  const restartableItems = items.filter(isRestartableResource);

  const afterConfirm = useCallback(() => {
    table.resetRowSelection();
  }, [table]);

  return (
    <Grid container spacing={2}>
      {restartableItems.length > 0 && (
        <Grid item>
          <RestartMultipleButton items={restartableItems} afterConfirm={afterConfirm} />
        </Grid>
      )}
      <Grid item>
        <DeleteMultipleButton items={items} afterConfirm={afterConfirm} />
      </Grid>
    </Grid>
  );
}
