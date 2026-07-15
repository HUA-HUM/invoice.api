import type { AxiosInstance } from 'axios';
import {
  GetComprobantesByDateRepository,
  XubioComprobantesByDateRequestError,
} from './GetComprobantesByDateRepository';
import { XubioComprobanteInvalidResponseError } from './XubioComprobanteParsers';

describe('GetComprobantesByDateRepository', () => {
  it('gets Xubio comprobantes by date range', async () => {
    const get = jest.fn().mockResolvedValue({
      data: [createComprobanteSummary()],
    });
    const repository = new GetComprobantesByDateRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getByDateRange({
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-31',
    });

    expect(get).toHaveBeenCalledWith('/API/1.1/comprobanteVentaBean', {
      params: {
        fechaDesde: '2025-01-01',
        fechaHasta: '2025-01-31',
      },
      headers: {
        minimalVersion: 'true',
        limit: 100,
      },
    });
    expect(result.comprobantes).toHaveLength(1);
    expect(result.comprobantes[0]?.transaccionid).toBe(54231396);
    expect(result.pageDiagnostics).toEqual([
      {
        page: 1,
        requestedLimit: 100,
        requestedLastTransactionId: null,
        received: 1,
        uniqueAdded: 1,
        duplicated: 0,
        firstTransactionId: 54231396,
        lastTransactionId: 54231396,
        shouldContinue: false,
      },
    ]);
  });

  it('uses the requested limit header', async () => {
    const get = jest.fn().mockResolvedValue({
      data: [createComprobanteSummary()],
    });
    const repository = new GetComprobantesByDateRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await repository.getByDateRange({
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-31',
      limit: 50,
    });

    expect(get).toHaveBeenCalledWith(
      '/API/1.1/comprobanteVentaBean',
      expect.objectContaining({
        headers: {
          minimalVersion: 'true',
          limit: 50,
        },
      }),
    );
  });

  it('rejects invalid calendar dates before calling Xubio', async () => {
    const get = jest.fn();
    const repository = new GetComprobantesByDateRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.getByDateRange({
        fechaDesde: '2025-25-15',
        fechaHasta: '2026-03-24',
      }),
    ).rejects.toThrow(
      'fechaDesde must be a valid calendar date in YYYY-MM-DD format',
    );
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects limits greater than 100 before calling Xubio', async () => {
    const get = jest.fn();
    const repository = new GetComprobantesByDateRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.getByDateRange({
        fechaDesde: '2025-01-01',
        fechaHasta: '2025-01-01',
        limit: 1000,
      }),
    ).rejects.toThrow('limit must be an integer between 1 and 100');
    expect(get).not.toHaveBeenCalled();
  });

  it('paginates Xubio comprobantes with lastTransactionID header', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      createComprobanteSummary(index + 1),
    );
    const secondPage = [
      createComprobanteSummary(101),
      createComprobanteSummary(102),
    ];
    const get = jest
      .fn()
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({ data: secondPage });
    const repository = new GetComprobantesByDateRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getByDateRange({
      fechaDesde: '2025-01-29',
      fechaHasta: '2025-01-29',
      limit: 100,
    });

    expect(result.comprobantes).toHaveLength(102);
    expect(result.pages).toBe(2);
    expect(result.lastTransactionId).toBe(102);
    expect(result.pageDiagnostics).toEqual([
      {
        page: 1,
        requestedLimit: 100,
        requestedLastTransactionId: null,
        received: 100,
        uniqueAdded: 100,
        duplicated: 0,
        firstTransactionId: 1,
        lastTransactionId: 100,
        shouldContinue: true,
      },
      {
        page: 2,
        requestedLimit: 100,
        requestedLastTransactionId: 100,
        received: 2,
        uniqueAdded: 2,
        duplicated: 0,
        firstTransactionId: 101,
        lastTransactionId: 102,
        shouldContinue: false,
      },
    ]);
    expect(get).toHaveBeenNthCalledWith(
      1,
      '/API/1.1/comprobanteVentaBean',
      expect.objectContaining({
        headers: {
          minimalVersion: 'true',
          limit: 100,
        },
      }),
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      '/API/1.1/comprobanteVentaBean',
      expect.objectContaining({
        headers: {
          minimalVersion: 'true',
          limit: 100,
          lastTransactionID: 100,
        },
      }),
    );
  });

  it('stops pagination defensively when Xubio repeats the cursor', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      createComprobanteSummary(index + 1),
    );
    const duplicatedCursorPage = Array.from({ length: 100 }, (_, index) =>
      createComprobanteSummary(index + 1),
    );
    const get = jest
      .fn()
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({ data: duplicatedCursorPage });
    const repository = new GetComprobantesByDateRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getByDateRange({
      fechaDesde: '2025-01-29',
      fechaHasta: '2025-01-29',
      limit: 100,
    });

    expect(get).toHaveBeenCalledTimes(2);
    expect(result.comprobantes).toHaveLength(100);
    expect(result.pages).toBe(2);
    expect(result.pageDiagnostics[1]).toEqual({
      stopReason: 'repeated_cursor',
      page: 2,
      requestedLimit: 100,
      requestedLastTransactionId: 100,
      received: 100,
      uniqueAdded: 0,
      duplicated: 100,
      firstTransactionId: 1,
      lastTransactionId: 100,
      shouldContinue: false,
    });
  });

  it('stops pagination defensively when a full page adds no new comprobantes', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      createComprobanteSummary(index + 1),
    );
    const duplicatedPageWithDifferentCursor = Array.from(
      { length: 100 },
      (_, index) => createComprobanteSummary(index === 99 ? 99 : index + 1),
    );
    const get = jest
      .fn()
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({ data: duplicatedPageWithDifferentCursor });
    const repository = new GetComprobantesByDateRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getByDateRange({
      fechaDesde: '2025-01-29',
      fechaHasta: '2025-01-29',
      limit: 100,
    });

    expect(get).toHaveBeenCalledTimes(2);
    expect(result.comprobantes).toHaveLength(100);
    expect(result.pageDiagnostics[1]).toEqual({
      stopReason: 'duplicate_page',
      page: 2,
      requestedLimit: 100,
      requestedLastTransactionId: 100,
      received: 100,
      uniqueAdded: 0,
      duplicated: 100,
      firstTransactionId: 1,
      lastTransactionId: 99,
      shouldContinue: false,
    });
  });

  it('filters out comprobantes outside the requested date range and stops pagination', async () => {
    const inRangePage = Array.from({ length: 100 }, (_, index) =>
      createComprobanteSummary(index + 1, '2026-03-23'),
    );
    const outOfRangePage = Array.from({ length: 100 }, (_, index) =>
      createComprobanteSummary(index + 101, '2026-03-22'),
    );
    const get = jest
      .fn()
      .mockResolvedValueOnce({ data: inRangePage })
      .mockResolvedValueOnce({ data: outOfRangePage });
    const repository = new GetComprobantesByDateRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getByDateRange({
      fechaDesde: '2026-03-23',
      fechaHasta: '2026-03-23',
      limit: 100,
    });

    expect(get).toHaveBeenCalledTimes(2);
    expect(result.comprobantes).toHaveLength(100);
    expect(
      result.comprobantes.every((item) => item.fecha === '2026-03-23'),
    ).toBe(true);
    expect(result.pageDiagnostics[1]).toEqual({
      stopReason: 'out_of_date_range',
      page: 2,
      requestedLimit: 100,
      requestedLastTransactionId: 100,
      received: 100,
      uniqueAdded: 0,
      duplicated: 0,
      firstTransactionId: 101,
      lastTransactionId: 200,
      shouldContinue: false,
    });
  });

  it('accepts minimal Xubio list responses', async () => {
    const get = jest.fn().mockResolvedValue({
      data: [{ transaccionid: 54231396 }],
    });
    const repository = new GetComprobantesByDateRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getByDateRange({
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-31',
    });

    expect(result.comprobantes).toHaveLength(1);
    expect(result.comprobantes[0]?.transaccionid).toBe(54231396);
    expect(result.comprobantes[0]?.descripcion).toBe('');
  });

  it('rejects invalid response bodies', async () => {
    const get = jest.fn().mockResolvedValue({
      data: { unexpected: true },
    });
    const repository = new GetComprobantesByDateRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.getByDateRange({
        fechaDesde: '2025-01-01',
        fechaHasta: '2025-01-31',
      }),
    ).rejects.toBeInstanceOf(XubioComprobanteInvalidResponseError);
  });

  it('does not leak Axios errors outside the driver', async () => {
    const get = jest.fn().mockRejectedValue(new Error('raw network error'));
    const repository = new GetComprobantesByDateRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.getByDateRange({
        fechaDesde: '2025-01-01',
        fechaHasta: '2025-01-31',
      }),
    ).rejects.toEqual(
      new XubioComprobantesByDateRequestError(
        '2025-01-01',
        '2025-01-31',
        'raw network error',
      ),
    );
  });

  it('retries transient Xubio list errors', async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce(createAxiosError(503))
      .mockResolvedValueOnce({
        data: [createComprobanteSummary()],
      });
    const repository = new GetComprobantesByDateRepository({
      httpClient: { get } as unknown as AxiosInstance,
      retryOptions: {
        maxAttempts: 2,
        initialDelayInMilliseconds: 0,
        maxDelayInMilliseconds: 0,
      },
    });

    const result = await repository.getByDateRange({
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-31',
    });

    expect(result.comprobantes).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(2);
  });
});

