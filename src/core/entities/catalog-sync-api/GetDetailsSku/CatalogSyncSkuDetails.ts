export interface CatalogSyncSkuProductDetails {
  sku: string;
  sellerId?: string | null;
  itemId?: string | null;
  title?: string | null;
  brand?: string | null;
  categoryId?: string | null;
  domainId?: string | null;
  status?: string | null;
  condition?: string | null;
  price?: number | null;
  currencyId?: string | null;
  stock?: number | null;
  availableQuantity?: number | null;
  catalogSoldQuantity?: number | null;
  permalink?: string | null;
  thumbnail?: string | null;
  rawPayload: unknown;
}

export interface GetCatalogSyncSkuDetailsCommand {
  sku: string;
}

export type GetCatalogSyncSkuDetailsResponse =
  | {
      found: true;
      productDetails: CatalogSyncSkuProductDetails;
    }
  | {
      found: false;
      sku: string;
      rawPayload?: unknown;
    };
