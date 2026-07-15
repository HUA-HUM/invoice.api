import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  BackfillXubioComprobantesCommand,
  BackfillXubioComprobantesResponse,
} from '../../../../../core/interactors/xubio/comprobantes/BackfillXubioComprobantesInteractor';
import { InternalApiKeyGuard } from '../../../../guards/internal-api-key.guard';
import {
  EnqueueXubioComprobantesBackfillResponse,
  XubioComprobantesBackfillQueueService,
} from '../../../../services/xubio-comprobantes-backfill-queue.service';
import { XubioComprobantesBackfillService } from '../../../../services/xubio-comprobantes-backfill.service';
import { ApiInternalEndpoint } from '../../../shared/swagger/internal-api-docs.decorators';

@ApiTags('Xubio - Comprobantes')
@Controller('internal/xubio/comprobantes')
@UseGuards(InternalApiKeyGuard)
export class XubioComprobantesBackfillController {
  constructor(
    private readonly backfillService: XubioComprobantesBackfillService,
    private readonly backfillQueueService: XubioComprobantesBackfillQueueService,
  ) {}

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Encolar backfill de comprobantes Xubio',
    description:
      'Crea un sync run en Madre API y encola el procesamiento en BullMQ. Responde rápido para evitar timeout HTTP.',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        fechaDesde: {
          type: 'string',
          example: '2025-01-01',
          description: 'Fecha inicial inclusive. Default: 2025-01-01.',
        },
        fechaHasta: {
          type: 'string',
          example: '2026-06-30',
          description: 'Fecha final inclusive. Default: hoy.',
        },
        batchSize: {
          type: 'number',
          example: 10,
          description: 'Cantidad de comprobantes por upsert batch a Madre.',
        },
        windowSizeDays: {
          type: 'number',
          example: 1,
          description: 'Tamaño de ventana de fechas. Para Xubio usamos chico.',
        },
        xubioLimit: {
          type: 'number',
          example: 100,
          maximum: 100,
          description:
            'Header limit para listado Xubio minimalVersion. Usar máximo 100; valores mayores hacen inestable el paginado de Xubio.',
        },
      },
      example: {
        fechaDesde: '2025-01-01',
        fechaHasta: '2026-06-30',
        batchSize: 10,
        windowSizeDays: 1,
        xubioLimit: 100,
      },
    },
  })
  @ApiAcceptedResponse({
    description: 'Job encolado.',
    schema: {
      example: {
        syncRunId: 23,
        jobId: 'xubio-comprobantes-backfill-23',
        queueName: 'xubio-comprobantes-backfill',
        status: 'queued',
        fechaDesde: '2025-01-01',
        fechaHasta: '2026-06-30',
        batchSize: 10,
        windowSizeDays: 1,
        xubioLimit: 100,
      },
    },
  })
  @Post('backfill')
  backfill(
    @Body() body: BackfillXubioComprobantesCommand = {},
  ): Promise<EnqueueXubioComprobantesBackfillResponse> {
    return this.backfillQueueService.enqueue(body);
  }

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Ejecutar backfill ahora',
    description:
      'Ejecuta el backfill dentro de la request HTTP. Útil para pruebas cortas; para cargas masivas usar /backfill.',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      example: {
        fechaDesde: '2025-01-01',
        fechaHasta: '2025-01-10',
        batchSize: 10,
        windowSizeDays: 1,
        xubioLimit: 100,
      },
    },
  })
  @ApiOkResponse({
    description: 'Resultado final del backfill ejecutado de forma bloqueante.',
  })
  @Post('backfill/run-now')
  runNow(
    @Body() body: BackfillXubioComprobantesCommand = {},
  ): Promise<BackfillXubioComprobantesResponse> {
    return this.backfillService.execute(body);
  }
}
