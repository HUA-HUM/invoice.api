import type { IGetMadreItemByTlqvCodeRepository } from '../../../adapters/repositories/spreadsheet-api/madre/IGetMadreItemByTlqvCodeRepository';
import type { IGetTlqvItemByCodeRepository } from '../../../adapters/repositories/spreadsheet-api/tlqv/IGetTlqvItemByCodeRepository';
import type { GetMadreItemByTlqvCodeResponse } from '../../../entities/spreadsheet-api/madre/MadreItems';
import type { GetTlqvItemByCodeResponse } from '../../../entities/spreadsheet-api/tlqv/TlqvItems';
import type {
  CreateXubioInvoiceCommand,
  CreateXubioInvoiceResponse,
} from '../../../entities/xubio/facturas/XubioInvoice';
import type {
  CreateXubioClienteFromTlqvCommand,
  CreateXubioClienteFromTlqvResponse,
} from '../clientes/CreateXubioClienteFromTlqvInteractor';
import {
  BuildXubioInvoiceFromTlqvInteractor,
  type BuildXubioInvoiceFromTlqvResponse,
} from './BuildXubioInvoiceFromTlqvInteractor';

export const TLQV_INVOICE_FLOW_STOP_AFTER_VALUES = [
  'client',
  'source_data',
  'invoice_creation',
] as const;

export type TlqvInvoiceFlowStopAfter =
  (typeof TLQV_INVOICE_FLOW_STOP_AFTER_VALUES)[number];

export type TlqvInvoiceFlowStatus = 'completed' | 'blocked';

export type TlqvInvoiceFlowStepName =
  | 'client'
  | 'source_data'
  | 'invoice_creation';

export type TlqvInvoiceFlowStepStatus =
  | 'completed'
  | 'blocked'
  | 'skipped';

export interface CreateTlqvInvoiceFlowCommand {
  tlqvCode: string;
  stopAfter?: TlqvInvoiceFlowStopAfter;
  dryRun?: boolean;
  issueDate?: string;
}

export interface TlqvInvoiceFlowBlocker {
  code: string;
  message: string;
  step: TlqvInvoiceFlowStepName;
}

export interface TlqvInvoiceFlowStep {
  name: TlqvInvoiceFlowStepName;
  status: TlqvInvoiceFlowStepStatus;
  message?: string;
  blockers?: TlqvInvoiceFlowBlocker[];
}

export interface TlqvInvoiceFlowSourceData {
  tlqvSheet: GetTlqvItemByCodeResponse;
  madreSheet: GetMadreItemByTlqvCodeResponse;
}

interface CreateTlqvInvoiceFlowBaseResponse {
  status: TlqvInvoiceFlowStatus;
  canContinue: boolean;
  tlqvCode: string;
  stopAfter: TlqvInvoiceFlowStopAfter;
  dryRun: boolean;
  steps: TlqvInvoiceFlowStep[];
  clienteFlow?: CreateXubioClienteFromTlqvResponse;
  xubioClienteId?: number;
  sourceData?: TlqvInvoiceFlowSourceData;
  invoiceBuild?: BuildXubioInvoiceFromTlqvResponse;
  createdInvoice?: CreateXubioInvoiceResponse;
  nextStep?: TlqvInvoiceFlowStepName;
}

export type CreateTlqvInvoiceFlowResponse =
  | (CreateTlqvInvoiceFlowBaseResponse & {
      status: 'completed';
      canContinue: true;
    })
  | (CreateTlqvInvoiceFlowBaseResponse & {
      status: 'blocked';
      canContinue: false;
      blockers: TlqvInvoiceFlowBlocker[];
    });

export interface ICreateXubioClienteFromTlqvUseCase {
  execute(
    command: CreateXubioClienteFromTlqvCommand,
  ): Promise<CreateXubioClienteFromTlqvResponse>;
}

export interface ICreateXubioInvoiceRepository {
  create(
    command: CreateXubioInvoiceCommand,
  ): Promise<CreateXubioInvoiceResponse>;
}

export class CreateTlqvInvoiceFlowInteractor {
  constructor(
    private readonly createXubioClienteFromTlqvUseCase: ICreateXubioClienteFromTlqvUseCase,
    private readonly tlqvSheetRepository: IGetTlqvItemByCodeRepository,
    private readonly madreSheetRepository: IGetMadreItemByTlqvCodeRepository,
    private readonly createXubioInvoiceRepository?: ICreateXubioInvoiceRepository,
    private readonly buildXubioInvoiceFromTlqvInteractor = new BuildXubioInvoiceFromTlqvInteractor(),
    private readonly getTodayIsoDate: () => string = () =>
      new Date().toISOString().slice(0, 10),
  ) {}

