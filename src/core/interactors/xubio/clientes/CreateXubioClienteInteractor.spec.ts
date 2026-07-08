import type { IInvoiceClientIssueRepository } from '../../../adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import type { ICreateXubioClienteRepository } from '../../../adapters/repositories/xubio/clientes/ICreateXubioClienteRepository';
import { CreateXubioClienteInteractor } from './CreateXubioClienteInteractor';

describe('CreateXubioClienteInteractor', () => {
  it('builds a Xubio cliente payload from fiscal info', async () => {
    const create: jest.MockedFunction<ICreateXubioClienteRepository['create']> =
      jest.fn().mockResolvedValue({
        status: 'created',
        created: true,
        cliente: {
          clienteId: 10256469,
          nombre: 'FELIPE ZAMPELLA',
          rawPayload: {},
        },
      });
    const repository = {
      create,
    } as unknown as ICreateXubioClienteRepository;
    const interactor = new CreateXubioClienteInteractor(repository);

    const result = await interactor.execute({
      tlqvCode: 'TLQV-14921',
      cuit: '20444823993',
      nombre: 'FELIPE DESTINATARIO',
      razonSocial: 'FELIPE ZAMPELLA',
      primerNombre: 'FELIPE',
      primerApellido: 'DESTINATARIO',
      condicionImpositiva: 'MONOTRIBUTO',
      direccion: 'CALDAS 1551',
      codigoPostal: 'CP: 1427',
      provincia: 'CIUDAD AUTONOMA DE BUENOS AIRES',
    });

    expect(create).toHaveBeenCalledWith({
      cliente: {
        nombre: 'FELIPE DESTINATARIO',
        razonSocial: 'FELIPE ZAMPELLA',
        primerNombre: 'FELIPE',
        primerApellido: 'DESTINATARIO',
        identificacionTributaria: {
          codigo: 'CUIT',
        },
        categoriaFiscal: {
          codigo: 'MT',
        },
        pais: {
          codigo: 'ARGENTINA',
        },
        cuit: '20-44482399-3',
        CUIT: '20-44482399-3',
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
    expect(result.status).toBe('created');
  });

  it('allows overriding categoriaFiscalCodigo', async () => {
    const create: jest.MockedFunction<ICreateXubioClienteRepository['create']> =
      jest.fn().mockResolvedValue({
        status: 'already_exists',
        created: false,
      });
    const repository = {
      create,
    } as unknown as ICreateXubioClienteRepository;
    const interactor = new CreateXubioClienteInteractor(repository);

    const result = await interactor.execute({
      cuit: '30-12345678-9',
      razonSocial: 'ACME SA',
      condicionImpositiva: 'UNKNOWN',
      categoriaFiscalCodigo: 'RI',
    });

    expect(create.mock.calls[0]?.[0].cliente.categoriaFiscal.codigo).toBe('RI');
    expect(result.status).toBe('already_exists');
  });

  it('records an already existing Xubio cliente issue when TLQV code is present', async () => {
    const create: jest.MockedFunction<ICreateXubioClienteRepository['create']> =
      jest.fn().mockResolvedValue({
        status: 'already_exists',
        created: false,
        alreadyExistsDetail:
          'Ya existe el código TLQV-20444823993, este ha sido creado anteriormente como TLQV-20444823993',
        rawPayload: { description: 'Ya existe el código TLQV-20444823993' },
      });
    const repository = {
      create,
    } as unknown as ICreateXubioClienteRepository;
    const upsert = jest.fn().mockResolvedValue(undefined);
    const issueRepository = {
      upsert,
      getSnapshot: jest.fn(),
      getByTlqvCode: jest.fn(),
    } as unknown as IInvoiceClientIssueRepository;
    const interactor = new CreateXubioClienteInteractor(
      repository,
      issueRepository,
      () => new Date('2026-07-07T12:00:00.000Z'),
    );

    const result = await interactor.execute({
      tlqvCode: 'TLQV-14921',
      cuit: '20-44482399-3',
      razonSocial: 'FELIPE ZAMPELLA',
      condicionImpositiva: 'MONOTRIBUTO',
    });

    expect(result.status).toBe('already_exists');
    expect(upsert).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-14921',
      reason: 'XUBIO_CLIENT_ALREADY_EXISTS',
      source: 'xubio',
      cuit: '20-44482399-3',
      documentoTipo: 'CUIT',
      message:
        'Ya existe el código TLQV-20444823993, este ha sido creado anteriormente como TLQV-20444823993',
      messages: [
        'Ya existe el código TLQV-20444823993, este ha sido creado anteriormente como TLQV-20444823993',
      ],
      rawPayload: { description: 'Ya existe el código TLQV-20444823993' },
      now: new Date('2026-07-07T12:00:00.000Z'),
    });
  });
});
