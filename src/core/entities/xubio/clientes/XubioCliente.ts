export type XubioFiscalIdentificacionTributariaCodigo = 'CUIT' | 'CUIL';

export type XubioIdentificacionTributariaCodigo =
  XubioFiscalIdentificacionTributariaCodigo | 'DNI';

export type XubioCategoriaFiscalCodigo = 'MT' | 'RI' | 'CF' | 'EX';

export type CreateXubioClienteStatus = 'created' | 'already_exists';

export interface XubioClienteReference {
  ID?: number | null;
  id?: number | null;
  codigo?: string | null;
  nombre?: string | null;
}

interface XubioClienteBasePayload {
  nombre: string;
  razonSocial: string;
  primerNombre?: string | null;
  primerApellido?: string | null;
  categoriaFiscal: {
    codigo: XubioCategoriaFiscalCodigo;
  };
  pais: {
    codigo: string;
  };
  direccion?: string | null;
  codigoPostal?: string | null;
  provincia?: {
    nombre: string;
  } | null;
  usrCode: string;
  descripcion: string;
  esclienteextranjero: 0 | 1;
  esProveedor: 0 | 1;
}

export type XubioClientePayload =
  | (XubioClienteBasePayload & {
      identificacionTributaria: {
        codigo: XubioFiscalIdentificacionTributariaCodigo;
      };
      cuit: string;
      CUIT: string;
      dni?: never;
      DNI?: never;
    })
  | (XubioClienteBasePayload & {
      identificacionTributaria: {
        codigo: 'DNI';
      };
      dni: string;
      DNI: string;
      cuit?: never;
      CUIT?: never;
    });

export interface CreateXubioClienteCommand {
  cliente: XubioClientePayload;
}

export interface XubioCliente {
  clienteId: number;
  nombre: string;
  razonSocial?: string | null;
  primerNombre?: string | null;
  primerApellido?: string | null;
  identificacionTributaria?: XubioClienteReference | null;
  categoriaFiscal?: XubioClienteReference | null;
  provincia?: XubioClienteReference | null;
  direccion?: string | null;
  codigoPostal?: string | null;
  pais?: XubioClienteReference | null;
  usrCode?: string | null;
  descripcion?: string | null;
  esClienteExtranjero?: number | null;
  esProveedor?: number | null;
  cuit?: string | null;
  dni?: string | null;
  rawPayload: unknown;
}

export interface CreateXubioClienteResponse {
  status: CreateXubioClienteStatus;
  created: boolean;
  cliente?: XubioCliente;
  alreadyExistsDetail?: string;
  rawPayload?: unknown;
}

export interface CreateXubioClienteFromFiscalInfoCommand {
  tlqvCode?: string;
  cuit: string;
  documentoTipo?: XubioFiscalIdentificacionTributariaCodigo;
  nombre?: string | null;
  razonSocial: string;
  primerNombre?: string | null;
  primerApellido?: string | null;
  condicionImpositiva: string;
  categoriaFiscalCodigo?: XubioCategoriaFiscalCodigo;
  direccion?: string | null;
  codigoPostal?: string | null;
  provincia?: string | null;
  descripcion?: string | null;
}

export type CreateXubioClienteFromFiscalInfoResponse =
  CreateXubioClienteResponse;
