import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TusFacturasDocumentoTipo } from '../../core/entities/tus-facturas/afip-info/TusFacturasAfipInfo';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { ApiInternalEndpoint } from '../modules/shared/swagger/internal-api-docs.decorators';
import { TusFacturasAfipInfoService } from '../services/tus-facturas-afip-info.service';

@ApiTags('Tus Facturas')
@Controller('internal/tus-facturas')
@UseGuards(InternalApiKeyGuard)
export class TusFacturasController {
  constructor(
    private readonly tusFacturasAfipInfoService: TusFacturasAfipInfoService,
  ) {}

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Consultar condición fiscal AFIP/ARCA',
    description:
      'Consulta Tus Facturas con CUIT/CUIL y devuelve datos fiscales normalizados. Si el documento es inválido registra issue en Madre cuando viene con contexto TLQV.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['documentoNro'],
      properties: {
        tlqvCode: {
          type: 'string',
          example: 'TLQV-14921',
          description: 'Opcional para asociar errores a un TLQV.',
        },
        documentoNro: {
          type: 'string',
          example: '20-42433388-4',
        },
        cuit: {
          type: 'string',
          example: '20-42433388-4',
          description: 'Alias aceptado para documentoNro.',
        },
        documentoTipo: {
          type: 'string',
          enum: ['CUIT', 'CUIL'],
          example: 'CUIT',
          description: 'Opcional. Si no se envía, el core puede inferirlo.',
        },
      },
      example: {
        tlqvCode: 'TLQV-14921',
        documentoNro: '20-42433388-4',
        documentoTipo: 'CUIT',
      },
    },
  })
  @ApiOkResponse({
    description: 'Datos fiscales encontrados o documento inválido.',
    schema: {
      example: {
        status: 'found',
        found: true,
        afipInfo: {
          documentoNro: '20-42433388-4',
          documentoTipo: 'CUIT',
          razonSocial: 'ARTURO GUTIERREZ',
          condicionImpositiva: 'MONOTRIBUTO',
          direccion: 'OBLIGADO 3645',
          provincia: 'BUENOS AIRES',
          estado: 'ACTIVO',
        },
      },
    },
  })
  @Post('afip-info')
  getAfipInfo(
    @Body()
    body: {
      tlqvCode?: string;
      documentoNro?: string;
      cuit?: string;
      documentoTipo?: TusFacturasDocumentoTipo;
    } = {},
  ) {
    return this.tusFacturasAfipInfoService.execute({
      tlqvCode: readOptionalBodyString(body.tlqvCode),
      documentoNro: readRequiredDocumentoNro(body),
      documentoTipo: readOptionalDocumentoTipo(body.documentoTipo),
    });
  }
}

function readRequiredDocumentoNro(body: {
  documentoNro?: string;
  cuit?: string;
}): string {
  const value = body.documentoNro ?? body.cuit;
  if (value === undefined || value.trim() === '') {
    throw new BadRequestException('documentoNro or cuit is required');
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
  value: TusFacturasDocumentoTipo | undefined,
): TusFacturasDocumentoTipo | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== 'CUIT' && value !== 'CUIL') {
    throw new BadRequestException('documentoTipo must be CUIT or CUIL');
  }

  return value;
}
