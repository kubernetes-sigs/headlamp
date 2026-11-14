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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventAction, HeadlampEventType } from '../../../redux/headlampEventSlice';
import store from '../../../redux/stores/store';
import ErrorBoundary from './ErrorBoundary';

describe('ErrorBoundary', () => {
  const errorHandler = (event: ErrorEvent) => {
    event.preventDefault();
  };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.addEventListener('error', errorHandler);
  });

  afterEach(() => {
    window.removeEventListener('error', errorHandler);
    vi.restoreAllMocks();
  });

  function ThrowingComponent({
    error = new Error('Test Explosion'),
  }: {
    error?: Error;
  }): React.ReactElement {
    throw error;
  }

  function HealthyComponent({ text = 'Healthy Content' }: { text?: string }) {
    return <div data-testid="healthy-child">{text}</div>;
  }

  function ProblematicChild({ error = new Error('Triggered Error') }: { error?: Error }) {
    const [shouldThrow, setShouldThrow] = React.useState(false);
    if (shouldThrow) {
      throw error;
    }
    return (
      <div>
        <span data-testid="child-status">Normal</span>
        <button data-testid="break-btn" onClick={() => setShouldThrow(true)}>
          Break
        </button>
      </div>
    );
  }

  it('renders child components as expected when no error is thrown', () => {
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    render(
      <ErrorBoundary>
        <HealthyComponent text="Normal Child Output" />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('healthy-child')).toBeInTheDocument();
    expect(screen.getByText('Normal Child Output')).toBeInTheDocument();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('catches errors and renders a custom ReactElement passed as fallback', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Something went wrong</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByTestId('healthy-child')).not.toBeInTheDocument();
  });

  it('renders a ComponentType fallback and passes the error instance as the error prop', () => {
    const testError = new Error('Custom Component Failure');
    const FallbackComponent = ({ error }: { error: Error }) => (
      <div data-testid="component-fallback">Error message: {error.message}</div>
    );

    render(
      <ErrorBoundary fallback={FallbackComponent}>
        <ThrowingComponent error={testError} />
      </ErrorBoundary>
    );

    const fallbackElem = screen.getByTestId('component-fallback');
    expect(fallbackElem).toBeInTheDocument();
    expect(fallbackElem).toHaveTextContent('Error message: Custom Component Failure');
  });

  it('renders null when an error occurs and no fallback is provided', () => {
    const { container } = render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(container).toBeEmptyDOMElement();
  });

  describe('Redux event dispatching', () => {
    it('dispatches ERROR_BOUNDARY event to store when an error is caught on state update', () => {
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const testError = new Error('Dispatched Error Test');

      render(
        <ErrorBoundary fallback={<div data-testid="fallback">Error Caught</div>}>
          <ProblematicChild error={testError} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('child-status')).toBeInTheDocument();
      expect(dispatchSpy).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('break-btn'));

      expect(screen.getByTestId('fallback')).toBeInTheDocument();
      expect(dispatchSpy).toHaveBeenCalledWith(
        eventAction({
          type: HeadlampEventType.ERROR_BOUNDARY,
          data: testError,
        })
      );
    });

    it('does not dispatch duplicate events on subsequent re-renders while the error remains unchanged', () => {
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const testError = new Error('Static Error');

      const child = <ProblematicChild error={testError} />;

      const { rerender } = render(
        <ErrorBoundary fallback={<div>Fallback 1</div>}>{child}</ErrorBoundary>
      );

      fireEvent.click(screen.getByTestId('break-btn'));

      expect(screen.getByText('Fallback 1')).toBeInTheDocument();
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(dispatchSpy).toHaveBeenCalledWith(
        eventAction({
          type: HeadlampEventType.ERROR_BOUNDARY,
          data: testError,
        })
      );

      // Re-render with identical children reference and updated fallback
      rerender(<ErrorBoundary fallback={<div>Fallback 2</div>}>{child}</ErrorBoundary>);

      expect(screen.getByText('Fallback 2')).toBeInTheDocument();
      // Dispatch should not have been called a second time
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error recovery', () => {
    it('clears error state and renders new children when children prop changes', () => {
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const testError = new Error('Recoverable Error');

      const { rerender } = render(
        <ErrorBoundary fallback={<div data-testid="fallback">Error Occurred</div>}>
          <ProblematicChild error={testError} />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByTestId('break-btn'));

      expect(screen.getByTestId('fallback')).toBeInTheDocument();
      expect(dispatchSpy).toHaveBeenCalledTimes(1);

      // Change children to a healthy component
      rerender(
        <ErrorBoundary fallback={<div data-testid="fallback">Error Occurred</div>}>
          <HealthyComponent text="Recovered Successfully" />
        </ErrorBoundary>
      );

      expect(screen.queryByTestId('fallback')).not.toBeInTheDocument();
      expect(screen.getByTestId('healthy-child')).toBeInTheDocument();
      expect(screen.getByText('Recovered Successfully')).toBeInTheDocument();
      // Clearing the error state should not trigger another ERROR_BOUNDARY event
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
    });

    it('recovers and renders new children when children change after an initial mount error', () => {
      const { rerender } = render(
        <ErrorBoundary fallback={<div data-testid="fallback">Initial Error Occurred</div>}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('fallback')).toBeInTheDocument();
      expect(screen.getByText('Initial Error Occurred')).toBeInTheDocument();

      rerender(
        <ErrorBoundary fallback={<div data-testid="fallback">Initial Error Occurred</div>}>
          <HealthyComponent text="Recovered from Initial Failure" />
        </ErrorBoundary>
      );

      expect(screen.queryByTestId('fallback')).not.toBeInTheDocument();
      expect(screen.getByTestId('healthy-child')).toBeInTheDocument();
      expect(screen.getByText('Recovered from Initial Failure')).toBeInTheDocument();
    });
  });
});
