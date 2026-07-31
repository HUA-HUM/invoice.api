import type { IGetMadreItemByTlqvCodeRepository } from '../../../adapters/repositories/spreadsheet-api/madre/IGetMadreItemByTlqvCodeRepository';
import type { IGetTlqvItemByCodeRepository } from '../../../adapters/repositories/spreadsheet-api/tlqv/IGetTlqvItemByCodeRepository';
import type { TlqvItemData } from '../../../entities/spreadsheet-api/tlqv/TlqvItems';
import type {
  CreateXubioClienteFromTlqvResponse,
} from '../clientes/CreateXubioClienteFromTlqvInteractor';
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
          'TLQV-1569 tiene un documento fiscal inválido. Se guarda como issue de cliente en Madre y se saltea la creación de factura. documentoNro must contain exactly 11 digits',
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
  createCliente: jest.Mocked<ICreateXubioClienteFromTlqvUseCase>;
  tlqvSheet: jest.Mocked<IGetTlqvItemByCodeRepository>;
  madreSheet: jest.Mocked<IGetMadreItemByTlqvCodeRepository>;
  createInvoice: jest.Mocked<ICreateXubioInvoiceRepository>;
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
  );
}

function createDependencies(options: {
  clienteFlow?: CreateXubioClienteFromTlqvResponse;
} = {}): TestDependencies {
  return {
    createCliente: {
      execute: jest.fn().mockResolvedValue(
        options.clienteFlow ?? createClienteFlowResponse(),
      ),
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
    madreSheet: {
      getByTlqvCode: jest.fn().mockResolvedValue({
        found: true,
        tlqvCode: 'TLQV-1569',
        item: {
          rowNumber: 1526,
          data: {
            Identificador: 'TLQV-1569',
            NOMBREPRODUCTO:
              'Tabla De Remo Inflable con su kit de accesorios',
            NROVENTA: '2000007867251585',
            PRECIOVENTA: '$781,999.10',
            COMISIONML: '$121,209.90',
            COSTOENVIO: '$16,328.49',
          },
        },
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
  };
}

function createClienteFlowResponse(): CreateXubioClienteFromTlqvResponse {
  return {
    status: 'created',
    canContinue: true,
    tlqvCode: 'TLQV-1569',
    prepare: {} as never,
    fiscalInfo: {
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
