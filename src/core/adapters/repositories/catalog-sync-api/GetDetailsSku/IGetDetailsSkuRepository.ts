import type {
  GetCatalogSyncSkuDetailsCommand,
  GetCatalogSyncSkuDetailsResponse,
} from '../../../../entities/catalog-sync-api/GetDetailsSku/CatalogSyncSkuDetails';

export interface IGetDetailsSkuRepository {
  getDetailsBySku(
    command: GetCatalogSyncSkuDetailsCommand,
  ): Promise<GetCatalogSyncSkuDetailsResponse>;
}
