import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter as BullBoardExpressAdapter } from '@bull-board/express';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/modules/app.module';
import { StockBueTlqvCacheRefreshQueueService } from './app/services/stock-bue-tlqv-cache-refresh-queue.service';
import { XubioComprobantesBackfillQueueService } from './app/services/xubio-comprobantes-backfill-queue.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  if (readBooleanConfig(configService, 'SWAGGER_ENABLED', true)) {
    const swaggerPath =
      readOptionalConfig(configService, 'SWAGGER_PATH') ?? '/api/docs';
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Invoice API')
      .setDescription(
        [
          'Microservicio interno de facturación TLQV.',
          'Documenta procesos manuales, backfills, cache Stock BUE, creación de clientes y consultas fiscales.',
        ].join(' '),
      )
      .setVersion('1.0')
      .addApiKey(
        {
          type: 'apiKey',
          name: 'x-internal-api-key',
          in: 'header',
          description: 'Clave interna requerida por endpoints internal/*',
        },
        'internal-api-key',
      )
      .addTag('Health', 'Estado básico de la API')
      .addTag(
        'Xubio - Comprobantes',
        'Backfill y carga de comprobantes de venta desde Xubio hacia Madre API',
      )
      .addTag(
        'Stock BUE - TLQV',
        'Cache y cruces de TLQV despachados contra comprobantes facturados',
      )
      .addTag(
        'TLQV Invoice - Preparación',
        'Validaciones previas para saber si un TLQV puede avanzar a facturación',
      )
      .addTag(
        'TLQV Invoice - Clientes',
        'Creación de clientes Xubio desde TLQV o issues fiscales',
      )
      .addTag(
        'TLQV Invoice - Documentos',
        'Generación de PDFs internos para Odoo: factura y remito por TLQV',
      )
      .addTag(
        'TLQV Invoice - Issues',
        'Consulta de problemas fiscales o de clientes detectados durante el flujo',
      )
      .addTag('Tus Facturas', 'Consulta fiscal AFIP/ARCA vía Tus Facturas')
      .addTag('Xubio - Clientes', 'Creación directa de clientes en Xubio')
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

    SwaggerModule.setup(swaggerPath, app, swaggerDocument, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'method',
      },
    });
  }

  if (readBooleanConfig(configService, 'BULL_BOARD_ENABLED', true)) {
    const basePath =
      readOptionalConfig(configService, 'BULL_BOARD_BASE_PATH') ??
      '/admin/queues';
    const serverAdapter = new BullBoardExpressAdapter();
    const backfillQueueService = app.get(XubioComprobantesBackfillQueueService);
    const stockBueTlqvCacheRefreshQueueService = app.get(
      StockBueTlqvCacheRefreshQueueService,
    );

    serverAdapter.setBasePath(basePath);
    createBullBoard({
      queues: [
        new BullMQAdapter(backfillQueueService.getQueue()),
        new BullMQAdapter(stockBueTlqvCacheRefreshQueueService.getQueue()),
      ],
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
