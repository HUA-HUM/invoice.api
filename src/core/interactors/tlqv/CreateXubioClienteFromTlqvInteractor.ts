import type { IInvoiceClientIssueRepository } from '../../adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import type { IStockBueTlqvCacheRepository } from '../../adapters/repositories/cache/stock-bue/IStockBueTlqvCacheRepository';
import type { IMadreXubioComprobantesRepository } from '../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { IGetTlqvOrderDetailsRepository } from '../../adapters/repositories/tlqv/order-details/IGetTlqvOrderDetailsRepository';
import type { IGetTusFacturasAfipInfoRepository } from '../../adapters/repositories/tus-facturas/afip-info/IGetTusFacturasAfipInfoRepository';
import type { ICreateXubioClienteRepository } from '../../adapters/repositories/xubio/clientes/ICreateXubioClienteRepository';
import type {
  TlqvOrderBuyerData,
  TlqvOrderDetails,
} from '../../entities/tlqv/order-details/TlqvOrderDetails';
import type {
  GetTusFacturasAfipInfoResponse,
  TusFacturasAfipInfo,
  TusFacturasAfipInfoInvalidDocument,
  TusFacturasDocumentoTipo,
} from '../../entities/tus-facturas/afip-info/TusFacturasAfipInfo';
import type { CreateXubioClienteResponse } from '../../entities/xubio/clientes/XubioCliente';
import { CreateXubioClienteInteractor } from '../xubio/clientes/CreateXubioClienteInteractor';
import { GetTusFacturasAfipInfoInteractor } from '../tus-facturas/GetTusFacturasAfipInfoInteractor';
import {
  PrepareTlqvInvoiceInteractor,
  type PrepareTlqvInvoiceBlocker,
  type PrepareTlqvInvoiceResponse,
} from './PrepareTlqvInvoiceInteractor';

export type CreateXubioClienteFromTlqvStatus =
  'created' | 'already_exists' | 'blocked' | 'invalid_fiscal_document';

export type CreateXubioClienteFromTlqvBlockerCode =
  | PrepareTlqvInvoiceBlocker['code']
  | 'ORDER_DETAILS_NOT_FOUND'
  | 'MISSING_BUYER_CUIT'
  | 'MISSING_FISCAL_RAZON_SOCIAL'
  | 'MISSING_FISCAL_CONDICION_IMPOSITIVA';

export interface CreateXubioClienteFromTlqvCommand {
  tlqvCode: string;
}

export interface CreateXubioClienteFromTlqvBlocker {
  code: CreateXubioClienteFromTlqvBlockerCode;
  message: string;
}

interface CreateXubioClienteFromTlqvBaseResponse {
  status: CreateXubioClienteFromTlqvStatus;
  tlqvCode: string;
  prepare: PrepareTlqvInvoiceResponse;
  orderDetails?: TlqvOrderDetails;
  buyerData?: TlqvOrderBuyerData;
  fiscalInfoResponse?: GetTusFacturasAfipInfoResponse;
  documentoTipo?: TusFacturasDocumentoTipo;
}

export type CreateXubioClienteFromTlqvResponse =
  | (CreateXubioClienteFromTlqvBaseResponse & {
      status: 'blocked';
      canContinue: false;
      blockers: CreateXubioClienteFromTlqvBlocker[];
    })
  | (CreateXubioClienteFromTlqvBaseResponse & {
      status: 'invalid_fiscal_document';
      canContinue: false;
      invalidDocument: TusFacturasAfipInfoInvalidDocument;
    })
  | (CreateXubioClienteFromTlqvBaseResponse & {
      status: 'created' | 'already_exists';
      canContinue: true;
      fiscalInfo: TusFacturasAfipInfo;
      xubioClienteResult: CreateXubioClienteResponse;
    });

export class CreateXubioClienteFromTlqvInteractor {
  constructor(
    private readonly stockBueTlqvCacheRepository: IStockBueTlqvCacheRepository,
    private readonly madreXubioComprobantesRepository: IMadreXubioComprobantesRepository,
    private readonly orderDetailsRepositories: IGetTlqvOrderDetailsRepository[],
    private readonly tusFacturasAfipInfoRepository: IGetTusFacturasAfipInfoRepository,
    private readonly createXubioClienteRepository: ICreateXubioClienteRepository,
    private readonly invoiceClientIssueRepository?: IInvoiceClientIssueRepository,
    private readonly getNow: () => Date = () => new Date(),
  ) {}

  async execute(
    command: CreateXubioClienteFromTlqvCommand,
  ): Promise<CreateXubioClienteFromTlqvResponse> {
    const prepareInteractor = new PrepareTlqvInvoiceInteractor(
      this.stockBueTlqvCacheRepository,
      this.madreXubioComprobantesRepository,
    );
    const prepare = await prepareInteractor.execute(command);

    if (!prepare.canContinue) {
      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode: prepare.tlqvCode,
        prepare,
        blockers: prepare.blockers,
      };
    }

