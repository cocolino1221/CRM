import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get('PORT', 4000);
  const nodeEnv = configService.get('NODE_ENV', 'development');

  // Global prefix for API routes
  app.setGlobalPrefix('api/v1');
  app.set('trust proxy', 1);

  // Serve uploaded files statically
  const uploadPath = configService.get('UPLOAD_PATH', './uploads');
  app.useStaticAssets(join(process.cwd(), uploadPath), {
    prefix: '/uploads',
  });

  // Get frontend URL for security headers
  const frontendUrl = configService.get('FRONTEND_URL');

  // Comprehensive security headers with Helmet
  app.use(helmet({
    // Content Security Policy - Prevents XSS attacks
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for Tailwind CSS
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", frontendUrl || 'http://localhost:4001'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: nodeEnv === 'production' ? [] : null,
      },
    },
    // Cross-Origin Policies
    crossOriginEmbedderPolicy: nodeEnv === 'production',
    crossOriginResourcePolicy: {
      policy: nodeEnv === 'production' ? 'same-site' : 'cross-origin'
    },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // Allow OAuth popups
    // Referrer Policy - Control information sent in Referer header
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // HTTP Strict Transport Security - Force HTTPS in production
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    },
    // X-Content-Type-Options - Prevent MIME sniffing
    noSniff: true,
    // X-Frame-Options - Prevent clickjacking
    frameguard: { action: 'deny' },
    // X-XSS-Protection - Enable XSS filter in older browsers
    xssFilter: true,
  }));

  // Cookie parser for httpOnly cookie support
  app.use(cookieParser());

  // Enable CORS with proper configuration
  const allowedOrigins = nodeEnv === 'production'
    ? [frontendUrl, 'https://easyteamcrm.netlify.app', 'http://localhost:4001', 'http://localhost:4000'].filter(Boolean)
    : ['http://localhost:4001', 'http://localhost:4000', 'http://localhost:3001'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true, // Required for httpOnly cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-CSRF-Token'],
    exposedHeaders: ['Set-Cookie'],
  });

  // Global validation pipe with detailed error handling
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // Allow extra properties but strip them
      transform: true,
      disableErrorMessages: nodeEnv === 'production',
      transformOptions: {
        enableImplicitConversion: true, // Auto-convert types
      },
    }),
  );

  // Global exception filter for consistent error handling
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global logging interceptor for request/response logging
  app.useGlobalInterceptors(new LoggingInterceptor());

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
