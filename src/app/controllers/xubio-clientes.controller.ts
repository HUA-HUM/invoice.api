import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  XubioCategoriaFiscalCodigo,
  XubioFiscalIdentificacionTributariaCodigo,
} from '../../core/entities/xubio/clientes/XubioCliente';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { ApiInternalEndpoint } from '../modules/shared/swagger/internal-api-docs.decorators';
import { XubioClientesService } from '../services/xubio-clientes.service';

@ApiTags('Xubio - Clientes')
@Controller('internal/xubio/clientes')
@UseGuards(InternalApiKeyGuard)
export class XubioClientesController {
  constructor(private readonly xubioClientesService: XubioClientesService) {}

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Crear cliente Xubio desde datos fiscales',
    description:
      'Endpoint directo para crear cliente en Xubio cuando ya se tiene CUIT/CUIL, razón social y condición impositiva.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['cuit', 'razonSocial', 'condicionImpositiva'],
      properties: {
        tlqvCode: { type: 'string', example: 'TLQV-14921' },
        cuit: { type: 'string', example: '20-42433388-4' },
        documentoTipo: {
          type: 'string',
          enum: ['CUIT', 'CUIL'],
          example: 'CUIT',
        },
        nombre: { type: 'string', example: 'ARTURO GUTIERREZ' },
        razonSocial: { type: 'string', example: 'ARTURO GUTIERREZ' },
        primerNombre: { type: 'string', example: 'ARTURO' },
        primerApellido: { type: 'string', example: 'GUTIERREZ' },
        condicionImpositiva: { type: 'string', example: 'MONOTRIBUTO' },
        categoriaFiscalCodigo: {
          type: 'string',
          enum: ['MT', 'RI', 'CF', 'EX'],
          example: 'MT',
        },
        direccion: { type: 'string', example: 'OBLIGADO 3645' },
        codigoPostal: { type: 'string', example: '1661' },
        provincia: { type: 'string', example: 'BUENOS AIRES' },
        descripcion: {
          type: 'string',
          example: 'Cliente creado automáticamente desde TLQV',
        },
      },
      example: {
        tlqvCode: 'TLQV-14921',
        cuit: '20-42433388-4',
        documentoTipo: 'CUIT',
        nombre: 'ARTURO GUTIERREZ',
        razonSocial: 'ARTURO GUTIERREZ',
        condicionImpositiva: 'MONOTRIBUTO',
        direccion: 'OBLIGADO 3645',
        codigoPostal: '1661',
        provincia: 'BUENOS AIRES',
      },
    },
  })
  @ApiOkResponse({
    description: 'Cliente creado o ya existente.',
    schema: {
      example: {
        status: 'created',
        created: true,
        cliente: {
          clienteId: 10256469,
          nombre: 'ARTURO GUTIERREZ',
          razonSocial: 'ARTURO GUTIERREZ',
          cuit: '20-42433388-4',
        },
      },
    },
  })
  @Post()
  createCliente(
    @Body()
    body: {
      tlqvCode?: string;
      cuit?: string;
      documentoTipo?: XubioFiscalIdentificacionTributariaCodigo;
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
  value: XubioFiscalIdentificacionTributariaCodigo | undefined,
): XubioFiscalIdentificacionTributariaCodigo | undefined {
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
