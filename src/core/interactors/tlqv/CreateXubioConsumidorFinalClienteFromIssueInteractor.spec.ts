import type { IInvoiceClientIssueRepository } from '../../adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import type { ICreateXubioClienteRepository } from '../../adapters/repositories/xubio/clientes/ICreateXubioClienteRepository';
import type { InvoiceClientIssue } from '../../entities/invoice/client-issues/InvoiceClientIssue';
import { CreateXubioConsumidorFinalClienteFromIssueInteractor } from './CreateXubioConsumidorFinalClienteFromIssueInteractor';

describe('CreateXubioConsumidorFinalClienteFromIssueInteractor', () => {
  it('creates a consumidor final cliente from an invalid fiscal document issue', async () => {
    const repositories = createRepositories({
      issues: [createInvalidFiscalDocumentIssue()],
    });
    repositories.xubioClientes.create.mockResolvedValue({
      status: 'created',
      created: true,
      cliente: {
        clienteId: 10256469,
        nombre: 'FELIPE ZAMPELLA',
        dni: '44482399',
        rawPayload: {},
      },
      rawPayload: {},
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-7734' });

    expect(result.status).toBe('created');
    expect(result.canContinue).toBe(true);
    expect(result.dni).toBe('44482399');
    expect(result.usrCode).toBe('TLQV-20444823993');
    expect(repositories.xubioClientes.create).toHaveBeenCalledWith({
      cliente: {
        nombre: 'FELIPE ZAMPELLA',
        razonSocial: 'FELIPE ZAMPELLA',
        primerNombre: 'FELIPE',
        primerApellido: 'ZAMPELLA',
        identificacionTributaria: {
          codigo: 'DNI',
        },
        categoriaFiscal: {
          codigo: 'CF',
        },
        pais: {
          codigo: 'ARGENTINA',
        },
        cuit: '44.482.399',
        CUIT: '44.482.399',
        direccion: 'CALDAS 1551',
        codigoPostal: '1427',
        provincia: {
          nombre: 'CIUDAD AUTONOMA DE BUENOS AIRES',
        },
        usrCode: 'TLQV-20444823993',
        descripcion: 'Cliente creado automáticamente desde TLQV',
        esclienteextranjero: 0,
        esProveedor: 0,
      },
    });
  });

  it('allows overriding DNI manually', async () => {
    const repositories = createRepositories({
      issues: [createInvalidFiscalDocumentIssue()],
    });
    repositories.xubioClientes.create.mockResolvedValue({
      status: 'created',
      created: true,
      rawPayload: {},
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-7734',
      dni: '44.482.399',
    });

    expect(result.status).toBe('created');
    expect(result.dni).toBe('44482399');
    expect(repositories.xubioClientes.create).toHaveBeenCalledWith({
      cliente: {
        nombre: 'FELIPE ZAMPELLA',
        razonSocial: 'FELIPE ZAMPELLA',
        primerNombre: 'FELIPE',
        primerApellido: 'ZAMPELLA',
        identificacionTributaria: {
          codigo: 'DNI',
        },
        categoriaFiscal: {
          codigo: 'CF',
        },
        pais: {
          codigo: 'ARGENTINA',
        },
        cuit: '44.482.399',
        CUIT: '44.482.399',
        direccion: 'CALDAS 1551',
        codigoPostal: '1427',
        provincia: {
          nombre: 'CIUDAD AUTONOMA DE BUENOS AIRES',
        },
        usrCode: 'TLQV-20444823993',
        descripcion: 'Cliente creado automáticamente desde TLQV',
        esclienteextranjero: 0,
        esProveedor: 0,
      },
    });
  });

  it('blocks when there is no invalid fiscal document issue', async () => {
    const repositories = createRepositories({
      issues: [],
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-7734' });

    expect(result.status).toBe('blocked');
    expect(result.canContinue).toBe(false);
    expect(repositories.xubioClientes.create).not.toHaveBeenCalled();
    if (result.status === 'blocked') {
      expect(result.blockers).toEqual([
        {
          code: 'ISSUE_NOT_FOUND',
          message:
            'TLQV-7734 does not have an invalid fiscal document issue in Madre.',
        },
      ]);
    }
  });

  it('blocks when DNI cannot be derived from the issue', async () => {
    const repositories = createRepositories({
      issues: [
        {
          ...createInvalidFiscalDocumentIssue(),
          documentoNroDigits: '1234',
          cuit: '1234',
        },
      ],
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-7734' });

    expect(result.status).toBe('blocked');
    expect(repositories.xubioClientes.create).not.toHaveBeenCalled();
    if (result.status === 'blocked') {
      expect(result.blockers).toEqual([
        {
          code: 'MISSING_DNI',
          message:
            'TLQV-7734 does not have a valid DNI derivable from the issue. Pass dni explicitly.',
        },
      ]);
    }
  });

  it('records a Xubio already exists issue when Xubio rejects the cliente', async () => {
    const repositories = createRepositories({
      issues: [createInvalidFiscalDocumentIssue()],
    });
    repositories.xubioClientes.create.mockResolvedValue({
      status: 'already_exists',
      created: false,
      alreadyExistsDetail: 'HTTP 400 - Ya existe el nombre FELIPE ZAMPELLA',
      rawPayload: { description: 'Ya existe el nombre FELIPE ZAMPELLA' },
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-7734' });

    expect(result.status).toBe('already_exists');
    expect(repositories.issues.upsert).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-7734',
      reason: 'XUBIO_CLIENT_ALREADY_EXISTS',
      source: 'xubio',
      saleNumber: '2000014853225236',
      buyerName: 'FELIPE ZAMPELLA',
      email: 'felipe@example.com',
      documentoTipo: 'DNI',
      documentoNro: '44482399',
      documentoNroDigits: '44482399',
      message: 'HTTP 400 - Ya existe el nombre FELIPE ZAMPELLA',
      messages: ['HTTP 400 - Ya existe el nombre FELIPE ZAMPELLA'],
      rawPayload: { description: 'Ya existe el nombre FELIPE ZAMPELLA' },
      metadata: {
        source: 'create_xubio_consumidor_final_cliente_from_issue',
        sourceIssueId: 10,
        sourceIssueKey: 'TLQV-7734:INVALID_FISCAL_DOCUMENT',
        usrCode: 'TLQV-20444823993',
      },
      now: new Date('2026-07-08T10:00:00.000Z'),
    });
  });
});

function createInteractor(repositories: Repositories) {
  return new CreateXubioConsumidorFinalClienteFromIssueInteractor(
    repositories.issues,
    repositories.xubioClientes,
    () => new Date('2026-07-08T10:00:00.000Z'),
  );
}

function createRepositories(options: {
  issues: InvoiceClientIssue[];
}): Repositories {
  return {
    issues: {
      upsert: jest.fn().mockResolvedValue(undefined),
      getSnapshot: jest.fn().mockResolvedValue({ items: options.issues }),
      getByTlqvCode: jest.fn().mockResolvedValue({ items: options.issues }),
    },
    xubioClientes: {
      create: jest.fn(),
    },
  };
}

function createInvalidFiscalDocumentIssue(): InvoiceClientIssue {
  return {
    id: 10,
    key: 'TLQV-7734:INVALID_FISCAL_DOCUMENT',
    tlqvCode: 'TLQV-7734',
    reason: 'INVALID_FISCAL_DOCUMENT',
    source: 'tus_facturas',
    status: 'open',
    saleNumber: '2000014853225236',
    buyerName: 'FELIPE ZAMPELLA',
    email: 'felipe@example.com',
    cuit: '20-44482399-3',
    documentoTipo: 'CUIT',
    documentoNro: '20-44482399-3',
    documentoNroDigits: '20444823993',
    message: 'No pudimos obtener datos para el CUIT ingresado.',
    messages: ['No pudimos obtener datos para el CUIT ingresado.'],
    occurrences: 1,
    firstSeenAt: '2026-07-08T09:00:00.000Z',
    lastSeenAt: '2026-07-08T09:00:00.000Z',
    metadata: {
      flokzuBuyerData: {
        nombreDestinatario: 'FELIPE ZAMPELLA',
        direccion: 'CALDAS 1551',
        provincia: 'CIUDAD AUTONOMA DE BUENOS AIRES',
        codigoPostal: 'CP: 1427',
      },
    },
  };
}

interface Repositories {
  issues: IInvoiceClientIssueRepository & {
    upsert: jest.Mock;
  };
  xubioClientes: ICreateXubioClienteRepository & {
    create: jest.Mock;
  };
}