  async execute(
    command: CreateTlqvInvoiceFlowCommand,
  ): Promise<CreateTlqvInvoiceFlowResponse> {
    const tlqvCode = normalizeRequiredTlqvCode(command.tlqvCode);
    const stopAfter = command.stopAfter ?? 'source_data';
    const dryRun = command.dryRun ?? true;
    const steps: TlqvInvoiceFlowStep[] = [];
    let issueDate = this.getTodayIsoDate();

    if (stopAfter === 'invoice_creation') {
      const issueDateValidation = validateIssueDateTolerance({
        issueDate: command.issueDate,
        todayIsoDate: this.getTodayIsoDate(),
      });

      if (!issueDateValidation.valid) {
        steps.push({
          name: 'invoice_creation',
          status: 'blocked',
          blockers: [issueDateValidation.blocker],
        });

        return {
          status: 'blocked',
          canContinue: false,
          tlqvCode,
          stopAfter,
          dryRun,
          steps,
          blockers: [issueDateValidation.blocker],
        };
      }

      issueDate = issueDateValidation.issueDate;
    }

    const clienteFlow = await this.createXubioClienteFromTlqvUseCase.execute({
      tlqvCode,
    });

    if (!clienteFlow.canContinue) {
      const blockers = buildClienteFlowBlockers(clienteFlow);
      steps.push({
        name: 'client',
        status: 'blocked',
        message: 'El flujo de cliente no puede continuar.',
        blockers,
      });

      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode,
        stopAfter,
        dryRun,
        steps,
        clienteFlow,
        blockers,
      };
    }

    const xubioClienteId = clienteFlow.xubioClienteResult.cliente?.clienteId;
    steps.push({
      name: 'client',
      status: 'completed',
      message:
        clienteFlow.status === 'created'
          ? 'Cliente creado en Xubio.'
          : 'Cliente ya existente en Xubio.',
    });

    if (stopAfter === 'client') {
      return {
        status: 'completed',
        canContinue: true,
        tlqvCode,
        stopAfter,
        dryRun,
        steps,
        clienteFlow,
        xubioClienteId,
        nextStep: 'source_data',
      };
    }

    const sourceDataResult = await this.getSourceData(tlqvCode);
    steps.push(sourceDataResult.step);

