import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { TlqvInvoiceDocumentsNotFoundError } from '../../core/interactors/tlqv/GenerateTlqvInvoiceDocumentsInteractor';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';
import { ApiInternalEndpoint } from '../modules/shared/swagger/internal-api-docs.decorators';
import { TlqvInvoiceDocumentsService } from '../services/tlqv-invoice-documents.service';

@ApiTags('TLQV Invoice - Documentos')
@Controller('internal/tlqv-invoice/documents')
@UseGuards(InternalApiKeyGuard)
export class TlqvInvoiceDocumentsController {
  constructor(
    private readonly tlqvInvoiceDocumentsService: TlqvInvoiceDocumentsService,
  ) {}

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Descargar factura + remito por TLQV',
    description:
      'Genera un PDF combinado para Odoo: primera página con factura desde Madre/Xubio y segunda página con remito/detalle de orden desde Ops API y Catalog Sync.',
  })
  @ApiParam({
    name: 'tlqvCode',
    example: 'TLQV-8821',
    description: 'Código TLQV a descargar.',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'PDF combinado factura + remito.',
    content: {
      'application/pdf': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @Get(':tlqvCode/pdf')
  async downloadCombinedPdf(
    @Param('tlqvCode') tlqvCode: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    try {
      const result =
        await this.tlqvInvoiceDocumentsService.generateCombinedPdf(tlqvCode);

      response.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': String(result.buffer.length),
      });

      return new StreamableFile(result.buffer);
    } catch (error: unknown) {
      if (error instanceof RangeError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof TlqvInvoiceDocumentsNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
