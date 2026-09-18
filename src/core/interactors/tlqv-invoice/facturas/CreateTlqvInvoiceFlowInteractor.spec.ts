import type { IGetCostosOperacionesByTlqvCodeRepository } from '../../../adapters/repositories/spreadsheet-api/costos-operaciones/IGetCostosOperacionesByTlqvCodeRepository';
import type { IGetMadreItemByTlqvCodeRepository } from '../../../adapters/repositories/spreadsheet-api/madre/IGetMadreItemByTlqvCodeRepository';
import type { IGetStockBueItemByTlqvCodeRepository } from '../../../adapters/repositories/spreadsheet-api/stock-bue/IGetStockBueItemByTlqvCodeRepository';
import type { IGetTlqvItemByCodeRepository } from '../../../adapters/repositories/spreadsheet-api/tlqv/IGetTlqvItemByCodeRepository';
import type { TlqvItemData } from '../../../entities/spreadsheet-api/tlqv/TlqvItems';
import type { CreateXubioClienteFromTlqvResponse } from '../clientes/CreateXubioClienteFromTlqvInteractor';
import {
  CreateTlqvInvoiceFlowInteractor,
  type ICreateXubioClienteFromTlqvUseCase,
  type ICreateXubioInvoiceRepository,
} from './CreateTlqvInvoiceFlowInteractor';

