import { PrismaClient } from '@prisma/client';

// PRISMA_DATASOURCE_URL memungkinkan test menunjuk DB terpisah tanpa
// dikalahkan oleh nilai .env (yang dimuat oleh prisma.config.ts / dotenv).
const prisma = process.env.PRISMA_DATASOURCE_URL
	? new PrismaClient({ datasourceUrl: process.env.PRISMA_DATASOURCE_URL })
	: new PrismaClient();

export default prisma;
