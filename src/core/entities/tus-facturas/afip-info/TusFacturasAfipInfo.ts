export type TusFacturasDocumentoTipo = 'CUIT' | 'CUIL';

export interface GetTusFacturasAfipInfoCommand {
  tlqvCode?: string;
  documentoNro: string;
  documentoTipo?: TusFacturasDocumentoTipo;
  issueContext?: {
    saleNumber?: string | null;
    buyerName?: string | null;
    email?: string | null;
    metadata?: unknown;
  };
}

export interface TusFacturasAfipInfo {
  documentoNro: string;
  documentoNroDigits: string;
  documentoTipo: TusFacturasDocumentoTipo;
  razonSocial?: string | null;
  condicionImpositiva?: string | null;
  direccion?: string | null;
  localidad?: string | null;
  codigoPostal?: string | null;
  provincia?: string | null;
  estado?: string | null;
  rawPayload: unknown;
}

export interface TusFacturasAfipInfoInvalidDocument {
  documentoNro: string;
  documentoNroDigits: string;
  documentoTipo: TusFacturasDocumentoTipo;
  message: string;
  messages: string[];
  rawPayload: unknown;
}

export type GetTusFacturasAfipInfoResponse =
  | {
      status: 'found';
      found: true;
      afipInfo: TusFacturasAfipInfo;
    }
  | {
      status: 'invalid_document';
      found: false;
      invalidDocument: TusFacturasAfipInfoInvalidDocument;
    };

export interface GetTusFacturasAfipInfoFoundResponse {
  status: 'found';
  found: true;
  afipInfo: TusFacturasAfipInfo;
}
