import { CAST_EMAILS, type ZoneName } from '../../src/db/cast';
import { seedReferenceData } from '../../src/db/seedData';
import { prisma } from '../../src/lib/prisma';
import { forgetTokens } from './http';

const zoneIds = new Map<ZoneName, number>();

/** Empties every table and reseeds zones plus the story cast. Call once per test file (beforeAll). */
export async function resetDatabase(): Promise<void> {
  zoneIds.clear();
  forgetTokens(); // the cast gets new user ids, so old tokens would point at deleted users
  await prisma.$executeRaw`TRUNCATE ride_events, pool_members, pools, ride_requests, vehicles, users, zones RESTART IDENTITY CASCADE`;
  await seedReferenceData(prisma);
}

/** Clears rides, pools and events between tests; keeps zones and the cast. */
export async function resetRideData(): Promise<void> {
  await prisma.$executeRaw`TRUNCATE ride_events, pool_members, pools, ride_requests RESTART IDENTITY CASCADE`;
  await prisma.vehicle.updateMany({ data: { isOnline: false, currentZoneId: null } });
  await prisma.user.deleteMany({ where: { email: { notIn: CAST_EMAILS } } });
}

export async function zoneId(name: ZoneName): Promise<number> {
  const cached = zoneIds.get(name);
  if (cached !== undefined) return cached;
  const zone = await prisma.zone.findUniqueOrThrow({ where: { name } });
  zoneIds.set(name, zone.id);
  return zone.id;
}
