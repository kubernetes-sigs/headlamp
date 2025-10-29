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
 * Default Response Renderer
 *
 * This is a fallback renderer that displays AI responses in a simple format.
 * It demonstrates the basic structure of a response renderer component.
 */

import { Box, Typography } from '@mui/material';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { AIResponseRendererProps } from '../responseRendererRegistry';

/**
 * Default renderer for text-based AI responses
 */
export function DefaultResponseRenderer({ response }: AIResponseRendererProps) {
  const content =
    typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content, null, 2);

  return (
    <Box sx={{ p: 2 }}>
      <ReactMarkdown>{content}</ReactMarkdown>

      {response.metadata && Object.keys(response.metadata).length > 0 && (
        <Box sx={{ mt: 2, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Metadata:
          </Typography>
          <pre style={{ fontSize: '0.75rem', margin: 0 }}>
            {JSON.stringify(response.metadata, null, 2)}
          </pre>
        </Box>
      )}
    </Box>
  );
}
