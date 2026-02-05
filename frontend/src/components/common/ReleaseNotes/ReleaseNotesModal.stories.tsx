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

import ReleaseNotesModal from './ReleaseNotesModal';

export default {
  title: 'common/ReleaseNotes/ReleaseNotesModal',
  component: ReleaseNotesModal,
  argTypes: {},
};

export const Show = {
  args: {
    releaseNotes: '### Hello\n\nworld',
    appVersion: '1.9.9',
  },
};

export const Closed = {
  args: {
    releaseNotes: undefined,
    appVersion: null,
  },
};

export const ShowNoNotes = {
  args: {
    releaseNotes: undefined,
    appVersion: '1.8.8',
  },
};

export const WithGitHubVideo = {
  args: {
    releaseNotes: `### Release with Video

This release includes an exciting new feature!

https://github.com/user-attachments/assets/46b377f2-a949-4e6e-b82a-bf528e7fd42a

Some more text after the video.`,
    appVersion: '2.0.0',
  },
};
