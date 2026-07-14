import type { IInvoiceClientIssueRepository } from '../../adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import type { IStockBueTlqvCacheRepository } from '../../adapters/repositories/cache/stock-bue/IStockBueTlqvCacheRepository';
import type { IMadreXubioComprobantesRepository } from '../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { IGetTlqvOrderDetailsRepository } from '../../adapters/repositories/tlqv/order-details/IGetTlqvOrderDetailsRepository';
import type { IGetTusFacturasAfipInfoRepository } from '../../adapters/repositories/tus-facturas/afip-info/IGetTusFacturasAfipInfoRepository';
import type { ICreateXubioClienteRepository } from '../../adapters/repositories/xubio/clientes/ICreateXubioClienteRepository';
import type { TlqvOrderBuyerData } from '../../entities/tlqv/order-details/TlqvOrderDetails';
import { CreateXubioClienteFromTlqvInteractor } from './CreateXubioClienteFromTlqvInteractor';

describe('CreateXubioClienteFromTlqvInteractor', () => {
  it('creates a Xubio cliente from a TLQV', async () => {
    const repositories = createRepositories();
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'tlqv-14921' });

    expect(result.status).toBe('created');
    if (result.status !== 'created') {
      throw new Error('Expected created response');
    }
    expect(repositories.opsOrderDetails.getByTlqvCode).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-14921',
    });
    expect(
      repositories.flokzuOrderDetails.getByTlqvCode,
    ).not.toHaveBeenCalled();
    expect(repositories.tusFacturas.getAfipInfo).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-14921',
      documentoNro: '27187719572',
      documentoTipo: 'CUIT',
      issueContext: {
        saleNumber: '200001111',
        buyerName: 'Tania Silvia Coronel Alferrano',
        email: 'taniasilvia.coronel@gmail.com',
        metadata: {
          source: 'create_xubio_cliente_from_tlqv',
          orderDetailsSource: 'ops_api',
          orderDetails: {
            tlqvCode: 'TLQV-14921',
            saleNumber: '200001111',
            source: 'ops_api',
          },
          stockBue: {
            rowNumber: 10,
            instruction: 'DESPACHADA',
            description: 'Producto test',
            fechaRecepcion: undefined,
            fechaSalida: undefined,
            fechaLimite: undefined,
            fechaInstruccion: undefined,
          },
          buyerData: {
            nombreDestinatario: 'Tania Silvia Coronel Alferrano',
            direccion: 'Belgrano 53',
            ciudad: 'CORDOBA',
            provincia: 'CORDOBA',
            codigoPostal: '5000',
            telefono: '(351) 15 651-3528',
            email: 'taniasilvia.coronel@gmail.com',
          },
          flokzuBuyerData: undefined,
        },
      },
    });
    expect(repositories.xubioClientes.create).toHaveBeenCalledWith({
      cliente: {
        nombre: 'Tania Silvia Coronel Alferrano',
        razonSocial: 'ARTURO GUTIERREZ',
        primerNombre: 'Tania',
        primerApellido: 'Silvia Coronel Alferrano',
        identificacionTributaria: {
          codigo: 'CUIT',
        },
        categoriaFiscal: {
          codigo: 'MT',
        },
        cuit: '27-18771957-2',
        CUIT: '27-18771957-2',
        direccion: 'Belgrano 53',
        codigoPostal: '5000',
        provincia: {
          nombre: 'CORDOBA',
        },
        usrCode: 'TLQV-27187719572',
        pais: {
          codigo: 'ARGENTINA',
        },
        descripcion: 'Cliente creado automáticamente desde TLQV',
        esclienteextranjero: 0,
        esProveedor: 0,
      },
    });
    expect(result.xubioClienteResult.created).toBe(true);
  });

  it('falls back to Flokzu when Ops API does not find the TLQV', async () => {
    const repositories = createRepositories();
    repositories.opsOrderDetails.getByTlqvCode.mockResolvedValue({
      found: false,
      tlqvCode: 'TLQV-14921',
      source: 'ops_api',
      reason: 'not_found',
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('created');
    expect(repositories.opsOrderDetails.getByTlqvCode).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-14921',
    });
    expect(repositories.flokzuOrderDetails.getByTlqvCode).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-14921',
    });
    if (result.status !== 'created') {
      throw new Error('Expected created response');
    }
    expect(result.orderDetails.source).toBe('flokzu');
  });

  it('returns blocked when prepare validation blocks the TLQV', async () => {
    const repositories = createRepositories();
    repositories.madre.existsByTlqvCode.mockResolvedValue({
      tlqvCode: 'TLQV-14921',
      exists: true,
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('blocked');
    expect(result.canContinue).toBe(false);
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'ALREADY_BILLED' }),
    ]);
    expect(repositories.opsOrderDetails.getByTlqvCode).not.toHaveBeenCalled();
    expect(
      repositories.flokzuOrderDetails.getByTlqvCode,
    ).not.toHaveBeenCalled();
  });

  it('returns blocked when Madre billing validation is unavailable', async () => {
    const repositories = createRepositories();
    repositories.madre.existsByTlqvCode.mockRejectedValue(
      new Error('timeout of 20000ms exceeded'),
    );
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('blocked');
    expect(result.canContinue).toBe(false);
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: 'BILLING_VALIDATION_UNAVAILABLE',
      }),
    ]);
    expect(repositories.opsOrderDetails.getByTlqvCode).not.toHaveBeenCalled();
    expect(
      repositories.flokzuOrderDetails.getByTlqvCode,
    ).not.toHaveBeenCalled();
    expect(repositories.tusFacturas.getAfipInfo).not.toHaveBeenCalled();
    expect(repositories.xubioClientes.create).not.toHaveBeenCalled();
  });

  it('returns blocked when order details do not have buyer CUIT', async () => {
    const repositories = createRepositories();
    repositories.opsOrderDetails.getByTlqvCode.mockResolvedValue({
      found: true,
      orderDetails: createOrderDetails({
        cuitComprador: null,
        cuitCompradorDigits: null,
      }),
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'MISSING_BUYER_CUIT' }),
    ]);
    expect(repositories.tusFacturas.getAfipInfo).not.toHaveBeenCalled();
  });

  it('returns invalid_fiscal_document and records issue when TusFacturas rejects CUIT', async () => {
    const repositories = createRepositories();
    repositories.tusFacturas.getAfipInfo.mockResolvedValue({
      status: 'invalid_document',
      found: false,
      invalidDocument: {
        documentoNro: '27-18771957-2',
        documentoNroDigits: '27187719572',
        documentoTipo: 'CUIT',
        message: 'No pudimos obtener datos para el CUIT ingresado.',
        messages: ['No pudimos obtener datos para el CUIT ingresado.'],
        rawPayload: { error: 'S' },
      },
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('invalid_fiscal_document');
    expect(repositories.issues.upsert).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-14921',
      reason: 'INVALID_FISCAL_DOCUMENT',
      source: 'tus_facturas',
      saleNumber: '200001111',
      buyerName: 'Tania Silvia Coronel Alferrano',
      email: 'taniasilvia.coronel@gmail.com',
      cuit: '27-18771957-2',
      documentoTipo: 'CUIT',
      message: 'No pudimos obtener datos para el CUIT ingresado.',
      messages: ['No pudimos obtener datos para el CUIT ingresado.'],
      rawPayload: { error: 'S' },
      metadata: {
        source: 'create_xubio_cliente_from_tlqv',
        orderDetailsSource: 'ops_api',
        orderDetails: {
          tlqvCode: 'TLQV-14921',
          saleNumber: '200001111',
          source: 'ops_api',
        },
        stockBue: {
          rowNumber: 10,
          instruction: 'DESPACHADA',
          description: 'Producto test',
          fechaRecepcion: undefined,
          fechaSalida: undefined,
          fechaLimite: undefined,
          fechaInstruccion: undefined,
        },
        buyerData: {
          nombreDestinatario: 'Tania Silvia Coronel Alferrano',
          direccion: 'Belgrano 53',
          ciudad: 'CORDOBA',
          provincia: 'CORDOBA',
          codigoPostal: '5000',
          telefono: '(351) 15 651-3528',
          email: 'taniasilvia.coronel@gmail.com',
        },
        flokzuBuyerData: undefined,
      },
      now: new Date('2026-07-07T12:00:00.000Z'),
    });
    expect(repositories.xubioClientes.create).not.toHaveBeenCalled();
  });
});

