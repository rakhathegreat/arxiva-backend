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
                },
                parentId: null
            },
            include: {
                children: {
                    include: {
                        brandRules: { include: { brand: true } },
                        items: true
                    }
                },
                brandRules: { include: { brand: true } },
                items: true
            }
        });

        const formattedLocations = locations.map(loc => {
            const isRak = loc.type === 'RACK';
            if (isRak) {
                return {
                    id: loc.id,
                    name: loc.name,
                    type: "Rak",
                    isActive: loc.isActive,
                    levels: loc.children.map(lvl => ({
                        id: lvl.id,
                        name: lvl.name,
                        capacity: lvl.capacity,
                        usedCapacity: lvl.items ? lvl.items.length : 0,
                        brandRule: lvl.brandRules && lvl.brandRules.length > 0 ? lvl.brandRules[0].brand.nama : "Campuran",
                        isActive: lvl.isActive,
                        sheetUrl: null
                    }))
                };
            } else if (loc.type === "PALLET") {
                return {
                    id: loc.id,
                    name: loc.name,
                    type: "Pallet",
                    isActive: loc.isActive,
                    capacity: loc.capacity,
                    usedCapacity: loc.items ? loc.items.length : 0,
                    brandRule: loc.brandRules && loc.brandRules.length > 0 ? loc.brandRules[0].brand.nama : "Campuran",
                    sheetUrl: null
                };
            } else {
                return {
                    id: loc.id,
                    name: loc.name,
                    type: "Kardus",
                    isActive: loc.isActive,
                    capacity: loc.capacity,
                    usedCapacity: loc.items ? loc.items.length : 0,
                    brandRule: loc.brandRules && loc.brandRules.length > 0 ? loc.brandRules[0].brand.nama : "Campuran",
                    sheetUrl: null
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
        const { name, type, capacity, brandRule, levels, parentId } = req.body;

        if (!name || !type) {
            return res.status(400).json({ message: 'Name and type are required' });
        }

        const existing = await prisma.location.findUnique({ where: { name } });
        if (existing) {
            return res.status(400).json({ message: 'Nama lokasi sudah terdaftar' });
        }

        const brandRuleId = await getBrandRuleId(brandRule);

        if (type === "Pallet" || type === "PALLET") {
            const newLocation = await prisma.location.create({
                data: {
                    name,
                    type: "PALLET",
                    isActive: true,
                    capacity: capacity || 0,
                    parentId: parentId ? parseInt(parentId) : null,
                    brandRules: brandRuleId ? {
                        create: { brandId: brandRuleId }
                    } : undefined
                }
            });
            return res.status(201).json({ message: 'Location created successfully', location: newLocation });
        } else if (type === "Rak" || type === "RACK") {
            const newLocation = await prisma.location.create({
                data: {
                    name,
                    type: "RACK",
                    isActive: true,
                    children: {
                        create: await Promise.all((levels || []).map(async (l) => {
                            const bId = await getBrandRuleId(l.brandRule);
                            return {
                                name: l.name,
                                type: "BOX",
                                capacity: l.capacity || 0,
                                isActive: true,
                                brandRules: bId ? { create: { brandId: bId } } : undefined
                            };
                        }))
                    }
                },
                include: { children: true }
            });
            return res.status(201).json({ message: 'Location created successfully', location: newLocation });
        } else {
            const newLocation = await prisma.location.create({
                data: {
                    name,
                    type: "BOX",
                    isActive: true,
                    capacity: capacity || 0,
                    parentId: parentId ? parseInt(parentId) : null,
                    brandRules: brandRuleId ? {
                        create: { brandId: brandRuleId }
                    } : undefined
                }
            });
            return res.status(201).json({ message: 'Location created successfully', location: newLocation });
        }
    } catch (error) {
        console.error('Error in createLocation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateLocation = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, capacity, brandRule } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Name is required' });
        }

        const existing = await prisma.location.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ message: 'Location not found' });
        }

        const brandRuleId = await getBrandRuleId(brandRule);

        // Update location basic fields
        await prisma.location.update({
            where: { id },
            data: {
                name,
                capacity: capacity || existing.capacity
            }
        });

        // Update brand rule if provided
        if (brandRuleId) {
            await prisma.brandLocationRule.deleteMany({ where: { locationId: id } });
            await prisma.brandLocationRule.create({
                data: { locationId: id, brandId: brandRuleId }
            });
        } else if (brandRule === "Campuran") {
            await prisma.brandLocationRule.deleteMany({ where: { locationId: id } });
        }

        res.json({ message: 'Location updated successfully' });
    } catch (error) {
        console.error('Error in updateLocation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const toggleLocation = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { isActive } = req.body;

        if (isActive === undefined) {
            return res.status(400).json({ message: 'isActive flag is required' });
        }

        const updated = await prisma.location.update({
            where: { id },
            data: { isActive }
        });

        res.json({ message: 'Location status updated successfully', location: updated });
    } catch (error) {
        console.error('Error in toggleLocation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteLocation = async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        const existing = await prisma.location.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ message: 'Location not found' });
        }

        await prisma.location.delete({ where: { id } });

        res.json({ message: 'Location deleted successfully' });
    } catch (error) {
        console.error('Error in deleteLocation:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

