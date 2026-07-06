import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter as BullBoardExpressAdapter } from '@bull-board/express';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/modules/app.module';
import { XubioComprobantesBackfillQueueService } from './app/services/xubio-comprobantes-backfill-queue.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  if (readBooleanConfig(configService, 'BULL_BOARD_ENABLED', true)) {
    const basePath =
      readOptionalConfig(configService, 'BULL_BOARD_BASE_PATH') ??
      '/admin/queues';
    const serverAdapter = new BullBoardExpressAdapter();
    const backfillQueueService = app.get(XubioComprobantesBackfillQueueService);

    serverAdapter.setBasePath(basePath);
    createBullBoard({
      queues: [new BullMQAdapter(backfillQueueService.getQueue())],
      serverAdapter,
    });
    app.use(basePath, serverAdapter.getRouter());
  }

  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '0.0.0.0');
}
void bootstrap();

function readOptionalConfig(
  configService: ConfigService,
  name: string,
): string | undefined {
  const value = configService.get<string>(name);
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  return value.trim();
}

function readBooleanConfig(
  configService: ConfigService,
  name: string,
  defaultValue: boolean,
): boolean {
  const rawValue = readOptionalConfig(configService, name);
  if (rawValue === undefined) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'y'].includes(rawValue.toLowerCase());
}
