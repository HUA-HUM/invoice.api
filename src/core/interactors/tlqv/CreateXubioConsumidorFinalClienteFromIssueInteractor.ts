import type { IInvoiceClientIssueRepository } from '../../adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import type { ICreateXubioClienteRepository } from '../../adapters/repositories/xubio/clientes/ICreateXubioClienteRepository';
import type { InvoiceClientIssue } from '../../entities/invoice/client-issues/InvoiceClientIssue';
import type {
  CreateXubioClienteResponse,
  XubioClientePayload,
} from '../../entities/xubio/clientes/XubioCliente';

const DEFAULT_PAIS_CODIGO = 'ARGENTINA';
const DEFAULT_DESCRIPCION = 'Cliente creado automáticamente desde TLQV';
const CONSUMIDOR_FINAL_CATEGORIA_FISCAL = 'CF';
const DNI_IDENTIFICACION_TRIBUTARIA = 'DNI';
const INVALID_FISCAL_DOCUMENT_REASON = 'INVALID_FISCAL_DOCUMENT';

export type CreateXubioConsumidorFinalClienteFromIssueStatus =
  'created' | 'already_exists' | 'blocked';

export type CreateXubioConsumidorFinalClienteFromIssueBlockerCode =
  | 'ISSUE_NOT_FOUND'
  | 'ISSUE_REASON_NOT_SUPPORTED'
  | 'ISSUE_NOT_OPEN'
  | 'MISSING_DNI'
  | 'MISSING_BUYER_NAME';

export interface CreateXubioConsumidorFinalClienteFromIssueCommand {
  tlqvCode: string;
  issueId?: number;
  dni?: string;
}

export interface CreateXubioConsumidorFinalClienteFromIssueBlocker {
  code: CreateXubioConsumidorFinalClienteFromIssueBlockerCode;
  message: string;
}

interface CreateXubioConsumidorFinalClienteFromIssueBaseResponse {
  status: CreateXubioConsumidorFinalClienteFromIssueStatus;
  canContinue: boolean;
  tlqvCode: string;
  issue?: InvoiceClientIssue;
  dni?: string;
  usrCode?: string;
}

export type CreateXubioConsumidorFinalClienteFromIssueResponse =
  | (CreateXubioConsumidorFinalClienteFromIssueBaseResponse & {
      status: 'blocked';
      canContinue: false;
      blockers: CreateXubioConsumidorFinalClienteFromIssueBlocker[];
    })
  | (CreateXubioConsumidorFinalClienteFromIssueBaseResponse & {
      status: 'created' | 'already_exists';
      canContinue: true;
      dni: string;
      usrCode: string;
      xubioClienteResult: CreateXubioClienteResponse;
    });

interface ConsumidorFinalClienteData {
  payload: XubioClientePayload;
  dni: string;
  usrCode: string;
  buyerName: string;
}

type ConsumidorFinalClienteDataResult =
  | {
      ok: true;
      value: ConsumidorFinalClienteData;
    }
  | {
      ok: false;
      blockers: CreateXubioConsumidorFinalClienteFromIssueBlocker[];
    };

export class CreateXubioConsumidorFinalClienteFromIssueInteractor {
  constructor(
    private readonly invoiceClientIssueRepository: IInvoiceClientIssueRepository,
    private readonly createXubioClienteRepository: ICreateXubioClienteRepository,
    private readonly getNow: () => Date = () => new Date(),
  ) {}

  async execute(
    command: CreateXubioConsumidorFinalClienteFromIssueCommand,
  ): Promise<CreateXubioConsumidorFinalClienteFromIssueResponse> {
    const tlqvCode = normalizeRequiredString(command.tlqvCode, 'tlqvCode');
    const issueResponse = await this.invoiceClientIssueRepository.getByTlqvCode(
      {
        tlqvCode,
      },
    );
    const issue = selectIssue(issueResponse.items, command.issueId);

    if (issue === null) {
      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode,
        blockers: [
          {
            code: 'ISSUE_NOT_FOUND',
            message:
              command.issueId === undefined
                ? `${tlqvCode} does not have an invalid fiscal document issue in Madre.`
                : `${tlqvCode} does not have issue id ${command.issueId} in Madre.`,
          },
        ],
      };
    }

