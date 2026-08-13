import prisma from '../utils/prisma.js';

// GET /categories
export const getCategories = async (req, res) => {
    try {
        const categories = await prisma.materialCategory.findMany();
        const categoriesWithCounts = await Promise.all(categories.map(async (category) => {
            const totalItems = await prisma.item.count({
                where: { model: { materialCategoryId: category.id } }
            });
            return { ...category, totalItems };
        }));
        res.json(categoriesWithCounts);
    } catch (error) {
        console.error('Error in getCategories:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /categories/:id
export const getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await prisma.materialCategory.findUnique({
            where: { id: parseInt(id) }
        });

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        res.json(category);
    } catch (error) {
        console.error('Error in getCategoryById:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /categories
export const createCategory = async (req, res) => {
    try {
        const { nama, safetyStock } = req.body;

        if (!nama) {
            return res.status(400).json({ message: 'Nama is required' });
        }

        const newCategory = await prisma.materialCategory.create({
            data: {
                nama,
                safetyStock: safetyStock || 0
            }
        });

        res.status(201).json({
            message: 'Category created successfully',
            category: newCategory
        });
    } catch (error) {
        console.error('Error in createCategory:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /categories/:id
export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { nama, safetyStock } = req.body;

        const category = await prisma.materialCategory.findUnique({
            where: { id: parseInt(id) }
        });

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        const updateData = {};
        if (nama) updateData.nama = nama;
        if (safetyStock !== undefined) updateData.safetyStock = safetyStock;

        const updatedCategory = await prisma.materialCategory.update({
            where: { id: parseInt(id) },
            data: updateData
        });

        res.json({
            message: 'Category updated successfully',
            category: updatedCategory
        });
    } catch (error) {
        console.error('Error in updateCategory:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /categories/:id
export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const category = await prisma.materialCategory.findUnique({
            where: { id: parseInt(id) }
        });

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        await prisma.materialCategory.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Error in deleteCategory:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