function createInteractor(repositories: ReturnType<typeof createRepositories>) {
  return new CreateXubioClienteFromTlqvInteractor(
    repositories.cache,
    repositories.madre,
    [repositories.opsOrderDetails, repositories.flokzuOrderDetails],
    repositories.tusFacturas,
    repositories.xubioClientes,
    repositories.issues,
    () => new Date('2026-07-07T12:00:00.000Z'),
  );
}

function createRepositories(): {
  cache: IStockBueTlqvCacheRepository & { getByTlqvCode: jest.Mock };
  madre: IMadreXubioComprobantesRepository & {
    findByTlqvCodes: jest.Mock;
    findByTlqvCode: jest.Mock;
    existsByTlqvCode: jest.Mock;
  };
  opsOrderDetails: IGetTlqvOrderDetailsRepository & {
    getByTlqvCode: jest.Mock;
  };
  flokzuOrderDetails: IGetTlqvOrderDetailsRepository & {
    getByTlqvCode: jest.Mock;
  };
  tusFacturas: IGetTusFacturasAfipInfoRepository & {
    getAfipInfo: jest.Mock;
  };
  xubioClientes: ICreateXubioClienteRepository & { create: jest.Mock };
  issues: IInvoiceClientIssueRepository & { upsert: jest.Mock };
} {
  return {
    cache: {
      replaceAll: jest.fn(),
      getSnapshot: jest.fn(),
      getByTlqvCode: jest.fn().mockResolvedValue({
        metadata: createCacheMetadata(),
        item: createCacheItem('TLQV-14921', 'DESPACHADA'),
      }),
    },
    madre: {
      createSyncRun: jest.fn(),
      updateSyncRun: jest.fn(),
      upsertBatch: jest.fn(),
      findByTlqvCodes: jest.fn(),
      findByTlqvCode: jest.fn(),
      existsByTlqvCode: jest.fn().mockResolvedValue({
        tlqvCode: 'TLQV-14921',
        exists: false,
      }),
    },
    opsOrderDetails: {
      getByTlqvCode: jest.fn().mockResolvedValue({
        found: true,
        orderDetails: createOrderDetails(),
      }),
    },
    flokzuOrderDetails: {
      getByTlqvCode: jest.fn().mockResolvedValue({
        found: true,
        orderDetails: createOrderDetails({ source: 'flokzu' }),
      }),
    },
    tusFacturas: {
      getAfipInfo: jest.fn().mockResolvedValue({
        status: 'found',
        found: true,
        afipInfo: {
          documentoNro: '27-18771957-2',
          documentoNroDigits: '27187719572',
          documentoTipo: 'CUIT',
          razonSocial: 'ARTURO GUTIERREZ',
          condicionImpositiva: 'MONOTRIBUTO',
          direccion: 'OBLIGADO 3645',
          codigoPostal: 'CP: 1661',
          provincia: 'BUENOS AIRES',
          estado: 'ACTIVO',
          rawPayload: {},
        },
      }),
    },
    xubioClientes: {
      create: jest.fn().mockResolvedValue({
        status: 'created',
        created: true,
        cliente: {
          clienteId: 10256469,
          nombre: 'Tania Silvia Coronel Alferrano',
          rawPayload: {},
        },
        rawPayload: {},
      }),
    },
    issues: {
      upsert: jest.fn().mockResolvedValue(undefined),
      getSnapshot: jest.fn(),
      getByTlqvCode: jest.fn(),
    },
  };
}

