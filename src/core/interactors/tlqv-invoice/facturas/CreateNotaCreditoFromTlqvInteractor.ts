import type { IMadreXubioComprobantesRepository } from '../../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type {
  MadreXubioComprobante,
  MadreXubioProductItem,
} from '../../../entities/madre-api/xubio/comprobantes/MadreXubioComprobante';
import type {
  CreateXubioInvoiceCommand,
  CreateXubioInvoiceResponse,
  XubioInvoice,
  XubioInvoiceItem,
} from '../../../entities/xubio/facturas/XubioInvoice';

export type CreateNotaCreditoStatus = 'created' | 'skipped' | 'blocked';

export type CreateNotaCreditoBlockerCode =
  | 'COMPROBANTES_LOOKUP_FAILED'
  | 'NO_LIVE_INVOICE'
  | 'ALREADY_CANCELLED'
  | 'INVOICE_HAS_NO_ITEMS'
  | 'INVOICE_DATA_INCOMPLETE'
  | 'NOTA_CREDITO_CREATION_FAILED';

export interface CreateNotaCreditoBlocker {
  code: CreateNotaCreditoBlockerCode;
  message: string;
}

export interface CreateNotaCreditoFromTlqvCommand {
  tlqvCode: string;
  dryRun?: boolean;
  issueDate?: string;
}

export interface CreateNotaCreditoFromTlqvResponse {
  status: CreateNotaCreditoStatus;
  tlqvCode: string;
  dryRun: boolean;
  cancelledInvoice?: {
    xubioTransactionId: number;
    numeroDocumento?: string | null;
    letra?: string | null;
    importeTotal?: number | null;
  };
  notaCredito?: XubioInvoice;
  createdNotaCredito?: CreateXubioInvoiceResponse;
  /**
   * Xubio creates the comprobante without asking AFIP for a CAE — that is a
   * separate, manual step, the same way facturas work here. Until it is
   * requested the nota de crédito exists in Xubio and not for AFIP, so the
   * caller is told explicitly rather than assuming "created" means "issued".
   */
  caeStatus?: {
    cae: string | null;
    fiscalmenteEmitido: boolean;
    pendiente: boolean;
  };
  blockers: CreateNotaCreditoBlocker[];
}

export interface ICreateXubioNotaCreditoRepository {
  create(
    command: CreateXubioInvoiceCommand,
  ): Promise<CreateXubioInvoiceResponse>;
}

/**
 * Issues the nota de crédito that cancels the live factura of a TLQV, copying
 * its concepts as they were invoiced.
 *
 * The factura to cancel is never taken on trust: it is read back from Madre,
 * and a factura that already has a nota de crédito pointing at it is reported
 * as skipped rather than cancelled twice — a second one would have to be
 * compensated in turn, the same reasoning behind ALREADY_BILLED on the
 * invoicing side.
 *
 * Xubio only creates the comprobante here; the CAE is requested by hand
 * afterwards, as it is for facturas. So a 'created' nota de crédito exists in
 * Xubio and not yet for AFIP — caeStatus says which.
 */
export class CreateNotaCreditoFromTlqvInteractor {
  constructor(
    private readonly madreXubioComprobantesRepository: IMadreXubioComprobantesRepository,
    private readonly createXubioNotaCreditoRepository?: ICreateXubioNotaCreditoRepository,
    private readonly getTodayIsoDate: () => string = () =>
      new Date().toISOString().slice(0, 10),
  ) {}

  async execute(
    command: CreateNotaCreditoFromTlqvCommand,
  ): Promise<CreateNotaCreditoFromTlqvResponse> {
    const tlqvCode = normalizeRequiredTlqvCode(command.tlqvCode);
    const dryRun = command.dryRun ?? true;

    let comprobantes: MadreXubioComprobante[];
    try {
      const response =
        await this.madreXubioComprobantesRepository.findFullByTlqvCode({
          tlqvCode,
        });
      comprobantes = response.items;
    } catch (error: unknown) {
      return blocked(tlqvCode, dryRun, {
        code: 'COMPROBANTES_LOOKUP_FAILED',
        message: `No se pudieron leer los comprobantes de ${tlqvCode} en Madre. ${readErrorMessage(error)}`,
      });
    }

    const facturas = comprobantes.filter((item) => !isCreditNote(item));
    const cancelledIds = readCancelledTransactionIds(comprobantes);
    const live = facturas.filter(
      (factura) => !cancelledIds.has(factura.xubioTransactionId),
    );

    if (facturas.length === 0) {
      return blocked(tlqvCode, dryRun, {
        code: 'NO_LIVE_INVOICE',
        message: `${tlqvCode} no tiene facturas en Madre.`,
      });
    }

    if (live.length === 0) {
      return {
        status: 'skipped',
        tlqvCode,
        dryRun,
        blockers: [
          {
            code: 'ALREADY_CANCELLED',
            message: `Todas las facturas de ${tlqvCode} ya tienen nota de crédito. No se emite otra.`,
          },
        ],
      };
    }

    // Newest first: if several are live, the last one issued is the one being
    // corrected.
    const factura = [...live].sort((left, right) =>
      String(right.fechaEmision).localeCompare(String(left.fechaEmision)),
    )[0];

    const build = buildNotaCredito({
      factura,
      issueDate: command.issueDate ?? this.getTodayIsoDate(),
    });

    if (build.blocker !== undefined) {
      return blocked(tlqvCode, dryRun, build.blocker);
    }

    const cancelledInvoice = {
      xubioTransactionId: factura.xubioTransactionId,
      numeroDocumento: factura.numeroDocumento,
      letra: factura.letraComprobante,
      importeTotal: factura.importeTotal,
    };

    if (dryRun) {
      return {
        status: 'skipped',
        tlqvCode,
        dryRun,
        cancelledInvoice,
        notaCredito: build.notaCredito,
        blockers: [],
      };
    }

    if (this.createXubioNotaCreditoRepository === undefined) {
      return blocked(
        tlqvCode,
        dryRun,
        {
          code: 'NOTA_CREDITO_CREATION_FAILED',
          message:
            'El repositorio de creación de notas de crédito no está configurado.',
        },
        cancelledInvoice,
        build.notaCredito,
      );
    }

    try {
      const createdNotaCredito =
        await this.createXubioNotaCreditoRepository.create({
          invoice: build.notaCredito,
        });

      const cae = createdNotaCredito.invoice.cae ?? null;

      return {
        status: 'created',
        tlqvCode,
        dryRun,
        cancelledInvoice,
        notaCredito: build.notaCredito,
        createdNotaCredito,
        caeStatus: {
          cae,
          fiscalmenteEmitido: cae !== null && cae.trim() !== '',
          pendiente: cae === null || cae.trim() === '',
        },
        blockers: [],
      };
    } catch (error: unknown) {
      return blocked(
        tlqvCode,
        dryRun,
        {
          code: 'NOTA_CREDITO_CREATION_FAILED',
          message: `Xubio rechazó la nota de crédito de ${tlqvCode}. ${readErrorMessage(error)}`,
        },
        cancelledInvoice,
        build.notaCredito,
      );
    }
  }
}

function buildNotaCredito(command: {
  factura: MadreXubioComprobante;
  issueDate: string;
}): { notaCredito: XubioInvoice; blocker?: CreateNotaCreditoBlocker } {
  const { factura, issueDate } = command;
  const productItems = factura.productItems ?? [];

  if (productItems.length === 0) {
    return {
      notaCredito: {} as XubioInvoice,
      blocker: {
        code: 'INVOICE_HAS_NO_ITEMS',
        message: `La factura ${factura.numeroDocumento ?? factura.xubioTransactionId} no tiene items en Madre; no se puede replicar en la nota de crédito.`,
      },
    };
  }

  if (
    factura.clienteXubioId === undefined ||
    factura.clienteXubioId === null ||
    factura.puntoVentaId === undefined ||
    factura.puntoVentaId === null
  ) {
    return {
      notaCredito: {} as XubioInvoice,
      blocker: {
        code: 'INVOICE_DATA_INCOMPLETE',
        message: `La factura ${factura.numeroDocumento ?? factura.xubioTransactionId} no tiene cliente o punto de venta en Madre.`,
      },
    };
  }

  const items: XubioInvoiceItem[] = [];
  for (const item of productItems) {
    const mapped = toInvoiceItem(item);
    if (mapped === null) {
      return {
        notaCredito: {} as XubioInvoice,
        blocker: {
          code: 'INVOICE_DATA_INCOMPLETE',
          message: `Un item de la factura ${factura.numeroDocumento ?? factura.xubioTransactionId} no tiene producto, depósito o precio; no se puede replicar.`,
        },
      };
    }
    items.push(mapped);
  }

  return {
    notaCredito: {
      type: 'NotaCredito',
      letter: normalizeLetter(factura.letraComprobante),
      customerId: factura.clienteXubioId,
      issueDate,
      dueDate: issueDate,
      pointOfSaleId: factura.puntoVentaId,
      description: factura.descripcion ?? '',
      exchangeRate: 1,
      items,
      relatedDocument: { id: factura.xubioTransactionId },
    },
  };
}

function toInvoiceItem(item: MadreXubioProductItem): XubioInvoiceItem | null {
  if (
    item.productoId === undefined ||
    item.productoId === null ||
    item.depositoId === undefined ||
    item.depositoId === null ||
    item.precio === undefined ||
    item.precio === null
  ) {
    return null;
  }

  return {
    productId: item.productoId,
    warehouseId: item.depositoId,
    description: item.descripcion ?? item.productoNombre ?? '',
    quantity: item.cantidad ?? 1,
    unitPrice: item.precio,
    priceWithVat: item.precioConIvaIncluido ?? 0,
    discountPercentage: item.porcentajeDescuento ?? 0,
  };
}

function normalizeLetter(value: string | null | undefined): 'A' | 'B' {
  return String(value ?? '').toUpperCase() === 'A' ? 'A' : 'B';
}

function isCreditNote(item: MadreXubioComprobante): boolean {
  return item.documentKind === 'CREDIT_NOTE';
}

function readCancelledTransactionIds(
  comprobantes: MadreXubioComprobante[],
): Set<number> {
  const ids = new Set<number>();
  for (const comprobante of comprobantes) {
    if (!isCreditNote(comprobante)) {
      continue;
    }

    const payload = comprobante.rawDetailPayload;
    if (typeof payload !== 'object' || payload === null) {
      continue;
    }

    const value = (payload as Record<string, unknown>).comprobante;
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      ids.add(value);
    }
  }

  return ids;
}

function blocked(
  tlqvCode: string,
  dryRun: boolean,
  blocker: CreateNotaCreditoBlocker,
  cancelledInvoice?: CreateNotaCreditoFromTlqvResponse['cancelledInvoice'],
  notaCredito?: XubioInvoice,
): CreateNotaCreditoFromTlqvResponse {
  return {
    status: 'blocked',
    tlqvCode,
    dryRun,
    cancelledInvoice,
    notaCredito,
    blockers: [blocker],
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

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }

  return 'unknown error';
}
