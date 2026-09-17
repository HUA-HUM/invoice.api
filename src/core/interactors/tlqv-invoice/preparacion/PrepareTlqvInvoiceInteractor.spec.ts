import type { IMadreXubioComprobantesRepository } from '../../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import { PrepareTlqvInvoiceInteractor } from '../preparacion/PrepareTlqvInvoiceInteractor';

describe('PrepareTlqvInvoiceInteractor', () => {
  it('returns READY when TLQV is not billed', async () => {
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.existsByTlqvCode.mockResolvedValue({
      tlqvCode: 'TLQV-14027',
      exists: false,
    });
    const interactor = new PrepareTlqvInvoiceInteractor(comprobantesRepository);

    const result = await interactor.execute({ tlqvCode: ' tlqv-14027 ' });

    expect(comprobantesRepository.existsByTlqvCode).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-14027',
    });
    expect(comprobantesRepository.findByTlqvCodes).not.toHaveBeenCalled();
    expect(comprobantesRepository.findByTlqvCode).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'READY',
      canContinue: true,
      tlqvCode: 'TLQV-14027',
      isBilled: false,
      billingValidationAvailable: true,
      billingValidationErrorMessage: undefined,
      blockers: [],
      billedComprobantes: [],
    });
  });

  it('blocks when TLQV already has an invoice comprobante', async () => {
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.existsByTlqvCode.mockResolvedValue({
      tlqvCode: 'TLQV-14027',
      exists: true,
    });
    comprobantesRepository.findFullByTlqvCode.mockResolvedValue({
      items: [factura(76985617)],
    });
    const interactor = new PrepareTlqvInvoiceInteractor(comprobantesRepository);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14027' });

    expect(result.status).toBe('BLOCKED');
    expect(result.canContinue).toBe(false);
    expect(result.isBilled).toBe(true);
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'ALREADY_BILLED' }),
    ]);
  });

  it('blocks safely when billing validation against Madre is unavailable', async () => {
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.existsByTlqvCode.mockRejectedValue(
      new Error('timeout of 20000ms exceeded'),
    );
    const interactor = new PrepareTlqvInvoiceInteractor(comprobantesRepository);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14027' });

    expect(result.status).toBe('BLOCKED');
    expect(result.canContinue).toBe(false);
    expect(result.isBilled).toBe(false);
    expect(result.billingValidationAvailable).toBe(false);
    expect(result.billingValidationErrorMessage).toBe(
      'timeout of 20000ms exceeded',
    );
    expect(result.billedComprobantes).toEqual([]);
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: 'BILLING_VALIDATION_UNAVAILABLE',
      }),
    ]);
  });

  it('requires a tlqvCode', async () => {
    const comprobantesRepository = createComprobantesRepository();
    const interactor = new PrepareTlqvInvoiceInteractor(comprobantesRepository);

    await expect(interactor.execute({ tlqvCode: '  ' })).rejects.toThrow(
      RangeError,
    );
  });
  it('lets a TLQV be reissued once its factura was cancelled with a nota de credito', async () => {
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.existsByTlqvCode.mockResolvedValue({
      tlqvCode: 'TLQV-18719',
      exists: true,
    });
    comprobantesRepository.findFullByTlqvCode.mockResolvedValue({
      items: [factura(76985617), notaCredito(77112121, 76985617)],
    });
    const interactor = new PrepareTlqvInvoiceInteractor(comprobantesRepository);

    const result = await interactor.execute({ tlqvCode: 'TLQV-18719' });

    expect(result.isBilled).toBe(false);
    expect(result.canContinue).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('keeps blocking while one factura is still live', async () => {
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.existsByTlqvCode.mockResolvedValue({
      tlqvCode: 'TLQV-18719',
      exists: true,
    });
    // The B was cancelled, but the A that replaced it is live.
    comprobantesRepository.findFullByTlqvCode.mockResolvedValue({
      items: [
        factura(76985617),
        notaCredito(77112121, 76985617),
        factura(77267759),
      ],
    });
    const interactor = new PrepareTlqvInvoiceInteractor(comprobantesRepository);

    const result = await interactor.execute({ tlqvCode: 'TLQV-18719' });

    expect(result.isBilled).toBe(true);
    expect(result.canContinue).toBe(false);
  });

  it('fails closed when a nota de credito does not say what it cancels', async () => {
    const comprobantesRepository = createComprobantesRepository();
    comprobantesRepository.existsByTlqvCode.mockResolvedValue({
      tlqvCode: 'TLQV-18719',
      exists: true,
    });
    comprobantesRepository.findFullByTlqvCode.mockResolvedValue({
      items: [factura(76985617), notaCredito(77112121, undefined)],
    });
    const interactor = new PrepareTlqvInvoiceInteractor(comprobantesRepository);

    const result = await interactor.execute({ tlqvCode: 'TLQV-18719' });

    // Better a manual review than a duplicate invoice with a CAE.
    expect(result.isBilled).toBe(true);
  });

  function factura(xubioTransactionId: number) {
    return {
      xubioTransactionId,
      documentKind: 'INVOICE',
      tipoCodigo: 1,
      rawDetailPayload: { transaccionid: xubioTransactionId },
    };
  }

  function notaCredito(
    xubioTransactionId: number,
    cancels: number | undefined,
  ) {
    return {
      xubioTransactionId,
      documentKind: 'CREDIT_NOTE',
      tipoCodigo: 3,
      rawDetailPayload:
        cancels === undefined
          ? { transaccionid: xubioTransactionId }
          : { transaccionid: xubioTransactionId, comprobante: cancels },
    };
  }
});

function createComprobantesRepository(): IMadreXubioComprobantesRepository & {
  findByTlqvCodes: jest.Mock;
  findByTlqvCode: jest.Mock;
  findFullByTlqvCode: jest.Mock;
  existsByTlqvCode: jest.Mock;
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
