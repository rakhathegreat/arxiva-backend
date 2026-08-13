import bcrypt from 'bcrypt';
import prisma from '../utils/prisma.js';

// GET /users
export const getUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                role: true,
                isAktif: true,
                createdAt: true,
                updatedAt: true,
                profile: true
            }
        });
        res.json(users);
    } catch (error) {
        console.error('Error in getUsers:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /users
export const createUser = async (req, res) => {
    try {
        const { username, password, role, isActive, isAktif, name, nama, email, phone, telepon, address, alamat, code, partnerType, contactPerson, picName, picSignatureUrl } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const existingUser = await prisma.user.findUnique({
            where: { username }
        });

        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const activeStatus = isActive !== undefined ? isActive : (isAktif !== undefined ? isAktif : true);

        const userRole = role || 'MITRA';
        const profileNama = name || nama || username;

        // Gunakan transaksi agar user, profile, location, dan linknya terbuat secara atomic
        const newUser = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    username,
                    password: hashedPassword,
                    role: userRole,
                    isAktif: activeStatus,
                    profile: {
                        create: {
                            nama: profileNama,
                            email: email || '-',
                            telepon: phone || telepon || '-',
                            alamat: address || alamat || '-',
                            code: code || '-',
                            partnerType: partnerType || 'Supplier',
                            contactPerson: contactPerson || '-',
                            picName: picName || null,
                            picSignatureUrl: picSignatureUrl || null
                        }
                    }
                },
                select: {
                    id: true,
                    username: true,
                    role: true,
                    isAktif: true,
                    createdAt: true,
                    profile: true
                }
            });

            // Jika role adalah MITRA, otomatis buat lokasi partner dan relasikan
            if (userRole === 'MITRA') {
                const partnerLocation = await tx.location.create({
                    data: {
                        name: profileNama,
                        type: 'PARTNER',
                        capacity: 999999, // Kapasitas besar untuk lokasi logis partner
                    }
                });

                await tx.userLocation.create({
                    data: {
                        userId: user.id,
                        locationId: partnerLocation.id
                    }
                });
            }

            return user;
        });

        res.status(201).json({
            message: 'User created successfully',
            user: newUser
        });
    } catch (error) {
        console.error('Error in createUser:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /users/:id
export const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, password, role, isActive, isAktif, name, nama, email, phone, telepon, address, alamat, code, partnerType, contactPerson, picName, picSignatureUrl } = req.body;

        if (req.user.role !== 'ADMIN' && req.user.id !== id) {
            return res.status(403).json({ message: 'Forbidden: You can only update your own profile' });
        }

        const user = await prisma.user.findUnique({ where: { id }, include: { profile: true } });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const updateData = {};
        if (username) updateData.username = username;
        if (req.user.role === 'ADMIN') {
            if (role) updateData.role = role;
            if (isActive !== undefined) updateData.isAktif = isActive;
            else if (isAktif !== undefined) updateData.isAktif = isAktif;
        }

        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const profileData = {};
        if (name !== undefined || nama !== undefined) profileData.nama = name || nama;
        if (email !== undefined) profileData.email = email;
        if (phone !== undefined || telepon !== undefined) profileData.telepon = phone || telepon;
        if (address !== undefined || alamat !== undefined) profileData.alamat = address || alamat;
        if (code !== undefined) profileData.code = code;
        if (partnerType !== undefined) profileData.partnerType = partnerType;
        if (contactPerson !== undefined) profileData.contactPerson = contactPerson;
        if (picName !== undefined) profileData.picName = picName;
        if (picSignatureUrl !== undefined) profileData.picSignatureUrl = picSignatureUrl;

        if (Object.keys(profileData).length > 0) {
            if (user.profile) {
                updateData.profile = {
                    update: profileData
                };
            } else {
                updateData.profile = {
                    create: {
                        nama: profileData.nama || username || '-',
                        email: profileData.email || '-',
                        telepon: profileData.telepon || '-',
                        alamat: profileData.alamat || '-',
                        code: profileData.code || '-',
                        partnerType: profileData.partnerType || 'Supplier',
                        contactPerson: profileData.contactPerson || '-',
                        picName: profileData.picName || null,
                        picSignatureUrl: profileData.picSignatureUrl || null
                    }
                };
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                username: true,
                role: true,
                isAktif: true,
                updatedAt: true,
                profile: true
            }
        });

        res.json({
            message: 'User updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Error in updateUser:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ message: 'Username already exists' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /users/:id
export const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        if (req.user && id === req.user.id) {
            return res.status(403).json({ message: 'Cannot delete your own account' });
        }

        const user = await prisma.user.findUnique({ where: { id }, include: { profile: true } });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.profile) {
            await prisma.userProfile.delete({ where: { userId: id } });
        }

        await prisma.user.delete({
            where: { id }
        });

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error in deleteUser:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
