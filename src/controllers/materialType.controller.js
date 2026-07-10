import prisma from '../utils/prisma.js';

export const getMaterialTypes = async (req, res) => {
    try {
        const types = await prisma.materialType.findMany();
        res.json(types);
    } catch (error) {
        console.error('Error in getMaterialTypes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getMaterialTypeById = async (req, res) => {
    try {
        const { id } = req.params;
        const type = await prisma.materialType.findUnique({
            where: { id: parseInt(id) }
        });

        if (!type) {
            return res.status(404).json({ message: 'Material Type not found' });
        }

        res.json(type);
    } catch (error) {
        console.error('Error in getMaterialTypeById:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createMaterialType = async (req, res) => {
    try {
        const { nama } = req.body;

        if (!nama) {
            return res.status(400).json({ message: 'Nama is required' });
        }

        const newType = await prisma.materialType.create({
            data: { nama }
        });

        res.status(201).json({
            message: 'Material Type created successfully',
            type: newType
        });
    } catch (error) {
        console.error('Error in createMaterialType:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ message: 'Material Type name already exists' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateMaterialType = async (req, res) => {
    try {
        const { id } = req.params;
        const { nama } = req.body;

        if (!nama) {
            return res.status(400).json({ message: 'Nama is required' });
        }

        const type = await prisma.materialType.findUnique({
            where: { id: parseInt(id) }
        });

        if (!type) {
            return res.status(404).json({ message: 'Material Type not found' });
        }

        const updatedType = await prisma.materialType.update({
            where: { id: parseInt(id) },
            data: { nama }
        });

        res.json({
            message: 'Material Type updated successfully',
            type: updatedType
        });
    } catch (error) {
        console.error('Error in updateMaterialType:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ message: 'Material Type name already exists' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteMaterialType = async (req, res) => {
    try {
        const { id } = req.params;

        const type = await prisma.materialType.findUnique({
            where: { id: parseInt(id) }
        });

        if (!type) {
            return res.status(404).json({ message: 'Material Type not found' });
        }

        await prisma.materialType.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: 'Material Type deleted successfully' });
    } catch (error) {
        console.error('Error in deleteMaterialType:', error);
        if (error.code === 'P2003') {
            return res.status(400).json({ message: 'Cannot delete Material Type because it is being used by Material Categories' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};
