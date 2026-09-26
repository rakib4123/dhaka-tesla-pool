import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RideEvent } from '../../api/types';
import { bulletPool, NUSRAT_POOLED_FARE, nusrat, nusratRide } from '../../test/fixtures';
import { mockApi, sequence } from '../../test/mockApi';
import { renderApp } from '../../test/render';

const at = (minute: number) => `2026-09-25T02:${String(minute).padStart(2, '0')}:00.000Z`;
const yesterdaysEvents: RideEvent[] = [
  { type: 'RIDE_REQUESTED', fromStatus: null, toStatus: 'REQUESTED', actor: 'PASSENGER', createdAt: at(41) },
  { type: 'RIDE_MATCHED', fromStatus: 'REQUESTED', toStatus: 'MATCHED', actor: 'DRIVER', createdAt: at(42) },
  { type: 'RIDE_STATUS_CHANGED', fromStatus: 'MATCHED', toStatus: 'DRIVER_ARRIVED', actor: 'DRIVER', createdAt: at(44) },
  { type: 'RIDE_STATUS_CHANGED', fromStatus: 'DRIVER_ARRIVED', toStatus: 'STARTED', actor: 'DRIVER', createdAt: at(46) },
  { type: 'RIDE_STATUS_CHANGED', fromStatus: 'STARTED', toStatus: 'COMPLETED', actor: 'DRIVER', createdAt: at(58) },
];
const completed = nusratRide({ status: 'COMPLETED', fare: NUSRAT_POOLED_FARE, pool: bulletPool({ status: 'COMPLETED', coRiderCount: 1 }) });

describe('passenger history', () => {
  it('says so when there are no rides yet', async () => {
    mockApi({ 'GET /me': { body: nusrat }, 'GET /rides': { body: [] } });
    renderApp('/history', { signedIn: true });
    expect(await screen.findByText('No rides yet')).toBeInTheDocument();
  });

  it("lists yesterday's pooled ride with its fare, and explains exactly what happened", async () => {
    mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': { body: [completed] },
      'GET /rides/ride-nusrat': { body: { ...completed, events: yesterdaysEvents } },
    });
    const { user } = renderApp('/history', { signedIn: true });

    expect(await screen.findByText('Banani → Mohakhali')).toBeInTheDocument();
    expect(screen.getByText('Completed · ৳52.50')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details' }));

    expect(await screen.findByText('You requested the ride')).toBeInTheDocument();
    expect(screen.getByText('The driver accepted your ride')).toBeInTheDocument();
    expect(screen.getByText('Your Tesla arrived at the pickup')).toBeInTheDocument();
    expect(screen.getByText('Trip started and your fare was locked')).toBeInTheDocument();
    expect(screen.getByText('Trip completed')).toBeInTheDocument();
  });

  it('describes an automatic match and a driver cancellation in plain words', async () => {
    const requeued = nusratRide();
    mockApi({
      'GET /me': { body: nusrat },
      'GET /rides': { body: [nusratRide({ status: 'CANCELLED', cancelledBy: 'PASSENGER' })] },
      'GET /rides/ride-nusrat': {
        body: {
          ...requeued,
          events: [
            { type: 'RIDE_MATCHED', fromStatus: 'REQUESTED', toStatus: 'MATCHED', actor: 'SYSTEM', createdAt: at(43) },
            { type: 'RIDE_REQUEUED', fromStatus: 'MATCHED', toStatus: 'REQUESTED', actor: 'DRIVER', createdAt: at(45) },
            { type: 'RIDE_CANCELLED', fromStatus: 'REQUESTED', toStatus: 'CANCELLED', actor: 'PASSENGER', createdAt: at(47) },
          ],
        },
      },
    });
    const { user } = renderApp('/history', { signedIn: true });

    expect(await screen.findByText('Cancelled · no charge')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(await screen.findByText('Matched into a shared Tesla automatically')).toBeInTheDocument();
    expect(screen.getByText('The driver cancelled, so you went back in the queue')).toBeInTheDocument();
    expect(screen.getByText('You cancelled the ride')).toBeInTheDocument();
  });

  it('offers a retry when history cannot be loaded', async () => {
    mockApi({ 'GET /me': { body: nusrat }, 'GET /rides': sequence({ networkError: true }, { body: [] }) });
    const { user } = renderApp('/history', { signedIn: true });
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No rides yet')).toBeInTheDocument();
  });
});
