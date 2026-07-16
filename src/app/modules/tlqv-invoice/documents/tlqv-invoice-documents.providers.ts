import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DigitalOceanSpacesInvoiceDocumentStorageRepository } from '../../../drivers/storage/invoice-documents/digital-ocean-spaces-invoice-document-storage.repository';
import type {
  IInvoiceDocumentStorageRepository,
  InvoiceDocumentStorageObject,
  UploadInvoiceDocumentCommand,
} from '../../../../core/adapters/repositories/invoice/documents/IInvoiceDocumentStorageRepository';
import { GetDetailsSkuRepository } from '../../../../core/driver/repository/catalog-sync-api/GetDetailsSku/GetDetailsSkuRepository';
import { GetFlokzuTlqvOrderDetailsRepository } from '../../../../core/driver/repository/flokzu/order-details/GetTlqvOrderDetailsRepository';
import { GetOpsApiTlqvOrderDetailsRepository } from '../../../../core/driver/repository/ops-api/order-details/GetTlqvOrderDetailsRepository';
import { GenerateTlqvInvoiceDocumentsInteractor } from '../../../../core/interactors/tlqv/GenerateTlqvInvoiceDocumentsInteractor';
import {
  readNumberConfig,
  readOptionalConfig,
} from '../../shared/config/read-config';
import { createMadreXubioComprobantesRepository } from '../../shared/madre/madre-repositories.factory';

export const GENERATE_TLQV_INVOICE_DOCUMENTS_INTERACTOR = Symbol(
  'GENERATE_TLQV_INVOICE_DOCUMENTS_INTERACTOR',
);
export const INVOICE_DOCUMENT_STORAGE_REPOSITORY = Symbol(
  'INVOICE_DOCUMENT_STORAGE_REPOSITORY',
);

export const tlqvInvoiceDocumentsProviders: Provider[] = [
  {
    provide: GENERATE_TLQV_INVOICE_DOCUMENTS_INTERACTOR,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) =>
      new GenerateTlqvInvoiceDocumentsInteractor(
        createMadreXubioComprobantesRepository(configService),
        [
          new GetOpsApiTlqvOrderDetailsRepository({
            baseUrl: readOptionalConfig(configService, 'OPS_API_BASE_URL'),
            timeoutInMilliseconds: readNumberConfig(
              configService,
              'OPS_API_TIMEOUT_MS',
              20_000,
            ),
          }),
          new GetFlokzuTlqvOrderDetailsRepository({
            baseUrl: readOptionalConfig(configService, 'FLOKZU_BASE_URL'),
            apiKey: readOptionalConfig(configService, 'FLOKZU_API_KEY'),
            username: readOptionalConfig(configService, 'FLOKZU_USERNAME'),
          }),
        ],
        new GetDetailsSkuRepository({
          baseUrl: readOptionalConfig(
            configService,
            'CATALOG_SYNC_API_BASE_URL',
          ),
          timeoutInMilliseconds: readNumberConfig(
            configService,
            'CATALOG_SYNC_API_TIMEOUT_MS',
            20_000,
          ),
        }),
      ),
  },
  {
    provide: INVOICE_DOCUMENT_STORAGE_REPOSITORY,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) =>
      createInvoiceDocumentStorageRepository(configService),
  },
];

function createInvoiceDocumentStorageRepository(
  configService: ConfigService,
): IInvoiceDocumentStorageRepository {
  const config = {
    bucket: readConfigWithFallback(
      configService,
      'INVOICE_DOCUMENTS_SPACES_BUCKET',
      'FRAVEGA_IMAGES_SPACES_BUCKET',
    ),
    region: readConfigWithFallback(
      configService,
      'INVOICE_DOCUMENTS_SPACES_REGION',
      'FRAVEGA_IMAGES_SPACES_REGION',
    ),
    endpoint: readConfigWithFallback(
      configService,
      'INVOICE_DOCUMENTS_SPACES_ENDPOINT',
      'FRAVEGA_IMAGES_SPACES_ENDPOINT',
    ),
    accessKeyId: readConfigWithFallback(
      configService,
      'INVOICE_DOCUMENTS_SPACES_ACCESS_KEY_ID',
      'FRAVEGA_IMAGES_SPACES_ACCESS_KEY_ID',
    ),
    secretAccessKey: readConfigWithFallback(
      configService,
      'INVOICE_DOCUMENTS_SPACES_SECRET_ACCESS_KEY',
      'FRAVEGA_IMAGES_SPACES_SECRET_ACCESS_KEY',
    ),
    publicBaseUrl: readConfigWithFallback(
      configService,
      'INVOICE_DOCUMENTS_SPACES_CDN_BASE_URL',
      'FRAVEGA_IMAGES_SPACES_CDN_BASE_URL',
    ),
    prefix: readOptionalConfig(
      configService,
      'INVOICE_DOCUMENTS_SPACES_PREFIX',
    ),
  };

  if (
    config.bucket === undefined ||
    config.region === undefined ||
    config.endpoint === undefined ||
    config.accessKeyId === undefined ||
    config.secretAccessKey === undefined ||
    config.publicBaseUrl === undefined
  ) {
    return new UnavailableInvoiceDocumentStorageRepository();
  }

  return new DigitalOceanSpacesInvoiceDocumentStorageRepository({
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    publicBaseUrl: config.publicBaseUrl,
    prefix: config.prefix,
  });
}

function readConfigWithFallback(
  configService: ConfigService,
  primaryName: string,
  fallbackName: string,
): string | undefined {
  return (
    readOptionalConfig(configService, primaryName) ??
    readOptionalConfig(configService, fallbackName)
  );
}

class UnavailableInvoiceDocumentStorageRepository implements IInvoiceDocumentStorageRepository {
  async findExistingByTlqvCode(): Promise<InvoiceDocumentStorageObject | null> {
    throw buildUnavailableStorageError();
  }

  async exists(): Promise<InvoiceDocumentStorageObject | null> {
    throw buildUnavailableStorageError();
  }

  async upload(
    _command: UploadInvoiceDocumentCommand,
  ): Promise<InvoiceDocumentStorageObject> {
    throw buildUnavailableStorageError();
  }

  buildPublicUrl(): string {
    throw buildUnavailableStorageError();
  }

  buildTlqvDocumentKey(): string {
    throw buildUnavailableStorageError();
  }
}

function buildUnavailableStorageError(): Error {
  return new Error(
    [
      'Invoice document CDN storage is not configured.',
      'Set INVOICE_DOCUMENTS_SPACES_* variables or FRAVEGA_IMAGES_SPACES_* fallbacks.',
    ].join(' '),
  );
}
