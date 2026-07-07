import type {
  GetAllStockBueItemsCommand,
  GetAllStockBueItemsResponse,
} from '../../../../entities/spreadsheet-api/stock-bue/StockBueItems';

export interface IGetAllStockBueItemsRepository {
  getAll(
    command?: GetAllStockBueItemsCommand,
  ): Promise<GetAllStockBueItemsResponse>;
}
