import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const item = await prisma.item.findFirst({
    include: {
      model: {
        include: {
          materialCategory: true,
          brand: true,
        }
      }
    }
  });
  console.log(JSON.stringify(item, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