function createAxiosError(status: number) {
  return {
    isAxiosError: true,
    message: 'Request failed',
    response: {
      status,
      data: {
        message: 'temporary Xubio error',
      },
    },
    toJSON: () => ({}),
  };
}

export function createComprobanteSummary(
  transaccionid = 54231396,
  fecha = '2025-01-29',
) {
  return {
    numeroDocumento: 'B-00005-00000616',
    descripcion: 'TLQV-237\nExprimidor Lento Hurom Hz, Plateado',
    fecha,
    importeGravado: 1332225.01,
    importeImpuestos: 0,
    importetotal: 1332225.01,
    moneda: createReference(-2, 'PESOS_ARGENTINOS', 'Pesos Argentinos'),
    circuitoContable: createReference(-2, 'DEFAULT', 'default'),
    cotizacion: 1,
    deposito: createReference(-2, 'DEPOSITO_UNIVERSAL', 'Depósito Universal'),
    condicionDePago: 2,
    transaccionid,
    porcentajeComision: 0,
    puntoVenta: createReference(
      192172,
      'TIENDA_LO_QUIERO_ACA',
      'Tienda Lo Quiero ACA',
    ),
    facturaNoExportacion: false,
    cliente: createReference(7902762, 'CLAUDIO_JESUS_PUMAR', 'Cliente Xubio'),
    importeMonPrincipal: 1332225.01,
    tipo: 1,
    cbuinformada: false,
    cae: '75059399870372',
    caefechaVto: [2025, 2, 8],
    CAE: '75059399870372',
  };
}

export function createReference(id: number, codigo: string, nombre: string) {
  return {
    ID: id,
    id,
    codigo,
    nombre,
  };
}
