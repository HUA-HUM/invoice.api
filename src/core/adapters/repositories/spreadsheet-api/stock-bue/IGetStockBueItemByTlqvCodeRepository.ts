import type {
  GetStockBueItemByTlqvCodeCommand,
  GetStockBueItemByTlqvCodeResponse,
} from '../../../../entities/spreadsheet-api/stock-bue/StockBueItems';

export interface IGetStockBueItemByTlqvCodeRepository {
  getByTlqvCode(
    command: GetStockBueItemByTlqvCodeCommand,
  ): Promise<GetStockBueItemByTlqvCodeResponse>;
}
