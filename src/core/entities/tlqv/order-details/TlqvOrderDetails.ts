export type TlqvOrderDetailsSource = 'ops_api' | 'flokzu';

export interface TlqvOrderBuyerData {
  cuitComprador?: string | null;
  cuitCompradorDigits?: string | null;
  cuitEnvio?: string | null;
  cuitEnvioDigits?: string | null;
  nombreDestinatario?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  provincia?: string | null;
  codigoPostal?: string | null;
  email?: string | null;
}

export interface TlqvOrderDetails {
  tlqvCode: string;
  source: TlqvOrderDetailsSource;
  saleNumber?: string | null;
  buyerData: TlqvOrderBuyerData;
  rawPayload: unknown;
}

export interface GetTlqvOrderDetailsCommand {
  tlqvCode: string;
}

export type GetTlqvOrderDetailsResponse =
  | {
      found: true;
      orderDetails: TlqvOrderDetails;
    }
  | {
      found: false;
      tlqvCode: string;
      source: TlqvOrderDetailsSource;
      reason?: string;
      rawPayload?: unknown;
    };
