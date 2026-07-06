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
        limit: 1000,
      },
    });
    expect(result.comprobantes).toHaveLength(1);
    expect(result.comprobantes[0]?.transaccionid).toBe(54231396);
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
      fechaDesde: '2025-01-01',
      fechaHasta: '2025-01-01',
      limit: 1000,
    });

    expect(result.comprobantes).toHaveLength(102);
    expect(result.pages).toBe(2);
    expect(result.lastTransactionId).toBe(102);
    expect(get).toHaveBeenNthCalledWith(
      1,
      '/API/1.1/comprobanteVentaBean',
      expect.objectContaining({
        headers: {
          minimalVersion: 'true',
          limit: 1000,
        },
      }),
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      '/API/1.1/comprobanteVentaBean',
      expect.objectContaining({
        headers: {
          minimalVersion: 'true',
          limit: 1000,
          lastTransactionID: 100,
        },
      }),
    );
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

export function createComprobanteSummary(transaccionid = 54231396) {
  return {
    numeroDocumento: 'B-00005-00000616',
    descripcion: 'TLQV-237\nExprimidor Lento Hurom Hz, Plateado',
    fecha: '2025-01-29',
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
