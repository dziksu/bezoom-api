import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

const GLOBAL_PREFIX = 'api';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 4000);

  app.setGlobalPrefix(GLOBAL_PREFIX);

  // ── Security ───────────────────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginOpenerPolicy: { policy: 'unsafe-none' },
      contentSecurityPolicy: false
    })
  );

  // ── CORS ───────────────────────────────────────────────────────────────
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true
  });

  // ── Global validation pipe ─────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true
      }
    })
  );

  const keycloakUrl = configService.get<string>('KEYCLOAK_URL', '');

  const config = new DocumentBuilder()
    .setTitle('BeZoom API')
    .setDescription('BeZoom — local events discovery platform API')
    .setVersion('1.0')
    .addOAuth2(
      {
        type: 'oauth2',
        flows: {
          authorizationCode: {
            authorizationUrl: `${keycloakUrl}/realms/bezoom/protocol/openid-connect/auth`,
            tokenUrl: `${keycloakUrl}/realms/bezoom/protocol/openid-connect/token`,
            scopes: {
              openid: 'openid',
              profile: 'profile',
              email: 'email'
            }
          }
        }
      },
      'keycloak' // this name is referenced below and in @ApiBearerAuth()/@ApiOAuth2() decorators
    )
    .addSecurityRequirements('keycloak', ['openid', 'profile', 'email'])
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(GLOBAL_PREFIX, app, documentFactory, {
    swaggerOptions: {
      initOAuth: {
        clientId: process.env.KEYCLOAK_SWAGGER_CLIENT_ID, // e.g. "swagger-ui"
        scopes: ['openid', 'profile', 'email'],
        usePkceWithAuthorizationCodeGrant: true // recommended, avoids needing a client secret
      },
      oauth2RedirectUrl: `http://localhost:${port}/api/oauth2-redirect.html`,
      persistAuthorization: true // keeps you logged in across page refreshes
    }
  });

  await app.listen(port ?? 4000);

  Logger.log(`📖 Application is running on: http://localhost:${port}/api`);
}

bootstrap();
