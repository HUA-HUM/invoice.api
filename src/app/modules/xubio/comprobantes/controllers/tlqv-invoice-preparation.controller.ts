import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InternalApiKeyGuard } from '../../../../guards/internal-api-key.guard';
import { TlqvInvoicePreparationService } from '../../../../services/tlqv-invoice-preparation.service';
import { readRequiredBodyString } from '../../../shared/http/request-parsers';
import { ApiInternalEndpoint } from '../../../shared/swagger/internal-api-docs.decorators';

@ApiTags('TLQV Invoice - Preparación')
@Controller('internal/xubio/comprobantes/tlqv-invoice')
@UseGuards(InternalApiKeyGuard)
export class TlqvInvoicePreparationController {
  constructor(
    private readonly tlqvInvoicePreparationService: TlqvInvoicePreparationService,
  ) {}

  @ApiInternalEndpoint()
  @ApiOperation({
    summary: 'Preparar/validar un TLQV antes de facturar',
    description:
      'Valida que el TLQV exista en Stock BUE, esté DESPACHADA y no figure facturado en Madre/Xubio.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tlqvCode'],
      properties: {
        tlqvCode: {
          type: 'string',
          example: 'TLQV-7734',
        },
      },
      example: {
        tlqvCode: 'TLQV-7734',
      },
    },
  })
  @ApiOkResponse({
    description: 'Resultado de preparación del TLQV.',
    schema: {
      example: {
        status: 'READY',
        canContinue: true,
        tlqvCode: 'TLQV-7734',
        isBilled: false,
        isDispatched: true,
        billingValidationAvailable: true,
        blockers: [],
      },
    },
  })
  @Post('prepare')
  prepareTlqvInvoice(@Body() body: { tlqvCode?: string } = {}) {
    return this.tlqvInvoicePreparationService.execute({
      tlqvCode: readRequiredBodyString(body.tlqvCode, 'tlqvCode'),
    });
  }
}
