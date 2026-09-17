import type { IMadreXubioComprobantesRepository } from '../../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import { CreateNotaCreditoFromTlqvInteractor } from './CreateNotaCreditoFromTlqvInteractor';

describe('CreateNotaCreditoFromTlqvInteractor', () => {
  it('builds the nota de credito from the live factura without issuing it on dryRun', async () => {
    const madre = createMadre();
    madre.findFullByTlqvCode.mockResolvedValue({
      items: [factura(76985617, 'B-00008-00003355')],
    });
    const createRepository = { create: jest.fn() };
    const interactor = new CreateNotaCreditoFromTlqvInteractor(
      madre,
      createRepository,
      () => '2026-09-17',
    );

    const result = await interactor.execute({ tlqvCode: 'tlqv-18719' });

    expect(result.status).toBe('skipped');
    expect(result.tlqvCode).toBe('TLQV-18719');
    expect(createRepository.create).not.toHaveBeenCalled();
    expect(result.cancelledInvoice?.xubioTransactionId).toBe(76985617);
    expect(result.notaCredito).toEqual(
      expect.objectContaining({
        type: 'NotaCredito',
        letter: 'B',
        customerId: 10441429,
        issueDate: '2026-09-17',
        pointOfSaleId: 216731,
        relatedDocument: { id: 76985617 },
      }),
    );
    // Concepts are copied as they were invoiced.
    expect(result.notaCredito?.items).toEqual([
      {
        productId: 2461080,
        warehouseId: -2,
        description: 'Gastos documentales Aduana',
        quantity: 1,
        unitPrice: 25918.2,
        priceWithVat: 25918.2,
        discountPercentage: 0,
      },
    ]);
  });

  it('issues the nota de credito when dryRun is false', async () => {
    const madre = createMadre();
    madre.findFullByTlqvCode.mockResolvedValue({
      items: [factura(76985617, 'B-00008-00003355')],
    });
    const createRepository = {
      create: jest.fn().mockResolvedValue({
        invoice: { numeroDocumento: 'B-00008-00000164' },
        rawPayload: {},
        xubioPayload: {},
      }),
    };
    const interactor = new CreateNotaCreditoFromTlqvInteractor(
      madre,
      createRepository,
      () => '2026-09-17',
    );

    const result = await interactor.execute({
      tlqvCode: 'TLQV-18719',
      dryRun: false,
    });

    expect(result.status).toBe('created');
    expect(createRepository.create).toHaveBeenCalledTimes(1);
    // Xubio creates it without a CAE; that is requested by hand afterwards.
    expect(result.caeStatus).toEqual({
      cae: null,
      fiscalmenteEmitido: false,
      pendiente: true,
    });
  });

  it('reports the CAE once it is present', async () => {
    const madre = createMadre();
    madre.findFullByTlqvCode.mockResolvedValue({
      items: [factura(76985617, 'B-00008-00003355')],
    });
    const interactor = new CreateNotaCreditoFromTlqvInteractor(madre, {
      create: jest.fn().mockResolvedValue({
        invoice: {
          numeroDocumento: 'B-00008-00000164',
          cae: '86372441849113',
        },
        rawPayload: {},
        xubioPayload: {},
      }),
    });

    const result = await interactor.execute({
      tlqvCode: 'TLQV-18719',
      dryRun: false,
    });

    expect(result.caeStatus).toEqual({
      cae: '86372441849113',
      fiscalmenteEmitido: true,
      pendiente: false,
    });
  });

  it('does not cancel a factura twice', async () => {
    const madre = createMadre();
    madre.findFullByTlqvCode.mockResolvedValue({
      items: [
        factura(76985617, 'B-00008-00003355'),
        notaCredito(77112121, 76985617),
      ],
    });
    const createRepository = { create: jest.fn() };
    const interactor = new CreateNotaCreditoFromTlqvInteractor(
      madre,
      createRepository,
    );

    const result = await interactor.execute({
      tlqvCode: 'TLQV-18719',
      dryRun: false,
    });

    // A second one would itself have to be compensated.
    expect(result.status).toBe('skipped');
    expect(result.blockers[0].code).toBe('ALREADY_CANCELLED');
    expect(createRepository.create).not.toHaveBeenCalled();
  });

  it('targets the newest live factura when an earlier one was already cancelled', async () => {
    const madre = createMadre();
    madre.findFullByTlqvCode.mockResolvedValue({
      items: [
        factura(76985617, 'B-00008-00003355', '2026-08-31'),
        notaCredito(77112121, 76985617),
        factura(77267759, 'A-00008-00003083', '2026-09-14'),
      ],
    });
    const interactor = new CreateNotaCreditoFromTlqvInteractor(madre, {
      create: jest.fn(),
    });

    const result = await interactor.execute({ tlqvCode: 'TLQV-18719' });

    expect(result.cancelledInvoice?.xubioTransactionId).toBe(77267759);
  });

  it('blocks when the factura has no items to copy', async () => {
    const madre = createMadre();
    madre.findFullByTlqvCode.mockResolvedValue({
      items: [{ ...factura(76985617, 'B-00008-00003355'), productItems: [] }],
    });
    const interactor = new CreateNotaCreditoFromTlqvInteractor(madre, {
      create: jest.fn(),
    });

    const result = await interactor.execute({ tlqvCode: 'TLQV-18719' });

    expect(result.status).toBe('blocked');
    expect(result.blockers[0].code).toBe('INVOICE_HAS_NO_ITEMS');
  });

  it('blocks when Madre cannot be read instead of guessing', async () => {
    const madre = createMadre();
    madre.findFullByTlqvCode.mockRejectedValue(new Error('timeout'));
    const createRepository = { create: jest.fn() };
    const interactor = new CreateNotaCreditoFromTlqvInteractor(
      madre,
      createRepository,
    );

    const result = await interactor.execute({
      tlqvCode: 'TLQV-18719',
      dryRun: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.blockers[0].code).toBe('COMPROBANTES_LOOKUP_FAILED');
    expect(createRepository.create).not.toHaveBeenCalled();
  });
});

function factura(
  xubioTransactionId: number,
  numeroDocumento: string,
  fechaEmision = '2026-08-31',
) {
  return {
    xubioTransactionId,
    numeroDocumento,
    documentKind: 'INVOICE' as const,
    letraComprobante: numeroDocumento.startsWith('A') ? 'A' : 'B',
    descripcion: 'TLQV-18719 ML: 2000018164119530',
    tlqvCode: 'TLQV-18719',
    fechaEmision,
    importeTotal: 1085000,
    clienteXubioId: 10441429,
    puntoVentaId: 216731,
    productItems: [
      {
        productoId: 2461080,
        productoNombre: 'Gastos documentales Aduana',
        depositoId: -2,
        descripcion: 'Gastos documentales Aduana',
        cantidad: 1,
        precio: 25918.2,
        importe: 21420,
        iva: 4498.2,
        precioConIvaIncluido: 25918.2,
        porcentajeDescuento: 0,
        rawPayload: {},
      },
    ],
    rawListPayload: {},
    rawDetailPayload: { transaccionid: xubioTransactionId },
  };
}

function notaCredito(xubioTransactionId: number, cancels: number) {
  return {
    ...factura(xubioTransactionId, 'B-00008-00000164'),
    documentKind: 'CREDIT_NOTE' as const,
    rawDetailPayload: {
      transaccionid: xubioTransactionId,
      comprobante: cancels,
      comprobanteAsociado: 1,
    },
  };
}

function createMadre(): IMadreXubioComprobantesRepository & {
  findFullByTlqvCode: jest.Mock;
} {
  return {
    createSyncRun: jest.fn(),
    updateSyncRun: jest.fn(),
    upsertBatch: jest.fn(),
    findByTlqvCodes: jest.fn(),
    findByTlqvCode: jest.fn(),
    findFullByTlqvCode: jest.fn(),
    existsByTlqvCode: jest.fn(),
  };
}
