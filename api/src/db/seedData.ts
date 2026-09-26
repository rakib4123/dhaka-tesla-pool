import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
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
