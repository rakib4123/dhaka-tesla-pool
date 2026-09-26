import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { calculateFare, estimateFares } from '../domain/fare';
import { distanceKm } from '../domain/geo';
import { castEmail, DEMO_PASSWORD, DRIVERS, PASSENGERS, ZONES } from './cast';

/** Zones, passengers, drivers and their Teslas. Idempotent: upserts, never duplicates. */
export async function seedReferenceData(db: PrismaClient): Promise<void> {
  for (const zone of ZONES) {
    await db.zone.upsert({
      where: { name: zone.name },
      update: { gridX: zone.gridX, gridY: zone.gridY },
      create: { name: zone.name, gridX: zone.gridX, gridY: zone.gridY },
    });
  }

  for (const passenger of PASSENGERS) {
    const email = castEmail(passenger.key);
    await db.user.upsert({
      where: { email },
      update: {},
      create: {
        name: passenger.name,
        email,
        phone: passenger.phone,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
        role: 'PASSENGER',
      },
    });
  }

  for (const driver of DRIVERS) {
    const email = castEmail(driver.key);
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: {
        name: driver.name,
        email,
        phone: driver.phone,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
        role: 'DRIVER',
      },
    });
    await db.vehicle.upsert({
      where: { driverId: user.id },
      update: {},
      create: { driverId: user.id, ...driver.vehicle },
    });
  }
}

/**
 * Yesterday 08:41, Banani: Nusrat and Rafiq shared Bullet. Gives the history screens something real.
 * Idempotent: does nothing if Bullet already has any pool.
 */
export async function seedDemoHistory(db: PrismaClient, now = new Date()): Promise<boolean> {
  const bullet = await db.vehicle.findUniqueOrThrow({ where: { plate: 'DHK-TESLA-11' } });
  if ((await db.pool.count({ where: { vehicleId: bullet.id } })) > 0) return false;

  const zone = async (name: string) => db.zone.findUniqueOrThrow({ where: { name } });
  const [banani, mohakhali, gulshan1] = await Promise.all([zone('Banani'), zone('Mohakhali'), zone('Gulshan 1')]);
  const nusrat = await db.user.findUniqueOrThrow({ where: { email: castEmail('nusrat') } });
  const rafiq = await db.user.findUniqueOrThrow({ where: { email: castEmail('rafiq') } });
  const at = (hour: number, minute: number) => {
    const time = new Date(now);
    time.setDate(time.getDate() - 1);
    time.setHours(hour, minute, 0, 0);
    return time;
  };

  await db.$transaction(async (tx) => {
    const pool = await tx.pool.create({
      data: {
        vehicleId: bullet.id, pickupZoneId: banani.id, capacity: bullet.capacity, seatsTaken: 2,
        status: 'COMPLETED', createdAt: at(8, 42), startedAt: at(8, 46), completedAt: at(8, 58),
      },
    });
    await tx.rideEvent.createMany({
      data: [
        { poolId: pool.id, actorUserId: bullet.driverId, type: 'POOL_OPENED', toStatus: 'OPEN', createdAt: at(8, 42) },
        { poolId: pool.id, actorUserId: bullet.driverId, type: 'POOL_STATUS_CHANGED', fromStatus: 'OPEN', toStatus: 'DRIVER_ARRIVED', createdAt: at(8, 44) },
        { poolId: pool.id, actorUserId: bullet.driverId, type: 'POOL_STATUS_CHANGED', fromStatus: 'DRIVER_ARRIVED', toStatus: 'STARTED', createdAt: at(8, 46) },
        { poolId: pool.id, actorUserId: bullet.driverId, type: 'POOL_STATUS_CHANGED', fromStatus: 'STARTED', toStatus: 'COMPLETED', createdAt: at(8, 58) },
      ],
    });

    const riders = [
      { passenger: nusrat, dropoff: mohakhali, requestedAt: at(8, 41), matchedAt: at(8, 42), via: 'DRIVER_ACCEPT', matchedBy: bullet.driverId },
      { passenger: rafiq, dropoff: gulshan1, requestedAt: at(8, 43), matchedAt: at(8, 43), via: 'AUTO_JOIN', matchedBy: null },
    ] as const;

    for (const rider of riders) {
      const km = distanceKm(banani, rider.dropoff);
      const estimate = estimateFares(km, 1);
      const fare = calculateFare({ distanceKm: km, seats: 1, pooled: true });
      const ride = await tx.rideRequest.create({
        data: {
          passengerId: rider.passenger.id, pickupZoneId: banani.id, dropoffZoneId: rider.dropoff.id, seats: 1,
          distanceKm: km, status: 'COMPLETED', estimateSoloPaisa: estimate.soloPaisa, estimatePooledPaisa: estimate.pooledPaisa,
          fareBasePaisa: fare.basePaisa, fareDistancePaisa: fare.distancePaisa, fareDiscountPaisa: fare.discountPaisa,
          fareTotalPaisa: fare.totalPaisa, createdAt: rider.requestedAt,
        },
      });
      await tx.poolMember.create({ data: { poolId: pool.id, rideRequestId: ride.id, seats: 1, joinedAt: rider.matchedAt } });
      await tx.rideEvent.createMany({
        data: [
          { rideRequestId: ride.id, actorUserId: rider.passenger.id, type: 'RIDE_REQUESTED', toStatus: 'REQUESTED', createdAt: rider.requestedAt },
          { rideRequestId: ride.id, poolId: pool.id, actorUserId: rider.matchedBy, type: 'RIDE_MATCHED', fromStatus: 'REQUESTED', toStatus: 'MATCHED', metadata: { via: rider.via }, createdAt: rider.matchedAt },
          { rideRequestId: ride.id, poolId: pool.id, actorUserId: bullet.driverId, type: 'RIDE_STATUS_CHANGED', fromStatus: 'MATCHED', toStatus: 'DRIVER_ARRIVED', createdAt: at(8, 44) },
          { rideRequestId: ride.id, poolId: pool.id, actorUserId: bullet.driverId, type: 'RIDE_STATUS_CHANGED', fromStatus: 'DRIVER_ARRIVED', toStatus: 'STARTED', metadata: { ...fare, pooled: true }, createdAt: at(8, 46) },
          { rideRequestId: ride.id, poolId: pool.id, actorUserId: bullet.driverId, type: 'RIDE_STATUS_CHANGED', fromStatus: 'STARTED', toStatus: 'COMPLETED', createdAt: at(8, 58) },
        ],
      });
    }
  });
  return true;
}
