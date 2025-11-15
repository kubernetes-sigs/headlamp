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
