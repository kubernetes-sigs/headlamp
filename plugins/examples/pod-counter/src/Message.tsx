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

import { ConfigStore, Headlamp } from '@kinvolk/headlamp-plugin/lib';
import { Typography } from '@mui/material';

export interface MessageProps {
  /** String to display. */
  msg: string;
  /** True if there's an error. */
  error: boolean;
}

/**
 * For showing our action item message.
 *
 * This is a pure presentational component to make it
 * easier to use in storybook.
 *
 * See https://storybook.js.org/docs/web-components/writing-stories/build-pages-with-storybook
 *
 */
export default function Message({ msg, error }: MessageProps) {
  const config = new ConfigStore<{ errorMessage?: string }>('@kinvolk/headlamp-pod-counter');
  const useConf = config.useConfig();
  const conf = useConf();
  
  // Access environment variables through the Headlamp class
  const env = Headlamp.getEnv();
  const productName = env.REACT_APP_HEADLAMP_PRODUCT_NAME || 'Headlamp';

  return (
    <Typography color="textPrimary" sx={{ fontStyle: 'italic' }}>
      {!error ? 
        `${productName} - ${msg}` : 
        conf?.errorMessage ? conf?.errorMessage : 'Uh, pods!?'}
    </Typography>
  );
}