    const issueBlocker = buildIssueBlocker(issue);
    if (issueBlocker !== null) {
      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode,
        issue,
        blockers: [issueBlocker],
      };
    }

    const clienteData = buildConsumidorFinalClienteData(issue, command);
    if (!clienteData.ok) {
      return {
        status: 'blocked',
        canContinue: false,
        tlqvCode,
        issue,
        blockers: clienteData.blockers,
      };
    }

    const xubioClienteResult = await this.createXubioClienteRepository.create({
      cliente: clienteData.value.payload,
    });

    if (xubioClienteResult.status === 'already_exists') {
      await this.invoiceClientIssueRepository.upsert({
        tlqvCode,
        reason: 'XUBIO_CLIENT_ALREADY_EXISTS',
        source: 'xubio',
        saleNumber: issue.saleNumber,
        buyerName: clienteData.value.buyerName,
        email: issue.email,
        documentoTipo: DNI_IDENTIFICACION_TRIBUTARIA,
        documentoNro: clienteData.value.dni,
        documentoNroDigits: clienteData.value.dni,
        message:
          xubioClienteResult.alreadyExistsDetail ??
          'Xubio cliente already exists',
        messages: [
          xubioClienteResult.alreadyExistsDetail ??
            'Xubio cliente already exists',
        ],
        rawPayload: xubioClienteResult.rawPayload,
        metadata: {
          source: 'create_xubio_consumidor_final_cliente_from_issue',
          sourceIssueId: issue.id,
          sourceIssueKey: issue.key,
          usrCode: clienteData.value.usrCode,
        },
        now: this.getNow(),
      });
    }

    return {
      status: xubioClienteResult.status,
      canContinue: true,
      tlqvCode,
      issue,
      dni: clienteData.value.dni,
      usrCode: clienteData.value.usrCode,
      xubioClienteResult,
    };
  }
}

function selectIssue(
  items: InvoiceClientIssue[],
  issueId: number | undefined,
): InvoiceClientIssue | null {
  if (issueId !== undefined) {
    return items.find((item) => item.id === issueId) ?? null;
  }

  const invalidFiscalDocumentIssues = items
    .filter((item) => item.reason === INVALID_FISCAL_DOCUMENT_REASON)
    .sort(compareIssuesByLastSeenDesc);
  const openIssue = invalidFiscalDocumentIssues.find(
    (item) => item.status === undefined || item.status === 'open',
  );

  return openIssue ?? invalidFiscalDocumentIssues[0] ?? null;
}

function buildIssueBlocker(
  issue: InvoiceClientIssue,
): CreateXubioConsumidorFinalClienteFromIssueBlocker | null {
  if (issue.reason !== INVALID_FISCAL_DOCUMENT_REASON) {
    return {
      code: 'ISSUE_REASON_NOT_SUPPORTED',
      message: `Issue ${issue.id ?? issue.key ?? issue.tlqvCode} has reason ${issue.reason}. Only INVALID_FISCAL_DOCUMENT can be created as consumidor final.`,
    };
  }

  if (issue.status !== undefined && issue.status !== 'open') {
    return {
      code: 'ISSUE_NOT_OPEN',
      message: `Issue ${issue.id ?? issue.key ?? issue.tlqvCode} is ${issue.status}, not open.`,
    };
  }

  return null;
}

