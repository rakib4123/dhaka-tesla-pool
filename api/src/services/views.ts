import type { UserRole, Vehicle, Zone } from '@prisma/client';

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
