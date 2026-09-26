import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { EmptyState, ErrorState, InlineError, Loading } from './StateViews';

describe('state views', () => {
  it('announces loading', () => {
    render(<Loading label="Loading your ride…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your ride…');
  });

  it("shows the error's message and retries on request", async () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new ApiError(0, 'NETWORK', "Can't reach the server.")} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the server.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state with a hint', () => {
    render(<EmptyState title="No rides yet" hint="Your trips will show up here." />);
    expect(screen.getByText('No rides yet')).toBeInTheDocument();
    expect(screen.getByText('Your trips will show up here.')).toBeInTheDocument();
  });

  it('renders nothing for an empty inline error', () => {
    const { container } = render(<InlineError message={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
