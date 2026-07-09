import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueName } from './queue-names';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          password: configService.get<string>('redis.password', 'redis_dev')
        }
      }),
      inject: [ConfigService]
    }),
    BullModule.registerQueue(
      { name: QueueName.TEXT_MODERATION },
      { name: QueueName.MEDIA_MODERATION },
      { name: QueueName.MEDIA_PROCESSING },
      { name: QueueName.NOTIFICATIONS }
    )
  ],
  exports: [BullModule]
})
export class BullConfigModule {}
