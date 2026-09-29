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

import { render } from '@testing-library/react';
import ReleaseNotes from './ReleaseNotes';

const { moduleLoaded } = vi.hoisted(() => ({
  moduleLoaded: vi.fn(),
}));

vi.mock('./ReleaseNotesModal', () => {
  moduleLoaded();
  return { default: () => null };
});

describe('ReleaseNotes', () => {
  it('does not load the release notes modal before notes are available', () => {
    render(<ReleaseNotes />);

    expect(moduleLoaded).not.toHaveBeenCalled();
  });
});
