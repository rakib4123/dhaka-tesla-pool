import { PrismaClient } from '@prisma/client';
import { seedReferenceData } from './seedData';

async function main() {
  const prisma = new PrismaClient();
  try {
    await seedReferenceData(prisma);
    console.log('Seeded zones and the story cast (Jashim/Bullet, Monir/Toofan, Nusrat, Rafiq, Shirin).');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
