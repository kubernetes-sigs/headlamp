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

import Box from '@mui/material/Box';
import React from 'react';

interface LogHighlighterProps {
  log: string;
  searchTerm?: string;
}

export default function LogHighlighter({ log, searchTerm }: LogHighlighterProps) {
  if (!searchTerm) {
    return (
      <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>
        {log}
      </Box>
    );
  }

  const parts = log.split(new RegExp(`(${searchTerm})`, 'gi'));

  return (
    <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((part, index) =>
        part.toLowerCase() === searchTerm.toLowerCase() ? (
          <Box component="span" key={index} sx={{ backgroundColor: 'yellow', color: 'black' }}>
            {part}
          </Box>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </Box>
  );
}
