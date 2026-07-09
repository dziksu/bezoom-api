import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from './config/database.config';
import redisConfig from './config/redis.config';
import minioConfig from './config/minio.config';
import authConfig from './config/auth.config';
import throttleConfig from './config/throttle.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, redisConfig, minioConfig, authConfig, throttleConfig],
      envFilePath: ['.env.local', '.env']
    })
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
