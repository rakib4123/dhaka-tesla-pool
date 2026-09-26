import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Ride } from '../../api/types';
import { bulletPool, NUSRAT_POOLED_FARE, nusrat, nusratRide, ZONES } from '../../test/fixtures';
import { mockApi, sequence } from '../../test/mockApi';
import { renderApp } from '../../test/render';

vi.mock('../../lib/polling', () => ({ POLL_MS: 25 }));

const estimate = { body: { distanceKm: 2, soloPaisa: 7000, pooledPaisa: 5250 } };

describe('the passenger ride page', () => {
  it('quotes both prices and books Banani → Mohakhali', async () => {
    let rides: Ride[] = [];
    const { calls } = mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': () => ({ body: rides }),
      'GET /zones': { body: ZONES },
      'POST /fares/estimate': estimate,
      'POST /rides': () => {
        rides = [nusratRide()];
        return { status: 201, body: rides[0] };
      },
    });
    const { user } = renderApp('/ride', { signedIn: true });

    await user.selectOptions(await screen.findByLabelText('Pickup'), 'Banani');
    await user.selectOptions(screen.getByLabelText('Drop-off'), 'Mohakhali');
    expect(await screen.findByText('৳70.00 solo · ৳52.50 if pooled')).toBeInTheDocument();
    expect(screen.getByText('2 km')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Request ride' }));

    expect(await screen.findByRole('heading', { name: 'Waiting for a Tesla' })).toBeInTheDocument();
    const booking = calls.find((call) => call.method === 'POST' && call.path === '/rides');
    expect(booking?.body).toEqual({ pickupZoneId: 1, dropoffZoneId: 2, seats: 1 });
  });

  it('will not book a trip that starts and ends in the same zone', async () => {
    const { calls } = mockApi({ 'GET /me': { body: nusrat }, 'GET /rides': { body: [] }, 'GET /zones': { body: ZONES } });
    const { user } = renderApp('/ride', { signedIn: true });

    await user.selectOptions(await screen.findByLabelText('Pickup'), 'Banani');
    await user.selectOptions(screen.getByLabelText('Drop-off'), 'Banani');

    expect(screen.getByText('Pick a different drop-off zone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request ride' })).toBeDisabled();
    expect(calls.some((call) => call.path === '/fares/estimate')).toBe(false);
  });

  it('sends exactly one booking when Request ride is double-clicked', async () => {
    const { calls } = mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': { body: [] },
      'GET /zones': { body: ZONES },
      'POST /fares/estimate': estimate,
      'POST /rides': { status: 201, body: nusratRide(), delayMs: 100 },
    });
    const { user } = renderApp('/ride', { signedIn: true });

    await user.selectOptions(await screen.findByLabelText('Pickup'), 'Banani');
    await user.selectOptions(screen.getByLabelText('Drop-off'), 'Mohakhali');
    await user.dblClick(screen.getByRole('button', { name: 'Request ride' }));

    await waitFor(() => expect(calls.filter((call) => call.method === 'POST' && call.path === '/rides')).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(calls.filter((call) => call.method === 'POST' && call.path === '/rides')).toHaveLength(1);
  });

  it('shows why a booking failed', async () => {
    mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': { body: [] },
      'GET /zones': { body: ZONES },
      'POST /fares/estimate': estimate,
      'POST /rides': {
        status: 409,
        body: { error: { code: 'ACTIVE_RIDE_EXISTS', message: 'You already have an active ride. Cancel it or wait until it completes' } },
      },
    });
    const { user } = renderApp('/ride', { signedIn: true });

    await user.selectOptions(await screen.findByLabelText('Pickup'), 'Banani');
    await user.selectOptions(screen.getByLabelText('Drop-off'), 'Mohakhali');
    await user.click(screen.getByRole('button', { name: 'Request ride' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You already have an active ride');
  });

  it('shows the active ride instead of the form', async () => {
    mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': { body: [nusratRide({ status: 'MATCHED', pool: bulletPool({ coRiderCount: 1 }) })] },
    });
    renderApp('/ride', { signedIn: true });

    expect(await screen.findByRole('heading', { name: 'Matched' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request ride' })).not.toBeInTheDocument();
  });

  it('keeps the last update on screen when the connection drops', async () => {
    mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': sequence({ body: [nusratRide({ status: 'MATCHED', pool: bulletPool() })] }, { networkError: true }),
    });
    renderApp('/ride', { signedIn: true });

    expect(await screen.findByText('Connection lost — showing the last update. Retrying…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Matched' })).toBeInTheDocument();
  });

  it('shows how the last ride ended above the form', async () => {
    mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': { body: [nusratRide({ status: 'COMPLETED', fare: NUSRAT_POOLED_FARE })] },
      'GET /zones': { body: ZONES },
    });
    renderApp('/ride', { signedIn: true });

    expect(await screen.findByText('Last ride: Banani → Mohakhali · Completed · ৳52.50')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request ride' })).toBeInTheDocument();
  });

  it('offers a retry when the rides cannot be loaded', async () => {
    mockApi({ 'GET /me': { body: nusrat }, 'GET /rides': { networkError: true } });
    renderApp('/ride', { signedIn: true });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
