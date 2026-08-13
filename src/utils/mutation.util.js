import { resolveLocationDisplay } from './location.util.js';

/**
 * Generates a high-entropy mutation number string.
 * Format: [PREFIX]-[YYYYMMDDHHMMSS]-[6-digit random]
 * Example: MUT-20260811191045-984210
 * 
 * @param {string} [prefix='MUT']
 * @returns {string}
 */
export function generateMutationNumber(prefix = 'MUT') {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const HH = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const random6 = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}-${YYYY}${MM}${DD}${HH}${mm}${ss}-${random6}`;
}

/**
 * Creates an ItemMutation with automatic retry mechanism if a P2002 unique constraint collision occurs on mutationNumber.
 * 
 * @param {import('@prisma/client').PrismaClient|import('@prisma/client').Prisma.TransactionClient} dbClient - Prisma client or transaction instance
 * @param {Object} data - Mutation data object (excluding mutationNumber, or with data fields)
 * @param {string} [prefix='MUT'] - Prefix for mutation number
 * @param {Object} [options={}] - Additional Prisma options like include
 * @param {number} [maxRetries=3] - Maximum retry attempts
 * @returns {Promise<Object>} Created ItemMutation record
 */
export async function createItemMutationWithRetry(dbClient, data, prefix = 'MUT', options = {}, maxRetries = 3) {
    let attempts = 0;
    while (true) {
        try {
            const mutationNumber = generateMutationNumber(prefix);
            return await dbClient.itemMutation.create({
                data: {
                    ...data,
                    mutationNumber,
                },
                ...options
            });
        } catch (error) {
            attempts++;
            const isP2002 = error?.code === 'P2002';
            const isMutationNumberTarget = 
                error?.meta?.target?.includes?.('mutationNumber') || 
                error?.meta?.target?.includes?.('ItemMutation_mutationNumber_key') ||
                String(error?.meta?.target).includes('mutationNumber');
            
            if (isP2002 && (isMutationNumberTarget || attempts <= maxRetries)) {
                if (attempts > maxRetries) {
                    throw error;
                }
                // High-entropy timestamp will be regenerated in next loop iteration
                continue;
            }
            throw error;
        }
    }
}

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
            model: {
                include: {
                    brand: true,
                    materialCategory: true
                }
            }
        }
    });

    if (!item) {
        throw new Error(`Item dengan ID ${data.itemId} tidak ditemukan untuk dicatat mutasinya.`);
    }

    const originLocationName = await resolveLocationDisplay(tx, data.originLocationId, data.originLocationName || null);
    const destinationLocationName = await resolveLocationDisplay(tx, data.destinationLocationId, data.destinationLocationName || null);

    // 2. Create mutation log with retry logic and snapshotted fields
    return await createItemMutationWithRetry(tx, {
        type: data.type,
        itemId: item.id,
        userId: data.userId,
        serialNumber: item.serialNumber,
        brand: item.model?.brand?.nama || '-',
        category: item.model?.materialCategory?.nama || '-',
        paNumber: item.paNumber || '',
        originLocationId: data.originLocationId || null,
        destinationLocationId: data.destinationLocationId || null,
        originLocationName,
        destinationLocationName,
        requestId: data.requestId || null,
    }, 'MUT');
}
