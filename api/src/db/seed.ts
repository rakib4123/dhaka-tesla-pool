import { PrismaClient } from '@prisma/client';
import { seedDemoHistory, seedReferenceData } from './seedData';

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedReferenceData(prisma);
    console.log('Seeded zones and the story cast (Jashim/Bullet, Monir/Toofan, Nusrat, Rafiq, Shirin).');
    const seededHistory = await seedDemoHistory(prisma);
    if (seededHistory) console.log("Seeded yesterday's 08:41 Banani pool (Nusrat + Rafiq in Bullet).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
