import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { InternalApiKeyGuard } from '../../../../guards/internal-api-key.guard';
import {
  EnqueueStockBueTlqvCacheRefreshResponse,
  StockBueTlqvCacheRefreshQueueService,
} from '../../../../services/stock-bue-tlqv-cache-refresh-queue.service';
import { StockBueTlqvAuditService } from '../../../../services/stock-bue-tlqv-audit.service';
import { parseOptionalPositiveInteger } from '../../../shared/http/request-parsers';
import { ApiInternalEndpoint } from '../../../shared/swagger/internal-api-docs.decorators';

@ApiTags('Stock BUE - TLQV')
@Controller('internal/xubio/comprobantes/stock-bue')
@UseGuards(InternalApiKeyGuard)
export class StockBueTlqvController {
  constructor(
    private readonly stockBueTlqvAuditService: StockBueTlqvAuditService,
    private readonly stockBueTlqvCacheRefreshQueueService: StockBueTlqvCacheRefreshQueueService,
  ) {}

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Encolar refresco de cache Stock BUE',
    description:
      'Recorre la API de spreadsheet stock-bue, normaliza TLQV y actualiza el cache usado para cruces de facturación.',
  })
  @ApiBody({
    required: false,
    schema: {
      type: 'object',
      properties: {
        pageSize: {
          type: 'number',
          example: 100,
          description: 'Cantidad de filas por página al leer spreadsheet.',
        },
      },
      example: {
        pageSize: 100,
      },
    },
  })
  @ApiAcceptedResponse({
    description: 'Refresh encolado en BullMQ.',
    schema: {
      example: {
        jobId: '123',
        queueName: 'stock-bue-tlqv-cache-refresh',
        status: 'queued',
        source: 'manual',
        pageSize: 100,
      },
    },
  })
  @Post('tlqv-cache/refresh')
  refreshStockBueTlqvCache(
    @Body() body: { pageSize?: number } = {},
  ): Promise<EnqueueStockBueTlqvCacheRefreshResponse> {
    return this.stockBueTlqvCacheRefreshQueueService.enqueueManual({
      pageSize: body.pageSize,
    });
  }

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Listar TLQV despachados no facturados',
    description:
      'Cruza el cache Stock BUE contra Madre/Xubio para saber qué TLQV están DESPACHADA y no figuran facturados.',
  })
  @ApiQuery({
    name: 'comprobantesBatchSize',
    required: false,
    example: 100,
    description: 'Tamaño del batch de consulta contra Madre API.',
  })
  @ApiOkResponse({
    description: 'Resumen e items TLQV no facturados.',
    schema: {
      example: {
        status: 'completed',
        instruction: 'DESPACHADA',
        totalCacheTlqv: 8454,
        totalDispatchedRows: 7669,
        totalUniqueDispatchedTlqv: 7669,
        totalBilledTlqv: 5646,
        totalUnbilledTlqv: 2023,
        items: [
          {
            tlqvCode: 'TLQV-3575',
            rowNumber: 2373,
            saleNumber: '2000012950920638',
            description:
              'Robot Limpiador De Ventanas Fmart Doble Cara Con Succión',
            instruction: 'DESPACHADA',
          },
        ],
      },
    },
  })
  @Get('unbilled-dispatched-tlqv')
  findUnbilledDispatchedStockBueTlqv(
    @Query('comprobantesBatchSize') comprobantesBatchSize?: string,
  ) {
    return this.stockBueTlqvAuditService.execute({
      comprobantesBatchSize: parseOptionalPositiveInteger(
        comprobantesBatchSize,
        'comprobantesBatchSize',
      ),
    });
  }
}
