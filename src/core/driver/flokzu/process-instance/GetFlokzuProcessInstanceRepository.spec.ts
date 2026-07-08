import type { AxiosInstance } from 'axios';
import {
  FlokzuProcessInstanceInvalidResponseError,
  FlokzuProcessInstanceRequestError,
  GetFlokzuProcessInstanceRepository,
} from './GetFlokzuProcessInstanceRepository';

describe('GetFlokzuProcessInstanceRepository', () => {
  it('gets a Flokzu process instance and extracts CUITCOMPRADOR', async () => {
    const request = jest.fn().mockResolvedValue({
      data: createFlokzuResponse(),
    });
    const repository = new GetFlokzuProcessInstanceRepository({
      apiKey: 'api-key',
      username: 'user@example.com',
      httpClient: { request } as unknown as AxiosInstance,
    });

    const result = await repository.getByIdentifier({
      identifier: ' TLQV-14921 ',
    });

    expect(request).toHaveBeenCalledWith({
      method: 'GET',
      url: '/flokzuopenapi/api/v2/process/instance',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Api-Key': 'api-key',
        'X-Username': 'user@example.com',
      },
      data: {
        identifier: 'TLQV-14921',
      },
    });
    expect(result.processInstance.identifier).toBe('TLQV-14921');
    expect(result.processInstance.cuitComprador).toBe('27-18771957-2');
    expect(result.processInstance.cuitCompradorDigits).toBe('27187719572');
    expect(result.processInstance.fields.CUITCOMPRADOR).toBe('27-18771957-2');
    expect(result.processInstance.buyerData).toEqual({
      cuitComprador: '27-18771957-2',
      cuitCompradorDigits: '27187719572',
      cuitEnvio: '27187719572',
      cuitEnvioDigits: '27187719572',
      nombreDestinatario: 'Tania Silvia Coronel Alferrano',
      telefono: '(351) 15 651-3528',
      direccion: 'Belgrano 53',
      ciudad: 'CORDOBA',
      provincia: 'CORDOBA',
      codigoPostal: '5000',
      email: 'taniasilvia.coronel@gmail.com',
    });
  });

  it('returns null CUIT values when CUITCOMPRADOR is empty', async () => {
    const response = createFlokzuResponse();
    response.data.fields.CUITCOMPRADOR = '';
    const request = jest.fn().mockResolvedValue({ data: response });
    const repository = new GetFlokzuProcessInstanceRepository({
      apiKey: 'api-key',
      username: 'user@example.com',
      httpClient: { request } as unknown as AxiosInstance,
    });

    const result = await repository.getByIdentifier({
      identifier: 'TLQV-14921',
    });

    expect(result.processInstance.cuitComprador).toBeNull();
    expect(result.processInstance.cuitCompradorDigits).toBeNull();
  });

  it('rejects a response whose schema is invalid', async () => {
    const response = createFlokzuResponse();
    response.data.fields = undefined as unknown as Record<string, unknown>;
    const request = jest.fn().mockResolvedValue({ data: response });
    const repository = new GetFlokzuProcessInstanceRepository({
      apiKey: 'api-key',
      username: 'user@example.com',
      httpClient: { request } as unknown as AxiosInstance,
    });

    await expect(
      repository.getByIdentifier({ identifier: 'TLQV-14921' }),
    ).rejects.toBeInstanceOf(FlokzuProcessInstanceInvalidResponseError);
  });

  it('does not leak the Axios error outside the driver', async () => {
    const request = jest.fn().mockRejectedValue(new Error('network detail'));
    const repository = new GetFlokzuProcessInstanceRepository({
      apiKey: 'api-key',
      username: 'user@example.com',
      httpClient: { request } as unknown as AxiosInstance,
    });

    await expect(
      repository.getByIdentifier({ identifier: 'TLQV-14921' }),
    ).rejects.toEqual(
      new FlokzuProcessInstanceRequestError('TLQV-14921', 'network detail'),
    );
  });
});

function createFlokzuResponse() {
  return {
    status: 'OK',
    data: {
      identifier: 'TLQV-14921',
      fields: {
        CUITCOMPRADOR: '27-18771957-2',
        CUITENVIO: '27187719572',
        NOMBREDESTINATARIO: 'Tania Silvia Coronel Alferrano',
        TELEFONO: '(351) 15 651-3528',
        'Datos Cliente': 'Belgrano,53',
        CIUDAD: 'CORDOBA',
        PROVINCIA: 'CORDOBA',
        'CODIGO POSTAL': '5000',
        EMAIL: 'taniasilvia.coronel@gmail.com',
      } as Record<string, unknown>,
    },
  };
}
