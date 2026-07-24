import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const types = await prisma.materialModel.findMany({
        include: {
            brand: true,
            materialCategory: true,
            _count: { select: { items: true } }
        },
        take: 1
    });
    console.log(JSON.stringify(types, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
