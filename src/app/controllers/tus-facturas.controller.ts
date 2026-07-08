import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { TusFacturasDocumentoTipo } from '../../core/entities/tus-facturas/afip-info/TusFacturasAfipInfo';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { TusFacturasAfipInfoService } from '../services/tus-facturas-afip-info.service';

@Controller('internal/tus-facturas')
@UseGuards(InternalApiKeyGuard)
export class TusFacturasController {
  constructor(
    private readonly tusFacturasAfipInfoService: TusFacturasAfipInfoService,
  ) {}

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
