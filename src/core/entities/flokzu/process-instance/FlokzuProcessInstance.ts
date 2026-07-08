export interface FlokzuProcessInstanceFields {
  [field: string]: unknown;
}

export interface FlokzuBuyerData {
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

export interface FlokzuProcessInstance {
  identifier: string;
  fields: FlokzuProcessInstanceFields;
  cuitComprador?: string | null;
  cuitCompradorDigits?: string | null;
  buyerData: FlokzuBuyerData;
  rawPayload: unknown;
}

export interface GetFlokzuProcessInstanceCommand {
  identifier: string;
}

export interface GetFlokzuProcessInstanceResponse {
  processInstance: FlokzuProcessInstance;
}
