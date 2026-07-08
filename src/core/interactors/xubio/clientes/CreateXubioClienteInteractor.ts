import type { IInvoiceClientIssueRepository } from '../../../adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import type { ICreateXubioClienteRepository } from '../../../adapters/repositories/xubio/clientes/ICreateXubioClienteRepository';
import type {
  CreateXubioClienteFromFiscalInfoCommand,
  CreateXubioClienteFromFiscalInfoResponse,
  XubioCategoriaFiscalCodigo,
  XubioClientePayload,
} from '../../../entities/xubio/clientes/XubioCliente';

const DEFAULT_PAIS_CODIGO = 'ARGENTINA';
const DEFAULT_DESCRIPCION = 'Cliente creado automáticamente desde TLQV';

export class CreateXubioClienteInteractor {
  constructor(
    private readonly createXubioClienteRepository: ICreateXubioClienteRepository,
    private readonly invoiceClientIssueRepository?: IInvoiceClientIssueRepository,
    private readonly getNow: () => Date = () => new Date(),
  ) {}

  async execute(
    command: CreateXubioClienteFromFiscalInfoCommand,
  ): Promise<CreateXubioClienteFromFiscalInfoResponse> {
    const response = await this.createXubioClienteRepository.create({
      cliente: buildClientePayload(command),
    });

    if (
      response.status === 'already_exists' &&
      command.tlqvCode !== undefined &&
      command.tlqvCode.trim() !== '' &&
      this.invoiceClientIssueRepository !== undefined
    ) {
      await this.invoiceClientIssueRepository.upsert({
        tlqvCode: command.tlqvCode.trim(),
        reason: 'XUBIO_CLIENT_ALREADY_EXISTS',
        source: 'xubio',
        cuit: command.cuit,
        documentoTipo: command.documentoTipo ?? 'CUIT',
        message: response.alreadyExistsDetail ?? 'Xubio cliente already exists',
        messages: [
          response.alreadyExistsDetail ?? 'Xubio cliente already exists',
        ],
        rawPayload: response.rawPayload,
        now: this.getNow(),
      });
    }

    return response;
  }
}

function buildClientePayload(
  command: CreateXubioClienteFromFiscalInfoCommand,
): XubioClientePayload {
  const cuitDigits = normalizeCuitDigits(command.cuit);
  const cuit = formatCuit(cuitDigits);
  const razonSocial = normalizeRequiredString(
    command.razonSocial,
    'razonSocial',
  );
  const nombre = normalizeOptionalString(command.nombre) ?? razonSocial;
  const nameParts = splitName(nombre);
  const primerNombre =
    normalizeOptionalString(command.primerNombre) ?? nameParts.primerNombre;
  const primerApellido =
    normalizeOptionalString(command.primerApellido) ?? nameParts.primerApellido;
  const codigoPostal = normalizeOptionalCodigoPostal(command.codigoPostal);
  const provincia = normalizeOptionalString(command.provincia);

  return {
    nombre,
    razonSocial,
    primerNombre,
    primerApellido,
    identificacionTributaria: {
      codigo: command.documentoTipo ?? 'CUIT',
    },
    categoriaFiscal: {
      codigo:
        command.categoriaFiscalCodigo ??
        mapCondicionImpositivaToCategoriaFiscalCodigo(
          command.condicionImpositiva,
        ),
    },
    pais: {
      codigo: DEFAULT_PAIS_CODIGO,
    },
    cuit,
    CUIT: cuit,
    direccion: normalizeOptionalString(command.direccion),
    codigoPostal,
    provincia:
      provincia === null
        ? null
        : {
            nombre: provincia,
          },
    usrCode: `TLQV-${cuitDigits}`,
    descripcion:
      normalizeOptionalString(command.descripcion) ?? DEFAULT_DESCRIPCION,
    esclienteextranjero: 0,
    esProveedor: 0,
  };
}

function mapCondicionImpositivaToCategoriaFiscalCodigo(
  value: string,
): XubioCategoriaFiscalCodigo {
  const normalizedValue = normalizeForComparison(value);

  if (normalizedValue.includes('MONOTRIBUTO')) {
    return 'MT';
  }

  if (
    normalizedValue.includes('RESPONSABLE INSCRIPTO') ||
    normalizedValue.includes('IVA RESPONSABLE')
  ) {
    return 'RI';
  }

  if (normalizedValue.includes('CONSUMIDOR FINAL')) {
    return 'CF';
  }

  if (normalizedValue.includes('EXENTO')) {
    return 'EX';
  }

  throw new RangeError(
    `Unsupported condicionImpositiva "${value}". Pass categoriaFiscalCodigo explicitly.`,
  );
}

function normalizeCuitDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) {
    throw new RangeError('cuit must contain exactly 11 digits');
  }

  return digits;
}

function formatCuit(digits: string): string {
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
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

function normalizeOptionalCodigoPostal(
  value: string | null | undefined,
): string | null {
  const normalizedValue = normalizeOptionalString(value);
  if (normalizedValue === null) {
    return null;
  }

  return normalizedValue.replace(/^CP:\s*/i, '').trim();
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

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}
