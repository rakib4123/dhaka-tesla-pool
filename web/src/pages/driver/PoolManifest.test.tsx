import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { driverPool, rafiqRider, rider } from '../../test/fixtures';
import { mockApi } from '../../test/mockApi';
import { PoolManifest } from './PoolManifest';

const withRafiq = (overrides = {}) =>
  driverPool({ seatsTaken: 2, riders: [rider({ estimatePaisa: 5250 }), rafiqRider()], ...overrides });

describe("Jashim's pool manifest", () => {
  it('shows who is aboard, where they go, and what each will pay', () => {
    render(<PoolManifest pool={withRafiq()} onChanged={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Picking up in Banani' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '2 of 3 seats taken' })).toBeInTheDocument();
    expect(screen.getByText('2/3 seats')).toBeInTheDocument();
    expect(screen.getByText('Nusrat')).toBeInTheDocument();
    expect(screen.getByText('1 seat · to Mohakhali')).toBeInTheDocument();
    expect(screen.getByText('৳52.50 (est.)')).toBeInTheDocument();
    expect(screen.getByText('Rafiq')).toBeInTheDocument();
    expect(screen.getByText('৳67.50 (est.)')).toBeInTheDocument();
  });

  it('marks Bullet as full and ready to go', () => {
    render(<PoolManifest pool={withRafiq({ seatsTaken: 3, isFull: true })} onChanged={vi.fn()} />);
    expect(screen.getByText('Bullet is full — ready to go')).toBeInTheDocument();
  });

  it.each([
    ['OPEN', "I've arrived", 'arrive'],
    ['DRIVER_ARRIVED', 'Start trip', 'start'],
    ['STARTED', 'Complete trip', 'complete'],
  ] as const)('from %s, the next button is "%s"', async (status, label, action) => {
    const { calls } = mockApi({ [`POST /pools/pool-1/${action}`]: { body: withRafiq() } });
    const onChanged = vi.fn();
    render(<PoolManifest pool={withRafiq({ status })} onChanged={onChanged} />);

    await userEvent.click(screen.getByRole('button', { name: label }));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/pools/pool-1/${action}` });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('tells Jashim how much cash to collect once fares are locked', () => {
    const started = withRafiq({
      status: 'STARTED',
      riders: [rider({ status: 'STARTED', fareTotalPaisa: 5250 }), rafiqRider({ status: 'STARTED', fareTotalPaisa: 6750 })],
    });
    render(<PoolManifest pool={started} onChanged={vi.fn()} />);
    expect(screen.getByText('৳52.50')).toBeInTheDocument();
    expect(screen.getByText('Collect ৳120.00 in cash at drop-off')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel trip' })).not.toBeInTheDocument();
  });

  it('sends one request when Start trip is double-clicked', async () => {
    const { calls } = mockApi({ 'POST /pools/pool-1/start': { body: withRafiq(), delayMs: 80 } });
    render(<PoolManifest pool={withRafiq({ status: 'DRIVER_ARRIVED' })} onChanged={vi.fn()} />);

    await userEvent.dblClick(screen.getByRole('button', { name: 'Start trip' }));
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(calls).toHaveLength(1);
  });

  it('cancels the trip only after confirmation', async () => {
    const { calls } = mockApi({ 'POST /pools/pool-1/cancel': { body: withRafiq({ status: 'CANCELLED' }) } });
    render(<PoolManifest pool={withRafiq()} onChanged={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel trip' }));
    expect(calls).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel trip' }));
    expect(calls[0]).toMatchObject({ path: '/pools/pool-1/cancel' });
  });

  it("shows the API's reason when an action is refused, and refreshes", async () => {
    mockApi({
      'POST /pools/pool-1/start': {
        status: 409,
        body: { error: { code: 'INVALID_TRANSITION', message: "You can't start a trip that is open" } },
      },
    });
    const onChanged = vi.fn();
    render(<PoolManifest pool={withRafiq({ status: 'DRIVER_ARRIVED' })} onChanged={onChanged} />);

    await userEvent.click(screen.getByRole('button', { name: 'Start trip' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("You can't start a trip that is open");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
