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

// A react testing lib example test for the Message component.
// @see https://testing-library.com/docs/react-testing-library/intro

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Message from './Message';

describe('Message', () => {
  it('renders a message', async () => {
    // Arrange
    render(<Message msg="Hello World" error={false} />);

    // Act
    //   Clicking on this doesn't do anything, but it's a good example of how to
    //   find a button by its text.
    await userEvent.click(screen.getByText('# Pods: Hello World'));

    // Assert
    expect(screen.getByText(/# Pods: Hello World/i)).toBeInTheDocument();
  });

  // A test showing the error=true state
  it('renders an error message', async () => {
    // Arrange
    render(<Message msg="Hello World" error />);

    // Act
    await userEvent.click(screen.getByText('Uh, pods!?'));

    // Assert
    expect(screen.getByText(/Uh, pods!?/i)).toBeInTheDocument();
  });
});
