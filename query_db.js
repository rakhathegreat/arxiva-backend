import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const requests = await prisma.request.findMany({
    include: {
      requestItems: {
        include: {
          materialCategory: true,
          brand: true,
          model: true,
        }
      }
    },
    take: 1,
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(requests, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
