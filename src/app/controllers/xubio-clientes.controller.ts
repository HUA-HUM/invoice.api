import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  XubioCategoriaFiscalCodigo,
  XubioIdentificacionTributariaCodigo,
} from '../../core/entities/xubio/clientes/XubioCliente';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { XubioClientesService } from '../services/xubio-clientes.service';

@Controller('internal/xubio/clientes')
@UseGuards(InternalApiKeyGuard)
export class XubioClientesController {
  constructor(private readonly xubioClientesService: XubioClientesService) {}

  @Post()
  createCliente(
    @Body()
    body: {
      tlqvCode?: string;
      cuit?: string;
      documentoTipo?: XubioIdentificacionTributariaCodigo;
      nombre?: string | null;
      razonSocial?: string;
      primerNombre?: string | null;
      primerApellido?: string | null;
      condicionImpositiva?: string;
      categoriaFiscalCodigo?: XubioCategoriaFiscalCodigo;
      direccion?: string | null;
      codigoPostal?: string | null;
      provincia?: string | null;
      descripcion?: string | null;
    } = {},
  ) {
    return this.xubioClientesService.execute({
      tlqvCode: readOptionalBodyString(body.tlqvCode),
      cuit: readRequiredBodyString(body.cuit, 'cuit'),
      documentoTipo: readOptionalDocumentoTipo(body.documentoTipo),
      nombre: readOptionalBodyString(body.nombre),
      razonSocial: readRequiredBodyString(body.razonSocial, 'razonSocial'),
      primerNombre: readOptionalBodyString(body.primerNombre),
      primerApellido: readOptionalBodyString(body.primerApellido),
      condicionImpositiva: readRequiredBodyString(
        body.condicionImpositiva,
        'condicionImpositiva',
      ),
      categoriaFiscalCodigo: readOptionalCategoriaFiscalCodigo(
        body.categoriaFiscalCodigo,
      ),
      direccion: readOptionalBodyString(body.direccion),
      codigoPostal: readOptionalBodyString(body.codigoPostal),
      provincia: readOptionalBodyString(body.provincia),
      descripcion: readOptionalBodyString(body.descripcion),
    });
  }
}

function readRequiredBodyString(
  value: string | undefined,
  field: string,
): string {
  if (value === undefined || value.trim() === '') {
    throw new BadRequestException(`${field} is required`);
  }

  return value.trim();
}

function readOptionalBodyString(
  value: string | null | undefined,
): string | undefined {
  if (value === undefined || value === null || value.trim() === '') {
    return undefined;
  }

  return value.trim();
}

function readOptionalDocumentoTipo(
  value: XubioIdentificacionTributariaCodigo | undefined,
): XubioIdentificacionTributariaCodigo | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== 'CUIT' && value !== 'CUIL') {
    throw new BadRequestException('documentoTipo must be CUIT or CUIL');
  }

  return value;
}

function readOptionalCategoriaFiscalCodigo(
  value: XubioCategoriaFiscalCodigo | undefined,
): XubioCategoriaFiscalCodigo | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== 'MT' && value !== 'RI' && value !== 'CF' && value !== 'EX') {
    throw new BadRequestException(
      'categoriaFiscalCodigo must be MT, RI, CF or EX',
    );
  }

  return value;
}
