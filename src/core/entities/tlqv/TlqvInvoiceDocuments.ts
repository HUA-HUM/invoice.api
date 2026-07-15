import type { CatalogSyncSkuProductDetails } from '../catalog-sync-api/GetDetailsSku/CatalogSyncSkuDetails';
import type { MadreXubioComprobante } from '../madre-api/xubio/comprobantes/MadreXubioComprobante';
import type { TlqvOrderDetails } from './order-details/TlqvOrderDetails';

export interface GenerateTlqvInvoiceDocumentsCommand {
  tlqvCode: string;
}

export interface TlqvInvoiceDocumentsData {
  tlqvCode: string;
  comprobante: MadreXubioComprobante;
  orderDetails?: TlqvOrderDetails | null;
  catalogProductDetails?: CatalogSyncSkuProductDetails | null;
  warnings: string[];
}
