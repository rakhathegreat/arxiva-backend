
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

export default function setupSwagger(app, port) {
    if (process.env.ENABLE_SWAGGER === 'true') {
        const options = {
            definition: {
                openapi: '3.0.0',
                info: {
                    title: 'Taslim API',
                    version: '1.0.0',
                    description: 'API documentation for Taslim backend'
                },
                // servers: [
                //     {
                //         url: `http://localhost:${port}`,
                //         description: 'Local server'
                //     }
                // ]
            },
            apis: ['./src/routes/*.js']
        };

        const specs = swaggerJsdoc(options);

        app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
        console.log(`Swagger documentation available at http://localhost:${port}/api-docs`);
    }
}