import type { IGetDetailsSkuRepository } from '../../adapters/repositories/catalog-sync-api/GetDetailsSku/IGetDetailsSkuRepository';
import type { IMadreXubioComprobantesRepository } from '../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { IGetTlqvOrderDetailsRepository } from '../../adapters/repositories/tlqv/order-details/IGetTlqvOrderDetailsRepository';
import type { MadreXubioComprobante } from '../../entities/madre-api/xubio/comprobantes/MadreXubioComprobante';
import type {
  GenerateTlqvInvoiceDocumentsCommand,
  TlqvInvoiceDocumentsData,
} from '../../entities/tlqv/TlqvInvoiceDocuments';
import type { TlqvOrderDetails } from '../../entities/tlqv/order-details/TlqvOrderDetails';

export class TlqvInvoiceDocumentsNotFoundError extends Error {
  constructor(tlqvCode: string) {
    super(`No billed Xubio comprobante was found for ${tlqvCode}`);
    this.name = TlqvInvoiceDocumentsNotFoundError.name;
  }
}

export class GenerateTlqvInvoiceDocumentsInteractor {
  constructor(
    private readonly comprobantesRepository: IMadreXubioComprobantesRepository,
    private readonly orderDetailsRepositories: IGetTlqvOrderDetailsRepository[],
    private readonly catalogSkuDetailsRepository: IGetDetailsSkuRepository,
  ) {}

  async execute(
    command: GenerateTlqvInvoiceDocumentsCommand,
  ): Promise<TlqvInvoiceDocumentsData> {
    const tlqvCode = normalizeTlqvCode(command.tlqvCode);
    const comprobantesResponse =
      await this.comprobantesRepository.findFullByTlqvCode({ tlqvCode });
    const comprobante = selectComprobante(comprobantesResponse.items);

    if (comprobante === undefined) {
      throw new TlqvInvoiceDocumentsNotFoundError(tlqvCode);
    }

    const warnings: string[] = [];
    const orderDetails = await this.getOrderDetails(tlqvCode, warnings);
    const sku = orderDetails?.product?.sku?.trim();
    const catalogProductDetails =
      sku === undefined || sku === ''
        ? null
        : await this.getCatalogProductDetails(sku, warnings);

    return {
      tlqvCode,
      comprobante,
      orderDetails,
      catalogProductDetails,
      warnings,
    };
  }

  private async getOrderDetails(
    tlqvCode: string,
    warnings: string[],
  ): Promise<TlqvOrderDetails | null> {
    for (const repository of this.orderDetailsRepositories) {
      try {
        const response = await repository.getByTlqvCode({ tlqvCode });
        if (response.found) {
          return response.orderDetails;
        }
      } catch (error: unknown) {
        warnings.push(
          `Order details lookup failed: ${readErrorMessage(error)}`,
        );
      }
    }

    warnings.push(`Order details were not found for ${tlqvCode}`);
    return null;
  }

  private async getCatalogProductDetails(sku: string, warnings: string[]) {
    try {
      const response = await this.catalogSkuDetailsRepository.getDetailsBySku({
        sku,
      });

      if (!response.found) {
        warnings.push(`Catalog details were not found for SKU ${sku}`);
        return null;
      }

      return response.productDetails;
    } catch (error: unknown) {
      warnings.push(
        `Catalog details lookup failed for SKU ${sku}: ${readErrorMessage(error)}`,
      );
      return null;
    }
  }
}

function selectComprobante(
  comprobantes: MadreXubioComprobante[],
): MadreXubioComprobante | undefined {
  return (
    comprobantes.find(
      (comprobante) =>
        comprobante.documentKind === 'INVOICE' &&
        comprobante.fiscalmenteEmitido !== false,
    ) ??
    comprobantes.find(
      (comprobante) => comprobante.documentKind === 'INVOICE',
    ) ??
    comprobantes[0]
  );
}

function normalizeTlqvCode(value: string): string {
  const trimmedValue = value.trim().toUpperCase();
  const match = /^TLQV\s*-?\s*(\d+)$/.exec(trimmedValue);
  if (match === null) {
    throw new RangeError('tlqvCode must use TLQV-123 format');
  }

  return `TLQV-${Number(match[1])}`;
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
