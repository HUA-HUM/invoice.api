import type { AxiosInstance } from 'axios';
import {
  FindClienteRepository,
  XubioFindClienteInvalidResponseError,
  XubioFindClienteRequestError,
} from './FindClienteRepository';

describe('FindClienteRepository', () => {
  it('finds Xubio clientes by nombre', async () => {
    const get = jest.fn().mockResolvedValue({
      data: [createXubioClientePayload()],
    });
    const repository = new FindClienteRepository({
      authorizationToken: 'access-token',
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.findByName({
      nombre: 'Felipe zampella',
    });

    expect(get).toHaveBeenCalledWith('/API/1.1/clienteBean', {
      params: {
        nombre: 'Felipe zampella',
      },
      headers: {
        Authorization: 'Bearer access-token',
      },
    });
    expect(result.clientes).toHaveLength(1);
    expect(result.clientes[0]).toEqual(
      expect.objectContaining({
        clienteId: 10270718,
        nombre: 'FELIPE ZAMPELLA',
        razonSocial: 'FELIPE ZAMPELLA',
        usrCode: 'TLQV-20444823993',
        cuit: '44.482.399',
      }),
    );
  });

  it('uses access token provider and retries after authorization failures', async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            message: 'expired token',
          },
        },
      })
      .mockResolvedValueOnce({
        data: [createXubioClientePayload()],
      });
    const accessTokenProvider = jest
      .fn()
      .mockResolvedValueOnce('token-1')
      .mockResolvedValueOnce('token-2');
    const onAuthorizationFailure = jest.fn();
    const repository = new FindClienteRepository({
      accessTokenProvider,
      onAuthorizationFailure,
      retryOptions: {
        maxAttempts: 2,
        initialDelayInMilliseconds: 0,
        maxDelayInMilliseconds: 0,
      },
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.findByName({
      nombre: 'FELIPE ZAMPELLA',
    });

    expect(result.clientes).toHaveLength(1);
    expect(onAuthorizationFailure).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenNthCalledWith(1, expect.any(String), {
      params: {
        nombre: 'FELIPE ZAMPELLA',
      },
      headers: {
        Authorization: 'Bearer token-1',
      },
    });
    expect(get).toHaveBeenNthCalledWith(2, expect.any(String), {
      params: {
        nombre: 'FELIPE ZAMPELLA',
      },
      headers: {
        Authorization: 'Bearer token-2',
      },
    });
  });

  it('rejects an invalid response body', async () => {
    const get = jest.fn().mockResolvedValue({
      data: {
        cliente_id: 10270718,
      },
    });
    const repository = new FindClienteRepository({
      authorizationToken: 'access-token',
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.findByName({ nombre: 'FELIPE ZAMPELLA' }),
    ).rejects.toBeInstanceOf(XubioFindClienteInvalidResponseError);
  });

  it('does not leak Axios errors outside the driver', async () => {
    const get = jest.fn().mockRejectedValue(new Error('network detail'));
    const repository = new FindClienteRepository({
      authorizationToken: 'access-token',
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.findByName({ nombre: 'FELIPE ZAMPELLA' }),
    ).rejects.toEqual(
      new XubioFindClienteRequestError(
        'FELIPE ZAMPELLA',
        'network detail',
      ),
    );
  });
});

function createXubioClientePayload() {
  return {
    cliente_id: 10270718,
    nombre: 'FELIPE ZAMPELLA',
    primerApellido: 'ZAMPELLA',
    primerNombre: 'FELIPE',
    razonSocial: 'FELIPE ZAMPELLA',
    identificacionTributaria: {
      ID: 10,
      nombre: 'DNI',
      codigo: 'DNI',
      id: 10,
    },
    categoriaFiscal: {
      ID: 3,
      nombre: 'Consumidor Final',
      codigo: 'CF',
      id: 3,
    },
    provincia: {
      ID: 43,
      nombre: 'Ciudad Autónoma de Buenos Aires',
      codigo: 'CIUDAD_AUTONOMA_DE_BUENOS_AIRES',
      id: 43,
    },
    direccion: 'CALDAS 1551',
    codigoPostal: '1427',
    pais: {
      ID: 1,
      nombre: 'Argentina',
      codigo: 'ARGENTINA',
      id: 1,
    },
    usrCode: 'TLQV-20444823993',
    descripcion: 'Cliente creado automáticamente desde TLQV',
    esclienteextranjero: 0,
    esProveedor: 0,
    cuit: '44.482.399',
    CUIT: '44.482.399',
  };
}