describe('CreateTlqvInvoiceFlowInteractor', () => {
  it('runs client flow and gets TLQV/MADRE source data', async () => {
    const dependencies = createDependencies();
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({ tlqvCode: 'tlqv-1569' });

    expect(result.status).toBe('completed');
    expect(result.canContinue).toBe(true);
    expect(result.tlqvCode).toBe('TLQV-1569');
    expect(result.nextStep).toBe('invoice_creation');
    expect(result.xubioClienteId).toBe(10270718);
    expect(result.steps).toEqual([
      expect.objectContaining({ name: 'client', status: 'completed' }),
      expect.objectContaining({ name: 'source_data', status: 'completed' }),
    ]);
    expect(dependencies.createCliente.execute).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-1569',
    });
    expect(dependencies.tlqvSheet.getByCode).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-1569',
    });
    expect(dependencies.madreSheet.getByTlqvCode).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-1569',
    });
  });

  it('stops when client flow is blocked', async () => {
    const dependencies = createDependencies({
      clienteFlow: {
        status: 'blocked',
        canContinue: false,
        tlqvCode: 'TLQV-1569',
        prepare: {} as never,
        blockers: [
          {
            code: 'ALREADY_BILLED',
            message: 'TLQV-1569 is already billed.',
          },
        ],
      },
    });
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({ tlqvCode: 'TLQV-1569' });

    expect(result.status).toBe('blocked');
    expect(result.canContinue).toBe(false);
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      {
        code: 'ALREADY_BILLED',
        message: 'TLQV-1569 is already billed.',
        step: 'client',
      },
    ]);
    expect(dependencies.tlqvSheet.getByCode).not.toHaveBeenCalled();
    expect(dependencies.madreSheet.getByTlqvCode).not.toHaveBeenCalled();
  });

  it('skips the TLQV invoice flow when client creation stores an invalid fiscal document issue', async () => {
    const dependencies = createDependencies({
      clienteFlow: {
        status: 'invalid_fiscal_document',
        canContinue: false,
        tlqvCode: 'TLQV-1569',
        prepare: {} as never,
        invalidDocument: {
          documentoNro: '26172071',
          documentoNroDigits: '26172071',
          documentoTipo: 'CUIT',
          message: 'documentoNro must contain exactly 11 digits',
          messages: ['documentoNro must contain exactly 11 digits'],
          rawPayload: {
            error: 'INVALID_DOCUMENT_LENGTH',
          },
        },
      },
    });
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      dryRun: false,
    });

    expect(result.status).toBe('blocked');
    expect(result.canContinue).toBe(false);
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      {
        code: 'INVALID_FISCAL_DOCUMENT',
        message:
          'TLQV-1569 trae documento fiscal "26172071" (8 dígitos). No se puede consultar TusFacturas ni derivar un DNI/CUIT válido automáticamente. Se guarda como issue de cliente en Madre y se saltea la creación de factura.',
        step: 'client',
      },
    ]);
    expect(dependencies.tlqvSheet.getByCode).not.toHaveBeenCalled();
    expect(dependencies.madreSheet.getByTlqvCode).not.toHaveBeenCalled();
    expect(dependencies.createInvoice.create).not.toHaveBeenCalled();
  });

  it('blocks when one spreadsheet source item is missing', async () => {
    const dependencies = createDependencies();
    dependencies.madreSheet.getByTlqvCode.mockResolvedValue({
      found: false,
      tlqvCode: 'TLQV-1569',
      reason: 'not_found',
    });
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({ tlqvCode: 'TLQV-1569' });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      {
        code: 'MADRE_SHEET_ITEM_NOT_FOUND',
        message: 'TLQV-1569 no existe en la solapa MADRE de prueba-lectura.',
        step: 'source_data',
      },
    ]);
    expect(result.sourceData?.tlqvSheet.found).toBe(true);
    expect(result.sourceData?.madreSheet.found).toBe(false);
  });

  it('uses fallback direct TLQV sheet lookup when the primary TLQV source does not find the item', async () => {
    const dependencies = createDependencies();
    dependencies.tlqvSheet.getByCode.mockResolvedValue({
      found: false,
      tlqvCode: 'TLQV-1569',
      reason: 'not_found',
    });
    dependencies.fallbackTlqvSheet.getByCode.mockResolvedValue({
      found: true,
      tlqvCode: 'TLQV-1569',
      item: {
        rowNumber: 22,
        data: createTlqvItemData(),
      },
    });
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({ tlqvCode: 'TLQV-1569' });

    expect(result.status).toBe('completed');
    expect(dependencies.tlqvSheet.getByCode).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-1569',
    });
    expect(dependencies.fallbackTlqvSheet.getByCode).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-1569',
    });
    expect(result.sourceData?.tlqvSheet.found).toBe(true);
  });

  it('validates stock-bue directly when the financial TLQV sheet item is missing', async () => {
    const dependencies = createDependencies();
    dependencies.tlqvSheet.getByCode.mockResolvedValue({
      found: false,
      tlqvCode: 'TLQV-15239',
      reason: 'not_found',
    });
    dependencies.fallbackTlqvSheet.getByCode.mockResolvedValue({
      found: false,
      tlqvCode: 'TLQV-15239',
      reason: 'not_found',
    });
    dependencies.stockBueSheet.getByTlqvCode.mockResolvedValue({
      found: true,
      tlqvCode: 'TLQV-15239',
      item: {
        rowNumber: 8921,
        data: {
          TLQV: 'TLQV-15239',
          'N venta': '2291-1',
          Instruccion: 'DESPACHADA',
        },
      },
    });
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({ tlqvCode: 'TLQV-15239' });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(dependencies.stockBueSheet.getByTlqvCode).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-15239',
    });
    expect(result.sourceData?.stockBueSheet).toEqual({
      found: true,
      tlqvCode: 'TLQV-15239',
      item: {
        rowNumber: 8921,
        data: {
          TLQV: 'TLQV-15239',
          'N venta': '2291-1',
          Instruccion: 'DESPACHADA',
        },
      },
    });
    expect(result.blockers).toEqual([
      {
        code: 'TLQV_SHEET_ITEM_NOT_FOUND',
        message:
          'TLQV-15239 no existe en la solapa financiera TLQV de prueba-lectura. Esa solapa es necesaria para calcular importes de factura. En stock-bue sí existe en row 8921, venta 2291-1, con Instruccion "DESPACHADA". La orden está despachada, pero faltan los importes financieros para facturar.',
        step: 'source_data',
      },
    ]);
  });

  it('skips invoice creation when dryRun is enabled', async () => {
    const dependencies = createDependencies();
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      dryRun: true,
    });

    expect(result.status).toBe('completed');
    expect(result.invoiceBuild?.invoice.items.length).toBeGreaterThan(0);
    expect(dependencies.createInvoice.create).not.toHaveBeenCalled();
    expect(result.steps).toEqual([
      expect.objectContaining({ name: 'client', status: 'completed' }),
      expect.objectContaining({ name: 'source_data', status: 'completed' }),
      expect.objectContaining({
        name: 'invoice_creation',
        status: 'skipped',
      }),
    ]);
  });

  it('creates a Xubio invoice when dryRun is disabled', async () => {
    const dependencies = createDependencies();
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      dryRun: false,
      issueDate: '2026-07-25',
    });

    expect(result.status).toBe('completed');
    expect(dependencies.createInvoice.create).toHaveBeenCalledWith({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining() is typed `any` by Jest
      invoice: expect.objectContaining({
        type: 'Factura',
        customerId: 10270718,
        pointOfSaleId: 216731,
        issueDate: '2026-07-25',
        dueDate: '2026-07-25',
      }),
    });
    expect(result.createdInvoice?.invoice.transaccionId).toBe(75226596);
  });

  it('blocks invoice creation when the TLQV sheet has an "Anti Dumping" value', async () => {
    const dependencies = createDependencies();
    dependencies.tlqvSheet.getByCode.mockResolvedValue({
      found: true,
      tlqvCode: 'TLQV-1569',
      item: {
        rowNumber: 22,
        data: { ...createTlqvItemData(), 'Anti Dumping': '55.26' },
      },
    });
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      dryRun: false,
      issueDate: '2026-07-25',
    });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: 'ANTI_DUMPING_NOT_SUPPORTED',
        step: 'invoice_creation',
      }),
    ]);
    expect(dependencies.createInvoice.create).not.toHaveBeenCalled();
    expect(
      dependencies.costosOperaciones?.getByTlqvCode,
    ).not.toHaveBeenCalled();
  });

  it('creates the invoice when the computed total matches costos-operaciones "Precio de venta"', async () => {
    const dependencies = createDependencies();
    dependencies.costosOperaciones = createCostosOperacionesRepository();
    dependencies.costosOperaciones.getByTlqvCode.mockResolvedValue({
      found: true,
      tlqvCode: 'TLQV-1569',
      item: {
        rowNumber: 1,
        data: { OPERACIÓN: 'TLQV-1569', 'Precio de venta': '$781,999.10' },
      },
    });
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      dryRun: false,
      issueDate: '2026-07-25',
    });

    expect(result.status).toBe('completed');
    expect(dependencies.costosOperaciones.getByTlqvCode).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-1569',
    });
    expect(dependencies.createInvoice.create).toHaveBeenCalled();
  });

  it.each(['$782,000.10', '$781,998.10'])(
    'creates the invoice when the total is off by up to $1 from "Precio de venta" (%s)',
    async (precioVenta) => {
      const dependencies = createDependencies();
      dependencies.costosOperaciones = createCostosOperacionesRepository();
      dependencies.costosOperaciones.getByTlqvCode.mockResolvedValue({
        found: true,
        tlqvCode: 'TLQV-1569',
        item: {
          rowNumber: 1,
          data: { OPERACIÓN: 'TLQV-1569', 'Precio de venta': precioVenta },
        },
      });
      const interactor = createInteractor(dependencies);

      const result = await interactor.execute({
        tlqvCode: 'TLQV-1569',
        stopAfter: 'invoice_creation',
        dryRun: false,
        issueDate: '2026-07-25',
      });

      expect(result.status).toBe('completed');
      expect(dependencies.createInvoice.create).toHaveBeenCalled();
    },
  );

  it('blocks invoice creation when the total is off by more than $1 from "Precio de venta"', async () => {
    const dependencies = createDependencies();
    dependencies.costosOperaciones = createCostosOperacionesRepository();
    dependencies.costosOperaciones.getByTlqvCode.mockResolvedValue({
      found: true,
      tlqvCode: 'TLQV-1569',
      item: {
        rowNumber: 1,
        data: { OPERACIÓN: 'TLQV-1569', 'Precio de venta': '$782,001.11' },
      },
    });
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      dryRun: false,
      issueDate: '2026-07-25',
    });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'INVOICE_TOTAL_SALE_PRICE_MISMATCH' }),
    ]);
    expect(dependencies.createInvoice.create).not.toHaveBeenCalled();
  });

  it('blocks invoice creation when the computed total does not match costos-operaciones "Precio de venta"', async () => {
    const dependencies = createDependencies();
    dependencies.costosOperaciones = createCostosOperacionesRepository();
    dependencies.costosOperaciones.getByTlqvCode.mockResolvedValue({
      found: true,
      tlqvCode: 'TLQV-1569',
      item: {
        rowNumber: 1,
        data: { OPERACIÓN: 'TLQV-1569', 'Precio de venta': '$1,000.00' },
      },
    });
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      dryRun: false,
      issueDate: '2026-07-25',
    });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: 'INVOICE_TOTAL_SALE_PRICE_MISMATCH',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.stringContaining() is typed `any` by Jest
        message: expect.stringContaining('781999.10'),
      }),
    ]);
    expect(dependencies.createInvoice.create).not.toHaveBeenCalled();
  });

  it('blocks when costos-operaciones has no row for the TLQV yet (fails closed)', async () => {
    const dependencies = createDependencies();
    dependencies.costosOperaciones = createCostosOperacionesRepository();
    dependencies.costosOperaciones.getByTlqvCode.mockResolvedValue({
      found: false,
      tlqvCode: 'TLQV-1569',
      reason: 'not_found',
    });
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      dryRun: false,
      issueDate: '2026-07-25',
    });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'COSTOS_OPERACIONES_NOT_FOUND' }),
    ]);
    expect(dependencies.createInvoice.create).not.toHaveBeenCalled();
  });

  it('blocks when costos-operaciones lookup fails', async () => {
    const dependencies = createDependencies();
    dependencies.costosOperaciones = createCostosOperacionesRepository();
    dependencies.costosOperaciones.getByTlqvCode.mockRejectedValue(
      new Error('timeout of 10000ms exceeded'),
    );
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      dryRun: false,
      issueDate: '2026-07-25',
    });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'COSTOS_OPERACIONES_LOOKUP_FAILED' }),
    ]);
    expect(dependencies.createInvoice.create).not.toHaveBeenCalled();
  });

  it('blocks when costos-operaciones repository is not configured', async () => {
    const dependencies = createDependencies();
    dependencies.costosOperaciones = undefined;
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      dryRun: false,
      issueDate: '2026-07-25',
    });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'COSTOS_OPERACIONES_NOT_CONFIGURED' }),
    ]);
  });

  it('blocks with a clear date sequence error when Xubio rejects invoice creation by chronological numbering', async () => {
    const dependencies = createDependencies();
    dependencies.createInvoice.create.mockRejectedValue(
      new Error(
        'Xubio request failed while creating invoice TLQV-15783 ML: 2000017391220904: HTTP 401 - {"description":"El documento número A-00008-00002243 tiene fecha mayor a la fecha del documento que desea emitir"}',
      ),
    );
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      dryRun: false,
      issueDate: '2026-07-25',
    });

    expect(result.status).toBe('blocked');
    expect(result.canContinue).toBe(false);
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: 'XUBIO_INVOICE_DATE_SEQUENCE_ERROR',
        step: 'invoice_creation',
      }),
    ]);
    expect(result.steps).toEqual([
      expect.objectContaining({ name: 'client', status: 'completed' }),
      expect.objectContaining({ name: 'source_data', status: 'completed' }),
      expect.objectContaining({
        name: 'invoice_creation',
        status: 'blocked',
        blockers: [
          expect.objectContaining({
            code: 'XUBIO_INVOICE_DATE_SEQUENCE_ERROR',
          }),
        ],
      }),
    ]);
  });

  it('does not say Xubio rejected the invoice when Xubio simply never answered', async () => {
    const dependencies = createDependencies();
    const timeout = Object.assign(
      new Error(
        'Xubio request failed while creating invoice TLQV-1569: timeout of 30000ms exceeded',
      ),
      { outcomeUnknown: true },
    );
    dependencies.createInvoice.create.mockRejectedValue(timeout);
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      dryRun: false,
    });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    // The comprobante may exist: whoever picks this up has to look in Xubio
    // before reissuing, or the TLQV ends up with two facturas with CAE.
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: 'XUBIO_INVOICE_OUTCOME_UNKNOWN',
        step: 'invoice_creation',
      }),
    ]);
    expect(result.blockers[0].message).toContain('Revisá en Xubio');
  });

  it('uses today as issue date when no custom issue date is sent', async () => {
    const dependencies = createDependencies();
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      dryRun: true,
    });

    expect(result.status).toBe('completed');
    expect(result.invoiceBuild?.invoice.issueDate).toBe('2026-07-30');
    expect(result.invoiceBuild?.invoice.dueDate).toBe('2026-07-30');
  });

  it('blocks future issue dates before creating a cliente', async () => {
    const dependencies = createDependencies();
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      issueDate: '2026-07-31',
    });

    expect(result.status).toBe('blocked');
    expect(dependencies.createCliente.execute).not.toHaveBeenCalled();
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      {
        code: 'INVALID_INVOICE_ISSUE_DATE',
        message: 'issueDate cannot be in the future.',
        step: 'invoice_creation',
      },
    ]);
  });

  it('blocks issue dates older than 10 days before creating a cliente', async () => {
    const dependencies = createDependencies();
    const interactor = createInteractor(dependencies);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-1569',
      stopAfter: 'invoice_creation',
      issueDate: '2026-07-19',
    });

    expect(result.status).toBe('blocked');
    expect(dependencies.createCliente.execute).not.toHaveBeenCalled();
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      {
        code: 'INVALID_INVOICE_ISSUE_DATE',
        message: 'issueDate cannot be older than 10 days.',
        step: 'invoice_creation',
      },
    ]);
  });
});

