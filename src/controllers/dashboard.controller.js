import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getMitraPerformance = async (req, res) => {
    try {
        const requests = await prisma.request.findMany({
            where: {
                status: 'SELESAI',
                requester: {
                    role: 'MITRA'
                }
            },
            include: {
                requester: {
                    include: {
                        profile: true
                    }
                },
                requestItems: true
            },
            orderBy: {
                requestedAt: 'asc'
            }
        });

        const mitraStatsMap = new Map();

        requests.forEach(req => {
            const mitraId = req.requesterId;
            if (!mitraStatsMap.has(mitraId)) {
                mitraStatsMap.set(mitraId, {
                    id: mitraId,
                    name: req.requester.profile?.nama || req.requester.username || 'Unknown Mitra',
                    count: 0,
                    firstRequestAt: req.requestedAt,
                    lastRequestAt: req.requestedAt,
                    totalItems: 0
                });
            }
            
            const stats = mitraStatsMap.get(mitraId);
            stats.count += 1;
            
            const itemsCount = req.requestItems.reduce((acc, item) => acc + item.quantity, 0);
            stats.totalItems += itemsCount;
            
            if (req.requestedAt < stats.firstRequestAt) {
                stats.firstRequestAt = req.requestedAt;
            }
            if (req.requestedAt > stats.lastRequestAt) {
                stats.lastRequestAt = req.requestedAt;
            }
        });

        const now = new Date();
        const performanceData = Array.from(mitraStatsMap.values()).map(stats => {
            const msPerDay = 1000 * 60 * 60 * 24;
            let averageLifespanDays = null;
            
            if (stats.count > 1) {
                const diffTime = Math.abs(stats.lastRequestAt - stats.firstRequestAt);
                const diffDays = Math.ceil(diffTime / msPerDay);
                averageLifespanDays = diffDays / (stats.count - 1);
            }
            
            const daysSinceLastRequest = Math.ceil(Math.abs(now - stats.lastRequestAt) / msPerDay);
            const isIdleStock = daysSinceLastRequest > 30;

            let status = 'Not Enough Data';
            if (averageLifespanDays !== null) {
                if (averageLifespanDays < 10) status = 'Fast';
                else if (averageLifespanDays <= 25) status = 'Steady';
                else status = 'Slow';
            }

            if (isIdleStock) {
                status = 'Idle';
            }

            return {
                id: stats.id,
                name: stats.name,
                requestCount: stats.count,
                totalItems: stats.totalItems,
                averageLifespanDays: averageLifespanDays !== null ? Number(averageLifespanDays.toFixed(2)) : null,
                daysSinceLastRequest,
                isIdleStock,
                status
            };
        });

        res.status(200).json({ data: performanceData });
    } catch (error) {
        console.error("Error in getMitraPerformance:", error);
        res.status(500).json({ error: "Failed to fetch mitra performance data" });
    }
};