function buildConsumidorFinalClienteData(
  issue: InvoiceClientIssue,
  command: CreateXubioConsumidorFinalClienteFromIssueCommand,
): ConsumidorFinalClienteDataResult {
  const blockers: CreateXubioConsumidorFinalClienteFromIssueBlocker[] = [];
  const dni =
    normalizeDniDigits(command.dni) ?? deriveDniDigitsFromIssue(issue);
  const buyerName = getBuyerName(issue);

  if (dni === null) {
    blockers.push({
      code: 'MISSING_DNI',
      message: `${issue.tlqvCode} does not have a valid DNI derivable from the issue. Pass dni explicitly.`,
    });
  }

  if (buyerName === null) {
    blockers.push({
      code: 'MISSING_BUYER_NAME',
      message: `${issue.tlqvCode} does not have buyerName in the issue metadata.`,
    });
  }

  if (blockers.length > 0 || dni === null || buyerName === null) {
    return { ok: false, blockers };
  }

  const originalDocumentoDigits = getOriginalDocumentoDigits(issue) ?? dni;
  const nameParts = splitName(buyerName);
  const provincia = getIssueMetadataString(issue, 'provincia');
  const usrCode = `TLQV-${originalDocumentoDigits}`;
  const formattedDni = formatDni(dni);
  const payload: XubioClientePayload = {
    nombre: buyerName,
    razonSocial: buyerName,
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
    direccion: getIssueMetadataString(issue, 'direccion'),
    codigoPostal: normalizeCodigoPostal(
      getIssueMetadataString(issue, 'codigoPostal'),
    ),
    provincia:
      provincia === null
        ? null
        : {
            nombre: provincia,
          },
    usrCode,
    descripcion: DEFAULT_DESCRIPCION,
    esclienteextranjero: 0,
    esProveedor: 0,
  };

  return {
    ok: true,
    value: {
      payload,
      dni,
      usrCode,
      buyerName,
    },
  };
}

function getBuyerName(issue: InvoiceClientIssue): string | null {
  return (
    normalizeOptionalString(issue.buyerName) ??
    getIssueMetadataString(issue, 'nombreDestinatario') ??
    getIssueMetadataString(issue, 'nombre') ??
    getIssueMetadataString(issue, 'razonSocial')
  );
}

function deriveDniDigitsFromIssue(issue: InvoiceClientIssue): string | null {
  const documentoDigits = getOriginalDocumentoDigits(issue);
  if (documentoDigits === null) {
    return null;
  }

  if (documentoDigits.length === 11) {
    return documentoDigits.slice(2, 10);
  }

  return isDniLength(documentoDigits) ? documentoDigits : null;
}

function getOriginalDocumentoDigits(issue: InvoiceClientIssue): string | null {
  return (
    normalizeDigits(issue.documentoNroDigits) ??
    normalizeDigits(issue.documentoNro) ??
    normalizeDigits(issue.cuit)
  );
}

function normalizeDniDigits(value: string | null | undefined): string | null {
  const digits = normalizeDigits(value);
  if (digits === null) {
    return null;
  }

  if (digits.length === 11) {
    return digits.slice(2, 10);
  }

  return isDniLength(digits) ? digits : null;
}

function isDniLength(value: string): boolean {
  return value.length >= 7 && value.length <= 8;
}

function formatDni(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function normalizeDigits(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const digits = value.replace(/\D/g, '');
  return digits === '' ? null : digits;
}

function getIssueMetadataString(
  issue: InvoiceClientIssue,
  field: string,
): string | null {
  return (
    getNestedMetadataString(issue.metadata, ['flokzuBuyerData', field]) ??
    getNestedMetadataString(issue.metadata, ['buyerData', field]) ??
    getNestedMetadataString(issue.metadata, ['buyer', field]) ??
    getNestedMetadataString(issue.metadata, [field])
  );
}

function getNestedMetadataString(
  metadata: unknown,
  path: string[],
): string | null {
  let currentValue = metadata;
  for (const key of path) {
    if (!isRecord(currentValue)) {
      return null;
    }
    currentValue = currentValue[key];
  }

  return normalizeOptionalString(
    typeof currentValue === 'string' ? currentValue : null,
  );
}

function normalizeCodigoPostal(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return value.replace(/^CP:\s*/i, '').trim();
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

function compareIssuesByLastSeenDesc(
  first: InvoiceClientIssue,
  second: InvoiceClientIssue,
): number {
  return readIssueTimestamp(second) - readIssueTimestamp(first);
}

function readIssueTimestamp(issue: InvoiceClientIssue): number {
  const timestamp = Date.parse(issue.lastSeenAt || issue.firstSeenAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeRequiredString(value: string, field: string): string {
  const trimmedValue = value.trim();
  if (trimmedValue === '') {
    throw new RangeError(`${field} cannot be empty`);
  }

  return trimmedValue;
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === '' ? null : trimmedValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
