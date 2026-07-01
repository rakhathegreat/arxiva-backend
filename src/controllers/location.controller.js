import prisma from '../utils/prisma.js';
import { createSheetForLevel, updateSheetName, deleteSheet } from '../services/sheet.service.js';

const getBrandRuleId = async (brandName) => {
    if (!brandName || brandName === "Campuran") return null;
    const brand = await prisma.brand.findUnique({ where: { nama: brandName } });
    return brand ? brand.id : null;
};

// GET /locations
export const getLocations = async (req, res) => {
    try {
        const locations = await prisma.location.findMany({
            where: {
                name: {
                    notIn: ["Keluar", "Diluar"]
                }
            },
            include: {
                levels: {
                    include: {
                        brandRule: true,
                        items: true
                    }
                }
            }
        });

        const formattedLocations = locations.map(loc => {
            const isRak = loc.type === 'RAK';
            if (isRak) {
                return {
                    id: loc.id,
                    name: loc.name,
                    type: "Rak",
                    isActive: loc.isActive,
                    levels: loc.levels.map(lvl => ({
                        id: lvl.id,
                        name: lvl.name,
                        capacity: lvl.capacity,
                        usedCapacity: lvl.items ? lvl.items.length : 0,
                        brandRule: lvl.brandRule ? lvl.brandRule.nama : "Campuran",
                        isActive: lvl.isActive,
                        sheetUrl: lvl.sheetUrl || null
                    }))
                };
            } else {
                const firstLevel = loc.levels && loc.levels[0];
                return {
                    id: loc.id,
                    name: loc.name,
                    type: "Kardus",
                    isActive: loc.isActive,
                    capacity: firstLevel ? firstLevel.capacity : 0,
                    usedCapacity: firstLevel && firstLevel.items ? firstLevel.items.length : 0,
                    brandRule: firstLevel && firstLevel.brandRule ? firstLevel.brandRule.nama : "Campuran",
                    sheetUrl: firstLevel ? firstLevel.sheetUrl : null
                };
            }
        });

        res.json(formattedLocations);
    } catch (error) {
        console.error('Error in getLocations:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /locations
export const createLocation = async (req, res) => {
    try {
        const { name, type, capacity, brandRule, levels } = req.body;

        if (!name || !type) {
            return res.status(400).json({ message: 'Name and type are required' });
        }

        const existing = await prisma.location.findUnique({ where: { name } });
        if (existing) {
            return res.status(400).json({ message: 'Nama lokasi sudah terdaftar' });
        }

        if (type === "Kardus") {
            const brandRuleId = await getBrandRuleId(brandRule);
            const { sheetId, sheetUrl } = await createSheetForLevel(name);

            const newLocation = await prisma.location.create({
                data: {
                    name,
                    type: "KARDUS",
                    isActive: true,
                    levels: {
                        create: {
                            name: "Kardus Level",
                            capacity: capacity || 0,
                            brandRuleId,
                            isActive: true,
                            sheetId,
                            sheetUrl
                        }
                    }
                },
                include: { levels: true }
            });
            return res.status(201).json({ message: 'Location created successfully', location: newLocation });
        } else {
            const levelsData = await Promise.all((levels || []).map(async (l) => {
                const bId = await getBrandRuleId(l.brandRule);
                const { sheetId, sheetUrl } = await createSheetForLevel(`${name} - ${l.name}`);
                return {
                    name: l.name,
                    capacity: l.capacity || 0,
                    brandRuleId: bId,
                    isActive: true,
                    sheetId,
                    sheetUrl
                };
            }));

            const newLocation = await prisma.location.create({
                data: {
                    name,
                    type: "RAK",
                    isActive: true,
                    levels: {
                        create: levelsData
                    }
                },
                include: { levels: true }
            });
            return res.status(201).json({ message: 'Location created successfully', location: newLocation });
        }
    } catch (error) {
        console.error('Error in createLocation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /locations/:id
export const updateLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, capacity, brandRule } = req.body;

        const loc = await prisma.location.findUnique({
            where: { id },
            include: { levels: true }
        });

        if (!loc) {
            return res.status(404).json({ message: 'Location not found' });
        }

        if (name && name !== loc.name) {
            const existing = await prisma.location.findUnique({ where: { name } });
            if (existing) {
                return res.status(400).json({ message: 'Nama lokasi sudah terdaftar' });
            }
        }

        await prisma.location.update({
            where: { id },
            data: {
                name: name || loc.name
            }
        });

        if (name && name !== loc.name) {
            if (loc.type === 'KARDUS' && loc.levels && loc.levels[0]) {
                if (loc.levels[0].sheetId) {
                    await updateSheetName(loc.levels[0].sheetId, name);
                }
            } else if (loc.type === 'RAK' && loc.levels) {
                for (const lvl of loc.levels) {
                    if (lvl.sheetId) {
                        await updateSheetName(lvl.sheetId, `${name} - ${lvl.name}`);
                    }
                }
            }
        }

        if (loc.type === 'KARDUS' && loc.levels && loc.levels[0]) {
            const brandRuleId = await getBrandRuleId(brandRule);
            await prisma.level.update({
                where: { id: loc.levels[0].id },
                data: {
                    capacity: capacity !== undefined ? capacity : loc.levels[0].capacity,
                    brandRuleId
                }
            });
        }

        res.json({ message: 'Location updated successfully' });
    } catch (error) {
        console.error('Error in updateLocation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /locations/:id/levels
export const createLevel = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, capacity, brandRule } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Name is required' });
        }

        const loc = await prisma.location.findUnique({ where: { id } });
        if (!loc) {
            return res.status(404).json({ message: 'Location not found' });
        }

        const existing = await prisma.level.findUnique({
            where: { locationId_name: { locationId: id, name } }
        });
        if (existing) {
            return res.status(400).json({ message: 'Nama level sudah ada di rak ini' });
        }

        const brandRuleId = await getBrandRuleId(brandRule);
        const { sheetId, sheetUrl } = await createSheetForLevel(`${loc.name} - ${name}`);
        const newLevel = await prisma.level.create({
            data: {
                name,
                capacity: capacity || 0,
                brandRuleId,
                isActive: true,
                locationId: id,
                sheetId,
                sheetUrl
            }
        });

        res.status(201).json({ message: 'Level created successfully', level: newLevel });
    } catch (error) {
        console.error('Error in createLevel:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /locations/:id/levels/:levelId
export const updateLevel = async (req, res) => {
    try {
        const { id, levelId } = req.params;
        const { name, capacity, brandRule } = req.body;

        const lvl = await prisma.level.findUnique({ where: { id: levelId }, include: { location: true } });
        if (!lvl) {
            return res.status(404).json({ message: 'Level not found' });
        }

        if (name && name !== lvl.name) {
            const existing = await prisma.level.findUnique({
                where: { locationId_name: { locationId: id, name } }
            });
            if (existing) {
                return res.status(400).json({ message: 'Nama level sudah ada di rak ini' });
            }
        }

        if (name && name !== lvl.name && lvl.sheetId && lvl.location) {
            await updateSheetName(lvl.sheetId, `${lvl.location.name} - ${name}`);
        }

        const brandRuleId = await getBrandRuleId(brandRule);
        const updatedLevel = await prisma.level.update({
            where: { id: levelId },
            data: {
                name: name || lvl.name,
                capacity: capacity !== undefined ? capacity : lvl.capacity,
                brandRuleId
            }
        });

        res.json({ message: 'Level updated successfully', level: updatedLevel });
    } catch (error) {
        console.error('Error in updateLevel:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /locations/:id/toggle
export const toggleLocation = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        await prisma.location.update({
            where: { id },
            data: { isActive }
        });

        res.json({ message: 'Location status updated successfully' });
    } catch (error) {
        console.error('Error in toggleLocation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /locations/:id/levels/:levelId/toggle
export const toggleLevel = async (req, res) => {
    try {
        const { id, levelId } = req.params;
        const { isActive } = req.body;

        await prisma.level.update({
            where: { id: levelId },
            data: { isActive }
        });

        res.json({ message: 'Level status updated successfully' });
    } catch (error) {
        console.error('Error in toggleLevel:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /locations/:id
export const deleteLocation = async (req, res) => {
    try {
        const { id } = req.params;

        const loc = await prisma.location.findUnique({ 
            where: { id },
            include: { levels: true }
        });
        if (!loc) {
            return res.status(404).json({ message: 'Location not found' });
        }

        if (loc.levels && loc.levels.length > 0) {
            for (const lvl of loc.levels) {
                if (lvl.sheetId) {
                    await deleteSheet(lvl.sheetId);
                }
            }
        }

        await prisma.location.delete({ where: { id } });

        res.json({ message: 'Location deleted successfully' });
    } catch (error) {
        console.error('Error in deleteLocation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /locations/:id/levels/:levelId
export const deleteLevel = async (req, res) => {
    try {
        const { levelId } = req.params;

        const lvl = await prisma.level.findUnique({ where: { id: levelId } });
        if (!lvl) {
            return res.status(404).json({ message: 'Level not found' });
        }

        if (lvl.sheetId) {
            await deleteSheet(lvl.sheetId);
        }

        await prisma.level.delete({ where: { id: levelId } });

        res.json({ message: 'Level deleted successfully' });
    } catch (error) {
        console.error('Error in deleteLevel:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
