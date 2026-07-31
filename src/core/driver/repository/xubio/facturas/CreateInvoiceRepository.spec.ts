import type { AxiosInstance } from 'axios';
import type { XubioInvoice } from '../../../../entities/xubio/facturas/XubioInvoice';
import {
  buildFacturarPayload,
  CreateInvoiceRepository,
  XubioInvoiceInvalidResponseError,
  XubioInvoiceRequestError,
} from './CreateInvoiceRepository';

describe('CreateInvoiceRepository', () => {
  it('creates a Xubio invoice through the facturar endpoint', async () => {
    const post = jest.fn().mockResolvedValue({
      data: createXubioFacturarResponse(),
    });
    const repository = new CreateInvoiceRepository({
      accessTokenProvider: () => Promise.resolve('access-token'),
      httpClient: { post } as unknown as AxiosInstance,
    });

    const result = await repository.create({
      invoice: createInvoice(),
    });

    expect(post).toHaveBeenCalledWith('/API/1.1/facturar', expectedPayload(), {
      headers: {
        Authorization: 'Bearer access-token',
      },
    });
    expect(result.invoice.numeroDocumento).toBe('A-00008-00000043');
    expect(result.invoice.clienteId).toBe(10270718);
    expect(result.invoice.puntoVentaId).toBe(216731);
    expect(result.invoice.productItems?.[0]?.productoId).toBe(2461025);
    expect(result.invoice.cae).toBeNull();
    expect(result.invoice.transaccionId).toBe(74499913);
    expect(result.xubioPayload).toEqual(expectedPayload());
  });

  it('builds the Xubio facturar payload from the core invoice entity', () => {
    expect(buildFacturarPayload(createInvoice())).toEqual(expectedPayload());
  });

  it('adds related document when creating a credit note', () => {
    const payload = buildFacturarPayload({
      ...createInvoice(),
      type: 'NotaCredito',
      relatedDocument: {
        id: 71947390,
      },
    });

    expect(payload.tipo).toBe(3);
    expect(payload.comprobanteAsociado).toBe(71947390);
  });

  it('rejects credit notes without related document', async () => {
    const repository = new CreateInvoiceRepository({
      httpClient: { post: jest.fn() } as unknown as AxiosInstance,
    });

    await expect(
      repository.create({
        invoice: {
          ...createInvoice(),
          type: 'NotaCredito',
        },
      }),
    ).rejects.toEqual(
      new RangeError('relatedDocument is required for NotaCredito invoices'),
    );
  });

  it('rejects invalid responses', async () => {
    const post = jest.fn().mockResolvedValue({ data: null });
    const repository = new CreateInvoiceRepository({
      httpClient: { post } as unknown as AxiosInstance,
    });

    await expect(
      repository.create({ invoice: createInvoice() }),
    ).rejects.toBeInstanceOf(XubioInvoiceInvalidResponseError);
  });

  it('does not leak Axios errors outside the driver', async () => {
    const post = jest.fn().mockRejectedValue(new Error('network detail'));
    const repository = new CreateInvoiceRepository({
      httpClient: { post } as unknown as AxiosInstance,
    });

    await expect(
      repository.create({ invoice: createInvoice() }),
    ).rejects.toEqual(
      new XubioInvoiceRequestError(
        'PRUEBA API TLQV - ELIMINAR',
        'network detail',
      ),
    );
  });

  it('refreshes the token and retries after an authorization failure', async () => {
    const post = jest
      .fn()
      .mockRejectedValueOnce(createAxiosError(401))
      .mockResolvedValueOnce({
        data: createXubioFacturarResponse(),
      });
    const accessTokenProvider = jest
      .fn()
      .mockResolvedValueOnce('token-1')
      .mockResolvedValueOnce('token-2');
    const onAuthorizationFailure = jest.fn();
    const repository = new CreateInvoiceRepository({
      httpClient: { post } as unknown as AxiosInstance,
      accessTokenProvider,
      onAuthorizationFailure,
      retryOptions: {
        maxAttempts: 2,
        initialDelayInMilliseconds: 0,
        maxDelayInMilliseconds: 0,
      },
    });

    const result = await repository.create({ invoice: createInvoice() });

    expect(result.invoice.transaccionId).toBe(74499913);
    expect(onAuthorizationFailure).toHaveBeenCalledTimes(1);
    expect(accessTokenProvider).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenNthCalledWith(
      1,
      '/API/1.1/facturar',
      expectedPayload(),
      {
        headers: {
          Authorization: 'Bearer token-1',
        },
      },
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/API/1.1/facturar',
      expectedPayload(),
      {
        headers: {
          Authorization: 'Bearer token-2',
        },
      },
    );
  });
});

function createInvoice(): XubioInvoice {
  return {
    type: 'Factura',
    customerId: 10270718,
    issueDate: '2026-07-20',
    dueDate: '2026-07-20',
    pointOfSaleId: 216731,
    description: 'PRUEBA API TLQV - ELIMINAR',
    exchangeRate: 1,
    items: [
      {
        productId: 2461025,
        warehouseId: -2,
        description: 'PRUEBA API TLQV - ELIMINAR',
        quantity: 1,
        unitPrice: 100,
        priceWithVat: 100,
        discountPercentage: 0,
      },
    ],
  };
}

function expectedPayload() {
  return {
    circuitoContable: {
      ID: -2,
    },
    cliente: {
      ID: 10270718,
    },
    tipo: 1,
    fecha: '2026-07-20',
    fechaVto: '2026-07-20',
    puntoVenta: {
      ID: 216731,
    },
    condicionDePago: 1,
    deposito: {
      ID: -2,
    },
    cotizacion: 1,
    cotizacionListaDePrecio: 1,
    descripcion: 'PRUEBA API TLQV - ELIMINAR',
    cbuinformada: false,
    facturaNoExportacion: false,
    transaccionProductoItems: [
      {
        producto: {
          ID: 2461025,
        },
        deposito: {
          ID: -2,
        },
        descripcion: 'PRUEBA API TLQV - ELIMINAR',
        cantidad: 1,
        precio: 100,
        precioconivaincluido: 100,
        porcentajeDescuento: 0,
      },
    ],
    transaccionPercepcionItems: [],
    transaccionCobranzaItems: [],
  };
}

function createXubioFacturarResponse() {
  return {
    numeroDocumento: 'A-00008-00000043',
    descripcion: 'PRUEBA API TLQV - ELIMINAR',
    fecha: '2026-07-20',
    circuitoContable: {
      ID: -2,
      id: -2,
    },
    cotizacion: 1,
    fechaVto: '2026-07-20',
    cotizacionListaDePrecio: 1,
    deposito: {
      ID: -2,
      id: -2,
    },
    condicionDePago: 1,
    transaccionid: 74499913,
    transaccionProductoItems: [
      {
        descripcion: 'PRUEBA API TLQV - ELIMINAR',
        cantidad: 1,
        precio: 100,
        producto: {
          ID: 2461025,
          id: 2461025,
        },
        deposito: {
          ID: -2,
          id: -2,
        },
        precioconivaincluido: 100,
        porcentajeDescuento: 0,
      },
    ],
    puntoVenta: {
      ID: 216731,
      id: 216731,
    },
    facturaNoExportacion: false,
    cliente: {
      ID: 10270718,
      id: 10270718,
    },
    tipo: 1,
    transaccionPercepcionItems: [],
    transaccionCobranzaItems: [],
    tienePeriodoServicio: false,
    cbuinformada: false,
  };
}

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
