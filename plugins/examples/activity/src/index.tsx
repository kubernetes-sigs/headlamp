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
import { Activity, registerAppBarAction } from '@kinvolk/headlamp-plugin/lib';
import { Box, Button } from '@mui/material';

/** Content inside the Activity */
function MyContent() {
  return (
    <Box sx={{ p: 3, display: 'flex', gap: 2 }}>
      hello world!
      <Button
        variant="contained"
        color="secondary"
        onClick={() => {
          // To update Activity you will need the ID
          // And in second argument pass partial Activity to update any property
          Activity.update('my-activity', { title: 'New title! ' + Math.random() });
        }}
      >
        Update title
      </Button>
      <Button
        variant="contained"
        color="secondary"
        onClick={() => Activity.update('my-activity', { location: 'full' })}
      >
        Make fullscreen
      </Button>
      <Button variant="contained" color="secondary" onClick={() => Activity.close('my-activity')}>
        Close activity
      </Button>
    </Box>
  );
}

function AppBarButton() {
  return (
    <Button
      variant="contained"
      onClick={() => {
        // To launch an activity call Activity.launch
        Activity.launch({
          // ID has to be unique
          id: 'my-activity',
          // default location for the activity
          location: 'split-right',
          icon: <Icon icon="mdi:circle" />,
          title: 'Activity title',
          content: <MyContent />,
        });
      }}
    >
      Launch activity
    </Button>
  );
}

registerAppBarAction(AppBarButton);
