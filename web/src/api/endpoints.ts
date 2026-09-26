import { apiFetch } from './client';
import type {
  AuthResult,
  DriverPool,
  FareEstimate,
  Me,
  PoolAction,
  RegisterInput,
  RelevantRequest,
  Ride,
  RideDetail,
  TripInput,
  Vehicle,
  Zone,
} from './types';

const id = (value: string) => encodeURIComponent(value);

/** One function per API endpoint (spec §6). */
export const api = {
  login: (email: string, password: string) =>
    apiFetch<AuthResult>('/auth/login', { method: 'POST', body: { email, password } }),
  register: (input: RegisterInput) => apiFetch<AuthResult>('/auth/register', { method: 'POST', body: input }),
  me: () => apiFetch<Me>('/me'),

  zones: () => apiFetch<Zone[]>('/zones'),
  estimate: (trip: TripInput) => apiFetch<FareEstimate>('/fares/estimate', { method: 'POST', body: trip }),

  createRide: (trip: TripInput) => apiFetch<Ride>('/rides', { method: 'POST', body: trip }),
  rides: () => apiFetch<Ride[]>('/rides'),
  ride: (rideId: string) => apiFetch<RideDetail>(`/rides/${id(rideId)}`),
  cancelRide: (rideId: string) => apiFetch<Ride>(`/rides/${id(rideId)}/cancel`, { method: 'POST' }),

  setAvailability: (input: { online: boolean; zoneId?: number }) =>
    apiFetch<Vehicle>('/driver/availability', { method: 'PUT', body: input }),
  relevantRequests: () => apiFetch<RelevantRequest[]>('/driver/requests'),
  acceptRequest: (rideId: string) => apiFetch<DriverPool>(`/driver/requests/${id(rideId)}/accept`, { method: 'POST' }),
  driverPool: () => apiFetch<{ pool: DriverPool | null }>('/driver/pool'),
  driverHistory: () => apiFetch<DriverPool[]>('/driver/history'),
  poolAction: (poolId: string, action: PoolAction) =>
    apiFetch<DriverPool>(`/pools/${id(poolId)}/${action}`, { method: 'POST' }),
};
