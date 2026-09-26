// Mirrors api/src/services/views.ts: the JSON the API actually returns.

export type Role = 'PASSENGER' | 'DRIVER';
export type RideStatus = 'REQUESTED' | 'MATCHED' | 'DRIVER_ARRIVED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';
export type PoolStatus = 'OPEN' | 'DRIVER_ARRIVED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';
export type PoolAction = 'arrive' | 'start' | 'complete' | 'cancel';

export interface ZoneRef {
  id: number;
  name: string;
}

export interface Zone extends ZoneRef {
  gridX: number;
  gridY: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
}

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
  capacity: number;
  isOnline: boolean;
  currentZone: ZoneRef | null;
}

export interface Me extends User {
  vehicle: Vehicle | null;
}

export interface AuthResult {
  token: string;
  user: User;
}

export interface RegisterInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
}

export interface FareBreakdown {
  basePaisa: number;
  distancePaisa: number;
  discountPaisa: number;
  totalPaisa: number;
}

export interface FareEstimate {
  distanceKm: number;
  soloPaisa: number;
  pooledPaisa: number;
}

export interface TripInput {
  pickupZoneId: number;
  dropoffZoneId: number;
  seats: number;
}

export interface RidePool {
  id: string;
  status: PoolStatus;
  driverName: string;
  vehicleName: string;
  vehiclePlate: string;
  coRiderCount: number;
}

export interface Ride {
  id: string;
  status: RideStatus;
  seats: number;
  pickupZone: ZoneRef;
  dropoffZone: ZoneRef;
  distanceKm: number;
  estimate: { soloPaisa: number; pooledPaisa: number };
  fare: FareBreakdown | null;
  cancelledBy: 'PASSENGER' | 'DRIVER' | null;
  createdAt: string;
  pool: RidePool | null;
}

export interface RideEvent {
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  actor: 'PASSENGER' | 'DRIVER' | 'SYSTEM';
  createdAt: string;
}

export interface RideDetail extends Ride {
  events: RideEvent[];
}

export interface DriverRider {
  rideId: string;
  firstName: string;
  seats: number;
  dropoffZone: ZoneRef;
  status: RideStatus;
  estimatePaisa: number;
  fareTotalPaisa: number | null;
  leftReason: string | null;
}

export interface DriverPool {
  id: string;
  status: PoolStatus;
  capacity: number;
  seatsTaken: number;
  isFull: boolean;
  pickupZone: ZoneRef;
  vehicle: { name: string; plate: string };
  riders: DriverRider[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface RelevantRequest {
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