    const orderDetails = await this.getOrderDetails(prepare.tlqvCode);
    if (orderDetails === null) {
      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode: prepare.tlqvCode,
        prepare,
        blockers: [
          {
            code: 'ORDER_DETAILS_NOT_FOUND',
            message: `${prepare.tlqvCode} was not found in Ops API or Flokzu.`,
          },
        ],
      };
    }

    const buyerData = orderDetails.buyerData;
    const cuitCompradorDigits = buyerData.cuitCompradorDigits;

    if (cuitCompradorDigits === undefined || cuitCompradorDigits === null) {
      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode: prepare.tlqvCode,
        prepare,
        orderDetails,
        buyerData,
        blockers: [
          {
            code: 'MISSING_BUYER_CUIT',
            message: `${prepare.tlqvCode} does not have buyer CUIT in ${orderDetails.source}.`,
          },
        ],
      };
    }

    const documentoTipo = inferDocumentoTipo(cuitCompradorDigits);
    const fiscalInfoResponse = await new GetTusFacturasAfipInfoInteractor(
      this.tusFacturasAfipInfoRepository,
      this.invoiceClientIssueRepository,
      this.getNow,
    ).execute({
      tlqvCode: prepare.tlqvCode,
      documentoNro: cuitCompradorDigits,
      documentoTipo,
      issueContext: {
        saleNumber: orderDetails.saleNumber ?? prepare.stockBueItem?.saleNumber,
        buyerName: buyerData.nombreDestinatario,
        email: buyerData.email,
        metadata: {
          source: 'create_xubio_cliente_from_tlqv',
          orderDetailsSource: orderDetails.source,
          orderDetails: {
            tlqvCode: orderDetails.tlqvCode,
            saleNumber: orderDetails.saleNumber,
            source: orderDetails.source,
          },
          stockBue: {
            rowNumber: prepare.stockBueItem?.rowNumber,
            instruction: prepare.stockBueItem?.instruction,
            description: prepare.stockBueItem?.description,
            fechaRecepcion: prepare.stockBueItem?.fechaRecepcion,
            fechaSalida: prepare.stockBueItem?.fechaSalida,
            fechaLimite: prepare.stockBueItem?.fechaLimite,
            fechaInstruccion: prepare.stockBueItem?.fechaInstruccion,
          },
          buyerData: {
            nombreDestinatario: buyerData.nombreDestinatario,
            direccion: buyerData.direccion,
            ciudad: buyerData.ciudad,
            provincia: buyerData.provincia,
            codigoPostal: buyerData.codigoPostal,
            telefono: buyerData.telefono,
            email: buyerData.email,
          },
          flokzuBuyerData:
            orderDetails.source === 'flokzu'
              ? {
                  nombreDestinatario: buyerData.nombreDestinatario,
                  direccion: buyerData.direccion,
                  ciudad: buyerData.ciudad,
                  provincia: buyerData.provincia,
                  codigoPostal: buyerData.codigoPostal,
                  telefono: buyerData.telefono,
                  email: buyerData.email,
                }
              : undefined,
        },
      },
    });

    if (fiscalInfoResponse.status === 'invalid_document') {
      return {
        status: 'invalid_fiscal_document',
        canContinue: false,
        tlqvCode: prepare.tlqvCode,
        prepare,
        orderDetails,
        buyerData,
        fiscalInfoResponse,
        documentoTipo,
        invalidDocument: fiscalInfoResponse.invalidDocument,
      };
    }

    const fiscalInfo = fiscalInfoResponse.afipInfo;
    const fiscalBlockers = buildFiscalInfoBlockers(
      fiscalInfo,
      prepare.tlqvCode,
    );
    if (fiscalBlockers.length > 0) {
      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode: prepare.tlqvCode,
        prepare,
        orderDetails,
        buyerData,
        fiscalInfoResponse,
        documentoTipo,
        blockers: fiscalBlockers,
      };
    }

    const xubioClienteResult = await new CreateXubioClienteInteractor(
      this.createXubioClienteRepository,
      this.invoiceClientIssueRepository,
      this.getNow,
    ).execute({
      tlqvCode: prepare.tlqvCode,
      cuit: cuitCompradorDigits,
      documentoTipo,
      nombre: buyerData.nombreDestinatario,
      razonSocial: fiscalInfo.razonSocial as string,
      condicionImpositiva: fiscalInfo.condicionImpositiva as string,
      direccion: buyerData.direccion,
      codigoPostal: buyerData.codigoPostal,
      provincia: buyerData.provincia,
    });

    return {
      status: xubioClienteResult.status,
      canContinue: true,
      tlqvCode: prepare.tlqvCode,
      prepare,
      orderDetails,
      buyerData,
      fiscalInfoResponse,
      fiscalInfo,
      documentoTipo,
      xubioClienteResult,
    };
  }

  private async getOrderDetails(
    tlqvCode: string,
  ): Promise<TlqvOrderDetails | null> {
    for (const repository of this.orderDetailsRepositories) {
      const response = await repository.getByTlqvCode({ tlqvCode });
      if (response.found) {
        return response.orderDetails;
      }
    }

    return null;
  }
}

function buildFiscalInfoBlockers(
  fiscalInfo: TusFacturasAfipInfo,
  tlqvCode: string,
): CreateXubioClienteFromTlqvBlocker[] {
  const blockers: CreateXubioClienteFromTlqvBlocker[] = [];

  if (isBlank(fiscalInfo.razonSocial)) {
    blockers.push({
      code: 'MISSING_FISCAL_RAZON_SOCIAL',
      message: `${tlqvCode} does not have razon_social in TusFacturas response.`,
    });
  }

  if (isBlank(fiscalInfo.condicionImpositiva)) {
    blockers.push({
      code: 'MISSING_FISCAL_CONDICION_IMPOSITIVA',
      message: `${tlqvCode} does not have condicion_impositiva in TusFacturas response.`,
    });
  }

  return blockers;
}

function inferDocumentoTipo(digits: string): TusFacturasDocumentoTipo {
  const prefix = Number(digits.slice(0, 2));
  return prefix >= 30 ? 'CUIL' : 'CUIT';
}

function isBlank(value: string | null | undefined): boolean {
  return value === undefined || value === null || value.trim() === '';
}
