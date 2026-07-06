import type { IMadreXubioComprobantesRepository } from '../../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { IGetComprobanteDetailRepository } from '../../../adapters/repositories/xubio/comprobantes/IGetComprobanteDetailRepository';
import type { IGetComprobantesByDateRepository } from '../../../adapters/repositories/xubio/comprobantes/IGetComprobantesByDateRepository';
import type {
  XubioComprobanteDetail,
  XubioComprobanteSummary,
  XubioReference,
} from '../../../entities/xubio/comprobantes/XubioComprobante';
import {
  BackfillXubioComprobantesInteractor,
  normalizeBackfillXubioComprobantesCommand,
} from './BackfillXubioComprobantesInteractor';

describe('BackfillXubioComprobantesInteractor', () => {
  it('uses a safe default batch size for Madre API payloads', () => {
    const command = normalizeBackfillXubioComprobantesCommand({
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-31',
    });

    expect(command.batchSize).toBe(10);
  });

  it('gets summaries, gets details and upserts them in Madre API', async () => {
    const summary = createSummary(54231396);
    const detail = createDetail(54231396);
    const getByDateRangeRepository = createGetByDateRangeRepository();
    getByDateRangeRepository.getByDateRange.mockResolvedValue({
      comprobantes: [summary],
    });
    const getDetailRepository = createGetDetailRepository();
    getDetailRepository.getDetail.mockResolvedValue({ comprobante: detail });
    const madreRepository = createMadreRepository();
    const interactor = new BackfillXubioComprobantesInteractor(
      getByDateRangeRepository,
      getDetailRepository,
      madreRepository,
      () => new Date('2025-01-01T12:00:00.000Z'),
    );

    const result = await interactor.execute({
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-01',
      batchSize: 1,
    });

    expect(getByDateRangeRepository.getByDateRange).toHaveBeenCalledWith({
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-01',
      limit: 100,
    });
    expect(getDetailRepository.getDetail).toHaveBeenCalledWith({
      transaccionId: 54231396,
    });
    expect(madreRepository.upsertBatch).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          xubioTransactionId: 54231396,
          tlqvCode: 'TLQV-237',
          documentKind: 'INVOICE',
          fiscalmenteEmitido: true,
        }),
      ],
    });
    expect(result.status).toBe('completed');
    expect(result.totalListed).toBe(1);
    expect(result.totalDetailRequests).toBe(1);
    expect(result.totalInserted).toBe(1);
  });

  it('processes a date range one day at a time and marks saturated days', async () => {
    const getByDateRangeRepository = createGetByDateRangeRepository();
    getByDateRangeRepository.getByDateRange
      .mockResolvedValueOnce({
        comprobantes: Array.from({ length: 100 }, (_, index) =>
          createSummary(index + 1),
        ),
      })
      .mockResolvedValueOnce({ comprobantes: [] });
    const getDetailRepository = createGetDetailRepository();
    const madreRepository = createMadreRepository();
    const interactor = new BackfillXubioComprobantesInteractor(
      getByDateRangeRepository,
      getDetailRepository,
      madreRepository,
      () => new Date('2025-01-02T12:00:00.000Z'),
    );

    const result = await interactor.execute({
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-02',
    });

    expect(getByDateRangeRepository.getByDateRange).toHaveBeenCalledTimes(2);
    expect(getByDateRangeRepository.getByDateRange).toHaveBeenNthCalledWith(1, {
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-01',
      limit: 100,
    });
    expect(getByDateRangeRepository.getByDateRange).toHaveBeenNthCalledWith(2, {
      fechaDesde: '2025-01-02',
      fechaHasta: '2025-01-02',
      limit: 100,
    });
    expect(result.splitWindows).toEqual([]);
    expect(result.saturatedWindows).toEqual([
      {
        fechaDesde: '2025-01-01',
        fechaHasta: '2025-01-01',
      },
    ]);
    expect(result.status).toBe('partial');
  });

  it('updates sync progress after each batch window', async () => {
    const getByDateRangeRepository = createGetByDateRangeRepository();
    getByDateRangeRepository.getByDateRange.mockResolvedValue({
      comprobantes: [],
    });
    const getDetailRepository = createGetDetailRepository();
    const madreRepository = createMadreRepository();
    const interactor = new BackfillXubioComprobantesInteractor(
      getByDateRangeRepository,
      getDetailRepository,
      madreRepository,
      () => new Date('2025-01-21T12:00:00.000Z'),
    );

    const result = await interactor.execute({
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-21',
      windowSizeDays: 10,
    });

    expect(result.batchWindows).toEqual([
      {
        fechaDesde: '2025-01-01',
        fechaHasta: '2025-01-10',
      },
      {
        fechaDesde: '2025-01-11',
        fechaHasta: '2025-01-20',
      },
      {
        fechaDesde: '2025-01-21',
        fechaHasta: '2025-01-21',
      },
    ]);
    expect(getByDateRangeRepository.getByDateRange).toHaveBeenCalledTimes(21);
    expect(madreRepository.updateSyncRun).toHaveBeenCalledTimes(5);
    expect(madreRepository.updateSyncRun).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        status: 'running',
        totalListed: 0,
      }),
    );
    expect(madreRepository.updateSyncRun).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        status: 'completed',
        totalListed: 0,
      }),
    );
  });

  it('splits failed Madre API upsert batches and retries smaller chunks', async () => {
    const summaries = [1, 2, 3, 4].map((transactionId) =>
      createSummary(transactionId),
    );
    const getByDateRangeRepository = createGetByDateRangeRepository();
    getByDateRangeRepository.getByDateRange.mockResolvedValue({
      comprobantes: summaries,
    });
    const getDetailRepository = createGetDetailRepository();
    getDetailRepository.getDetail.mockImplementation(
      ({ transaccionId }: { transaccionId: number }) =>
        Promise.resolve({ comprobante: createDetail(transaccionId) }),
    );
    const madreRepository = createMadreRepository();
    madreRepository.upsertBatch
      .mockRejectedValueOnce(new Error('Madre 500'))
      .mockResolvedValueOnce({
        received: 2,
        inserted: 2,
        updated: 0,
        failed: 0,
      })
      .mockResolvedValueOnce({
        received: 2,
        inserted: 2,
        updated: 0,
        failed: 0,
      });
    const interactor = new BackfillXubioComprobantesInteractor(
      getByDateRangeRepository,
      getDetailRepository,
      madreRepository,
      () => new Date('2025-01-01T12:00:00.000Z'),
    );

    const result = await interactor.execute({
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-01',
      batchSize: 4,
    });

    expect(madreRepository.upsertBatch).toHaveBeenCalledTimes(3);
    expect(
      getUpsertBatchTransactionIds(madreRepository.upsertBatch, 0),
    ).toEqual([1, 2, 3, 4]);
    expect(
      getUpsertBatchTransactionIds(madreRepository.upsertBatch, 1),
    ).toEqual([1, 2]);
    expect(
      getUpsertBatchTransactionIds(madreRepository.upsertBatch, 2),
    ).toEqual([3, 4]);
    expect(result.totalInserted).toBe(4);
    expect(result.totalFailed).toBe(0);
  });
});

