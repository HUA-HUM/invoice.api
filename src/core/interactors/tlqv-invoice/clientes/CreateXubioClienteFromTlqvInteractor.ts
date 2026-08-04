import type { IInvoiceClientIssueRepository } from '../../../adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import type { IStockBueTlqvCacheRepository } from '../../../adapters/repositories/cache/stock-bue/IStockBueTlqvCacheRepository';
import type { IMadreXubioComprobantesRepository } from '../../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { IGetStockBueItemByTlqvCodeRepository } from '../../../adapters/repositories/spreadsheet-api/stock-bue/IGetStockBueItemByTlqvCodeRepository';
import type { IGetTlqvOrderDetailsRepository } from '../../../adapters/repositories/tlqv/order-details/IGetTlqvOrderDetailsRepository';
import type { IGetTusFacturasAfipInfoRepository } from '../../../adapters/repositories/tus-facturas/afip-info/IGetTusFacturasAfipInfoRepository';
import type { ICreateXubioClienteRepository } from '../../../adapters/repositories/xubio/clientes/ICreateXubioClienteRepository';
import type { IFindXubioClienteRepository } from '../../../adapters/repositories/xubio/clientes/IFindXubioClienteRepository';
import type {
  TlqvOrderBuyerData,
  TlqvOrderDetails,
} from '../../../entities/tlqv/order-details/TlqvOrderDetails';
import type {
  GetTusFacturasAfipInfoResponse,
  TusFacturasAfipInfo,
  TusFacturasAfipInfoInvalidDocument,
  TusFacturasDocumentoTipo,
} from '../../../entities/tus-facturas/afip-info/TusFacturasAfipInfo';
import type {
  CreateXubioClienteResponse,
  XubioCliente,
  XubioClientePayload,
} from '../../../entities/xubio/clientes/XubioCliente';
import { CreateXubioClienteInteractor } from '../../xubio/clientes/CreateXubioClienteInteractor';
import { GetTusFacturasAfipInfoInteractor } from '../../tus-facturas/GetTusFacturasAfipInfoInteractor';
import {
  PrepareTlqvInvoiceInteractor,
  type PrepareTlqvInvoiceBlocker,
  type PrepareTlqvInvoiceResponse,
} from '../preparacion/PrepareTlqvInvoiceInteractor';

const DEFAULT_PAIS_CODIGO = 'ARGENTINA';
const DEFAULT_DESCRIPCION = 'Cliente creado automáticamente desde TLQV';
const CONSUMIDOR_FINAL_CONDICION_IMPOSITIVA = 'CONSUMIDOR FINAL';
const CONSUMIDOR_FINAL_CATEGORIA_FISCAL = 'CF';
const DNI_IDENTIFICACION_TRIBUTARIA = 'DNI';
const DNI_DERIVABLE_10_DIGIT_PREFIXES = new Set(['20', '23', '24', '27', '30']);

export type CreateXubioClienteFromTlqvStatus =
  'created' | 'already_exists' | 'blocked' | 'invalid_fiscal_document';

