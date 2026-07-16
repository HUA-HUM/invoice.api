export interface InvoiceDocumentStorageObject {
  key: string;
  url: string;
  contentLength?: number | null;
  eTag?: string | null;
  lastModified?: Date | null;
}

export interface UploadInvoiceDocumentCommand {
  key: string;
  filename: string;
  contentType: 'application/pdf';
  body: Buffer;
}

export interface IInvoiceDocumentStorageRepository {
  findExistingByTlqvCode(
    tlqvCode: string,
  ): Promise<InvoiceDocumentStorageObject | null>;

  exists(key: string): Promise<InvoiceDocumentStorageObject | null>;

  upload(
    command: UploadInvoiceDocumentCommand,
  ): Promise<InvoiceDocumentStorageObject>;

  buildPublicUrl(key: string): string;

  buildTlqvDocumentKey(tlqvCode: string, filename: string): string;
}
