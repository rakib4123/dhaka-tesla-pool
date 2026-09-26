import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DriverPool, Me } from '../../api/types';
import { driverPool, jashim, jashimOnline, waitingRequest, ZONES } from '../../test/fixtures';
import { mockApi } from '../../test/mockApi';
import { renderApp } from '../../test/render';

vi.mock('../../lib/polling', () => ({ POLL_MS: 25 }));

describe("Jashim's driver screen", () => {
  it('goes online in Banani and shows that nobody is waiting yet', async () => {
    let me: Me = jashim;
    const { calls } = mockApi({
      'GET /me': () => ({ body: me }),
      'GET /zones': { body: ZONES },
      'GET /driver/pool': { body: { pool: null } },
      'GET /driver/requests': { body: [] },
      'PUT /driver/availability': () => {
        me = jashimOnline;
        return { body: jashimOnline.vehicle };
      },
    });
    const { user } = renderApp('/driver', { signedIn: true });

    expect(await screen.findByText("You're offline")).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Banani' }); // zones load before Jashim can pick one
    await user.selectOptions(screen.getByLabelText('Your zone'), 'Banani');
    await user.click(screen.getByRole('button', { name: 'Go online' }));

    expect(await screen.findByText('Online in Banani')).toBeInTheDocument();
    expect(await screen.findByText('No one in Banani needs a Tesla right now.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ online: true, zoneId: 1 });
  });

  it("accepts Nusrat and switches to Bullet's manifest", async () => {
    let pool: DriverPool | null = null;
    const { calls } = mockApi({
      'GET /me': { body: jashimOnline },
      'GET /driver/pool': () => ({ body: { pool } }),
      'GET /driver/requests': () => ({ body: pool ? [] : [waitingRequest()] }),
      'POST /driver/requests/ride-nusrat/accept': () => {
        pool = driverPool();
        return { body: pool };
      },
    });
    const { user } = renderApp('/driver', { signedIn: true });

    expect(await screen.findByText('Nusrat')).toBeInTheDocument();
    expect(screen.getByText('1 seat · Banani → Mohakhali · 2 km')).toBeInTheDocument();
    expect(screen.getByText('৳70.00 solo · ৳52.50 pooled')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept Nusrat' }));

    expect(await screen.findByRole('button', { name: "I've arrived" })).toBeInTheDocument();
    expect(calls.filter((call) => call.path === '/driver/requests/ride-nusrat/accept')).toHaveLength(1);
  });

  it('explains when another Tesla got the rider first, and refreshes the list', async () => {
    const { calls } = mockApi({
      'GET /me': { body: jashimOnline },
      'GET /driver/pool': { body: { pool: null } },
      'GET /driver/requests': { body: [waitingRequest()] },
      'POST /driver/requests/ride-nusrat/accept': {
        status: 409,
        body: { error: { code: 'ALREADY_MATCHED', message: 'Another Tesla already picked up this rider' } },
      },
    });
    const { user } = renderApp('/driver', { signedIn: true });

    await user.click(await screen.findByRole('button', { name: 'Accept Nusrat' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Another Tesla already picked up this rider');
    const listLoads = calls.filter((call) => call.path === '/driver/requests').length;
    await waitFor(() => expect(calls.filter((call) => call.path === '/driver/requests').length).toBeGreaterThan(listLoads));
  });

  it('keeps Jashim online while he has riders', async () => {
    mockApi({
      'GET /me': { body: jashimOnline },
      'GET /driver/pool': { body: { pool: driverPool() } },
      'GET /driver/requests': { body: [] },
    });
    renderApp('/driver', { signedIn: true });

    expect(await screen.findByText('Finish or cancel your trip first.')).toBeInTheDocument(); // once his trip has loaded
    expect(screen.getByRole('button', { name: 'Go offline' })).toBeDisabled();
  });

  it('stops listing waiting riders once Bullet is full', async () => {
    mockApi({
      'GET /me': { body: jashimOnline },
      'GET /driver/pool': { body: { pool: driverPool({ seatsTaken: 3, isFull: true }) } },
      'GET /driver/requests': { body: [waitingRequest({ firstName: 'Shirin', rideId: 'ride-shirin' })] },
    });
    renderApp('/driver', { signedIn: true });

    expect(await screen.findByText('Bullet is full — ready to go')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Riders waiting in Banani' })).not.toBeInTheDocument();
  });
});
