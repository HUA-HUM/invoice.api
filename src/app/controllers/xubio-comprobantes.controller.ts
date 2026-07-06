import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type {
  BackfillXubioComprobantesCommand,
  BackfillXubioComprobantesResponse,
} from '../../core/interactors/xubio/comprobantes/BackfillXubioComprobantesInteractor';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import {
  EnqueueXubioComprobantesBackfillResponse,
  XubioComprobantesBackfillQueueService,
} from '../services/xubio-comprobantes-backfill-queue.service';
import { XubioComprobantesBackfillService } from '../services/xubio-comprobantes-backfill.service';

@Controller('internal/xubio/comprobantes')
@UseGuards(InternalApiKeyGuard)
export class XubioComprobantesController {
  constructor(
    private readonly backfillService: XubioComprobantesBackfillService,
    private readonly backfillQueueService: XubioComprobantesBackfillQueueService,
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
}
