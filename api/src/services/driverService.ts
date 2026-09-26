import { ACTIVE_POOL_STATUSES } from '../domain/transitions';
import { AppError, conflict } from '../lib/AppError';
import { prisma } from '../lib/prisma';
import { lockVehicleForDriver } from './locks';
import { toVehicleView, type VehicleView } from './views';

export async function setAvailability(driverId: string, input: { online: boolean; zoneId?: number }): Promise<VehicleView> {
  return prisma.$transaction(async (tx) => {
    const vehicle = await lockVehicleForDriver(tx, driverId);

    const activePool = await tx.pool.findFirst({ where: { vehicleId: vehicle.id, status: { in: ACTIVE_POOL_STATUSES } } });
    if (activePool) throw conflict('ACTIVE_POOL_EXISTS', 'Finish or cancel your current trip before changing availability');

    if (input.online) {
      const zone = input.zoneId === undefined ? null : await tx.zone.findUnique({ where: { id: input.zoneId } });
      if (!zone) throw new AppError(400, 'VALIDATION_ERROR', 'Unknown zone', [{ path: 'zoneId', message: 'Unknown zone' }]);
    }

    const updated = await tx.vehicle.update({
      where: { id: vehicle.id },
      data: input.online ? { isOnline: true, currentZoneId: input.zoneId } : { isOnline: false, currentZoneId: null },
      include: { currentZone: true },
    });
    return toVehicleView(updated);
  });
}
