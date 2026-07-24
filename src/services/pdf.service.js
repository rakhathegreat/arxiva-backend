import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure fonts using the files inside node_modules/pdfmake/fonts/
const fonts = {
    Roboto: {
        normal: path.resolve(__dirname, '../../node_modules/pdfmake/fonts/Roboto/Roboto-Regular.ttf'),
        bold: path.resolve(__dirname, '../../node_modules/pdfmake/fonts/Roboto/Roboto-Medium.ttf'),
        italic: path.resolve(__dirname, '../../node_modules/pdfmake/fonts/Roboto/Roboto-Italic.ttf'),
        bolditalic: path.resolve(__dirname, '../../node_modules/pdfmake/fonts/Roboto/Roboto-MediumItalic.ttf')
    }
};

pdfmake.setFonts(fonts);

// Set explicit access policies to silence pdfmake security warnings 
// regarding SSRF/LFI, since we only use Base64 Data URIs.
pdfmake.setUrlAccessPolicy(() => true);
if (typeof pdfmake.setLocalAccessPolicy === 'function') {
    pdfmake.setLocalAccessPolicy(() => true);
} else {
    pdfmake.localAccessPolicy = () => true;
}

function formatTanggalBAST(isoDateString) {
    if (!isoDateString) return '-';
    const date = new Date(isoDateString);
    if (isNaN(date.getTime())) return '-';

    const hariList = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const bulanList = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];

    const hari = hariList[date.getDay()];
    const tanggal = date.getDate();
    const bulan = bulanList[date.getMonth()];
    const tahun = date.getFullYear();

    return `${hari}, ${tanggal} ${bulan} ${tahun}`;
}