interface TestDependencies {
  createCliente: ICreateXubioClienteFromTlqvUseCase & { execute: jest.Mock };
  tlqvSheet: IGetTlqvItemByCodeRepository & { getByCode: jest.Mock };
  fallbackTlqvSheet: IGetTlqvItemByCodeRepository & { getByCode: jest.Mock };
  madreSheet: IGetMadreItemByTlqvCodeRepository & {
    getByTlqvCode: jest.Mock;
  };
  stockBueSheet: IGetStockBueItemByTlqvCodeRepository & {
    getByTlqvCode: jest.Mock;
  };
  createInvoice: ICreateXubioInvoiceRepository & { create: jest.Mock };
  costosOperaciones?: IGetCostosOperacionesByTlqvCodeRepository & {
    getByTlqvCode: jest.Mock;
  };
}

function createInteractor(
  dependencies: TestDependencies,
): CreateTlqvInvoiceFlowInteractor {
  return new CreateTlqvInvoiceFlowInteractor(
    dependencies.createCliente,
    dependencies.tlqvSheet,
    dependencies.madreSheet,
    dependencies.createInvoice,
    undefined,
    () => '2026-07-30',
    dependencies.fallbackTlqvSheet,
    dependencies.stockBueSheet,
    dependencies.costosOperaciones,
  );
}

