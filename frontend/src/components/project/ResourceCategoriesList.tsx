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
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import { Box } from '@mui/system';
import { KubeObject } from '../../lib/k8s/KubeObject';
import { ResourceCategory } from '../../lib/k8s/ResourceCategory';
import { KubeObjectStatus } from '../resourceMap/nodes/KubeObjectStatus';
import { getHealthIcon } from './projectUtils';

export function ResourceCategoriesList({
  categoryList,
  selectedCategoryName,
  onCategoryClick,
}: {
  categoryList: Array<{
    category: ResourceCategory;
    items: KubeObject[];
    health: Record<KubeObjectStatus, number>;
  }>;
  selectedCategoryName?: string;
  onCategoryClick: (categoryName: string) => void;
}) {
  return (
    <Box
      sx={{
        flexShrink: 0,
      }}
    >
      <List dense>
        {categoryList.map(({ category, items, health }) => {
          const healthColor =
            health.error > 0
              ? 'error.main'
              : health.warning > 0
              ? 'warning.main'
              : items.length > 0
              ? 'success.main'
              : 'grey.500';

          const healthIcon = getHealthIcon(health.success, health.error, health.warning);

          return (
            <ListItem key={category.label} disablePadding>
              <ListItemButton
                onClick={() => onCategoryClick(category.label)}
                selected={selectedCategoryName === category.label}
              >
                <ListItemIcon>
                  <Icon icon={category.icon} style={{ fontSize: 32 }} />
                </ListItemIcon>
                <ListItemText primary={category.label} secondary={category.description} />
                <ListItemIcon sx={{ justifyContent: 'flex-end' }}>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <Typography
                      variant="h6"
                      sx={{
                        color: items.length > 0 ? healthColor : 'text.primary',
                        lineHeight: 1,
                      }}
                    >
                      {items.length}
                    </Typography>
                    {items.length > 0 && (
                      <Icon
                        icon={healthIcon}
                        style={{
                          fontSize: 20,
                          color: healthColor,
                        }}
                      />
                    )}
                  </Box>
                </ListItemIcon>
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}