const getBastDocDefinition = (data) => {
    const { requesterName, generatedByName, processedAt, completedAt, requestedAt, allocations, kpSignatureUrl, picSignatureUrl, picName } = data;
    const bastDate = processedAt || completedAt || requestedAt;
    const formattedDate = formatTanggalBAST(bastDate);

    // Build allocations table rows
    const tableBody = [
        [
            { text: 'No', style: 'tableHeader', alignment: 'center' },
            { text: 'Material Number', style: 'tableHeader', alignment: 'center' },
            { text: 'Nama Barang', style: 'tableHeader', alignment: 'center' },
            { text: 'Jumlah', style: 'tableHeader', alignment: 'center' },
            { text: 'Satuan', style: 'tableHeader', alignment: 'center' },
            { text: 'Serial Number', style: 'tableHeader', alignment: 'center' },
            // { text: 'Ket', style: 'tableHeader', alignment: 'center' }
        ]
    ];

    if (allocations && allocations.length > 0) {
        allocations.forEach((item, index) => {
            tableBody.push([
                { text: (index + 1).toString(), alignment: 'center', style: 'tableCell' },
                { text: item.materialNumber || '-', alignment: 'center', style: 'tableCell' },
                { text: item.materialName || '-', alignment: 'center', style: 'tableCell' },
                { text: (item.quantity || 1).toString(), alignment: 'center', style: 'tableCell' },
                { text: item.unit || 'Unit', alignment: 'center', style: 'tableCell' },
                { text: item.serialNumber || '-', alignment: 'center', style: 'tableCell' },
                // { text: '', style: 'tableCell' }
            ]);
        });
    } else {
        tableBody.push([
            {
                text: 'Belum ada barang yang dialokasikan',
                colSpan: 7,
                alignment: 'center',
                style: 'tableCellEmpty',
                margin: [0, 10, 0, 10]
            },
            {}, {}, {}, {}, {}, {}
        ]);
    }

    return {
        pageSize: 'A4',
        pageMargins: [42, 42, 42, 42], // 15mm in pt (approx 42.5pt)
        content: [
            // ===== HEADER =====
            {
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: 'PT.PLN ICON PLUS', style: 'headerCompany' },
                            { text: 'SBU REGIONAL JAWA BARAT', style: 'headerCompany' },
                            { text: 'Jl. WR.Supratman No.58 Bandung 40121 - Jawa Barat', style: 'headerAddress', margin: [0, 4, 0, 0] },
                            { text: 'Tel.022-7200262', style: 'headerAddress' }
                        ]
                    },
                    {
                        stack: [
                            {
                                image: path.resolve(__dirname, '../../assets/pln icon plus.png'),
                                width: 150,
                                alignment: 'right',
                            }
                        ]
                    }
                ],
                margin: [0, 0, 0, 14]
            },
            // ===== JUDUL =====
            {
                text: 'BUKTI SERAH TERIMA BARANG',
                style: 'docTitle',
                alignment: 'center',
                margin: [0, 0, 0, 11]
            },
            // ===== PARAGRAF PEMBUKA =====
            {
                text: [
                    'Pada hari ini, ',
                    { text: formattedDate, style: 'boldTextItalic' },
                    ' yang bertanda tangan dibawah ini:'
                ],
                style: 'normalText',
                margin: [0, 0, 0, 16]
            },
            // ===== PIHAK =====
            {
                table: {
                    widths: [80, 5, '*'],
                    body: [
                        [
                            { text: 'PIHAK Pertama', style: 'normalText' },
                            { text: ':', style: 'normalText' },
                            { text: 'PLN ICON PLUS SBU Regional Jawa Barat', style: 'normalText' }
                        ],
                        [
                            { text: 'PIHAK Kedua', style: 'normalText' },
                            { text: ':', style: 'normalText' },
                            { text: requesterName || 'Unknown', style: 'normalText' }
                        ]
                    ]
                },
                layout: 'noBorders',
                margin: [0, 0, 0, 16]
            },
            // ===== TEKS PENGANTAR =====
            {
                text: 'Telah diserahterimakan barang-barang dibawah ini, untuk pekerjaan:',
                style: 'normalText',
                margin: [0, 0, 0, 8]
            },
            {
                table: {
                    widths: [80, 5, '*'],
                    body: [
                        [
                            { text: 'Pekerjaan / Proyek', style: 'normalTextBold' },
                            { text: ':', style: 'normalText' },
                            { text: 'Gangguan SBU REG JABAR', style: 'normalText' }
                        ]
                    ]
                },
                layout: 'noBorders',
                margin: [0, 0, 0, 16]
            },
            // ===== TABEL BARANG =====
            {
                table: {
                    headerRows: 1,
                    widths: [20, 70, '*', 35, 35, 90],
                    body: tableBody
                },
                margin: [0, 0, 0, 16]
            },
            // ===== DISCLAIMER =====
            {
                text: 'Barang tersebut telah diterima dalam kondisi baik, segala bentuk kerusakan dan kehilangan menjadi tanggung jawab Pihak Kedua, dan tanda terima ini agar dapat dipergunakan sebagaimana mestinya.',
                style: 'disclaimerText',
                margin: [0, 0, 0, 32]
            },
            // ===== TANDA TANGAN =====
            {
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: 'Pihak Pertama', style: 'signatureRole', alignment: 'center' },
                            kpSignatureUrl
                                ? { image: kpSignatureUrl, width: 120, height: 50, alignment: 'center', margin: [0, 10, 0, 10] }
                                : { text: ' ', margin: [0, 28, 0, 28], alignment: 'center' },
                            { text: generatedByName || 'Admin', style: 'signatureName', alignment: 'center' }
                        ]
                    },
                    {
                        width: '*',
                        stack: [
                            { text: 'Pihak Kedua', style: 'signatureRole', alignment: 'center' },
                            picSignatureUrl
                                ? { image: picSignatureUrl, width: 120, height: 50, alignment: 'center', margin: [0, 10, 0, 10] }
                                : { text: ' ', margin: [0, 28, 0, 28], alignment: 'center' },
                            { text: picName || requesterName || 'Unknown', style: 'signatureName', alignment: 'center' }
                        ]
                    }
                ],
                margin: [32, 0, 32, 0]
            }
        ],
        styles: {
            headerCompany: {
                fontSize: 9,
                bold: true,
                lineHeight: 1.1
            },
            headerAddress: {
                fontSize: 9,
                lineHeight: 1.1
            },
            docTitle: {
                fontSize: 11,
                bold: true,
                decoration: 'underline'
            },
            normalText: {
                fontSize: 9,
                lineHeight: 1.2
            },
            normalTextBold: {
                fontSize: 9,
                bold: true,
                lineHeight: 1.2
            },
            boldTextItalic: {
                fontSize: 9,
                bold: true,
                italic: true
            },
            tableHeader: {
                fontSize: 8,
                bold: true,
                fillColor: '#F3F4F6'
            },
            tableCell: {
                fontSize: 8
            },
            tableCellEmpty: {
                fontSize: 9,
                italic: true,
                color: '#9CA3AF'
            },
            disclaimerText: {
                fontSize: 9,
                italic: true,
                lineHeight: 1.2
            },
            signatureRole: {
                fontSize: 9,
                bold: true
            },
            signatureName: {
                fontSize: 9,
                decoration: ''
            }
        },
        defaultStyle: {
            font: 'Roboto'
        }
    };
};

import fs from 'fs';

export const generateBastPdfStream = async (bastData) => {
    const docDefinition = getBastDocDefinition(bastData);
    const pdfDoc = pdfmake.createPdf(docDefinition);
    return await pdfDoc.getStream();
};

export const generateAndSaveBastPdf = async (bastData, filename) => {
    const docDefinition = getBastDocDefinition(bastData);
    const pdfDoc = pdfmake.createPdf(docDefinition);
    const pdfBuffer = await pdfDoc.getBuffer();

    const uploadDir = path.resolve(__dirname, '../../public/uploads/documents');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const absoluteFilePath = path.join(uploadDir, filename);
    await fs.promises.writeFile(absoluteFilePath, pdfBuffer);

    const relativeFilePath = `/uploads/documents/${filename}`;
    return { absoluteFilePath, relativeFilePath };
};