export type CreateXubioClienteFromTlqvBlockerCode =
  | PrepareTlqvInvoiceBlocker['code']
  | 'ORDER_DETAILS_NOT_FOUND'
  | 'MISSING_BUYER_CUIT'
  | 'FISCAL_INFO_UNAVAILABLE'
  | 'MISSING_FISCAL_RAZON_SOCIAL'
  | 'MISSING_FISCAL_CONDICION_IMPOSITIVA'
  | 'XUBIO_EXISTING_CLIENT_LOOKUP_FAILED'
  | 'XUBIO_EXISTING_CLIENT_NOT_FOUND';

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
    private readonly findXubioClienteRepository?: IFindXubioClienteRepository,
    private readonly stockBueItemByTlqvCodeRepository?: IGetStockBueItemByTlqvCodeRepository,
  ) {}

  async execute(
    command: CreateXubioClienteFromTlqvCommand,
  ): Promise<CreateXubioClienteFromTlqvResponse> {
    const prepareInteractor = new PrepareTlqvInvoiceInteractor(
      this.stockBueTlqvCacheRepository,
      this.madreXubioComprobantesRepository,
      this.stockBueItemByTlqvCodeRepository,
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

    if (this.findXubioClienteRepository !== undefined) {
      let existingCliente: XubioCliente | undefined;
      try {
        existingCliente = await this.findExistingXubioCliente({
          cuitDigits: cuitCompradorDigits,
          dniDigits: deriveDniDigitsFromDocumento(cuitCompradorDigits),
          buyerName: buyerData.nombreDestinatario,
          allowNameOnlyMatch: !hasValidFiscalDocumento(cuitCompradorDigits),
        });
      } catch (error: unknown) {
        return {
          status: 'blocked',
          canContinue: false,
          tlqvCode: prepare.tlqvCode,
          prepare,
          orderDetails,
          buyerData,
          blockers: [
            {
              code: 'XUBIO_EXISTING_CLIENT_LOOKUP_FAILED',
              message: `No se pudo validar si el cliente ya existe en Xubio. ${readErrorMessage(error)}`,
            },
          ],
        };
      }

      if (existingCliente !== undefined) {
        return buildExistingClienteResponse({
          tlqvCode: prepare.tlqvCode,
          prepare,
          orderDetails,
          buyerData,
          existingCliente,
          fallbackDocumentoDigits: cuitCompradorDigits,
        });
      }
    }

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
    const issueContext = {
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
    };
    let fiscalInfoResponse: GetTusFacturasAfipInfoResponse;
    try {
      fiscalInfoResponse = await new GetTusFacturasAfipInfoInteractor(
        this.tusFacturasAfipInfoRepository,
        undefined,
        this.getNow,
      ).execute({
        tlqvCode: prepare.tlqvCode,
        documentoNro: cuitCompradorDigits,
        documentoTipo,
        issueContext,
      });
    } catch (error: unknown) {
      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode: prepare.tlqvCode,
        prepare,
        orderDetails,
        buyerData,
        documentoTipo,
        blockers: [
          {
            code: 'FISCAL_INFO_UNAVAILABLE',
            message: `No se pudo validar la condición fiscal en TusFacturas. ${readErrorMessage(error)}`,
          },
        ],
      };
    }

    if (fiscalInfoResponse.status === 'invalid_document') {
      const consumidorFinalClienteResult =
        await this.createConsumidorFinalClienteFromFiscalFallback({
          tlqvCode: prepare.tlqvCode,
          prepare,
          orderDetails,
          buyerData,
          fiscalInfoResponse,
          documentoTipo,
          originalDocumentoDigits: cuitCompradorDigits,
          rawPayload: fiscalInfoResponse.invalidDocument.rawPayload,
        });

      if (consumidorFinalClienteResult !== null) {
        return consumidorFinalClienteResult;
      }

      await this.recordInvalidFiscalDocumentIssue({
        tlqvCode: prepare.tlqvCode,
        invalidDocument: fiscalInfoResponse.invalidDocument,
        issueContext,
      });

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
      const consumidorFinalClienteResult =
        await this.createConsumidorFinalClienteFromFiscalFallback({
          tlqvCode: prepare.tlqvCode,
          prepare,
          orderDetails,
          buyerData,
          fiscalInfoResponse,
          documentoTipo,
          originalDocumentoDigits: cuitCompradorDigits,
          rawPayload: fiscalInfo.rawPayload,
        });

      if (consumidorFinalClienteResult !== null) {
        return consumidorFinalClienteResult;
      }

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

    let xubioClienteResult = await new CreateXubioClienteInteractor(
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

    if (
      xubioClienteResult.status === 'already_exists' &&
      xubioClienteResult.cliente === undefined &&
      this.findXubioClienteRepository !== undefined
    ) {
      let existingCliente: XubioCliente | undefined;
      try {
        existingCliente = await this.findExistingXubioCliente({
          cuitDigits: cuitCompradorDigits,
          dniDigits: deriveDniDigitsFromDocumento(cuitCompradorDigits),
          buyerName: buyerData.nombreDestinatario,
          razonSocial: fiscalInfo.razonSocial as string,
          allowNameOnlyMatch: true,
        });
      } catch (error: unknown) {
        return {
          status: 'blocked',
          canContinue: false,
          tlqvCode: prepare.tlqvCode,
          prepare,
          orderDetails,
          buyerData,
          fiscalInfoResponse,
          documentoTipo,
          blockers: [
            {
              code: 'XUBIO_EXISTING_CLIENT_LOOKUP_FAILED',
              message: `Xubio cliente already exists, but the existing client lookup failed. ${readErrorMessage(error)}`,
            },
          ],
        };
      }

      if (existingCliente === undefined) {
        return {
          status: 'blocked',
          canContinue: false,
          tlqvCode: prepare.tlqvCode,
          prepare,
          orderDetails,
          buyerData,
          fiscalInfoResponse,
          documentoTipo,
          blockers: [
            {
              code: 'XUBIO_EXISTING_CLIENT_NOT_FOUND',
              message:
                'Xubio cliente already exists, but it could not be found by CUIT or usrCode.',
            },
          ],
        };
      }

      xubioClienteResult = {
        ...xubioClienteResult,
        cliente: existingCliente,
      };
    }

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

  private async findExistingXubioCliente(command: {
    cuitDigits?: string | null;
    dniDigits?: string | null;
    buyerName?: string | null;
    razonSocial?: string | null;
    allowNameOnlyMatch?: boolean;
  }): Promise<XubioCliente | undefined> {
    if (this.findXubioClienteRepository === undefined) {
      return undefined;
    }

    const candidates = buildClienteSearchCandidates({
      cuitDigits: command.cuitDigits,
      dniDigits: command.dniDigits,
      buyerName: command.buyerName,
      razonSocial: command.razonSocial,
    });

    for (const nombre of candidates) {
      const response = await this.findXubioClienteRepository.findByName({
        nombre,
      });
      const match = response.clientes.find((cliente) =>
        matchesExistingCliente(cliente, command),
      );

      if (match !== undefined) {
        return match;
      }
    }

    return undefined;
  }

  private async createConsumidorFinalClienteFromFiscalFallback(command: {
    tlqvCode: string;
    prepare: PrepareTlqvInvoiceResponse;
    orderDetails: TlqvOrderDetails;
    buyerData: TlqvOrderBuyerData;
    fiscalInfoResponse: GetTusFacturasAfipInfoResponse;
    documentoTipo: TusFacturasDocumentoTipo;
    originalDocumentoDigits: string;
    rawPayload: unknown;
  }): Promise<CreateXubioClienteFromTlqvResponse | null> {
    const dniDigits = deriveDniDigitsFromDocumento(
      command.originalDocumentoDigits,
    );
    const buyerName = normalizeOptionalString(
      command.buyerData.nombreDestinatario,
    );

    if (dniDigits === null || buyerName === null) {
      return null;
    }

    const fiscalInfo = buildConsumidorFinalFiscalInfo({
      dniDigits,
      buyerName,
      buyerData: command.buyerData,
      rawPayload: command.rawPayload,
    });
    let xubioClienteResult = await this.createXubioClienteRepository.create({
      cliente: buildConsumidorFinalClientePayload({
        dniDigits,
        originalDocumentoDigits: command.originalDocumentoDigits,
        buyerName,
        buyerData: command.buyerData,
      }),
    });

    if (
      xubioClienteResult.status === 'already_exists' &&
      xubioClienteResult.cliente === undefined &&
      this.findXubioClienteRepository !== undefined
    ) {
      let existingCliente: XubioCliente | undefined;
      try {
        existingCliente = await this.findExistingXubioCliente({
          cuitDigits: command.originalDocumentoDigits,
          dniDigits,
          buyerName,
          razonSocial: buyerName,
          allowNameOnlyMatch: true,
        });
      } catch (error: unknown) {
        return {
          status: 'blocked',
          canContinue: false,
          tlqvCode: command.tlqvCode,
          prepare: command.prepare,
          orderDetails: command.orderDetails,
          buyerData: command.buyerData,
          fiscalInfoResponse: command.fiscalInfoResponse,
          documentoTipo: command.documentoTipo,
          blockers: [
            {
              code: 'XUBIO_EXISTING_CLIENT_LOOKUP_FAILED',
              message: `Xubio consumidor final cliente already exists, but the existing client lookup failed. ${readErrorMessage(error)}`,
            },
          ],
        };
      }

      if (existingCliente === undefined) {
        return {
          status: 'blocked',
          canContinue: false,
          tlqvCode: command.tlqvCode,
          prepare: command.prepare,
          orderDetails: command.orderDetails,
          buyerData: command.buyerData,
          fiscalInfoResponse: command.fiscalInfoResponse,
          documentoTipo: command.documentoTipo,
          blockers: [
            {
              code: 'XUBIO_EXISTING_CLIENT_NOT_FOUND',
              message:
                'Xubio consumidor final cliente already exists, but it could not be found by DNI, CUIT or usrCode.',
            },
          ],
        };
      }

      xubioClienteResult = {
        ...xubioClienteResult,
        cliente: existingCliente,
      };
    }

    return {
      status: xubioClienteResult.status,
      canContinue: true,
      tlqvCode: command.tlqvCode,
      prepare: command.prepare,
      orderDetails: command.orderDetails,
      buyerData: command.buyerData,
      fiscalInfoResponse: command.fiscalInfoResponse,
      fiscalInfo,
      documentoTipo: command.documentoTipo,
      xubioClienteResult,
    };
  }

  private async recordInvalidFiscalDocumentIssue(command: {
    tlqvCode: string;
    invalidDocument: TusFacturasAfipInfoInvalidDocument;
    issueContext: {
      saleNumber?: string | null;
      buyerName?: string | null;
      email?: string | null;
      metadata?: unknown;
    };
  }): Promise<void> {
    if (this.invoiceClientIssueRepository === undefined) {
      return;
    }

    await this.invoiceClientIssueRepository.upsert({
      tlqvCode: command.tlqvCode,
      reason: 'INVALID_FISCAL_DOCUMENT',
      source: 'tus_facturas',
      saleNumber: command.issueContext.saleNumber,
      buyerName: command.issueContext.buyerName,
      email: command.issueContext.email,
      cuit: command.invalidDocument.documentoNro,
      documentoTipo: command.invalidDocument.documentoTipo,
      documentoNro: command.invalidDocument.documentoNro,
      documentoNroDigits: command.invalidDocument.documentoNroDigits,
      message: buildInvalidFiscalDocumentIssueMessage(
        command.tlqvCode,
        command.invalidDocument,
      ),
      messages: [
        buildInvalidFiscalDocumentIssueMessage(
          command.tlqvCode,
          command.invalidDocument,
        ),
        ...command.invalidDocument.messages,
      ],
      rawPayload: command.invalidDocument.rawPayload,
      metadata: command.issueContext.metadata,
      now: this.getNow(),
    });
  }
}

function buildInvalidFiscalDocumentIssueMessage(
  tlqvCode: string,
  invalidDocument: TusFacturasAfipInfoInvalidDocument,
): string {
  return `${tlqvCode} trae documento fiscal "${invalidDocument.documentoNro}" (${invalidDocument.documentoNroDigits.length} dígitos). No se puede consultar TusFacturas ni derivar un DNI/CUIT válido automáticamente. Hay que corregir el documento o cargarlo manualmente como consumidor final.`;
}

function buildExistingClienteResponse(command: {
  tlqvCode: string;
  prepare: PrepareTlqvInvoiceResponse;
  orderDetails: TlqvOrderDetails;
  buyerData: TlqvOrderBuyerData;
  existingCliente: XubioCliente;
  fallbackDocumentoDigits?: string | null;
}): CreateXubioClienteFromTlqvResponse {
  const fiscalInfo = buildFiscalInfoFromExistingCliente(
    command.existingCliente,
    command.fallbackDocumentoDigits,
  );

  return {
    status: 'already_exists',
    canContinue: true,
    tlqvCode: command.tlqvCode,
    prepare: command.prepare,
    orderDetails: command.orderDetails,
    buyerData: command.buyerData,
    fiscalInfo,
    documentoTipo: fiscalInfo.documentoTipo,
    xubioClienteResult: {
      status: 'already_exists',
      created: false,
      cliente: command.existingCliente,
      rawPayload: command.existingCliente.rawPayload,
    },
  };
}

function buildFiscalInfoFromExistingCliente(
  cliente: XubioCliente,
  fallbackDocumentoDigits?: string | null,
): TusFacturasAfipInfo {
  const rawDocumento =
    normalizeOptionalString(cliente.cuit) ??
    normalizeOptionalString(cliente.dni) ??
    normalizeOptionalString(fallbackDocumentoDigits) ??
    '';
  const documentoNroDigits = normalizeDocumentDigits(rawDocumento);
  const documentoTipo =
    inferDocumentoTipoFromOptionalDigits(documentoNroDigits);

  return {
    documentoNro: rawDocumento,
    documentoNroDigits,
    documentoTipo,
    razonSocial: cliente.razonSocial ?? cliente.nombre,
    condicionImpositiva: resolveCondicionImpositivaFromXubioCliente(cliente),
    direccion: cliente.direccion,
    codigoPostal: cliente.codigoPostal,
    provincia: cliente.provincia?.nombre ?? null,
    rawPayload: cliente.rawPayload,
  };
}

function resolveCondicionImpositivaFromXubioCliente(
  cliente: XubioCliente,
): string {
  const categoriaFiscalCodigo = normalizeForComparison(
    cliente.categoriaFiscal?.codigo,
  );

  if (categoriaFiscalCodigo === 'RI') {
    return 'RESPONSABLE INSCRIPTO';
  }

  if (categoriaFiscalCodigo === 'MT') {
    return 'MONOTRIBUTO';
  }

  if (categoriaFiscalCodigo === 'CF') {
    return 'CONSUMIDOR FINAL';
  }

  if (categoriaFiscalCodigo === 'EX') {
    return 'EXENTO';
  }

  const categoriaFiscalNombre = normalizeOptionalString(
    cliente.categoriaFiscal?.nombre,
  );
  if (categoriaFiscalNombre !== null) {
    return categoriaFiscalNombre;
  }

  const identificacionTributariaCodigo = normalizeForComparison(
    cliente.identificacionTributaria?.codigo,
  );
  if (identificacionTributariaCodigo === 'DNI') {
    return 'CONSUMIDOR FINAL';
  }

  return 'CONSUMIDOR FINAL';
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

function buildClienteSearchCandidates(command: {
  cuitDigits?: string | null;
  dniDigits?: string | null;
  buyerName?: string | null;
  razonSocial?: string | null;
}): string[] {
  const cuitDigits = normalizeOptionalString(command.cuitDigits);
  const cuitCandidates =
    cuitDigits === null
      ? []
      : [`TLQV-${cuitDigits}`, formatCuitIfPossible(cuitDigits), cuitDigits];
  const dniDigits = normalizeOptionalString(command.dniDigits);
  const dniCandidates =
    dniDigits === null ? [] : [formatDni(dniDigits), dniDigits];

  return Array.from(
    new Set(
      [
        command.buyerName,
        command.razonSocial,
        ...cuitCandidates,
        ...dniCandidates,
      ]
        .map((value) => normalizeOptionalString(value))
        .filter((value): value is string => value !== null),
    ),
  );
}

function matchesExistingCliente(
  cliente: XubioCliente,
  command: {
    cuitDigits?: string | null;
    dniDigits?: string | null;
    buyerName?: string | null;
    razonSocial?: string | null;
    allowNameOnlyMatch?: boolean;
  },
): boolean {
  const cuitDigits = normalizeOptionalString(command.cuitDigits);
  const dniDigits = normalizeOptionalString(command.dniDigits);

  if (cuitDigits !== null) {
    const expectedUsrCode = normalizeForComparison(`TLQV-${cuitDigits}`);
    if (normalizeForComparison(cliente.usrCode) === expectedUsrCode) {
      return true;
    }

    if (
      normalizeDocumentDigits(cliente.cuit) === cuitDigits ||
      normalizeDocumentDigits(cliente.dni) === cuitDigits
    ) {
      return true;
    }
  }

  if (dniDigits !== null) {
    if (
      normalizeDocumentDigits(cliente.cuit) === dniDigits ||
      normalizeDocumentDigits(cliente.dni) === dniDigits
    ) {
      return true;
    }
  }

  if (command.allowNameOnlyMatch !== true) {
    return false;
  }

  const buyerName = normalizeForComparison(command.buyerName);
  const razonSocial = normalizeForComparison(command.razonSocial);
  const clienteNombre = normalizeForComparison(cliente.nombre);
  const clienteRazonSocial = normalizeForComparison(cliente.razonSocial);

  return (
    (buyerName !== '' &&
      (clienteNombre === buyerName || clienteRazonSocial === buyerName)) ||
    (razonSocial !== '' &&
      (clienteNombre === razonSocial || clienteRazonSocial === razonSocial))
  );
}

function normalizeDocumentDigits(value: string | null | undefined): string {
  return value?.replace(/\D/g, '') ?? '';
}

function formatCuitIfPossible(digits: string): string {
  if (digits.length !== 11) {
    return digits;
  }

  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

function hasValidFiscalDocumento(value: string | null | undefined): boolean {
  return normalizeOptionalString(value)?.replace(/\D/g, '').length === 11;
}

function deriveDniDigitsFromDocumento(
  value: string | null | undefined,
): string | null {
  const digits = normalizeDocumentDigits(value);

  if (digits.length === 11) {
    return digits.slice(2, 10);
  }

  if (
    digits.length === 10 &&
    DNI_DERIVABLE_10_DIGIT_PREFIXES.has(digits.slice(0, 2))
  ) {
    return digits.slice(2);
  }

  return isDniLength(digits) ? digits : null;
}

function isDniLength(value: string): boolean {
  return value.length >= 7 && value.length <= 8;
}

function formatDni(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function buildConsumidorFinalFiscalInfo(command: {
  dniDigits: string;
  buyerName: string;
  buyerData: TlqvOrderBuyerData;
  rawPayload: unknown;
}): TusFacturasAfipInfo {
  return {
    documentoNro: formatDni(command.dniDigits),
    documentoNroDigits: command.dniDigits,
    documentoTipo: 'CUIT',
    razonSocial: command.buyerName,
    condicionImpositiva: CONSUMIDOR_FINAL_CONDICION_IMPOSITIVA,
    direccion: command.buyerData.direccion,
    codigoPostal: normalizeCodigoPostal(command.buyerData.codigoPostal),
    provincia: command.buyerData.provincia,
    rawPayload: command.rawPayload,
  };
}

function buildConsumidorFinalClientePayload(command: {
  dniDigits: string;
  originalDocumentoDigits: string;
  buyerName: string;
  buyerData: TlqvOrderBuyerData;
}): XubioClientePayload {
  const nameParts = splitName(command.buyerName);
  const formattedDni = formatDni(command.dniDigits);
  const provincia = normalizeOptionalString(command.buyerData.provincia);

  return {
    nombre: command.buyerName,
    razonSocial: command.buyerName,
    primerNombre: nameParts.primerNombre,
    primerApellido: nameParts.primerApellido,
    identificacionTributaria: {
      codigo: DNI_IDENTIFICACION_TRIBUTARIA,
    },
    categoriaFiscal: {
      codigo: CONSUMIDOR_FINAL_CATEGORIA_FISCAL,
    },
    pais: {
      codigo: DEFAULT_PAIS_CODIGO,
    },
    cuit: formattedDni,
    CUIT: formattedDni,
    direccion: normalizeOptionalString(command.buyerData.direccion),
    codigoPostal: normalizeCodigoPostal(command.buyerData.codigoPostal),
    provincia:
      provincia === null
        ? null
        : {
            nombre: provincia,
          },
    usrCode: `TLQV-${command.originalDocumentoDigits}`,
    descripcion: DEFAULT_DESCRIPCION,
    esclienteextranjero: 0,
    esProveedor: 0,
  };
}

function normalizeCodigoPostal(
  value: string | null | undefined,
): string | null {
  const normalizedValue = normalizeOptionalString(value);
  return normalizedValue?.replace(/^CP:\s*/i, '').trim() ?? null;
}

function splitName(value: string): {
  primerNombre: string | null;
  primerApellido: string | null;
} {
  const parts = value.split(/\s+/).filter((part) => part !== '');

  if (parts.length === 0) {
    return {
      primerNombre: null,
      primerApellido: null,
    };
  }

  if (parts.length === 1) {
    return {
      primerNombre: parts[0],
      primerApellido: null,
    };
  }

  return {
    primerNombre: parts[0],
    primerApellido: parts.slice(1).join(' '),
  };
}

function inferDocumentoTipoFromOptionalDigits(
  digits: string,
): TusFacturasDocumentoTipo {
  return digits.length === 11 ? inferDocumentoTipo(digits) : 'CUIT';
}

function normalizeForComparison(value: string | null | undefined): string {
  return (
    value
      ?.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase() ?? ''
  );
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue === '' ? null : normalizedValue;
}

function isBlank(value: string | null | undefined): boolean {
  return value === undefined || value === null || value.trim() === '';
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }

  return 'unknown error';
}
