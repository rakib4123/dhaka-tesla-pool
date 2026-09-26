import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { bulletPool, NUSRAT_POOLED_FARE, nusratRide } from '../../test/fixtures';
import { mockApi } from '../../test/mockApi';
import { ActiveRideCard } from './ActiveRideCard';

describe('ActiveRideCard', () => {
  it('says it is still looking while no Tesla has matched', () => {
    render(<ActiveRideCard ride={nusratRide()} onChanged={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Waiting for a Tesla' })).toBeInTheDocument();
    expect(screen.getByText('Looking for a Tesla in Banani…')).toBeInTheDocument();
    expect(screen.getByText('Estimated fare: ৳70.00 solo · ৳52.50 if someone shares')).toBeInTheDocument();
  });

  it('shows who is driving and how many share the ride, but not who they are', () => {
    render(<ActiveRideCard ride={nusratRide({ status: 'MATCHED', pool: bulletPool({ coRiderCount: 1 }) })} onChanged={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Matched' })).toBeInTheDocument();
    expect(screen.getByText('Jashim is driving Bullet (DHK-TESLA-11)')).toBeInTheDocument();
    expect(screen.getByText('Sharing with 1 other passenger')).toBeInTheDocument();
    expect(screen.getByText('Estimated fare: ৳52.50 (pooled)')).toBeInTheDocument();
  });

  it('says "Bullet is here" when Jashim has arrived, and marks that step', () => {
    render(<ActiveRideCard ride={nusratRide({ status: 'DRIVER_ARRIVED', pool: bulletPool({ status: 'DRIVER_ARRIVED' }) })} onChanged={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Bullet is here' })).toBeInTheDocument();
    const progress = screen.getByRole('list', { name: 'Ride progress' });
    expect(within(progress).getByText('Arrived')).toHaveAttribute('aria-current', 'step');
  });

  it('shows the locked fare once the trip starts, and no cancel button', () => {
    render(
      <ActiveRideCard
        ride={nusratRide({ status: 'STARTED', fare: NUSRAT_POOLED_FARE, pool: bulletPool({ status: 'STARTED', coRiderCount: 1 }) })}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText('Base fare')).toBeInTheDocument();
    expect(screen.getByText('৳30.00')).toBeInTheDocument();
    expect(screen.getByText('Distance (2 km)')).toBeInTheDocument();
    expect(screen.getByText('৳40.00')).toBeInTheDocument();
    expect(screen.getByText('-৳17.50')).toBeInTheDocument();
    expect(screen.getByText('Pay ৳52.50 in cash at drop-off.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel ride' })).not.toBeInTheDocument();
  });

  it('asks for confirmation, then cancels and refreshes', async () => {
    const { calls } = mockApi({ 'POST /rides/ride-nusrat/cancel': { body: nusratRide({ status: 'CANCELLED' }) } });
    const onChanged = vi.fn();
    render(<ActiveRideCard ride={nusratRide({ status: 'MATCHED', pool: bulletPool() })} onChanged={onChanged} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel ride' }));
    expect(calls).toHaveLength(0); // nothing is sent until the passenger confirms
    await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));

    expect(calls).toHaveLength(1);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("explains a cancel that lost a race with Jashim's Start, and refreshes", async () => {
    mockApi({
      'POST /rides/ride-nusrat/cancel': {
        status: 409,
        body: { error: { code: 'INVALID_TRANSITION', message: 'Your ride changed while you were cancelling. Refresh and try again' } },
      },
    });
    const onChanged = vi.fn();
    render(<ActiveRideCard ride={nusratRide({ status: 'DRIVER_ARRIVED', pool: bulletPool() })} onChanged={onChanged} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel ride' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your ride changed while you were cancelling');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
