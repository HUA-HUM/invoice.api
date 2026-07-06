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
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_WINDOW_SIZE_DAYS = 10;
const MAX_BATCH_SIZE = 500;
const MAX_WINDOW_SIZE_DAYS = 31;

export interface BackfillXubioComprobantesCommand {
  fechaDesde?: string;
  fechaHasta?: string;
  batchSize?: number;
  windowSizeDays?: number;
  syncRunId?: number;
}

export interface NormalizedBackfillXubioComprobantesCommand {
  fechaDesde: string;
  fechaHasta: string;
  batchSize: number;
  windowSizeDays: number;
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

export function normalizeBackfillXubioComprobantesCommand(
  command: BackfillXubioComprobantesCommand = {},
  now: () => Date = () => new Date(),
): NormalizedBackfillXubioComprobantesCommand {
  const fechaDesde = command.fechaDesde ?? DEFAULT_FECHA_DESDE;
  const fechaHasta = command.fechaHasta ?? formatDate(now());
  const batchSize = command.batchSize ?? DEFAULT_BATCH_SIZE;
  const windowSizeDays = command.windowSizeDays ?? DEFAULT_WINDOW_SIZE_DAYS;

  validateDateRange(fechaDesde, fechaHasta);
  validateBatchSize(batchSize);
  validateWindowSizeDays(windowSizeDays);
  validateOptionalSyncRunId(command.syncRunId);

  return {
    fechaDesde,
    fechaHasta,
    batchSize,
    windowSizeDays,
    syncRunId: command.syncRunId,
  };
}

export function buildSyncRunMetadata(
  batchSize: number,
  windowSizeDays: number,
  executionMode: 'blocking' | 'queued' = 'blocking',
): Record<string, unknown> {
  return {
    strategy:
      executionMode === 'queued'
        ? 'queued_batch_windows_day_by_day'
        : 'batch_windows_day_by_day',
    xubioLimit: DEFAULT_XUBIO_LIMIT,
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

export class BackfillXubioComprobantesInteractor {
  constructor(
    private readonly getComprobantesByDateRepository: IGetComprobantesByDateRepository,
    private readonly getComprobanteDetailRepository: IGetComprobanteDetailRepository,
    private readonly madreXubioComprobantesRepository: IMadreXubioComprobantesRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly logger: BackfillXubioComprobantesLogger = noopLogger,
  ) {}

  async execute(
    command: BackfillXubioComprobantesCommand = {},
  ): Promise<BackfillXubioComprobantesResponse> {
    const { fechaDesde, fechaHasta, batchSize, windowSizeDays, syncRunId } =
      normalizeBackfillXubioComprobantesCommand(command, this.now);

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
            metadata: buildSyncRunMetadata(batchSize, windowSizeDays),
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
          const summaries = await this.getSummaries(dayWindow, syncRun.id);
          counters.totalListed += summaries.length;

          if (summaries.length >= DEFAULT_XUBIO_LIMIT) {
            saturatedWindows.push(dayWindow);
            this.logger.warn('Xubio daily window reached the limit', {
              syncRunId: syncRun.id,
              fechaDesde: dayWindow.fechaDesde,
              fechaHasta: dayWindow.fechaHasta,
              totalListed: summaries.length,
              limit: DEFAULT_XUBIO_LIMIT,
            });
          }

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
  ): Promise<XubioComprobanteSummary[]> {
    this.logger.info('Getting Xubio comprobantes by day', {
      syncRunId,
      fechaDesde: window.fechaDesde,
      fechaHasta: window.fechaHasta,
    });

    const response = await this.getComprobantesByDateRepository.getByDateRange({
      fechaDesde: window.fechaDesde,
      fechaHasta: window.fechaHasta,
      limit: DEFAULT_XUBIO_LIMIT,
    });

    this.logger.info('Xubio comprobantes day listed', {
      syncRunId,
      fechaDesde: window.fechaDesde,
      fechaHasta: window.fechaHasta,
      totalListed: response.comprobantes.length,
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
      counters.totalFailed += batch.length;
      this.logger.error('Madre Xubio comprobantes batch upsert failed', {
        syncRunId,
        batchSize: batch.length,
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
  const match = /TLQV-?\s*(\d+)/i.exec(descripcion);
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`${field} must use YYYY-MM-DD format`);
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
