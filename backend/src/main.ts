import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './shared/filters/http-exception.filter';
import { parseCorsOrigins } from './shared/config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableCors({ origin: parseCorsOrigins(app.get(ConfigService)) });

  // Sesión "Swagger/OpenAPI": documento vivo de la API real, no boilerplate.
  // Se sirve en /api/docs tanto en local (npm run start:dev) como dentro de
  // docker-compose (mismo puerto que el resto del backend).
  const swaggerConfig = new DocumentBuilder()
    .setTitle('FinDash API')
    .setDescription(
      'API de la billetera digital FinDash — auth, cuentas y transferencias con comisión por tipo de cuenta (RN-03). Ver ARCHITECTURE.md/PROGRESS.md en el repo para el diseño completo.',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token de POST /auth/login o POST /auth/refresh (expira en 15min por defecto).',
      },
      'access-token',
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    customSiteTitle: 'FinDash API — Docs',
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