function createOrderDetails(
  buyerOverrides: Partial<{
    source: 'ops_api' | 'flokzu';
    cuitComprador: string | null;
    cuitCompradorDigits: string | null;
  }> = {},
) {
  const source = buyerOverrides.source ?? 'ops_api';
  const buyerData: TlqvOrderBuyerData = {
    cuitComprador: '27-18771957-2',
    cuitCompradorDigits: '27187719572',
    cuitEnvio: '27-18771957-2',
    cuitEnvioDigits: '27187719572',
    nombreDestinatario: 'Tania Silvia Coronel Alferrano',
    telefono: '(351) 15 651-3528',
    direccion: 'Belgrano 53',
    ciudad: 'CORDOBA',
    provincia: 'CORDOBA',
    codigoPostal: '5000',
    email: 'taniasilvia.coronel@gmail.com',
    ...buyerOverrides,
  };
  delete (buyerData as { source?: string }).source;

  return {
    tlqvCode: 'TLQV-14921',
    source,
    saleNumber: '200001111',
    buyerData,
    rawPayload: {},
  };
}

function createCacheItem(tlqvCode: string, instruction: string) {
  return {
    tlqvCode,
    rowNumber: 10,
    instruction,
    saleNumber: '200001111',
    description: 'Producto test',
    rawData: {
      TLQV: tlqvCode,
      Instruccion: instruction,
      'N venta': '200001111',
      Descripción: 'Producto test',
    },
  };
}

function createCacheMetadata() {
  return {
    refreshedAt: '2026-07-07T12:00:00.000Z',
    totalSheetRows: 10,
    totalRowsWithTlqv: 10,
    totalRowsWithoutTlqv: 0,
    totalUniqueTlqv: 10,
    totalDispatchedRows: 8,
    totalDispatchedRowsWithTlqv: 8,
    totalDispatchedRowsWithoutTlqv: 0,
    totalUniqueDispatchedTlqv: 8,
    instructionCounts: {
      DESPACHADA: 8,
    },
  };
}
