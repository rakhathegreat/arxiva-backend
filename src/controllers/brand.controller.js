import prisma from '../utils/prisma.js';

// GET /brands
export const getBrands = async (req, res) => {
    try {
        const brands = await prisma.brand.findMany({
            include: {
                category: true
            }
        });
        res.json(brands);
    } catch (error) {
        console.error('Error in getBrands:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /brands/:id
export const getBrandById = async (req, res) => {
    try {
        const { id } = req.params;
        const brand = await prisma.brand.findUnique({
            where: { id: parseInt(id) },
            include: {
                category: true
            }
        });

        if (!brand) {
            return res.status(404).json({ message: 'Brand not found' });
        }

        res.json(brand);
    } catch (error) {
        console.error('Error in getBrandById:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /brands
export const createBrand = async (req, res) => {
    try {
        const { nama, origin, identifier, categoryId } = req.body;

        if (!nama || !origin || !identifier || !categoryId) {
            return res.status(400).json({ message: 'Nama, origin, identifier, and categoryId are required' });
        }

        // Check if category exists
        const category = await prisma.category.findUnique({
            where: { id: parseInt(categoryId) }
        });

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        // Check if brand nama or identifier already exists
        const existingBrand = await prisma.brand.findFirst({
            where: {
                OR: [
                    { nama },
                    { identifier }
                ]
            }
        });

        if (existingBrand) {
            return res.status(400).json({ message: 'Brand name or identifier already exists' });
        }

        const newBrand = await prisma.brand.create({
            data: {
                nama,
                origin,
                identifier,
                categoryId: parseInt(categoryId)
            },
            include: {
                category: true
            }
        });

        res.status(201).json({
            message: 'Brand created successfully',
            brand: newBrand
        });
    } catch (error) {
        console.error('Error in createBrand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /brands/:id
export const updateBrand = async (req, res) => {
    try {
        const { id } = req.params;
        const { nama, origin, identifier, categoryId } = req.body;

        const brand = await prisma.brand.findUnique({
            where: { id: parseInt(id) }
        });

        if (!brand) {
            return res.status(404).json({ message: 'Brand not found' });
        }

        if (categoryId) {
            const category = await prisma.category.findUnique({
                where: { id: parseInt(categoryId) }
            });

            if (!category) {
                return res.status(404).json({ message: 'Category not found' });
            }
        }

        if (nama || identifier) {
            const existingBrand = await prisma.brand.findFirst({
                where: {
                    id: { not: parseInt(id) },
                    OR: [
                        ...(nama ? [{ nama }] : []),
                        ...(identifier ? [{ identifier }] : [])
                    ]
                }
            });

            if (existingBrand) {
                return res.status(400).json({ message: 'Brand name or identifier already exists' });
            }
        }

        const updateData = {};
        if (nama) updateData.nama = nama;
        if (origin) updateData.origin = origin;
        if (identifier) updateData.identifier = identifier;
        if (categoryId) updateData.categoryId = parseInt(categoryId);

        const updatedBrand = await prisma.brand.update({
            where: { id: parseInt(id) },
            data: updateData,
            include: {
                category: true
            }
        });

        res.json({
            message: 'Brand updated successfully',
            brand: updatedBrand
        });
    } catch (error) {
        console.error('Error in updateBrand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /brands/:id
export const deleteBrand = async (req, res) => {
    try {
        const { id } = req.params;

        const brand = await prisma.brand.findUnique({
            where: { id: parseInt(id) }
        });

        if (!brand) {
            return res.status(404).json({ message: 'Brand not found' });
        }

        await prisma.brand.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Brand deleted successfully' });
    } catch (error) {
        console.error('Error in deleteBrand:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
