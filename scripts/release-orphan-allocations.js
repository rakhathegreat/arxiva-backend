import prisma from '../src/utils/prisma.js';

async function releaseOrphanAllocations() {
    const terminalStatuses = ['DITOLAK', 'DIBATALKAN'];

    const orphanedRequests = await prisma.request.findMany({
        where: { status: { in: terminalStatuses } },
        include: { requestItems: { include: { allocations: true } } }
    });

    let releasedCount = 0;

    for (const request of orphanedRequests) {
        const allocationCount = request.requestItems.reduce(
            (sum, ri) => sum + ri.allocations.length,
            0
        );
        if (allocationCount === 0) continue;

        await prisma.$transaction(async (tx) => {
            const requestItemIds = request.requestItems.map(ri => ri.id);

            await tx.requestAllocation.deleteMany({
                where: { requestItemId: { in: requestItemIds } }
            });

            await tx.requestItem.updateMany({
                where: { id: { in: requestItemIds } },
                data: { fulfilledQuantity: 0 }
            });
        });

        releasedCount += allocationCount;
        console.log(`Released ${allocationCount} allocation(s) from ${request.requestNumber} (${request.status})`);
    }

    console.log(`Done. Total allocations released: ${releasedCount}`);
}

releaseOrphanAllocations()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
