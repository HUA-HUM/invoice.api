import type {
  GetCostosOperacionesByTlqvCodeCommand,
  GetCostosOperacionesByTlqvCodeResponse,
} from '../../../../entities/spreadsheet-api/costos-operaciones/CostosOperaciones';

export interface IGetCostosOperacionesByTlqvCodeRepository {
  getByTlqvCode(
    command: GetCostosOperacionesByTlqvCodeCommand,
  ): Promise<GetCostosOperacionesByTlqvCodeResponse>;
}
