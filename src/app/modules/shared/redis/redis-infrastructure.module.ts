import { Module } from '@nestjs/common';
import { RedisConnectionOptionsFactory } from '../../../drivers/redis/redis-connection-options.factory';

@Module({
  providers: [RedisConnectionOptionsFactory],
  exports: [RedisConnectionOptionsFactory],
})
export class RedisInfrastructureModule {}
