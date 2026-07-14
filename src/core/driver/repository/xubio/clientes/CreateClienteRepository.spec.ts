import type { AxiosInstance } from 'axios';
import {
  CreateClienteRepository,
  XubioClienteInvalidResponseError,
  XubioClienteRequestError,
} from './CreateClienteRepository';

describe('CreateClienteRepository', () => {
  it('creates a Xubio cliente', async () => {
    const post = jest.fn().mockResolvedValue({
      data: createXubioClienteResponse(),
    });
    const repository = new CreateClienteRepository({
      accessTokenProvider: () => Promise.resolve('access-token'),
      httpClient: { post } as unknown as AxiosInstance,
    });

    const result = await repository.create({
      cliente: createXubioClientePayload(),
    });

    expect(post).toHaveBeenCalledWith(
      '/API/1.1/clienteBean',
      createXubioClientePayload(),
      {
        headers: {
          Authorization: 'Bearer access-token',
        },
      },
    );
    expect(result.status).toBe('created');
    expect(result.created).toBe(true);
    expect(result.cliente?.clienteId).toBe(10256469);
    expect(result.cliente?.cuit).toBe('20-44482399-3');
  });

  it('creates a Xubio consumidor final cliente with DNI', async () => {
    const post = jest.fn().mockResolvedValue({
      data: createXubioDniClienteResponse(),
    });
    const repository = new CreateClienteRepository({
      accessTokenProvider: () => Promise.resolve('access-token'),
      httpClient: { post } as unknown as AxiosInstance,
    });

    const result = await repository.create({
      cliente: createXubioDniClientePayload(),
    });

    expect(post).toHaveBeenCalledWith(
      '/API/1.1/clienteBean',
      createXubioDniClientePayload(),
      {
        headers: {
          Authorization: 'Bearer access-token',
        },
      },
    );
    expect(result.status).toBe('created');
    expect(result.created).toBe(true);
    expect(result.cliente?.clienteId).toBe(10256469);
    expect(result.cliente?.cuit).toBe('44.482.399');
  });

  it('returns already_exists when Xubio says the cliente already exists', async () => {
    const error = {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: 'No se pudo completar la operación. - FunctionalException',
          description:
            'El número de identificación ya ha sido cargado en el sistema: 20-42433388-4; Ya existe el nombre ARTURO GUTIERREZ;',
        },
      },
    };
    const post = jest.fn().mockRejectedValue(error);
    const repository = new CreateClienteRepository({
      accessTokenProvider: () => Promise.resolve('access-token'),
      httpClient: { post } as unknown as AxiosInstance,
    });

    const result = await repository.create({
      cliente: createXubioClientePayload(),
    });

    expect(result.status).toBe('already_exists');
    expect(result.created).toBe(false);
    expect(result.alreadyExistsDetail).toContain('HTTP 400');
  });

  it('returns already_exists when Xubio says the usrCode already exists', async () => {
    const error = {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: 'No se pudo completar la operación. - FunctionalException',
          description:
            'Ya existe el código TLQV-20444823993, este ha sido creado anteriormente como TLQV-20444823993',
        },
      },
    };
    const post = jest.fn().mockRejectedValue(error);
    const repository = new CreateClienteRepository({
      accessTokenProvider: () => Promise.resolve('access-token'),
      httpClient: { post } as unknown as AxiosInstance,
    });

    const result = await repository.create({
      cliente: createXubioClientePayload(),
    });

    expect(result.status).toBe('already_exists');
    expect(result.created).toBe(false);
    expect(result.alreadyExistsDetail).toContain('Ya existe el código');
  });

  it('rejects a response whose schema is invalid', async () => {
    const post = jest.fn().mockResolvedValue({ data: { nombre: 'Cliente' } });
    const repository = new CreateClienteRepository({
      accessTokenProvider: () => Promise.resolve('access-token'),
      httpClient: { post } as unknown as AxiosInstance,
    });

    await expect(
      repository.create({ cliente: createXubioClientePayload() }),
    ).rejects.toBeInstanceOf(XubioClienteInvalidResponseError);
  });

  it('does not leak the Axios error outside the driver', async () => {
    const post = jest.fn().mockRejectedValue(new Error('network detail'));
    const repository = new CreateClienteRepository({
      accessTokenProvider: () => Promise.resolve('access-token'),
      httpClient: { post } as unknown as AxiosInstance,
    });

    await expect(
      repository.create({ cliente: createXubioClientePayload() }),
    ).rejects.toEqual(
      new XubioClienteRequestError('TLQV-20444823993', 'network detail'),
    );
  });
});

function createXubioClientePayload() {
  return {
    nombre: 'FELIPE ZAMPELLA',
    razonSocial: 'FELIPE ZAMPELLA',
    primerNombre: 'FELIPE',
    primerApellido: 'ZAMPELLA',
    identificacionTributaria: {
      codigo: 'CUIT' as const,
    },
    categoriaFiscal: {
      codigo: 'MT' as const,
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
    esclienteextranjero: 0 as const,
    esProveedor: 0 as const,
  };
}

function createXubioDniClientePayload() {
  return {
    nombre: 'FELIPE ZAMPELLA',
    razonSocial: 'FELIPE ZAMPELLA',
    primerNombre: 'FELIPE',
    primerApellido: 'ZAMPELLA',
    identificacionTributaria: {
      codigo: 'DNI' as const,
    },
    categoriaFiscal: {
      codigo: 'CF' as const,
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
    esclienteextranjero: 0 as const,
    esProveedor: 0 as const,
  };
}

function createXubioClienteResponse() {
  return {
    cliente_id: 10256469,
    nombre: 'FELIPE ZAMPELLA',
    primerApellido: 'ZAMPELLA',
    primerNombre: 'FELIPE',
    razonSocial: 'FELIPE ZAMPELLA',
    identificacionTributaria: {
      ID: 9,
      codigo: 'CUIT',
      id: 9,
    },
    categoriaFiscal: {
      ID: 4,
      codigo: 'MT',
      id: 4,
    },
    provincia: {
      ID: 43,
      nombre: 'CIUDAD AUTONOMA DE BUENOS AIRES',
      id: 43,
    },
    direccion: 'CALDAS 1551',
    codigoPostal: '1427',
    pais: {
      ID: 1,
      codigo: 'ARGENTINA',
      id: 1,
    },
    usrCode: 'TLQV-20444823993',
    descripcion: 'Cliente creado automáticamente desde TLQV',
    esclienteextranjero: 0,
    esProveedor: 0,
    cuit: '20-44482399-3',
    CUIT: '20-44482399-3',
  };
}

function createXubioDniClienteResponse() {
  return {
    ...createXubioClienteResponse(),
    identificacionTributaria: {
      ID: 4,
      codigo: 'DNI',
      id: 4,
    },
    categoriaFiscal: {
      ID: 6,
      codigo: 'CF',
      id: 6,
    },
    cuit: '44.482.399',
    CUIT: '44.482.399',
  };
}
