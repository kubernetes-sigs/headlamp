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

/**
 * This example keeps both sides of a plugin-owned extension point in one file:
 * the owner validates and reads values, and a contributor registers data.
 */
import {
  PluginExtension,
  registerAppBarAction,
  registerPluginExtension,
  usePluginExtensions,
} from '@kinvolk/headlamp-plugin/lib';
import { Box, Tooltip, Typography } from '@mui/material';

// Extension point owner side.
// In a real plugin, the owner documents this key and validates registered values.
const resourceInsightExtensionPoint = 'example.resourceInsights.v1';

interface ResourceInsightExtension extends PluginExtension {
  resourceKind: string;
  title: string;
  message: string;
}

function isResourceInsightExtension(
  extension: PluginExtension
): extension is ResourceInsightExtension {
  return (
    typeof extension.id === 'string' &&
    typeof (extension as ResourceInsightExtension).resourceKind === 'string' &&
    typeof (extension as ResourceInsightExtension).title === 'string' &&
    typeof (extension as ResourceInsightExtension).message === 'string'
  );
}

function ResourceInsightExtensions() {
  const extensions: ResourceInsightExtension[] = [];

  usePluginExtensions(resourceInsightExtensionPoint).forEach(extension => {
    if (isResourceInsightExtension(extension)) {
      extensions.push(extension);
      return;
    }

    console.warn('Ignoring invalid resource insight extension:', extension);
  });

  if (extensions.length === 0) {
    return null;
  }

  return (
    <Tooltip
      title={
        <span style={{ whiteSpace: 'pre-line' }}>
          {extensions
            .map(
              extension => `${extension.resourceKind}: ${extension.title} - ${extension.message}`
            )
            .join('\n')}
        </span>
      }
    >
      <Box sx={{ px: 1 }}>
        <Typography variant="body2">{extensions.length} resource insight extension(s)</Typography>
      </Box>
    </Tooltip>
  );
}

registerAppBarAction(ResourceInsightExtensions);

// Extension contributor side.
// In a real setup, this could live in another plugin that follows the documented shape.
registerPluginExtension(resourceInsightExtensionPoint, {
  id: 'pod-restart-insight',
  resourceKind: 'Pod',
  title: 'Pod restart insight',
  message: 'Show extra context for Pods with restarts.',
});
