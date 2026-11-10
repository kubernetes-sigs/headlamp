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

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import PasswordForm from './PasswordForm';

describe('PasswordForm', () => {
  it('renders children properly', () => {
    render(
      <TestContext>
        <PasswordForm data-testid="password-form">
          <input type="password" placeholder="Password input" />
          <button type="submit">Submit</button>
        </PasswordForm>
      </TestContext>
    );

    const form = screen.getByTestId('password-form');
    expect(form.tagName).toBe('FORM');

    expect(screen.getByPlaceholderText('Password input')).toBeInTheDocument();
    expect(screen.getByText('Submit')).toBeInTheDocument();
  });

  it('prevents default behavior and calls onSubmit', () => {
    const onSubmitMock = vi.fn();
    render(
      <TestContext>
        <PasswordForm onSubmit={onSubmitMock} data-testid="password-form">
          <input type="password" placeholder="Password input" />
          <button type="submit">Submit</button>
        </PasswordForm>
      </TestContext>
    );

    const form = screen.getByTestId('password-form');

    // Dispatch a custom submit event to check preventDefault
    fireEvent(
      form,
      new Event('submit', {
        bubbles: true,
        cancelable: true,
      })
    );

    expect(onSubmitMock).toHaveBeenCalledTimes(1);
    const eventArg = onSubmitMock.mock.calls[0][0];
    expect(eventArg.defaultPrevented).toBe(true);
  });

  it('prevents default behavior when onSubmit is not provided', () => {
    render(
      <TestContext>
        <PasswordForm data-testid="password-form-no-submit">
          <input type="password" placeholder="Password input" />
          <button type="submit">Submit</button>
        </PasswordForm>
      </TestContext>
    );

    const form = screen.getByTestId('password-form-no-submit');

    // Dispatch a custom submit event to check preventDefault
    const submitEvent = new Event('submit', {
      bubbles: true,
      cancelable: true,
    });
    const notPrevented = fireEvent(form, submitEvent);

    expect(notPrevented).toBe(false);
    expect(submitEvent.defaultPrevented).toBe(true);
  });

  it('applies custom styles and other props', () => {
    render(
      <TestContext>
        <PasswordForm
          style={{ padding: '10px' }}
          className="my-form-class"
          data-testid="password-form"
        >
          <input type="password" />
        </PasswordForm>
      </TestContext>
    );

    const form = screen.getByTestId('password-form');
    expect(form).toHaveClass('my-form-class');
    // Default margin is 0, custom padding is 10px
    expect(form).toHaveStyle({ margin: '0px', padding: '10px' });
  });
});
