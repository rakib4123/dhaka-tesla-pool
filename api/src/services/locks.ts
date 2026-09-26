import type { Vehicle, Zone } from '@prisma/client';
import { notFound } from '../lib/AppError';
import type { Db } from '../lib/prisma';

/**
 * Row locks (SELECT … FOR UPDATE) held until the transaction ends.
 * Lock order everywhere: vehicle → pool → ride requests. A single order means no deadlocks.
 */
export async function lockVehicleForDriver(tx: Db, driverId: string): Promise<Vehicle & { currentZone: Zone | null }> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM vehicles WHERE driver_id = ${driverId}::uuid FOR UPDATE`;
  const row = rows[0];
  if (!row) throw notFound('Vehicle');
  return tx.vehicle.findUniqueOrThrow({ where: { id: row.id }, include: { currentZone: true } });
}

export async function lockPool(tx: Db, poolId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM pools WHERE id = ${poolId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound('Pool');
}
