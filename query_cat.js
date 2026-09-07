import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const cats = await prisma.materialCategory.findMany();
  console.log(JSON.stringify(cats, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
