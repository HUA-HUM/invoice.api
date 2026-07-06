import type {
  CreateMadreXubioComprobanteSyncRunCommand,
  MadreXubioComprobanteSyncRun,
  UpdateMadreXubioComprobanteSyncRunCommand,
  UpsertMadreXubioComprobantesBatchCommand,
  UpsertMadreXubioComprobantesBatchResponse,
} from '../../../../../entities/madre-api/xubio/comprobantes/MadreXubioComprobante';

export interface IMadreXubioComprobantesRepository {
  createSyncRun(
    command: CreateMadreXubioComprobanteSyncRunCommand,
  ): Promise<MadreXubioComprobanteSyncRun>;

  updateSyncRun(
    command: UpdateMadreXubioComprobanteSyncRunCommand,
  ): Promise<MadreXubioComprobanteSyncRun>;

  upsertBatch(
    command: UpsertMadreXubioComprobantesBatchCommand,
  ): Promise<UpsertMadreXubioComprobantesBatchResponse>;
}
