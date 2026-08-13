import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fonts = {
    Roboto: {
        normal: path.resolve(__dirname, 'node_modules/pdfmake/fonts/Roboto/Roboto-Regular.ttf')
    }
};

pdfmake.setFonts(fonts);

async function run() {
    try {
        const docDefinition = { content: ['This is a test'] };
        const pdfDoc = pdfmake.createPdf(docDefinition);
        const stream = await pdfDoc.getStream();
        console.log('Stream successful!');
    } catch(e) {
        console.error('Error:', e);
    }
}
run();
