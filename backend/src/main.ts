import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get('PORT', 3000);
  const nodeEnv = configService.get('NODE_ENV', 'development');

  // Global prefix for API routes
  app.setGlobalPrefix('api/v1');

  // Enable CORS with proper configuration
  app.enableCors({
    origin: nodeEnv === 'production'
      ? configService.get('FRONTEND_URL')
      : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  });

  // Global validation pipe with detailed error handling
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: nodeEnv === 'production',
    }),
  );

  // Swagger API documentation
  if (nodeEnv === 'development') {
    const config = new DocumentBuilder()
      .setTitle('SlackCRM API')
      .setDescription('AI-Powered Team CRM Platform API Documentation')
      .setVersion('1.0')
      .addTag('Auth', 'Authentication endpoints')
      .addTag('Contacts', 'Contact management')
      .addTag('Deals', 'Deal pipeline management')
      .addTag('Tasks', 'Task management')
      .addTag('Slack', 'Slack integration')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 SlackCRM API running on: http://0.0.0.0:${port}`);
  console.log(`📚 API Docs: http://localhost:${port}/api/docs`);
  console.log(`🌍 Environment: ${nodeEnv}`);
}

bootstrap();