function createDependencies(
  options: {
    clienteFlow?: CreateXubioClienteFromTlqvResponse;
  } = {},
): TestDependencies {
  return {
    createCliente: {
      execute: jest
        .fn()
        .mockResolvedValue(options.clienteFlow ?? createClienteFlowResponse()),
    },
    tlqvSheet: {
      getByCode: jest.fn().mockResolvedValue({
        found: true,
        tlqvCode: 'TLQV-1569',
        item: {
          rowNumber: 22,
          data: createTlqvItemData(),
        },
      }),
    },
    fallbackTlqvSheet: {
      getByCode: jest.fn().mockResolvedValue({
        found: false,
        tlqvCode: 'TLQV-1569',
        reason: 'not_found',
      }),
    },
    madreSheet: {
      getByTlqvCode: jest.fn().mockResolvedValue({
        found: true,
        tlqvCode: 'TLQV-1569',
        item: {
          rowNumber: 1526,
          data: {
            Identificador: 'TLQV-1569',
            NOMBREPRODUCTO: 'Tabla De Remo Inflable con su kit de accesorios',
            NROVENTA: '2000007867251585',
            PRECIOVENTA: '$781,999.10',
            COMISIONML: '$121,209.90',
            COSTOENVIO: '$16,328.49',
          },
        },
      }),
    },
    stockBueSheet: {
      getByTlqvCode: jest.fn().mockResolvedValue({
        found: false,
        tlqvCode: 'TLQV-1569',
        reason: 'not_found',
      }),
    },
    createInvoice: {
      create: jest.fn().mockResolvedValue({
        invoice: {
          rawPayload: {},
          transaccionId: 75226596,
          numeroDocumento: 'B-00008-00002508',
          clienteId: 10270718,
          puntoVentaId: 216731,
        },
        rawPayload: {},
        xubioPayload: {} as never,
      }),
    },
    costosOperaciones: {
      getByTlqvCode: jest.fn().mockResolvedValue({
        found: true,
        tlqvCode: 'TLQV-1569',
        item: {
          rowNumber: 1,
          data: { OPERACIÓN: 'TLQV-1569', 'Precio de venta': '$781,999.10' },
        },
      }),
    },
  };
}

