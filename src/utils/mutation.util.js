/**
 * Automatically logs an item mutation into the ItemMutation table.
 * 
 * @param {import('@prisma/client').Prisma.TransactionClient} tx - The active Prisma transaction client
 * @param {Object} data - Mutation details
 * @param {string} data.type - Mutation type (MASUK, KELUAR, RUSAK, HILANG)
 * @param {string} data.itemId - The ID of the item
 * @param {string} data.userId - The user triggering the mutation
 * @param {number|null} [data.originLocationId] - Previous location ID (if any)
 * @param {number|null} [data.destinationLocationId] - New location ID (if any)
 * @param {string|null} [data.requestId] - Associated request ID (if any)
 */
export async function logMutation(tx, data) {
    // 1. Fetch item to snapshot data
    const item = await tx.item.findUnique({
        where: { id: data.itemId },
        include: {
            brand: true,
            category: true
        }
    });

    if (!item) {
        throw new Error(`Item dengan ID ${data.itemId} tidak ditemukan untuk dicatat mutasinya.`);
    }

    // 2. Generate a unique mutation number
    const date = new Date();
    const yearMonth = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    const randomSuffix = Math.floor(1000 + Math.random() * 9000); // 4 digit random
    const mutationNumber = `MUT-${yearMonth}-${randomSuffix}`;

    // 3. Create mutation log with snapshotted fields
    return await tx.itemMutation.create({
        data: {
            mutationNumber,
            type: data.type,
            itemId: item.id,
            userId: data.userId,
            serialNumber: item.serialNumber,
            brand: item.brand.nama,
            category: item.category.nama,
            paNumber: item.paNumber || '',
            originLocationId: data.originLocationId || null,
            destinationLocationId: data.destinationLocationId || null,
            requestId: data.requestId || null,
        }
    });
}
