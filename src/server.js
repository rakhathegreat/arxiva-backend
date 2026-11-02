import express from 'express';
import { config } from './shared/config.js';
import setupSwagger from './config/swagger.js';
import {
	securityHeaders,
	corsMiddleware,
	apiRateLimiter,
	authRateLimiter,
	notFoundHandler,
	errorHandler,
} from './shared/middlewares/security.middleware.js';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import categoryRoutes from './routes/category.routes.js';
import brandRoutes from './routes/brand.routes.js';
import materialModelRoutes from './routes/materialModel.routes.js';
import locationRoutes from './routes/location.routes.js';
import itemRoutes from './routes/item.routes.js';
import transactionRoutes from './routes/transaction.routes.js';
import requestRoutes from './routes/request.routes.js';
import intakeRoutes from './modules/intake/intake.routes.js';
import signatureSessionRoutes from './routes/signatureSession.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import {
	progressRouter as reconProgressRoutes,
	reportsRouter as reconReportsRoutes,
} from './routes/recon.routes.js';

/**
 * Membangun instance Express lengkap tanpa membuka port.
 * Dipisah dari bootstrap supaya bisa dipakai test E2E (supertest).
 */
export function createApp() {
	const app = express();

	if (config.http.trustProxy) {
		app.set('trust proxy', config.http.trustProxy);
	}
	app.disable('x-powered-by');

	app.use(securityHeaders);
	app.use(corsMiddleware);

	app.use(express.json({ limit: config.http.bodyLimit }));
	app.use(express.urlencoded({ limit: config.http.bodyLimit, extended: true }));

	setupSwagger(app, config.port);

	// Health check — tidak kena rate limit, dipakai Docker/uptime monitor.
	app.get('/health', (req, res) => {
		res.json({ status: 'ok', env: config.env, uptime: process.uptime() });
	});

	app.use(apiRateLimiter);

	// Autentikasi punya limit sendiri yang lebih ketat.
	app.use('/auth', authRateLimiter, authRoutes);

	app.use('/users', userRoutes);
	app.use('/categories', categoryRoutes);
	app.use('/brands', brandRoutes);
	app.use('/material-models', materialModelRoutes);
	app.use('/locations', locationRoutes);
	app.use('/items', itemRoutes);
	app.use('/transactions', transactionRoutes);
	app.use('/requests', requestRoutes);
	app.use('/intake', intakeRoutes);
	app.use('/signature-session', signatureSessionRoutes);
	app.use('/dashboard', dashboardRoutes);
	app.use('/notifications', notificationRoutes);
	app.use('/upload', uploadRoutes);
	app.use('/recon-progress', reconProgressRoutes);
	app.use('/recon-reports', reconReportsRoutes);

	app.use(notFoundHandler);
	app.use(errorHandler);

	return app;
}
