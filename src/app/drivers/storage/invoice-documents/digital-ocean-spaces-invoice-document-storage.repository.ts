import {
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import type {
  IInvoiceDocumentStorageRepository,
  InvoiceDocumentStorageObject,
  UploadInvoiceDocumentCommand,
} from '../../../../core/adapters/repositories/invoice/documents/IInvoiceDocumentStorageRepository';

const DEFAULT_DOCUMENT_NAMES = ['factura-remito.pdf', 'factura.pdf'];
const DEFAULT_PREFIX = 'invoice-documents/tlqv';

export interface DigitalOceanSpacesInvoiceDocumentStorageRepositoryOptions {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  prefix?: string;
  s3Client?: S3Client;
}

export class InvoiceDocumentStorageRequestError extends Error {
  constructor(action: string, detail: string) {
    super(`Invoice document storage request failed while ${action}: ${detail}`);
    this.name = InvoiceDocumentStorageRequestError.name;
  }
}

export class DigitalOceanSpacesInvoiceDocumentStorageRepository implements IInvoiceDocumentStorageRepository {
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly prefix: string;
  private readonly s3Client: S3Client;

  constructor(
    options: DigitalOceanSpacesInvoiceDocumentStorageRepositoryOptions,
  ) {
    this.bucket = options.bucket;
    this.publicBaseUrl = trimTrailingSlash(options.publicBaseUrl);
    this.prefix = trimSlashes(options.prefix ?? DEFAULT_PREFIX);
    this.s3Client =
      options.s3Client ?? new S3Client(buildS3ClientConfig(options));
  }

  async findExistingByTlqvCode(
    tlqvCode: string,
  ): Promise<InvoiceDocumentStorageObject | null> {
    const normalizedTlqvCode = normalizeTlqvCode(tlqvCode);

    for (const documentName of DEFAULT_DOCUMENT_NAMES) {
      const existing = await this.exists(
        this.buildTlqvDocumentKey(normalizedTlqvCode, documentName),
      );
      if (existing !== null) {
        return existing;
      }
    }

    return null;
  }

  async exists(key: string): Promise<InvoiceDocumentStorageObject | null> {
    const normalizedKey = normalizeKey(key);

    try {
      const response = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: normalizedKey,
        }),
      );

      return {
        key: normalizedKey,
        url: this.buildPublicUrl(normalizedKey),
        contentLength: response.ContentLength ?? null,
        eTag: response.ETag ?? null,
        lastModified: response.LastModified ?? null,
      };
    } catch (error: unknown) {
      if (isObjectNotFoundError(error)) {
        return null;
      }

      throw new InvoiceDocumentStorageRequestError(
        `checking ${normalizedKey}`,
        readErrorMessage(error),
      );
    }
  }

  async upload(
    command: UploadInvoiceDocumentCommand,
  ): Promise<InvoiceDocumentStorageObject> {
    const normalizedKey = normalizeKey(command.key);

    try {
      const response = await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: normalizedKey,
          Body: command.body,
          ContentType: command.contentType,
          ContentLength: command.body.length,
          ACL: 'public-read',
          CacheControl: 'public, max-age=31536000, immutable',
          ContentDisposition: `attachment; filename="${sanitizeFilename(command.filename)}"`,
        }),
      );

      return {
        key: normalizedKey,
        url: this.buildPublicUrl(normalizedKey),
        contentLength: command.body.length,
        eTag: response.ETag ?? null,
        lastModified: null,
      };
    } catch (error: unknown) {
      throw new InvoiceDocumentStorageRequestError(
        `uploading ${normalizedKey}`,
        readErrorMessage(error),
      );
    }
  }

  buildPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${normalizeKey(key)}`;
  }

  buildTlqvDocumentKey(tlqvCode: string, filename: string): string {
    const normalizedTlqvCode = normalizeTlqvCode(tlqvCode);
    return `${this.prefix}/${normalizedTlqvCode}/${sanitizeFilename(filename)}`;
  }
}

function buildS3ClientConfig(
  options: DigitalOceanSpacesInvoiceDocumentStorageRepositoryOptions,
): S3ClientConfig {
  return {
    region: options.region,
    endpoint: options.endpoint,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  };
}

function isObjectNotFoundError(error: unknown): boolean {
  const metadata =
    isRecord(error) && isRecord(error.$metadata) ? error.$metadata : {};

  return (
    error instanceof NotFound ||
    (isRecord(error) &&
      (error.name === 'NotFound' ||
        error.name === 'NoSuchKey' ||
        metadata.httpStatusCode === 404))
  );
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'unknown error';
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, '');
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

function normalizeKey(value: string): string {
  return trimSlashes(value.trim());
}

function normalizeTlqvCode(value: string): string {
  const trimmedValue = value.trim().toUpperCase();
  const match = /^TLQV\s*-?\s*(\d+)$/.exec(trimmedValue);
  if (match === null) {
    throw new RangeError('tlqvCode must use TLQV-123 format');
  }

  return `TLQV-${Number(match[1])}`;
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^\w.-]+/g, '_');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
