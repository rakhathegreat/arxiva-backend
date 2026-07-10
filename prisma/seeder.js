import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Mulai proses seeding database ---');

    // 1. Bersihkan database lama secara berurutan untuk menghindari error foreign key
    await prisma.itemMutation.deleteMany();
    await prisma.requestAllocation.deleteMany();
    await prisma.requestItem.deleteMany();
    await prisma.deliveryDocument.deleteMany();
    await prisma.request.deleteMany();
    await prisma.item.deleteMany();
    await prisma.materialModel.deleteMany();
    await prisma.brandLocationRule.deleteMany();
    await prisma.userLocation.deleteMany();
    await prisma.location.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.materialCategory.deleteMany();
    await prisma.materialType.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.userProfile.deleteMany();
    await prisma.user.deleteMany();
    console.log('🧹 Database berhasil dibersihkan');

    // 2. Hash password
    const hashedAdminPassword = await bcrypt.hash('Admin123!', 10);
    const hashedMitraPassword = await bcrypt.hash('Mitra123!', 10);

    // 3. Buat User & Profile
    const users = [];

    // Admin (KP Tasikmalaya)
    const adminUser = await prisma.user.create({
        data: {
            username: 'admin',
            password: hashedAdminPassword,
            role: 'ADMIN',
            profile: {
                create: {
                    nama: 'KP Tasikmalaya',
                    email: 'kp.tasikmalaya@arxiva.com',
                    telepon: '08123456789',
                    alamat: 'Kantor Pusat Tasikmalaya',
                }
            }
        }
    });
    users.push(adminUser);

    // Mitra-mitra
    const partnersData = [
        { username: 'pt_naratas', nama: 'PT Naratas', email: 'contact@naratas.com', partnerType: 'Gangguan' },
        { username: 'pt_tzu', nama: 'PT TZU', email: 'contact@tzu.com', partnerType: 'Aktivasi' },
        { username: 'mitra_demo', nama: 'Mitra Alpha', email: 'alpha@mitra.com', partnerType: 'Gangguan' },
        { username: 'pt_beta', nama: 'PT Beta', email: 'contact@beta.com', partnerType: 'Gangguan' },
        { username: 'pt_telkom_akses', nama: 'PT Telkom Akses', email: 'info@telkomakses.co.id', partnerType: 'Gangguan' },
        { username: 'pt_stp', nama: 'PT Solusi Tunas Pratama', email: 'contact@stp.co.id', partnerType: 'Aktivasi' },
        { username: 'pt_fmi', nama: 'PT Fiber Media Indonesia', email: 'info@fibermedia.co.id', partnerType: 'Aktivasi' },
        { username: 'pt_ibs', nama: 'PT Inti Bangun Sejahtera', email: 'support@ibstower.com', partnerType: 'Aktivasi' },
        { username: 'pt_lintasarta', nama: 'PT Lintasarta', email: 'helpdesk@lintasarta.co.id', partnerType: 'Aktivasi' },
        { username: 'pt_moratelindo', nama: 'PT Moratelindo', email: 'noc@moratelindo.co.id', partnerType: 'Aktivasi' },
        { username: 'pt_tower_bersama', nama: 'PT Tower Bersama', email: 'info@tbg.co.id', partnerType: 'Aktivasi' },
        { username: 'pt_linknet', nama: 'PT Link Net', email: 'corp.secretary@linknet.co.id', partnerType: 'Gangguan' },
        { username: 'pt_cmi', nama: 'PT Centratama Menara Indonesia', email: 'info@centratamagroup.com', partnerType: 'Aktivasi' },
        { username: 'pt_xl_axiata', nama: 'PT XL Axiata', email: 'customercare@xl.co.id', partnerType: 'Aktivasi' }
    ];


    const mappedPartners = {};
    for (const partner of partnersData) {
        const u = await prisma.user.create({
            data: {
                username: partner.username,
                password: hashedMitraPassword,
                role: 'MITRA',
                profile: {
                    create: {
                        nama: partner.nama,
                        email: partner.email,
                        telepon: '081122334455',
                        alamat: 'Jl. Industri No. 5',
                        partnerType: partner.partnerType,
                    }
                }
            }
        });
        mappedPartners[partner.nama] = u.id;
        users.push(u);
    }
    console.log('✅ User & Profile Mitra berhasil dibuat');

    // 4. Buat Kategori
    const typeONT = await prisma.materialType.create({ data: { nama: 'ONT' } });
    const typeKabel = await prisma.materialType.create({ data: { nama: 'Kabel' } });

    const catONT = await prisma.materialCategory.create({ data: { nama: 'ONT', typeId: typeONT.id, safetyStock: 50 } });
    const catKabel = await prisma.materialCategory.create({ data: { nama: 'DropWire (100m)', typeId: typeKabel.id, safetyStock: 100 } });
    console.log('✅ Kategori Aset berhasil dibuat');

    // 5. Buat Brand
    const bHuawei = await prisma.brand.create({ data: { nama: 'HUAWEI', origin: 'China', identifier: 'HWA' } });
    const bFiberhome = await prisma.brand.create({ data: { nama: 'FIBERHOME', origin: 'China', identifier: 'FBH' } });
    console.log('✅ Brand Aset berhasil dibuat');

    // 5b. Buat Model
    const modelHG8245H = await prisma.materialModel.create({
        data: { nama: 'HG8245H', materialCategoryId: catONT.id, brandId: bHuawei.id }
    });
    const modelEG8145V5 = await prisma.materialModel.create({
        data: { nama: 'EG8145V5', materialCategoryId: catONT.id, brandId: bHuawei.id }
    });
    const modelFiberhome1Core = await prisma.materialModel.create({
        data: { nama: '1-Core 150m', materialCategoryId: catKabel.id, brandId: bFiberhome.id }
    });
    console.log('✅ Model Aset berhasil dibuat');

    // 6. Buat Lokasi
    const locGudang = await prisma.location.create({ data: { name: 'Gudang Utama', type: 'BRANCH', capacity: 1000 } });
    const locRak1 = await prisma.location.create({ data: { name: 'Rak A - Baris 1', type: 'BOX', parentId: locGudang.id, capacity: 500 } });
    const locRak2 = await prisma.location.create({ data: { name: 'Rak A - Baris 2', type: 'BOX', parentId: locGudang.id, capacity: 500 } });

    // Lokasi Mitra disinkronkan dengan entitas User Profile
    const partnerLocations = {};
    for (const partner of partnersData) {
        partnerLocations[partner.nama] = await prisma.location.create({
            data: { name: partner.nama, type: 'PARTNER', capacity: 500 }
        });
    }
    const locNaratas = partnerLocations['PT Naratas'];
    console.log(`✅ ${partnersData.length} Lokasi Penyimpanan Mitra berhasil dibuat`);

    // 7. Buat Items/Aset
    // SN Generator: 16 Hex characters
    const generateHexSN = () => [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();

    const createdItems = [];
    let paCounter = 1000;

    const createItems = async (count, model, loc, status, ownerId) => {
        const items = [];
        for (let i = 0; i < count; i++) {
            const item = await prisma.item.create({
                data: {
                    serialNumber: generateHexSN(),
                    modelId: model.id,
                    status: status,
                    locationId: loc.id,
                    entryDate: new Date(Date.now() - Math.floor(Math.random() * 40 + 10) * 24 * 60 * 60 * 1000),
                    createdById: ownerId,
                    paNumber: `PA-ARX-${paCounter++}`
                },
                include: {
                    model: {
                        include: {
                            materialCategory: true,
                            brand: true
                        }
                    }
                }
            });
            items.push(item);
            createdItems.push(item);
        }
        return items;
    };

    const gudangONTs = await createItems(100, modelHG8245H, locRak1, 'tersedia', adminUser.id);
    const gudangKabels = await createItems(50, modelFiberhome1Core, locRak2, 'tersedia', adminUser.id);
    const naratasONTs = await createItems(50, modelEG8145V5, locNaratas, 'digunakan', mappedPartners['PT Naratas']);

    // Distribusi barang ke semua Mitra (sebagian tersedia, sebagian digunakan/terpakai)
    for (const partner of partnersData) {
        const loc = partnerLocations[partner.nama];
        const userId = mappedPartners[partner.nama];

        const ontModel = Math.random() > 0.5 ? modelHG8245H : modelEG8145V5;

        // Beri acak 5 - 15 ONT dengan status 'digunakan'
        await createItems(Math.floor(Math.random() * 11) + 5, ontModel, loc, 'digunakan', userId);
        // Beri acak 3 - 10 ONT dengan status 'tersedia'
        await createItems(Math.floor(Math.random() * 8) + 3, ontModel, loc, 'tersedia', userId);

        // Beri acak 5 - 15 Kabel dengan status 'digunakan'
        await createItems(Math.floor(Math.random() * 11) + 5, modelFiberhome1Core, loc, 'digunakan', userId);
        // Beri acak 3 - 10 Kabel dengan status 'tersedia'
        await createItems(Math.floor(Math.random() * 8) + 3, modelFiberhome1Core, loc, 'tersedia', userId);
    }

    console.log(`✅ ${createdItems.length} Item Aset berhasil dibuat dan didistribusikan`);

    // 8. Buat Transaksi Historis (Untuk Line Area Chart 30 Hari Terakhir)
    let txCounter = 1;
    const now = new Date();
    for (let day = 30; day >= 1; day--) {
        const txDate = new Date();
        txDate.setDate(now.getDate() - day);

        const txCount = Math.floor(Math.random() * 6) + 1;
        for (let i = 0; i < txCount; i++) {
            const randomItem = createdItems[Math.floor(Math.random() * createdItems.length)];
            const txType = Math.random() > 0.4 ? 'MASUK' : 'KELUAR';

            await prisma.itemMutation.create({
                data: {
                    mutationNumber: `MUT-${txDate.getFullYear()}${(txDate.getMonth() + 1).toString().padStart(2, '0')}-${txCounter++}`,
                    type: txType,
                    itemId: randomItem.id,
                    userId: randomItem.createdById,
                    serialNumber: randomItem.serialNumber,
                    brand: randomItem.model.brand.nama,
                    category: randomItem.model.materialCategory.nama,
                    paNumber: randomItem.paNumber || '',
                    createdAt: txDate,
                }
            });
        }
    }
    console.log('✅ Transaksi Historis (30 hari terakhir) berhasil dibuat');

    // 9. Buat Skenario Request & Lifecycle

    // Scenario 1: SELESAI (PT Naratas) - 50 ONT Huawei
    const req1Date = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const req1 = await prisma.request.create({
        data: {
            requestNumber: `REQ-${req1Date.getFullYear()}-0001`,
            requesterId: mappedPartners['PT Naratas'],
            status: 'SELESAI',
            notes: 'Permintaan ONT untuk project perumahan subsidi',
            requestedAt: req1Date,
            processedAt: new Date(req1Date.getTime() + 24 * 60 * 60 * 1000),
            completedAt: new Date(req1Date.getTime() + 3 * 24 * 60 * 60 * 1000),
            requestItems: {
                create: [
                    { materialCategoryId: catONT.id, brandId: bHuawei.id, quantity: 50 }
                ]
            }
        },
        include: { requestItems: true }
    });

    for (const item of naratasONTs) {
        await prisma.requestAllocation.create({
            data: {
                requestItemId: req1.requestItems[0].id,
                itemId: item.id,
                allocatedById: adminUser.id
            }
        });
    }
    await prisma.deliveryDocument.create({
        data: {
            documentNumber: `BAST/REQ/${req1.requestNumber}`,
            requestId: req1.id,
            generatedById: adminUser.id,
            filePath: `/storage/bast/${req1.requestNumber}.pdf`,
            createdAt: new Date(req1Date.getTime() + 3 * 24 * 60 * 60 * 1000)
        }
    });

    // Scenario 2: SIAP (PT TZU) - 20 Kabel Fiberhome
    const req2Date = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const req2 = await prisma.request.create({
        data: {
            requestNumber: `REQ-${req2Date.getFullYear()}-0002`,
            requesterId: mappedPartners['PT TZU'],
            status: 'SIAP',
            notes: 'Permintaan Kabel FOC untuk backbone area timur',
            requestedAt: req2Date,
            processedAt: new Date(req2Date.getTime() + 5 * 60 * 60 * 1000),
            requestItems: {
                create: [
                    { materialCategoryId: catKabel.id, brandId: bFiberhome.id, quantity: 20 }
                ]
            }
        },
        include: { requestItems: true }
    });

    for (let i = 0; i < 20; i++) {
        await prisma.requestAllocation.create({
            data: {
                requestItemId: req2.requestItems[0].id,
                itemId: gudangKabels[i].id,
                allocatedById: adminUser.id
            }
        });
    }

    // Scenario 3: MENUNGGU (Mitra Alpha)
    const req3Date = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    await prisma.request.create({
        data: {
            requestNumber: `REQ-${req3Date.getFullYear()}-0003`,
            requesterId: mappedPartners['Mitra Alpha'],
            status: 'MENUNGGU',
            notes: 'Permintaan restock reguler bulanan',
            requestedAt: req3Date,
            requestItems: {
                create: [
                    { materialCategoryId: catONT.id, brandId: bHuawei.id, quantity: 30 },
                    { materialCategoryId: catKabel.id, brandId: bFiberhome.id, quantity: 15 }
                ]
            }
        }
    });

    // Scenario 4: DITOLAK (PT Beta)
    const req4Date = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
    await prisma.request.create({
        data: {
            requestNumber: `REQ-${req4Date.getFullYear()}-0004`,
            requesterId: mappedPartners['PT Beta'],
            status: 'DITOLAK',
            notes: 'Stok gudang tidak mencukupi untuk permintaan ini',
            requestedAt: req4Date,
            processedAt: new Date(req4Date.getTime() + 12 * 60 * 60 * 1000),
            requestItems: {
                create: [
                    { materialCategoryId: catONT.id, brandId: bHuawei.id, quantity: 100 }
                ]
            }
        }
    });

    // Tambahan 50 dummy request acak
    const statuses = ['DRAFT', 'MENUNGGU', 'DISETUJUI', 'SIAP', 'DITERIMA', 'SELESAI', 'DITOLAK', 'DIBATALKAN'];
    const notesArr = ['Restock bulanan', 'Proyek baru', 'Ganti perangkat rusak', 'Ekspansi jaringan', 'Kebutuhan mendesak', 'Permintaan rutin', '', 'Permintaan cadangan'];
    const partnerKeys = Object.keys(mappedPartners);

    for (let i = 5; i <= 55; i++) {
        const randStatus = statuses[Math.floor(Math.random() * statuses.length)];
        const randPartner = partnerKeys[Math.floor(Math.random() * partnerKeys.length)];
        const reqDate = new Date(now.getTime() - Math.floor(Math.random() * 60) * 24 * 60 * 60 * 1000);

        await prisma.request.create({
            data: {
                requestNumber: `REQ-${reqDate.getFullYear()}-${i.toString().padStart(4, '0')}`,
                requesterId: mappedPartners[randPartner],
                status: randStatus,
                notes: notesArr[Math.floor(Math.random() * notesArr.length)],
                requestedAt: reqDate,
                requestItems: {
                    create: [
                        { materialCategoryId: catONT.id, brandId: bHuawei.id, quantity: Math.floor(Math.random() * 50) + 1 },
                        ...(Math.random() > 0.5 ? [{ materialCategoryId: catKabel.id, brandId: bFiberhome.id, quantity: Math.floor(Math.random() * 20) + 1 }] : [])
                    ]
                }
            }
        });
    }

    console.log('✅ Skenario Request (SELESAI, SIAP, MENUNGGU, DITOLAK) + 50 Data Acak berhasil dibuat');
    console.log('--- Proses seeding database selesai! ---');
}

main()
    .catch(e => {
        console.error('❌ Gagal melakukan seeding:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });