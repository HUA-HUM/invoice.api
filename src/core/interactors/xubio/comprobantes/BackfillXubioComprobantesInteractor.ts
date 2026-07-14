import type { IMadreXubioComprobantesRepository } from '../../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { IGetComprobanteDetailRepository } from '../../../adapters/repositories/xubio/comprobantes/IGetComprobanteDetailRepository';
import type { IGetComprobantesByDateRepository } from '../../../adapters/repositories/xubio/comprobantes/IGetComprobantesByDateRepository';
import type {
  MadreXubioComprobante,
  MadreXubioComprobanteDocumentKind,
} from '../../../entities/madre-api/xubio/comprobantes/MadreXubioComprobante';
import type {
  XubioCaeExpirationDate,
  XubioComprobanteDetail,
  XubioComprobanteSummary,
} from '../../../entities/xubio/comprobantes/XubioComprobante';

const DEFAULT_FECHA_DESDE = '2025-01-01';
const DEFAULT_XUBIO_LIMIT = 100;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_WINDOW_SIZE_DAYS = 3;
const MAX_XUBIO_LIMIT = 10_000;
const MAX_BATCH_SIZE = 500;
const MAX_WINDOW_SIZE_DAYS = 31;

export interface BackfillXubioComprobantesCommand {
  fechaDesde?: string;
  fechaHasta?: string;
  batchSize?: number;
  windowSizeDays?: number;
  xubioLimit?: number;
  syncRunId?: number;
}

export interface NormalizedBackfillXubioComprobantesCommand {
  fechaDesde: string;
  fechaHasta: string;
  batchSize: number;
  windowSizeDays: number;
  xubioLimit: number;
  syncRunId?: number;
}

export interface BackfillXubioComprobantesResponse {
  syncRunId: number;
  status: 'completed' | 'partial';
  fechaDesde: string;
  fechaHasta: string;
  totalListed: number;
  totalDetailRequests: number;
  totalInserted: number;
  totalUpdated: number;
  totalFailed: number;
  xubioLimit: number;
  batchWindows: DateWindow[];
  splitWindows: DateWindow[];
  saturatedWindows: DateWindow[];
}

export interface BackfillXubioComprobantesLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const noopLogger: BackfillXubioComprobantesLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export interface NormalizeBackfillXubioComprobantesOptions {
  defaultXubioLimit?: number;
}

export function normalizeBackfillXubioComprobantesCommand(
  command: BackfillXubioComprobantesCommand = {},
  now: () => Date = () => new Date(),
  options: NormalizeBackfillXubioComprobantesOptions = {},
): NormalizedBackfillXubioComprobantesCommand {
  const fechaDesde = command.fechaDesde ?? DEFAULT_FECHA_DESDE;
  const fechaHasta = command.fechaHasta ?? formatDate(now());
  const batchSize = command.batchSize ?? DEFAULT_BATCH_SIZE;
  const windowSizeDays = command.windowSizeDays ?? DEFAULT_WINDOW_SIZE_DAYS;
  const xubioLimit =
    command.xubioLimit ?? options.defaultXubioLimit ?? DEFAULT_XUBIO_LIMIT;

  validateDateRange(fechaDesde, fechaHasta);
  validateBatchSize(batchSize);
  validateWindowSizeDays(windowSizeDays);
  validateXubioLimit(xubioLimit);
  validateOptionalSyncRunId(command.syncRunId);

  return {
    fechaDesde,
    fechaHasta,
    batchSize,
    windowSizeDays,
    xubioLimit,
    syncRunId: command.syncRunId,
  };
}

export function buildSyncRunMetadata(
  batchSize: number,
  windowSizeDays: number,
  executionMode: 'blocking' | 'queued' = 'blocking',
  xubioLimit: number = DEFAULT_XUBIO_LIMIT,
): Record<string, unknown> {
  return {
    strategy:
      executionMode === 'queued'
        ? 'queued_batch_windows_day_by_day'
        : 'batch_windows_day_by_day',
    xubioLimit,
    batchSize,
    windowSizeDays,
    executionMode,
  };
}

interface DateWindow {
  fechaDesde: string;
  fechaHasta: string;
}

interface Counters {
  totalListed: number;
  totalDetailRequests: number;
  totalInserted: number;
  totalUpdated: number;
  totalFailed: number;
}

export interface BackfillXubioComprobantesInteractorOptions {
  defaultXubioLimit?: number;
}

export class BackfillXubioComprobantesInteractor {
  private readonly defaultXubioLimit: number;

  constructor(
    private readonly getComprobantesByDateRepository: IGetComprobantesByDateRepository,
    private readonly getComprobanteDetailRepository: IGetComprobanteDetailRepository,
    private readonly madreXubioComprobantesRepository: IMadreXubioComprobantesRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly logger: BackfillXubioComprobantesLogger = noopLogger,
    options: BackfillXubioComprobantesInteractorOptions = {},
  ) {
    const defaultXubioLimit = options.defaultXubioLimit ?? DEFAULT_XUBIO_LIMIT;
    validateXubioLimit(defaultXubioLimit);
    this.defaultXubioLimit = defaultXubioLimit;
  }

  async execute(
    command: BackfillXubioComprobantesCommand = {},
  ): Promise<BackfillXubioComprobantesResponse> {
    const {
      fechaDesde,
      fechaHasta,
      batchSize,
      windowSizeDays,
      xubioLimit,
      syncRunId,
    } = normalizeBackfillXubioComprobantesCommand(command, this.now, {
      defaultXubioLimit: this.defaultXubioLimit,
    });

    const batchWindows = buildBatchWindows(
      fechaDesde,
      fechaHasta,
      windowSizeDays,
    );

    const syncRun =
      syncRunId === undefined
        ? await this.madreXubioComprobantesRepository.createSyncRun({
            syncType: 'historical_backfill',
            status: 'running',
            fechaDesde,
            fechaHasta,
            windowType: 'custom',
            metadata: buildSyncRunMetadata(
              batchSize,
              windowSizeDays,
              'blocking',
              xubioLimit,
            ),
          })
        : { id: syncRunId };

    const counters: Counters = {
      totalListed: 0,
      totalDetailRequests: 0,
      totalInserted: 0,
      totalUpdated: 0,
      totalFailed: 0,
    };
    const splitWindows: DateWindow[] = [];
    const saturatedWindows: DateWindow[] = [];

    try {
      this.logger.info('Xubio comprobantes backfill started', {
        syncRunId: syncRun.id,
        fechaDesde,
        fechaHasta,
        windowSizeDays,
        xubioLimit,
        batchWindows: batchWindows.length,
      });

      await this.updateSyncRunProgress(
        syncRun.id,
        'running',
        counters,
        saturatedWindows,
      );

      for (const batchWindow of batchWindows) {
        this.logger.info('Xubio comprobantes batch window started', {
          syncRunId: syncRun.id,
          fechaDesde: batchWindow.fechaDesde,
          fechaHasta: batchWindow.fechaHasta,
        });

        for (const dayWindow of buildDayWindows(
          batchWindow.fechaDesde,
          batchWindow.fechaHasta,
        )) {
          const summaries = await this.getSummaries(
            dayWindow,
            syncRun.id,
            xubioLimit,
          );
          counters.totalListed += summaries.length;

          await this.processSummaries(
            syncRun.id,
            summaries,
            batchSize,
            counters,
          );
        }

        await this.updateSyncRunProgress(
          syncRun.id,
          'running',
          counters,
          saturatedWindows,
        );
        this.logger.info('Xubio comprobantes batch window completed', {
          syncRunId: syncRun.id,
          fechaDesde: batchWindow.fechaDesde,
          fechaHasta: batchWindow.fechaHasta,
          totalListed: counters.totalListed,
          totalDetailRequests: counters.totalDetailRequests,
          totalInserted: counters.totalInserted,
          totalUpdated: counters.totalUpdated,
          totalFailed: counters.totalFailed,
        });
      }

      const status = saturatedWindows.length > 0 ? 'partial' : 'completed';
      await this.updateSyncRunProgress(
        syncRun.id,
        status,
        counters,
        saturatedWindows,
        this.now().toISOString(),
      );
      this.logger.info('Xubio comprobantes backfill completed', {
        syncRunId: syncRun.id,
        status,
        totalListed: counters.totalListed,
        totalDetailRequests: counters.totalDetailRequests,
        totalInserted: counters.totalInserted,
        totalUpdated: counters.totalUpdated,
        totalFailed: counters.totalFailed,
      });

      return {
        syncRunId: syncRun.id,
        status,
        fechaDesde,
        fechaHasta,
        xubioLimit,
        ...counters,
        batchWindows,
        splitWindows,
        saturatedWindows,
      };
    } catch (error: unknown) {
      this.logger.error('Xubio comprobantes backfill failed', {
        syncRunId: syncRun.id,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        totalListed: counters.totalListed,
        totalDetailRequests: counters.totalDetailRequests,
        totalInserted: counters.totalInserted,
        totalUpdated: counters.totalUpdated,
        totalFailed: counters.totalFailed,
      });

      await this.updateSyncRunProgress(
        syncRun.id,
        'failed',
        counters,
        saturatedWindows,
        this.now().toISOString(),
        error instanceof Error ? error.message : 'Unknown error',
      );

      throw error;
    }
  }

  private async getSummaries(
    window: DateWindow,
    syncRunId: number,
    xubioLimit: number,
  ): Promise<XubioComprobanteSummary[]> {
    this.logger.info('Getting Xubio comprobantes by day', {
      syncRunId,
      fechaDesde: window.fechaDesde,
      fechaHasta: window.fechaHasta,
      limit: xubioLimit,
    });

    const response = await this.getComprobantesByDateRepository.getByDateRange({
      fechaDesde: window.fechaDesde,
      fechaHasta: window.fechaHasta,
      limit: xubioLimit,
    });

    for (const pageDiagnostic of response.pageDiagnostics ?? []) {
      this.logger.info('Xubio comprobantes page listed', {
        syncRunId,
        fechaDesde: window.fechaDesde,
        fechaHasta: window.fechaHasta,
        page: pageDiagnostic.page,
        requestedLimit: pageDiagnostic.requestedLimit,
        requestedLastTransactionId: pageDiagnostic.requestedLastTransactionId,
        received: pageDiagnostic.received,
        uniqueAdded: pageDiagnostic.uniqueAdded,
        duplicated: pageDiagnostic.duplicated,
        firstTransactionId: pageDiagnostic.firstTransactionId,
        lastTransactionId: pageDiagnostic.lastTransactionId,
        shouldContinue: pageDiagnostic.shouldContinue,
        stopReason: pageDiagnostic.stopReason ?? null,
      });

      if (pageDiagnostic.stopReason !== undefined) {
        this.logger.warn('Xubio comprobantes pagination stopped defensively', {
          syncRunId,
          fechaDesde: window.fechaDesde,
          fechaHasta: window.fechaHasta,
          page: pageDiagnostic.page,
          requestedLimit: pageDiagnostic.requestedLimit,
          requestedLastTransactionId: pageDiagnostic.requestedLastTransactionId,
          received: pageDiagnostic.received,
          uniqueAdded: pageDiagnostic.uniqueAdded,
          duplicated: pageDiagnostic.duplicated,
          firstTransactionId: pageDiagnostic.firstTransactionId,
          lastTransactionId: pageDiagnostic.lastTransactionId,
          stopReason: pageDiagnostic.stopReason,
        });
      }
    }

    this.logger.info('Xubio comprobantes day listed', {
      syncRunId,
      fechaDesde: window.fechaDesde,
      fechaHasta: window.fechaHasta,
      totalListed: response.comprobantes.length,
      pages: response.pages,
      lastTransactionId: response.lastTransactionId,
    });

    return response.comprobantes;
  }

  private async processSummaries(
    syncRunId: number,
    summaries: XubioComprobanteSummary[],
    batchSize: number,
    counters: Counters,
  ): Promise<void> {
    let batch: MadreXubioComprobante[] = [];

    for (const summary of summaries) {
      try {
        const summaryTlqv = extractTlqv(summary.descripcion);
        this.logger.info('Getting Xubio comprobante detail', {
          syncRunId,
          xubioTransactionId: summary.transaccionid,
          numeroDocumento: summary.numeroDocumento,
          tlqvCode: summaryTlqv?.code ?? null,
        });

        counters.totalDetailRequests += 1;
        const detailResponse =
          await this.getComprobanteDetailRepository.getDetail({
            transaccionId: summary.transaccionid,
          });

        const comprobante = mapToMadreComprobante(
          syncRunId,
          summary,
          detailResponse.comprobante,
        );
        this.logger.info('Xubio comprobante detail mapped', {
          syncRunId,
          xubioTransactionId: comprobante.xubioTransactionId,
          numeroDocumento: comprobante.numeroDocumento,
          tlqvCode: comprobante.tlqvCode,
          importeTotal: comprobante.importeTotal,
        });
        batch.push(comprobante);
      } catch (error: unknown) {
        counters.totalFailed += 1;
        this.logger.error('Xubio comprobante detail failed', {
          syncRunId,
          xubioTransactionId: summary.transaccionid,
          numeroDocumento: summary.numeroDocumento,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
        });
        continue;
      }

      if (batch.length >= batchSize) {
        await this.upsertBatch(syncRunId, batch, counters);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await this.upsertBatch(syncRunId, batch, counters);
    }
  }

  private async upsertBatch(
    syncRunId: number,
    batch: MadreXubioComprobante[],
    counters: Counters,
  ): Promise<void> {
    try {
      for (const comprobante of batch) {
        this.logger.info('Upserting Madre Xubio comprobante', {
          syncRunId,
          xubioTransactionId: comprobante.xubioTransactionId,
          numeroDocumento: comprobante.numeroDocumento,
          tlqvCode: comprobante.tlqvCode,
        });
      }

      const response = await this.madreXubioComprobantesRepository.upsertBatch({
        items: batch,
      });

      counters.totalInserted += response.inserted ?? 0;
      counters.totalUpdated += response.updated ?? 0;
      counters.totalFailed += response.failed ?? 0;

      if (
        response.inserted === undefined &&
        response.updated === undefined &&
        response.failed === undefined
      ) {
        counters.totalUpdated += batch.length;
      }
      this.logger.info('Madre Xubio comprobantes batch upserted', {
        syncRunId,
        received: response.received ?? batch.length,
        inserted: response.inserted ?? 0,
        updated: response.updated ?? 0,
        failed: response.failed ?? 0,
      });
    } catch (error: unknown) {
      if (batch.length > 1) {
        const middle = Math.ceil(batch.length / 2);
        this.logger.warn(
          'Madre Xubio comprobantes batch upsert failed; splitting batch',
          {
            syncRunId,
            batchSize: batch.length,
            firstHalfSize: middle,
            secondHalfSize: batch.length - middle,
            errorMessage:
              error instanceof Error ? error.message : 'Unknown error',
          },
        );

        await this.upsertBatch(syncRunId, batch.slice(0, middle), counters);
        await this.upsertBatch(syncRunId, batch.slice(middle), counters);
        return;
      }

      const comprobante = batch[0];
      counters.totalFailed += 1;
      this.logger.error('Madre Xubio comprobantes batch upsert failed', {
        syncRunId,
        batchSize: batch.length,
        xubioTransactionId: comprobante?.xubioTransactionId,
        numeroDocumento: comprobante?.numeroDocumento,
        tlqvCode: comprobante?.tlqvCode,
        payloadDiagnostic: buildComprobanteFailureDiagnostic(comprobante),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async updateSyncRunProgress(
    syncRunId: number,
    status: 'running' | 'completed' | 'failed' | 'partial',
    counters: Counters,
    saturatedWindows: DateWindow[],
    finishedAt?: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.madreXubioComprobantesRepository.updateSyncRun({
      id: syncRunId,
      status,
      totalListed: counters.totalListed,
      totalDetailRequests: counters.totalDetailRequests,
      totalInserted: counters.totalInserted,
      totalUpdated: counters.totalUpdated,
      totalFailed: counters.totalFailed,
      hasSaturatedWindows: saturatedWindows.length > 0,
      errorMessage:
        errorMessage ??
        (saturatedWindows.length > 0
          ? 'At least one daily Xubio window reached the limit and may be incomplete'
          : null),
      finishedAt,
    });

    this.logger.info('Madre Xubio sync run progress updated', {
      syncRunId,
      status,
      totalListed: counters.totalListed,
      totalDetailRequests: counters.totalDetailRequests,
      totalInserted: counters.totalInserted,
      totalUpdated: counters.totalUpdated,
      totalFailed: counters.totalFailed,
      hasSaturatedWindows: saturatedWindows.length > 0,
    });
  }
}

function mapToMadreComprobante(
  syncRunId: number,
  summary: XubioComprobanteSummary,
  detail: XubioComprobanteDetail,
): MadreXubioComprobante {
  const tlqv = extractTlqv(detail.descripcion);
  const documentKind = getDocumentKind(detail);

  return {
    xubioTransactionId: detail.transaccionid,
    syncRunId,
    source: 'api',
    externalId: detail.externalId,
    numeroDocumento: detail.numeroDocumento,
    tipoCodigo: detail.tipo,
    tipoNombre: getTipoNombre(documentKind),
    documentKind,
    letraComprobante: extractLetraComprobante(detail.numeroDocumento),
    descripcion: detail.descripcion,
    tlqvCode: tlqv?.code ?? null,
    tlqvNumber: tlqv?.number ?? null,
    mlOrderId: extractMercadoLibreOrderId(detail.descripcion),
    fechaEmision: detail.fecha,
    fechaVencimiento: detail.fechaVto,
    importeGravado: detail.importeGravado,
    importeImpuestos: detail.importeImpuestos,
    importeTotal: detail.importetotal,
    importeMonedaPrincipal: detail.importeMonPrincipal,
    monedaId: detail.moneda.id,
    monedaCodigo: detail.moneda.codigo,
    monedaNombre: detail.moneda.nombre,
    cotizacion: detail.cotizacion,
    cotizacionListaPrecio: detail.cotizacionListaDePrecio,
    circuitoContableId: detail.circuitoContable.id,
    circuitoContableCodigo: detail.circuitoContable.codigo,
    circuitoContableNombre: detail.circuitoContable.nombre,
    depositoId: detail.deposito.id,
    depositoCodigo: detail.deposito.codigo,
    depositoNombre: detail.deposito.nombre,
    condicionPago: detail.condicionDePago,
    porcentajeComision: detail.porcentajeComision,
    puntoVentaId: detail.puntoVenta.id,
    puntoVentaCodigo: detail.puntoVenta.codigo,
    puntoVentaNombre: detail.puntoVenta.nombre,
    clienteXubioId: detail.cliente.id,
    clienteCodigo: detail.cliente.codigo,
    clienteNombre: detail.cliente.nombre,
    provinciaId: detail.provincia?.id ?? null,
    provinciaCodigo: detail.provincia?.codigo ?? null,
    provinciaNombre: detail.provincia?.nombre ?? null,
    facturaNoExportacion: detail.facturaNoExportacion,
    cbuInformada: detail.cbuinformada,
    mailEstado: detail.mailEstado,
    cae: detail.cae ?? detail.CAE,
    caeFechaVencimiento: formatCaeDate(detail.caefechaVto),
    fiscalmenteEmitido: hasCae(detail),
    rawListPayload: summary.rawPayload,
    rawDetailPayload: detail.rawPayload,
    productItems: detail.transaccionProductoItems.map((item) => ({
      transaccionCvItemId: item.transaccionCVItemId,
      productoId: item.producto.id,
      productoCodigo: item.producto.codigo,
      productoNombre: item.producto.nombre,
      depositoId: item.deposito.id,
      depositoCodigo: item.deposito.codigo,
      depositoNombre: item.deposito.nombre,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio: item.precio,
      importe: item.importe,
      iva: item.iva,
      total: item.total,
      precioConIvaIncluido: item.precioconivaincluido,
      montoExento: item.montoExento,
      porcentajeDescuento: item.porcentajeDescuento,
      rawPayload: item.rawPayload,
    })),
    cobranzaItems: detail.transaccionCobranzaItems.map((item) => ({
      itemId: item.itemId,
      cuentaTipo: item.cuentaTipo,
      cuentaId: item.cuentaId,
      monedaId: item.moneda.id,
      monedaCodigo: item.moneda.codigo,
      monedaNombre: item.moneda.nombre,
      cotizacionMonedaTransaccion: item.cotizacionMonTransaccion,
      importeMonedaPrincipal: item.importeMonPrincipal,
      importeMonedaTransaccion: item.importeMonTransaccion,
      descripcion: item.descripcion,
      rawPayload: item.rawPayload,
    })),
    percepcionItems: detail.transaccionPercepcionItems.map((item) => ({
      itemId: item.itemId,
      descripcion: item.descripcion,
      importe: item.importe,
      rawPayload: item.rawPayload,
    })),
  };
}

function getDocumentKind(
  comprobante: XubioComprobanteDetail,
): MadreXubioComprobanteDocumentKind {
  if (comprobante.tipo === 3) {
    return 'CREDIT_NOTE';
  }
  if (comprobante.numeroDocumento?.includes('FCE')) {
    return 'FCE';
  }
  if (comprobante.tipo === 1) {
    return 'INVOICE';
  }
  return 'UNKNOWN';
}

function getTipoNombre(kind: MadreXubioComprobanteDocumentKind): string {
  if (kind === 'CREDIT_NOTE') {
    return 'Nota de Crédito';
  }
  if (kind === 'FCE') {
    return 'Factura de Crédito MiPyME';
  }
  if (kind === 'INVOICE') {
    return 'Factura';
  }
  return 'UNKNOWN';
}

function extractTlqv(
  descripcion: string,
): { code: string; number: number } | null {
  const match = /\bTLQV\s*-?\s*(\d+)\b/i.exec(descripcion);
  if (match === null) {
    return null;
  }

  const number = Number(match[1]);
  return {
    code: `TLQV-${number}`,
    number,
  };
}

function extractMercadoLibreOrderId(descripcion: string): string | null {
  const match = /ML:\s*([^\n\r]+)/i.exec(descripcion);
  return match?.[1]?.trim() || null;
}

function extractLetraComprobante(
  numeroDocumento: string | null,
): string | null {
  return numeroDocumento?.slice(0, 1) || null;
}

function hasCae(comprobante: XubioComprobanteDetail): boolean {
  return Boolean((comprobante.cae ?? comprobante.CAE)?.trim());
}

function formatCaeDate(value: XubioCaeExpirationDate | null): string | null {
  if (value === null) {
    return null;
  }

  const [year, month, day] = value;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function buildComprobanteFailureDiagnostic(
  comprobante: MadreXubioComprobante | undefined,
): Record<string, unknown> | null {
  if (comprobante === undefined) {
    return null;
  }

  const productRawPayloadSizes = comprobante.productItems?.map((item) =>
    measureJsonLength(item.rawPayload),
  );
  const cobranzaRawPayloadSizes = comprobante.cobranzaItems?.map((item) =>
    measureJsonLength(item.rawPayload),
  );
  const percepcionRawPayloadSizes = comprobante.percepcionItems?.map((item) =>
    measureJsonLength(item.rawPayload),
  );

  return {
    source: comprobante.source ?? null,
    externalIdLength: comprobante.externalId?.length ?? null,
    numeroDocumentoLength: comprobante.numeroDocumento?.length ?? null,
    tipoCodigo: comprobante.tipoCodigo ?? null,
    tipoNombreLength: comprobante.tipoNombre?.length ?? null,
    documentKind: comprobante.documentKind ?? null,
    letraComprobante: comprobante.letraComprobante ?? null,
    tlqvNumber: comprobante.tlqvNumber ?? null,
    mlOrderId: comprobante.mlOrderId ?? null,
    mlOrderIdLength: comprobante.mlOrderId?.length ?? null,
    fechaEmision: comprobante.fechaEmision,
    fechaVencimiento: comprobante.fechaVencimiento ?? null,
    importeGravado: comprobante.importeGravado ?? null,
    importeImpuestos: comprobante.importeImpuestos ?? null,
    importeTotal: comprobante.importeTotal ?? null,
    monedaId: comprobante.monedaId ?? null,
    monedaCodigoLength: comprobante.monedaCodigo?.length ?? null,
    monedaNombreLength: comprobante.monedaNombre?.length ?? null,
    circuitoContableId: comprobante.circuitoContableId ?? null,
    circuitoContableCodigoLength:
      comprobante.circuitoContableCodigo?.length ?? null,
    circuitoContableNombreLength:
      comprobante.circuitoContableNombre?.length ?? null,
    depositoId: comprobante.depositoId ?? null,
    depositoCodigoLength: comprobante.depositoCodigo?.length ?? null,
    depositoNombreLength: comprobante.depositoNombre?.length ?? null,
    puntoVentaId: comprobante.puntoVentaId ?? null,
    puntoVentaCodigoLength: comprobante.puntoVentaCodigo?.length ?? null,
    puntoVentaNombreLength: comprobante.puntoVentaNombre?.length ?? null,
    clienteXubioId: comprobante.clienteXubioId ?? null,
    clienteCodigo: comprobante.clienteCodigo ?? null,
    clienteCodigoLength: comprobante.clienteCodigo?.length ?? null,
    clienteNombreLength: comprobante.clienteNombre?.length ?? null,
    provinciaId: comprobante.provinciaId ?? null,
    provinciaCodigoLength: comprobante.provinciaCodigo?.length ?? null,
    provinciaNombreLength: comprobante.provinciaNombre?.length ?? null,
    descripcionLength: comprobante.descripcion?.length ?? null,
    mailEstadoLength: comprobante.mailEstado?.length ?? null,
    caeLength: comprobante.cae?.length ?? null,
    caeFechaVencimiento: comprobante.caeFechaVencimiento ?? null,
    fiscalmenteEmitido: comprobante.fiscalmenteEmitido ?? null,
    rawListPayloadLength: measureJsonLength(comprobante.rawListPayload),
    rawDetailPayloadLength: measureJsonLength(comprobante.rawDetailPayload),
    productItemsCount: comprobante.productItems?.length ?? 0,
    cobranzaItemsCount: comprobante.cobranzaItems?.length ?? 0,
    percepcionItemsCount: comprobante.percepcionItems?.length ?? 0,
    maxProductRawPayloadLength: maxNullable(productRawPayloadSizes),
    maxCobranzaRawPayloadLength: maxNullable(cobranzaRawPayloadSizes),
    maxPercepcionRawPayloadLength: maxNullable(percepcionRawPayloadSizes),
    maxProductDescripcionLength: maxNullable(
      comprobante.productItems?.map((item) => item.descripcion?.length ?? 0),
    ),
    maxProductCodigoLength: maxNullable(
      comprobante.productItems?.map((item) => item.productoCodigo?.length ?? 0),
    ),
    maxProductNombreLength: maxNullable(
      comprobante.productItems?.map((item) => item.productoNombre?.length ?? 0),
    ),
    maxProductDepositoCodigoLength: maxNullable(
      comprobante.productItems?.map((item) => item.depositoCodigo?.length ?? 0),
    ),
    maxProductDepositoNombreLength: maxNullable(
      comprobante.productItems?.map((item) => item.depositoNombre?.length ?? 0),
    ),
    maxCobranzaDescripcionLength: maxNullable(
      comprobante.cobranzaItems?.map((item) => item.descripcion?.length ?? 0),
    ),
    maxPercepcionDescripcionLength: maxNullable(
      comprobante.percepcionItems?.map((item) => item.descripcion?.length ?? 0),
    ),
    productItemsSummary:
      comprobante.productItems?.map((item, index) => ({
        lineNumber: index + 1,
        transaccionCvItemId: item.transaccionCvItemId ?? null,
        productoId: item.productoId ?? null,
        productoCodigo: item.productoCodigo ?? null,
        productoCodigoLength: item.productoCodigo?.length ?? null,
        productoNombreLength: item.productoNombre?.length ?? null,
        depositoId: item.depositoId ?? null,
        depositoCodigoLength: item.depositoCodigo?.length ?? null,
        descripcionLength: item.descripcion?.length ?? null,
        cantidad: item.cantidad ?? null,
        precio: item.precio ?? null,
        importe: item.importe ?? null,
        total: item.total ?? null,
      })) ?? [],
  };
}

function measureJsonLength(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  try {
    return JSON.stringify(value).length;
  } catch {
    return null;
  }
}

function maxNullable(values: Array<number | null> | undefined): number | null {
  const numbers = values?.filter((value): value is number =>
    Number.isFinite(value),
  );

  if (numbers === undefined || numbers.length === 0) {
    return null;
  }

  return Math.max(...numbers);
}

function buildBatchWindows(
  fechaDesde: string,
  fechaHasta: string,
  windowSizeDays: number,
): DateWindow[] {
  const windows: DateWindow[] = [];
  let current = parseDate(fechaDesde);
  const end = parseDate(fechaHasta);

  while (current.getTime() <= end.getTime()) {
    const windowEndCandidate = addDays(current, windowSizeDays - 1);
    const windowEnd =
      windowEndCandidate.getTime() > end.getTime() ? end : windowEndCandidate;

    windows.push({
      fechaDesde: formatDate(current),
      fechaHasta: formatDate(windowEnd),
    });

    current = addDays(windowEnd, 1);
  }

  return windows;
}

function buildDayWindows(fechaDesde: string, fechaHasta: string): DateWindow[] {
  const windows: DateWindow[] = [];
  let current = parseDate(fechaDesde);
  const end = parseDate(fechaHasta);

  while (current.getTime() <= end.getTime()) {
    windows.push({
      fechaDesde: formatDate(current),
      fechaHasta: formatDate(current),
    });
    current = addDays(current, 1);
  }

  return windows;
}

function validateDateRange(fechaDesde: string, fechaHasta: string): void {
  validateIsoDate(fechaDesde, 'fechaDesde');
  validateIsoDate(fechaHasta, 'fechaHasta');

  if (fechaDesde > fechaHasta) {
    throw new RangeError('fechaDesde cannot be greater than fechaHasta');
  }
}

function validateIsoDate(value: string, field: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new RangeError(`${field} must use YYYY-MM-DD format`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isValidCalendarDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!isValidCalendarDate) {
    throw new RangeError(
      `${field} must be a valid calendar date in YYYY-MM-DD format`,
    );
  }
}

function validateBatchSize(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
    throw new RangeError(
      `batchSize must be an integer between 1 and ${MAX_BATCH_SIZE}`,
    );
  }
}

function validateWindowSizeDays(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_WINDOW_SIZE_DAYS) {
    throw new RangeError(
      `windowSizeDays must be an integer between 1 and ${MAX_WINDOW_SIZE_DAYS}`,
    );
  }
}

function validateXubioLimit(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_XUBIO_LIMIT) {
    throw new RangeError(
      `xubioLimit must be an integer between 1 and ${MAX_XUBIO_LIMIT}`,
    );
  }
}

function validateOptionalSyncRunId(value: number | undefined): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError('syncRunId must be a positive integer');
  }
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}
