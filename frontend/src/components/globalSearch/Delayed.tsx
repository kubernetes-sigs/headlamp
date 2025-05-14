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

import { Box, styled } from '@mui/material';

/**
 * Displays children after a delay
 *
 * @param props.delayMs - Delay in milliseconds. Default 500ms
 */
export const Delayed = styled(Box)<{ delayMs?: number }>`
  animation: delayed-reveal 0.3s;
  animation-delay: ${p => p.delayMs ?? 500}ms;
  animation-fill-mode: both;

  @keyframes delayed-reveal {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;
