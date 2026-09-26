import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { driverPool, jashim, rafiqRider, rider } from '../../test/fixtures';
import { mockApi } from '../../test/mockApi';
import { renderApp } from '../../test/render';

describe("Jashim's past trips", () => {
  it('says so when there are none', async () => {
    mockApi({ 'GET /me': { body: jashim }, 'GET /driver/history': { body: [] } });
    renderApp('/driver/history', { signedIn: true });
    expect(await screen.findByText('No finished trips yet')).toBeInTheDocument();
  });

  it("shows yesterday's Banani pool and the cash collected", async () => {
    mockApi({
      'GET /me': { body: jashim },
      'GET /driver/history': {
        body: [
          driverPool({
            status: 'COMPLETED',
            seatsTaken: 2,
            completedAt: '2026-09-25T02:58:00.000Z',
            riders: [
              rider({ status: 'COMPLETED', fareTotalPaisa: 5250 }),
              rafiqRider({ status: 'COMPLETED', fareTotalPaisa: 6750 }),
            ],
          }),
        ],
      },
    });
    renderApp('/driver/history', { signedIn: true });

    expect(await screen.findByText('Completed · from Banani')).toBeInTheDocument();
    expect(screen.getByText('Nusrat → Mohakhali')).toBeInTheDocument();
    expect(screen.getByText('Rafiq → Gulshan 1')).toBeInTheDocument();
    expect(screen.getByText('Collected ৳120.00')).toBeInTheDocument();
  });

  it('shows a cancelled trip and who was re-queued', async () => {
    mockApi({
      'GET /me': { body: jashim },
      'GET /driver/history': {
        body: [driverPool({ status: 'CANCELLED', seatsTaken: 0, riders: [rider({ status: 'REQUESTED', leftReason: 'DRIVER_CANCELLED' })] })],
      },
    });
    renderApp('/driver/history', { signedIn: true });

    expect(await screen.findByText('Cancelled · from Banani')).toBeInTheDocument();
    expect(screen.getByText('back in the queue')).toBeInTheDocument();
  });
});