    if (sourceDataResult.status === 'blocked') {
      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode,
        stopAfter,
        dryRun,
        steps,
        clienteFlow,
        xubioClienteId,
        sourceData: sourceDataResult.sourceData,
        blockers: sourceDataResult.blockers,
      };
    }

    if (stopAfter === 'source_data') {
      return {
        status: 'completed',
        canContinue: true,
        tlqvCode,
        stopAfter,
        dryRun,
        steps,
        clienteFlow,
        xubioClienteId,
        sourceData: sourceDataResult.sourceData,
        nextStep: 'invoice_creation',
      };
    }

    if (xubioClienteId === undefined) {
      const invoiceBuildBlocker = {
        code: 'XUBIO_CLIENTE_ID_NOT_AVAILABLE',
        message:
          'No tenemos el ID del cliente Xubio en la respuesta actual; sin ese ID no se puede emitir la factura.',
        step: 'invoice_creation' as const,
      };
      steps.push({
        name: 'invoice_creation',
        status: 'blocked',
        blockers: [invoiceBuildBlocker],
      });

      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode,
        stopAfter,
        dryRun,
        steps,
        clienteFlow,
        sourceData: sourceDataResult.sourceData,
        blockers: [invoiceBuildBlocker],
      };
    }

    const sourceData = sourceDataResult.sourceData;
    if (!sourceData.tlqvSheet.found || !sourceData.madreSheet.found) {
      const blocker = {
        code: 'SOURCE_DATA_NOT_AVAILABLE',
        message:
          'No están disponibles las dos solapas necesarias para armar la factura.',
        step: 'invoice_creation' as const,
      };
      steps.push({
        name: 'invoice_creation',
        status: 'blocked',
        blockers: [blocker],
      });

      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode,
        stopAfter,
        dryRun,
        steps,
        clienteFlow,
        xubioClienteId,
        sourceData,
        blockers: [blocker],
      };
    }

    let invoiceBuild: BuildXubioInvoiceFromTlqvResponse;
    try {
      invoiceBuild = this.buildXubioInvoiceFromTlqvInteractor.execute({
        tlqvCode,
        customerId: xubioClienteId,
        fiscalCondition: clienteFlow.fiscalInfo.condicionImpositiva,
        tlqvSheetItem: sourceData.tlqvSheet.item,
        madreSheetItem: sourceData.madreSheet.item,
        issueDate,
      });
    } catch (error: unknown) {
      const blocker = {
        code: 'INVOICE_BUILD_FAILED',
        message: `No se pudo armar el payload de factura. ${getErrorMessage(error)}`,
        step: 'invoice_creation' as const,
      };
      steps.push({
        name: 'invoice_creation',
        status: 'blocked',
        blockers: [blocker],
      });

      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode,
        stopAfter,
        dryRun,
        steps,
        clienteFlow,
        xubioClienteId,
        sourceData: sourceDataResult.sourceData,
        blockers: [blocker],
      };
    }

    if (dryRun) {
      steps.push({
        name: 'invoice_creation',
        status: 'skipped',
        message:
          'dryRun=true: se armó el payload, pero no se emite factura.',
      });

      return {
        status: 'completed',
        canContinue: true,
        tlqvCode,
        stopAfter,
        dryRun,
        steps,
        clienteFlow,
        xubioClienteId,
        sourceData: sourceDataResult.sourceData,
        invoiceBuild,
        nextStep: 'invoice_creation',
      };
    }

    if (this.createXubioInvoiceRepository === undefined) {
      const blocker = {
        code: 'INVOICE_CREATION_REPOSITORY_NOT_CONFIGURED',
        message:
          'El repositorio de creación de facturas Xubio no está configurado.',
        step: 'invoice_creation' as const,
      };

      steps.push({
        name: 'invoice_creation',
        status: 'blocked',
        blockers: [blocker],
      });

      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode,
        stopAfter,
        dryRun,
        steps,
        clienteFlow,
        xubioClienteId,
        sourceData: sourceDataResult.sourceData,
        invoiceBuild,
        blockers: [blocker],
      };
    }

    let createdInvoice: CreateXubioInvoiceResponse;
    try {
      createdInvoice = await this.createXubioInvoiceRepository.create({
        invoice: invoiceBuild.invoice,
      });
    } catch (error: unknown) {
      const blocker = buildXubioInvoiceCreationBlocker(error);
      steps.push({
        name: 'invoice_creation',
        status: 'blocked',
        blockers: [blocker],
      });

      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode,
        stopAfter,
        dryRun,
        steps,
        clienteFlow,
        xubioClienteId,
        sourceData: sourceDataResult.sourceData,
        invoiceBuild,
        blockers: [blocker],
      };
    }

    steps.push({
      name: 'invoice_creation',
      status: 'completed',
      message: 'Factura creada en Xubio.',
    });

    return {
      status: 'completed',
      canContinue: true,
      tlqvCode,
      stopAfter,
      dryRun,
      steps,
      clienteFlow,
      xubioClienteId,
      sourceData: sourceDataResult.sourceData,
      invoiceBuild,
      createdInvoice,
    };
  }

  private async getSourceData(
    tlqvCode: string,
  ): Promise<
    | {
        status: 'completed';
        sourceData: TlqvInvoiceFlowSourceData;
        step: TlqvInvoiceFlowStep;
      }
    | {
        status: 'blocked';
        sourceData?: TlqvInvoiceFlowSourceData;
        blockers: TlqvInvoiceFlowBlocker[];
        step: TlqvInvoiceFlowStep;
      }
  > {
    let sourceData: TlqvInvoiceFlowSourceData;

    try {
      const [tlqvSheet, madreSheet] = await Promise.all([
        this.tlqvSheetRepository.getByCode({ tlqvCode }),
        this.madreSheetRepository.getByTlqvCode({ tlqvCode }),
      ]);
      sourceData = { tlqvSheet, madreSheet };
    } catch (error: unknown) {
      const blocker = {
        code: 'SPREADSHEET_SOURCE_DATA_UNAVAILABLE',
        message: `No se pudieron obtener los datos de TLQV/MADRE desde Spreadsheet API. ${getErrorMessage(error)}`,
        step: 'source_data' as const,
      };

      return {
        status: 'blocked',
        blockers: [blocker],
        step: {
          name: 'source_data',
          status: 'blocked',
          blockers: [blocker],
        },
      };
    }

    const blockers: TlqvInvoiceFlowBlocker[] = [];
    if (!sourceData.tlqvSheet.found) {
      blockers.push({
        code: 'TLQV_SHEET_ITEM_NOT_FOUND',
        message: `${tlqvCode} no existe en la solapa TLQV de prueba-lectura.`,
        step: 'source_data',
      });
    }
    if (!sourceData.madreSheet.found) {
      blockers.push({
        code: 'MADRE_SHEET_ITEM_NOT_FOUND',
        message: `${tlqvCode} no existe en la solapa MADRE de prueba-lectura.`,
        step: 'source_data',
      });
    }

    if (blockers.length > 0) {
      return {
        status: 'blocked',
        sourceData,
        blockers,
        step: {
          name: 'source_data',
          status: 'blocked',
          blockers,
        },
      };
    }

    return {
      status: 'completed',
      sourceData,
      step: {
        name: 'source_data',
        status: 'completed',
        message: 'Datos obtenidos desde solapas TLQV y MADRE.',
      },
    };
  }
}

