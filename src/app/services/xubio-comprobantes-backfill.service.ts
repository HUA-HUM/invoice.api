import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { IMadreXubioComprobantesRepository } from '../../core/adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import {
  BackfillXubioComprobantesInteractor,
  buildSyncRunMetadata,
  type BackfillXubioComprobantesCommand,
  type BackfillXubioComprobantesResponse,
  normalizeBackfillXubioComprobantesCommand,
  type NormalizedBackfillXubioComprobantesCommand,
} from '../../core/interactors/xubio/comprobantes/BackfillXubioComprobantesInteractor';
import {
  BACKFILL_XUBIO_COMPROBANTES_INTERACTOR,
  MADRE_XUBIO_COMPROBANTES_REPOSITORY,
  XUBIO_COMPROBANTES_DEFAULT_LIST_LIMIT,
} from '../modules/xubio/comprobantes/xubio-comprobantes.providers';

export interface CreatedXubioComprobantesBackfillSyncRun {
  syncRunId: number;
  command: NormalizedBackfillXubioComprobantesCommand;
}

@Injectable()
export class XubioComprobantesBackfillService {
  constructor(
    @Inject(BACKFILL_XUBIO_COMPROBANTES_INTERACTOR)
    private readonly interactor: BackfillXubioComprobantesInteractor,
    @Inject(MADRE_XUBIO_COMPROBANTES_REPOSITORY)
    private readonly madreXubioComprobantesRepository: IMadreXubioComprobantesRepository,
    @Inject(XUBIO_COMPROBANTES_DEFAULT_LIST_LIMIT)
    private readonly defaultXubioLimit: number,
  ) {}

  async execute(
    command: BackfillXubioComprobantesCommand,
  ): Promise<BackfillXubioComprobantesResponse> {
    try {
      return await this.interactor.execute(command);
    } catch (error: unknown) {
      throw mapBackfillValidationError(error);
    }
  }

  async createSyncRun(
    command: BackfillXubioComprobantesCommand,
  ): Promise<CreatedXubioComprobantesBackfillSyncRun> {
    let normalizedCommand: NormalizedBackfillXubioComprobantesCommand;

    try {
      normalizedCommand = normalizeBackfillXubioComprobantesCommand(
        command,
        () => new Date(),
        { defaultXubioLimit: this.defaultXubioLimit },
      );
    } catch (error: unknown) {
      throw mapBackfillValidationError(error);
    }

    const syncRun = await this.madreXubioComprobantesRepository.createSyncRun({
      syncType: 'historical_backfill',
      status: 'running',
      fechaDesde: normalizedCommand.fechaDesde,
      fechaHasta: normalizedCommand.fechaHasta,
      windowType: 'custom',
      metadata: buildSyncRunMetadata(
        normalizedCommand.batchSize,
        normalizedCommand.windowSizeDays,
        'queued',
        normalizedCommand.xubioLimit,
      ),
    });

    return {
      syncRunId: syncRun.id,
      command: {
        fechaDesde: normalizedCommand.fechaDesde,
        fechaHasta: normalizedCommand.fechaHasta,
        batchSize: normalizedCommand.batchSize,
        windowSizeDays: normalizedCommand.windowSizeDays,
        xubioLimit: normalizedCommand.xubioLimit,
      },
    };
  }

  async failSyncRun(syncRunId: number, errorMessage: string): Promise<void> {
    await this.madreXubioComprobantesRepository.updateSyncRun({
      id: syncRunId,
      status: 'failed',
      totalListed: 0,
      totalDetailRequests: 0,
      totalInserted: 0,
      totalUpdated: 0,
      totalFailed: 0,
      hasSaturatedWindows: false,
      errorMessage,
      finishedAt: new Date().toISOString(),
    });
  }
}

function mapBackfillValidationError(error: unknown): unknown {
  if (error instanceof RangeError) {
    return new BadRequestException(error.message);
  }

  return error;
}
