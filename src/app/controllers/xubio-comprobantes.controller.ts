import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  BackfillXubioComprobantesCommand,
  BackfillXubioComprobantesResponse,
} from '../../core/interactors/xubio/comprobantes/BackfillXubioComprobantesInteractor';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import {
  EnqueueXubioComprobantesBackfillResponse,
  XubioComprobantesBackfillQueueService,
} from '../services/xubio-comprobantes-backfill-queue.service';
import { StockBueTlqvAuditService } from '../services/stock-bue-tlqv-audit.service';
import { XubioComprobantesBackfillService } from '../services/xubio-comprobantes-backfill.service';

@Controller('internal/xubio/comprobantes')
@UseGuards(InternalApiKeyGuard)
export class XubioComprobantesController {
  constructor(
    private readonly backfillService: XubioComprobantesBackfillService,
    private readonly backfillQueueService: XubioComprobantesBackfillQueueService,
    private readonly stockBueTlqvAuditService: StockBueTlqvAuditService,
  ) {}

  @Post('backfill')
  backfill(
    @Body() body: BackfillXubioComprobantesCommand = {},
  ): Promise<EnqueueXubioComprobantesBackfillResponse> {
    return this.backfillQueueService.enqueue(body);
  }

  @Post('backfill/run-now')
  runNow(
    @Body() body: BackfillXubioComprobantesCommand = {},
  ): Promise<BackfillXubioComprobantesResponse> {
    return this.backfillService.execute(body);
  }

  @Get('stock-bue/unbilled-dispatched-tlqv')
  findUnbilledDispatchedStockBueTlqv(
    @Query('pageSize') pageSize?: string,
    @Query('comprobantesBatchSize') comprobantesBatchSize?: string,
  ) {
    return this.stockBueTlqvAuditService.execute({
      pageSize: parseOptionalPositiveInteger(pageSize, 'pageSize'),
      comprobantesBatchSize: parseOptionalPositiveInteger(
        comprobantesBatchSize,
        'comprobantesBatchSize',
      ),
    });
  }
}

function parseOptionalPositiveInteger(
  value: string | undefined,
  field: string,
): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }

  return parsedValue;
}