function createGetByDateRangeRepository() {
  return {
    getByDateRange: jest.fn(),
  } as unknown as IGetComprobantesByDateRepository & {
    getByDateRange: jest.Mock;
  };
}

function createGetDetailRepository() {
  return {
    getDetail: jest.fn(),
  } as unknown as IGetComprobanteDetailRepository & {
    getDetail: jest.Mock;
  };
}

function createMadreRepository() {
  return {
    createSyncRun: jest.fn().mockResolvedValue({
      id: 10,
      syncType: 'historical_backfill',
      status: 'running',
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-01',
      windowType: 'custom',
    }),
    updateSyncRun: jest.fn().mockResolvedValue({
      id: 10,
      syncType: 'historical_backfill',
      status: 'completed',
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-01',
      windowType: 'custom',
    }),
    upsertBatch: jest.fn().mockResolvedValue({
      received: 1,
      inserted: 1,
      updated: 0,
      failed: 0,
    }),
  } as unknown as IMadreXubioComprobantesRepository & {
    createSyncRun: jest.Mock;
    updateSyncRun: jest.Mock;
    upsertBatch: jest.Mock;
  };
}

function getUpsertBatchTransactionIds(
  upsertBatch: jest.Mock,
  callIndex: number,
): number[] {
  const calls = upsertBatch.mock.calls as unknown[][];
  const command = calls[callIndex]?.[0] as {
    items: Array<{ xubioTransactionId: number }>;
  };

  return command.items.map((item) => item.xubioTransactionId);
}

function createSummary(transaccionId: number): XubioComprobanteSummary {
  return {
    rawPayload: { transaccionid: transaccionId },
    externalId: '',
    numeroDocumento: 'B-00005-00000616',
    descripcion: 'TLQV-237\nExprimidor Lento Hurom Hz, Plateado',
    fecha: '2025-01-29',
    fechaVto: null,
    importeGravado: 1332225.01,
    importeImpuestos: 0,
    importetotal: 1332225.01,
    importeMonPrincipal: 1332225.01,
    moneda: createReference(-2, 'PESOS_ARGENTINOS', 'Pesos Argentinos'),
    circuitoContable: createReference(-2, 'DEFAULT', 'default'),
    cotizacion: 1,
    deposito: createReference(-2, 'DEPOSITO_UNIVERSAL', 'Depósito Universal'),
    condicionDePago: 2,
    transaccionid: transaccionId,
    porcentajeComision: 0,
    puntoVenta: createReference(
      192172,
      'TIENDA_LO_QUIERO_ACA',
      'Tienda Lo Quiero ACA',
    ),
    facturaNoExportacion: false,
    cliente: createReference(7902762, 'CLAUDIO_JESUS_PUMAR', 'Cliente Xubio'),
    tipo: 1,
    mailEstado: 'No Enviado',
    cbuinformada: false,
    cae: '75059399870372',
    caefechaVto: [2025, 2, 8],
    CAE: '75059399870372',
    provincia: null,
  };
}

function createDetail(transaccionId: number): XubioComprobanteDetail {
  return {
    ...createSummary(transaccionId),
    rawPayload: { detail: transaccionId },
    cotizacionListaDePrecio: 1,
    transaccionProductoItems: [],
    transaccionCobranzaItems: [],
    transaccionPercepcionItems: [],
  };
}

function createReference(
  id: number,
  codigo: string,
  nombre: string,
): XubioReference {
  return {
    ID: id,
    id,
    codigo,
    nombre,
  };
}
