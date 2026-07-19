import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import setupSwagger from './src/config/swagger.js';

import authRoutes from './src/routes/auth.routes.js';
import userRoutes from './src/routes/user.routes.js';
import categoryRoutes from './src/routes/category.routes.js';
import materialTypeRoutes from './src/routes/materialType.routes.js';
import brandRoutes from './src/routes/brand.routes.js';
import materialModelRoutes from './src/routes/materialModel.routes.js';
import locationRoutes from './src/routes/location.routes.js';
import itemRoutes from './src/routes/item.routes.js';
import transactionRoutes from './src/routes/transaction.routes.js';
import requestRoutes from './src/routes/request.routes.js';
import signatureSessionRoutes from './src/routes/signatureSession.routes.js';


const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || 'localhost';

// CORS
app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
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
app.use("/material-types", materialTypeRoutes);
app.use("/brands", brandRoutes);
app.use("/material-models", materialModelRoutes);
app.use("/locations", locationRoutes);
app.use("/items", itemRoutes);
app.use("/transactions", transactionRoutes);
app.use("/requests", requestRoutes);
app.use("/signature-session", signatureSessionRoutes);

// Start the server
app.listen(PORT, HOST, () => {
    console.log(`Backend Server is running on port ${PORT}`);
});
