import 'dotenv/config';
import express from 'express';
import { config } from './src/shared/config.js';
import cors from 'cors';
import setupSwagger from './src/config/swagger.js';

import authRoutes from './src/routes/auth.routes.js';
import userRoutes from './src/routes/user.routes.js';
import categoryRoutes from './src/routes/category.routes.js';
import brandRoutes from './src/routes/brand.routes.js';
import materialModelRoutes from './src/routes/materialModel.routes.js';
import locationRoutes from './src/routes/location.routes.js';
import itemRoutes from './src/routes/item.routes.js';
import transactionRoutes from './src/routes/transaction.routes.js';
import requestRoutes from './src/routes/request.routes.js';
import intakeRoutes from './src/modules/intake/intake.routes.js';
import signatureSessionRoutes from './src/routes/signatureSession.routes.js';
import dashboardRoutes from './src/routes/dashboard.routes.js';
import notificationRoutes from './src/routes/notification.routes.js';


const app = express();
const PORT = config.port;
const HOST = config.host;

// CORS
app.use(cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Swagger documentation
setupSwagger(app, PORT);

// Routes
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/categories", categoryRoutes);
app.use("/brands", brandRoutes);
app.use("/material-models", materialModelRoutes);
app.use("/locations", locationRoutes);
app.use("/items", itemRoutes);
app.use("/transactions", transactionRoutes);
app.use("/requests", requestRoutes);
app.use("/intake", intakeRoutes);
app.use("/signature-session", signatureSessionRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/notifications", notificationRoutes);

// Central error handler — jaring pengaman untuk error yang lolos dari controller
app.use((err, req, res, next) => {
    console.error('[unhandled]', err);
    if (res.headersSent) return next(err);
    res.status(err.statusCode || err.status || 500).json({
        message: err.message || 'Internal server error',
        ...(err.code ? { reason: err.code } : {}),
    });
});

// Start the server
app.listen(PORT, HOST, () => {
    console.log(`Backend Server is running on port ${PORT}`);
});
