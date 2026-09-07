import prisma from '../src/shared/prisma.js';
import { releaseAllocations } from '../src/modules/requestflow/requestflow.service.js';

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
            // Satu definisi pelepasan alokasi — sama dengan controller (M2)
            await releaseAllocations(tx, request);
        });

        releasedCount += allocationCount;
        console.log(`Released ${allocationCount} allocation(s) from ${request.requestNumber} (${request.status})`);
    }

    console.log(`Done. Total allocations released: ${releasedCount}`);
}

releaseOrphanAllocations()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
