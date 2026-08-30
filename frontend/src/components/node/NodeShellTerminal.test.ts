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

import { getNodeShellCommand } from './NodeShellTerminal';

describe('getNodeShellCommand', () => {
  it('keeps the existing shell command when host chroot is disabled', () => {
    expect(getNodeShellCommand()).toEqual(['sh']);
    expect(getNodeShellCommand(false)).toEqual(['sh']);
  });

  it('starts chroot at the host root when enabled', () => {
    expect(getNodeShellCommand(true)).toEqual(['chroot', '/host']);
  });
});
