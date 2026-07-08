import type {
  CreateMadreXubioComprobanteSyncRunCommand,
  ExistsMadreXubioComprobanteByTlqvCodeCommand,
  ExistsMadreXubioComprobanteByTlqvCodeResponse,
  FindMadreXubioComprobanteByTlqvCodeCommand,
  FindMadreXubioComprobanteByTlqvCodeResponse,
  FindMadreXubioComprobantesByTlqvCodesCommand,
  FindMadreXubioComprobantesByTlqvCodesResponse,
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

  findByTlqvCodes(
    command: FindMadreXubioComprobantesByTlqvCodesCommand,
  ): Promise<FindMadreXubioComprobantesByTlqvCodesResponse>;

  findByTlqvCode(
    command: FindMadreXubioComprobanteByTlqvCodeCommand,
  ): Promise<FindMadreXubioComprobanteByTlqvCodeResponse>;

  existsByTlqvCode(
    command: ExistsMadreXubioComprobanteByTlqvCodeCommand,
  ): Promise<ExistsMadreXubioComprobanteByTlqvCodeResponse>;
}
