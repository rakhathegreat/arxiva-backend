import prisma from '../utils/prisma.js';

// GET /material-models
export const getMaterialModels = async (req, res) => {
    try {
        const models = await prisma.materialModel.findMany({
            include: {
                materialCategory: true,
                brand: true
            }
        });
        res.json(models);
    } catch (error) {
        console.error('Error in getMaterialModels:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /material-models/:id
export const getMaterialModelById = async (req, res) => {
    try {
        const { id } = req.params;
        const model = await prisma.materialModel.findUnique({
            where: { id: parseInt(id) },
            include: {
                materialCategory: true,
                brand: true
            }
        });

        if (!model) {
            return res.status(404).json({ message: 'Material model not found' });
        }

        res.json(model);
    } catch (error) {
        console.error('Error in getMaterialModelById:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /material-models
export const createMaterialModel = async (req, res) => {
    try {
        const { nama, materialCategoryId, brandId, code } = req.body;

        if (!nama || !materialCategoryId || !brandId) {
            return res.status(400).json({ message: 'Nama, materialCategoryId, and brandId are required' });
        }

        // Check if category exists
        const category = await prisma.materialCategory.findUnique({
            where: { id: parseInt(materialCategoryId) }
        });
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        // Check if brand exists
        const brand = await prisma.brand.findUnique({
            where: { id: parseInt(brandId) }
        });
        if (!brand) {
            return res.status(404).json({ message: 'Brand not found' });
        }

        // Check duplicate name
        const existingModel = await prisma.materialModel.findUnique({
            where: { nama }
        });
        if (existingModel) {
            return res.status(400).json({ message: 'Material model name already exists' });
        }

        const generatedCode = code || (nama.replace(/\s+/g, '-').substring(0, 10).toUpperCase() + '-' + Math.floor(Math.random() * 10000));

        const newModel = await prisma.materialModel.create({
            data: {
                nama,
                code: generatedCode,
                materialCategoryId: parseInt(materialCategoryId),
                brandId: parseInt(brandId)
            },
            include: {
                materialCategory: true,
                brand: true
            }
        });

        res.status(201).json({
            message: 'Material model created successfully',
            model: newModel
        });
    } catch (error) {
        console.error('Error in createMaterialModel:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /material-models/:id
export const updateMaterialModel = async (req, res) => {
    try {
        const { id } = req.params;
        const { materialCategoryId, brandId, code } = req.body;
        const nama = req.body.nama || req.body.name;

        const model = await prisma.materialModel.findUnique({
            where: { id: parseInt(id) }
        });

        if (!model) {
            return res.status(404).json({ message: 'Material model not found' });
        }

        if (materialCategoryId) {
            const category = await prisma.materialCategory.findUnique({
                where: { id: parseInt(materialCategoryId) }
            });
            if (!category) {
                return res.status(404).json({ message: 'Category not found' });
            }
        }

        if (brandId) {
            const brand = await prisma.brand.findUnique({
                where: { id: parseInt(brandId) }
            });
            if (!brand) {
                return res.status(404).json({ message: 'Brand not found' });
            }
        }

        if (nama) {
            const existingModel = await prisma.materialModel.findFirst({
                where: {
                    id: { not: parseInt(id) },
                    nama
                }
            });
            if (existingModel) {
                return res.status(400).json({ message: 'Material model name already exists' });
            }
        }

        const updateData = {};
        if (nama) updateData.nama = nama;
        if (code) updateData.code = code;
        if (materialCategoryId) updateData.materialCategoryId = parseInt(materialCategoryId);
        if (brandId) updateData.brandId = parseInt(brandId);

        const updatedModel = await prisma.materialModel.update({
            where: { id: parseInt(id) },
            data: updateData,
            include: {
                materialCategory: true,
                brand: true
            }
        });

        res.json({
            message: 'Material model updated successfully',
            model: updatedModel
        });
    } catch (error) {
        console.error('Error in updateMaterialModel:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /material-models/:id
export const deleteMaterialModel = async (req, res) => {
    try {
        const { id } = req.params;

        const model = await prisma.materialModel.findUnique({
            where: { id: parseInt(id) }
        });

        if (!model) {
            return res.status(404).json({ message: 'Material model not found' });
        }

        await prisma.materialModel.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Material model deleted successfully' });
    } catch (error) {
        console.error('Error in deleteMaterialModel:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
