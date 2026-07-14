import type { AxiosInstance } from 'axios';
import {
  GetTusFacturasAfipInfoRepository,
  TusFacturasAfipInfoInvalidResponseError,
  TusFacturasAfipInfoRequestError,
} from './GetTusFacturasAfipInfoRepository';

describe('GetTusFacturasAfipInfoRepository', () => {
  it('gets AFIP info and infers CUIT for prefixes lower than 30', async () => {
    const post = jest.fn().mockResolvedValue({
      data: createDirectAfipInfoResponse(),
    });
    const repository = new GetTusFacturasAfipInfoRepository({
      userToken: 'user-token',
      apiKey: 'api-key',
      apiToken: 'api-token',
      httpClient: { post } as unknown as AxiosInstance,
    });

    const result = await repository.getAfipInfo({
      documentoNro: '20-42433388-4',
    });

    expect(post).toHaveBeenCalledWith(
      '/app/api/v2/clientes/afip-info',
      {
        usertoken: 'user-token',
        apikey: 'api-key',
        apitoken: 'api-token',
        cliente: {
          documento_nro: '20-42433388-4',
          documento_tipo: 'CUIT',
        },
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
    );
    expect(result.status).toBe('found');
    expect(result.found).toBe(true);
    if (result.status !== 'found') {
      throw new Error('Expected found response');
    }
    expect(result.afipInfo.documentoNro).toBe('20-42433388-4');
    expect(result.afipInfo.documentoNroDigits).toBe('20424333884');
    expect(result.afipInfo.documentoTipo).toBe('CUIT');
    expect(result.afipInfo.razonSocial).toBe('ARTURO GUTIERREZ');
    expect(result.afipInfo.condicionImpositiva).toBe('MONOTRIBUTO');
    expect(result.afipInfo.codigoPostal).toBe('CP: 1661');
    expect(result.afipInfo.estado).toBe('ACTIVO');
  });

  it('infers CUIL for prefixes greater than or equal to 30 and can send cookie', async () => {
    const post = jest.fn().mockResolvedValue({
      data: { data: createDirectAfipInfoResponse() },
    });
    const repository = new GetTusFacturasAfipInfoRepository({
      userToken: 'user-token',
      apiKey: 'api-key',
      apiToken: 'api-token',
      cookie: 'session-cookie',
      httpClient: { post } as unknown as AxiosInstance,
    });

    const result = await repository.getAfipInfo({
      documentoNro: '30-12345678-9',
    });

    expect(post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cliente: {
          documento_nro: '30-12345678-9',
          documento_tipo: 'CUIL',
        },
      }),
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Cookie: 'session-cookie',
        },
      },
    );
    if (result.status !== 'found') {
      throw new Error('Expected found response');
    }
    expect(result.afipInfo.documentoTipo).toBe('CUIL');
  });

  it('allows overriding documentoTipo', async () => {
    const post = jest.fn().mockResolvedValue({
      data: createDirectAfipInfoResponse(),
    });
    const repository = new GetTusFacturasAfipInfoRepository({
      userToken: 'user-token',
      apiKey: 'api-key',
      apiToken: 'api-token',
      httpClient: { post } as unknown as AxiosInstance,
    });

    const result = await repository.getAfipInfo({
      documentoNro: '20424333884',
      documentoTipo: 'CUIT',
    });

    expect(post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cliente: {
          documento_nro: '20-42433388-4',
          documento_tipo: 'CUIT',
        },
      }),
      expect.any(Object),
    );
    if (result.status !== 'found') {
      throw new Error('Expected found response');
    }
    expect(result.afipInfo.documentoTipo).toBe('CUIT');
  });

  it('returns invalid_document when TusFacturas cannot recover AFIP data', async () => {
    const post = jest.fn().mockResolvedValue({
      data: createInvalidDocumentResponse(),
    });
    const repository = new GetTusFacturasAfipInfoRepository({
      userToken: 'user-token',
      apiKey: 'api-key',
      apiToken: 'api-token',
      httpClient: { post } as unknown as AxiosInstance,
    });

    const result = await repository.getAfipInfo({
      documentoNro: '20-11111111-4',
    });

    expect(result.status).toBe('invalid_document');
    expect(result.found).toBe(false);
    if (result.status !== 'invalid_document') {
      throw new Error('Expected invalid_document response');
    }
    expect(result.invalidDocument.documentoNro).toBe('20-11111111-4');
    expect(result.invalidDocument.documentoTipo).toBe('CUIT');
    expect(result.invalidDocument.messages).toContain(
      'No pudimos obtener datos para el CUIT ingresado. Esto podria deberse a un error en el numero o a una caida temporal de los servicios de ARCA. Error EIP14',
    );
  });

  it('rejects a response whose schema is invalid', async () => {
    const post = jest.fn().mockResolvedValue({ data: { ok: true } });
    const repository = new GetTusFacturasAfipInfoRepository({
      userToken: 'user-token',
      apiKey: 'api-key',
      apiToken: 'api-token',
      httpClient: { post } as unknown as AxiosInstance,
    });

    await expect(
      repository.getAfipInfo({ documentoNro: '20-42433388-4' }),
    ).rejects.toBeInstanceOf(TusFacturasAfipInfoInvalidResponseError);
  });

  it('does not leak the Axios error outside the driver', async () => {
    const post = jest.fn().mockRejectedValue(new Error('network detail'));
    const repository = new GetTusFacturasAfipInfoRepository({
      userToken: 'user-token',
      apiKey: 'api-key',
      apiToken: 'api-token',
      httpClient: { post } as unknown as AxiosInstance,
    });

    await expect(
      repository.getAfipInfo({ documentoNro: '20-42433388-4' }),
    ).rejects.toEqual(
      new TusFacturasAfipInfoRequestError('20424333884', 'network detail'),
    );
  });
});

function createDirectAfipInfoResponse() {
  return {
    razon_social: 'ARTURO GUTIERREZ',
    condicion_impositiva: 'MONOTRIBUTO',
    direccion: 'OBLIGADO 3645',
    localidad: 'BELLA VISTA',
    codigopostal: 'CP: 1661',
    provincia: 'BUENOS AIRES',
    estado: 'ACTIVO',
  };
}

function createInvalidDocumentResponse() {
  return {
    error: 'S',
    errores: [
      [
        'No se ha podido recuperar la condicion frente al IVA de este CUIT.',
        'No pudimos obtener datos para el CUIT ingresado. Esto podria deberse a un error en el numero o a una caida temporal de los servicios de ARCA. Error EIP14',
      ],
    ],
    apoc_existe: 'NO',
    apoc_info: '',
  };
}
