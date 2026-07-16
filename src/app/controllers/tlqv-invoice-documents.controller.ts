import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiNotFoundResponse,
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

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Consultar PDF guardado en CDN por TLQV',
    description:
      'Consulta si ya existe un PDF de factura/factura-remito en el CDN para el TLQV. No genera ni sube archivos.',
  })
  @ApiParam({
    name: 'tlqvCode',
    example: 'TLQV-12948',
    description: 'Código TLQV a consultar.',
  })
  @ApiOkResponse({
    description: 'Documento encontrado en CDN.',
    schema: {
      example: {
        status: 'already_exists',
        tlqvCode: 'TLQV-12948',
        filename: 'factura-remito.pdf',
        cdnKey: 'invoice-documents/tlqv/TLQV-12948/factura-remito.pdf',
        cdnUrl:
          'https://product-images-fravega.nyc3.cdn.digitaloceanspaces.com/invoice-documents/tlqv/TLQV-12948/factura-remito.pdf',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'No existe PDF guardado en CDN para el TLQV.',
  })
  @Get(':tlqvCode/cdn')
  async getCdnPdf(@Param('tlqvCode') tlqvCode: string) {
    try {
      const result =
        await this.tlqvInvoiceDocumentsService.getExistingCdnPdf(tlqvCode);

      if (result === null) {
        throw new NotFoundException(
          `No CDN PDF was found for ${tlqvCode.trim().toUpperCase()}`,
        );
      }

      return result;
    } catch (error: unknown) {
      if (error instanceof RangeError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Crear o devolver PDF guardado en CDN por TLQV',
    description:
      'Proceso idempotente: si ya existe un PDF en CDN para el TLQV devuelve esa URL. Si no existe, genera el PDF actual, lo sube a CDN y devuelve la URL.',
  })
  @ApiParam({
    name: 'tlqvCode',
    example: 'TLQV-12948',
    description: 'Código TLQV a generar/subir.',
  })
  @ApiOkResponse({
    description: 'Documento existente o creado en CDN.',
    schema: {
      example: {
        status: 'created',
        tlqvCode: 'TLQV-12948',
        filename: 'TLQV-12948-factura-remito.pdf',
        cdnKey: 'invoice-documents/tlqv/TLQV-12948/factura-remito.pdf',
        cdnUrl:
          'https://product-images-fravega.nyc3.cdn.digitaloceanspaces.com/invoice-documents/tlqv/TLQV-12948/factura-remito.pdf',
      },
    },
  })
  @Post(':tlqvCode/cdn')
  async getOrCreateCdnPdf(@Param('tlqvCode') tlqvCode: string) {
    try {
      return await this.tlqvInvoiceDocumentsService.getOrCreateCdnPdf(tlqvCode);
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
