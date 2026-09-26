import type { UserRole, Vehicle, Zone } from '@prisma/client';
import type { FareBreakdown } from '../domain/fare';
import type { PoolStatus, RideStatus } from '../domain/transitions';

// Response shapes. The web app mirrors these types (Plan 2).

export interface ZoneRef {
  id: number;
  name: string;
}

export interface UserView {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
}

export interface VehicleView {
  id: string;
  name: string;
  plate: string;
  capacity: number;
  isOnline: boolean;
  currentZone: ZoneRef | null;
}

export interface MeView extends UserView {
  vehicle: VehicleView | null;
}

export const toZoneRef = (zone: Zone): ZoneRef => ({ id: zone.id, name: zone.name });

export function toVehicleView(vehicle: Vehicle & { currentZone: Zone | null }): VehicleView {
  return {
    id: vehicle.id,
    name: vehicle.name,
    plate: vehicle.plate,
    capacity: vehicle.capacity,
    isOnline: vehicle.isOnline,
    currentZone: vehicle.currentZone ? toZoneRef(vehicle.currentZone) : null,
  };
}

/** What a passenger may see about their pool: no other riders' names, destinations or fares. */
export interface RidePoolView {
  id: string;
  status: PoolStatus;
  driverName: string;
  vehicleName: string;
  vehiclePlate: string;
  coRiderCount: number;
}

export interface RideView {
  id: string;
  status: RideStatus;
  seats: number;
  pickupZone: ZoneRef;
  dropoffZone: ZoneRef;
  distanceKm: number;
  estimate: { soloPaisa: number; pooledPaisa: number };
  /** Locked when the trip starts; null before that. */
  fare: FareBreakdown | null;
  cancelledBy: 'PASSENGER' | 'DRIVER' | null;
  createdAt: string;
  pool: RidePoolView | null;
}

export interface RideEventView {
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  actor: 'PASSENGER' | 'DRIVER' | 'SYSTEM';
  createdAt: string;
}

export interface RideDetailView extends RideView {
  events: RideEventView[];
}

/** What Jashim sees about each rider: enough to pick up, drop off and collect cash. */
export interface DriverRiderView {
  rideId: string;
  firstName: string;
  seats: number;
  dropoffZone: ZoneRef;
  status: RideStatus;
  /** Expected cash: the pooled estimate if 2+ riders are aboard, else solo. Replaced by the locked fare at start. */
  estimatePaisa: number;
  fareTotalPaisa: number | null;
  leftReason: string | null;
}

export interface DriverPoolView {
  id: string;
  status: PoolStatus;
  capacity: number;
  seatsTaken: number;
  isFull: boolean;
  pickupZone: ZoneRef;
  vehicle: { name: string; plate: string };
  riders: DriverRiderView[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface RelevantRequestView {
  rideId: string;
  firstName: string;
  seats: number;
  pickupZone: ZoneRef;
  dropoffZone: ZoneRef;
  distanceKm: number;
  estimateSoloPaisa: number;
  estimatePooledPaisa: number;
  requestedAt: string;
}