function createCostosOperacionesRepository(): IGetCostosOperacionesByTlqvCodeRepository & {
  getByTlqvCode: jest.Mock;
} {
  return {
    getByTlqvCode: jest.fn(),
  };
}

function createClienteFlowResponse(): CreateXubioClienteFromTlqvResponse {
  return {
    status: 'created',
    canContinue: true,
    tlqvCode: 'TLQV-1569',
    prepare: {} as never,
    fiscalInfo: {
      documentoNro: '20-42433388-4',
      documentoNroDigits: '20424333884',
      documentoTipo: 'CUIT',
      razonSocial: 'ARTURO GUTIERREZ',
      condicionImpositiva: 'MONOTRIBUTO',
      direccion: 'OBLIGADO 3645',
      localidad: 'BELLA VISTA',
      codigoPostal: '1661',
      provincia: 'BUENOS AIRES',
      estado: 'ACTIVO',
      rawPayload: {},
    },
    fiscalInfoResponse: {
      status: 'found',
      found: true,
      afipInfo: {
        documentoNro: '20-42433388-4',
        documentoNroDigits: '20424333884',
        documentoTipo: 'CUIT',
        razonSocial: 'ARTURO GUTIERREZ',
        condicionImpositiva: 'MONOTRIBUTO',
        direccion: 'OBLIGADO 3645',
        localidad: 'BELLA VISTA',
        codigoPostal: '1661',
        provincia: 'BUENOS AIRES',
        estado: 'ACTIVO',
        rawPayload: {},
      },
    },
    documentoTipo: 'CUIT',
    xubioClienteResult: {
      status: 'created',
      created: true,
      cliente: {
        clienteId: 10270718,
        nombre: 'ARTURO GUTIERREZ',
        rawPayload: {},
      },
    },
  };
}

function createTlqvItemData(): TlqvItemData {
  return {
    TLQV: 'TLQV-1569',
    'Valor Declarado': '169.99',
    Peso: '12.60',
    PESOVOLUMENTICO: '16.65',
    VALORXKG: '9.63',
    DI: '0.00',
    TE: '0.00',
    IVA: '42.74',
    'Imp Internos': '',
    'Anti Dumping': '',
    'Total Impuestos': '42.74',
    'Total Flete': '160.36',
    'Fijo Liberacion': '14082.40',
    Seguro: '1.70',
    Total: '215.23',
    tc: '1160.00',
    tc2: '1168.00',
    'tc impuesto': '49578.40',
    Productoco: '198548.32',
    'Productoco.b': '198548.32',
    DIFACTURA: '0.00',
    'DIFACTURA.B': '0.00',
    TEFACTURA: '0.00',
    'TEFACTURA.B': '0.00',
    IVAFACTURA: '49578.40',
    'IVAFACTURA.B': '49578.40',
    LAFACTURA: '14082.40',
    'LAFACTURA.B': '17039.70',
    A13VENTA: '162.06',
    FLETEINTERNACIONALA: '379294.29',
    FLETEINTERNACIONALB: '379294.29',
    'NRO CARGA': '',
  };
}