function buildClienteFlowBlockers(
  clienteFlow: CreateXubioClienteFromTlqvResponse,
): TlqvInvoiceFlowBlocker[] {
  if (clienteFlow.status === 'blocked') {
    return clienteFlow.blockers.map((blocker) => ({
      code: blocker.code,
      message: blocker.message,
      step: 'client',
    }));
  }

  if (clienteFlow.status === 'invalid_fiscal_document') {
    return [
      {
        code: 'INVALID_FISCAL_DOCUMENT',
        message: `${clienteFlow.tlqvCode} tiene un documento fiscal inválido. Se guarda como issue de cliente en Madre y se saltea la creación de factura. ${clienteFlow.invalidDocument.message}`,
        step: 'client',
      },
    ];
  }

  return [
    {
      code: 'CLIENT_FLOW_BLOCKED',
      message: 'El flujo de cliente no puede continuar.',
      step: 'client',
    },
  ];
}

function buildXubioInvoiceCreationBlocker(
  error: unknown,
): TlqvInvoiceFlowBlocker {
  const message = getErrorMessage(error);
  const normalizedMessage = normalizeForComparison(message);

  if (
    normalizedMessage.includes('FECHA MAYOR A LA FECHA DEL DOCUMENTO') ||
    normalizedMessage.includes('FECHA DEL DOCUMENTO QUE DESEA EMITIR')
  ) {
    return {
      code: 'XUBIO_INVOICE_DATE_SEQUENCE_ERROR',
      message: `Xubio no permite emitir este comprobante con esa fecha porque ya existe un comprobante posterior en la misma numeración. ${message}`,
      step: 'invoice_creation',
    };
  }

  return {
    code: 'XUBIO_INVOICE_CREATION_FAILED',
    message: `Xubio rechazó la creación de la factura. ${message}`,
    step: 'invoice_creation',
  };
}

function normalizeRequiredTlqvCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === '') {
    throw new RangeError('tlqvCode is required');
  }

  const match = normalized.match(/TLQV-\d+/);
  return match?.[0] ?? normalized;
}

function validateIssueDateTolerance(command: {
  issueDate: string | undefined;
  todayIsoDate: string;
}):
  | {
      valid: true;
      issueDate: string;
    }
  | {
      valid: false;
      blocker: TlqvInvoiceFlowBlocker;
    } {
  const today = parseIsoDateOnly(command.todayIsoDate);
  const issueDate = command.issueDate?.trim() ?? command.todayIsoDate.trim();
  const parsedIssueDate = parseIsoDateOnly(issueDate);

  if (today === null) {
    throw new RangeError('todayIsoDate must have YYYY-MM-DD format');
  }

  if (parsedIssueDate === null) {
    return {
      valid: false,
      blocker: {
        code: 'INVALID_INVOICE_ISSUE_DATE',
        message: 'issueDate must have YYYY-MM-DD format.',
        step: 'invoice_creation',
      },
    };
  }

  const differenceInDays = calculateDateDifferenceInDays(
    parsedIssueDate,
    today,
  );

  if (differenceInDays < 0) {
    return {
      valid: false,
      blocker: {
        code: 'INVALID_INVOICE_ISSUE_DATE',
        message: 'issueDate cannot be in the future.',
        step: 'invoice_creation',
      },
    };
  }

  if (differenceInDays > 10) {
    return {
      valid: false,
      blocker: {
        code: 'INVALID_INVOICE_ISSUE_DATE',
        message: 'issueDate cannot be older than 10 days.',
        step: 'invoice_creation',
      },
    };
  }

  return {
    valid: true,
    issueDate,
  };
}

function parseIsoDateOnly(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function calculateDateDifferenceInDays(from: Date, to: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1_000;
  return Math.round((to.getTime() - from.getTime()) / millisecondsPerDay);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }

  return 'unknown error';
}

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
