import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { castEmail, type ZoneName } from '../../src/db/cast';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase, resetRideData, zoneId } from '../helpers/db';

const bullet = () => prisma.vehicle.findUniqueOrThrow({ where: { plate: 'DHK-TESLA-11' } });

async function openBulletPool(seatsTaken = 0) {
  const vehicle = await bullet();
  return prisma.pool.create({
    data: { vehicleId: vehicle.id, pickupZoneId: await zoneId('Banani'), capacity: vehicle.capacity, seatsTaken },
  });
}

async function insertRide(who: 'nusrat' | 'rafiq' | 'shirin', dropoff: ZoneName = 'Mohakhali') {
  const passenger = await prisma.user.findUniqueOrThrow({ where: { email: castEmail(who) } });
  return prisma.rideRequest.create({
    data: {
      passengerId: passenger.id,
      pickupZoneId: await zoneId('Banani'),
      dropoffZoneId: await zoneId(dropoff),
      seats: 1,
      distanceKm: 2,
      estimateSoloPaisa: 7000,
      estimatePooledPaisa: 5250,
    },
  });
}

describe('database constraints: the last line of defence', () => {
  beforeAll(resetDatabase);
  beforeEach(resetRideData);

  it('seeds Bullet with three seats for Jashim', async () => {
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { plate: 'DHK-TESLA-11' }, include: { driver: true } });
    expect(vehicle).toMatchObject({ name: 'Bullet', capacity: 3 });
    expect(vehicle.driver.name).toBe('Jashim');
  });

  it('never lets Bullet carry more seats than it has', async () => {
    const pool = await openBulletPool(3);
    await expect(prisma.$executeRaw`UPDATE pools SET seats_taken = 4 WHERE id = ${pool.id}::uuid`).rejects.toThrow();
    const after = await prisma.pool.findUniqueOrThrow({ where: { id: pool.id } });
    expect(after.seatsTaken).toBe(3);
  });

  it('allows only one active pool per Tesla', async () => {
    const first = await openBulletPool();
    await expect(openBulletPool()).rejects.toThrow();
    await prisma.pool.update({ where: { id: first.id }, data: { status: 'COMPLETED' } });
    await expect(openBulletPool()).resolves.toMatchObject({ status: 'OPEN' });
  });

  it('allows only one active ride per passenger', async () => {
    const first = await insertRide('nusrat');
    await expect(insertRide('nusrat')).rejects.toThrow();
    await prisma.rideRequest.update({ where: { id: first.id }, data: { status: 'CANCELLED' } });
    await expect(insertRide('nusrat')).resolves.toMatchObject({ status: 'REQUESTED' });
  });

  it('rejects a ride that starts and ends in the same zone', async () => {
    await expect(insertRide('rafiq', 'Banani')).rejects.toThrow();
  });

  it('rejects an online Tesla that has no zone', async () => {
    await expect(
      prisma.vehicle.update({ where: { plate: 'DHK-TESLA-11' }, data: { isOnline: true, currentZoneId: null } }),
    ).rejects.toThrow();
  });
});
