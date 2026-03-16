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

import { InlineIcon } from '@iconify/react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Meta, StoryFn } from '@storybook/react';
import { DropZoneBox } from './DropZoneBox';

export default {
  title: 'DropZoneBox',
  component: DropZoneBox,
} as Meta;

const Template: StoryFn<typeof DropZoneBox> = args => <DropZoneBox {...args} />;

export const UploadFiles = Template.bind({});
UploadFiles.args = {
  children: (
    <>
      <Typography sx={{ m: 2 }}>{'Select a file or drag and drop here'}</Typography>
      <Button
        variant="contained"
        component="label"
        startIcon={<InlineIcon icon="mdi:upload" width={32} />}
        sx={{ fontWeight: 500 }}
      >
        {'Select File'}
      </Button>
    </>
  ),
};
