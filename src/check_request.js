import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const requestId = "68e3b302-9c6e-493a-b13f-e9080e9f8910";
    const itemId = "94d2250a-e6bd-47b5-9923-91684317914b";
    
    console.log(`=== CHECKING DB ===\n`);

    // 1. Check Request
    console.log(`[1] Checking Request ID: ${requestId}`);
    const req = await prisma.request.findUnique({
        where: { id: requestId },
        include: { requestItems: true }
    });

    if (!req) {
        console.log("-> ❌ Request NOT FOUND in DB!");
    } else {
        console.log(`-> ✅ Request Found! Status: ${req.status}`);
        console.log(`   (Valid statuses for allocation: MENUNGGU, SIAP)`);
        if (req.status !== 'MENUNGGU' && req.status !== 'SIAP') {
            console.log(`   🚨 WARNING: Status '${req.status}' will trigger the 400 error!`);
        }
    }

    // 2. Check Item
    console.log(`\n[2] Checking Item ID: ${itemId}`);
    const item = await prisma.item.findUnique({
        where: { id: itemId },
        include: { model: true }
    });

    if (!item) {
        console.log("-> ❌ Item NOT FOUND in DB!");
    } else {
        console.log(`-> ✅ Item Found! Status: ${item.status}, SN: ${item.serialNumber}`);
        if (item.status !== 'tersedia') {
            console.log(`   🚨 WARNING: Item status '${item.status}' is not 'tersedia'!`);
        }
    }
}

main()
    .catch(e => console.error("Error querying DB:", e))
    .finally(() => prisma.$disconnect());
