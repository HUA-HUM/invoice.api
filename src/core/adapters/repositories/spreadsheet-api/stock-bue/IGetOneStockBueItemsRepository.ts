import type {
  GetOneStockBueItemsCommand,
  GetOneStockBueItemsResponse,
} from '../../../../entities/spreadsheet-api/stock-bue/StockBueItems';

export interface IGetOneStockBueItemsRepository {
  getOne(
    command: GetOneStockBueItemsCommand,
  ): Promise<GetOneStockBueItemsResponse>;
}
