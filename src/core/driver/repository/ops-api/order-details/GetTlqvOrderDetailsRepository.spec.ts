import type { AxiosInstance } from 'axios';
import {
  GetOpsApiTlqvOrderDetailsRepository,
  OpsApiTlqvOrderDetailsInvalidResponseError,
  OpsApiTlqvOrderDetailsRequestError,
} from './GetTlqvOrderDetailsRepository';

describe('GetOpsApiTlqvOrderDetailsRepository', () => {
  it('gets TLQV order details and extracts buyer data', async () => {
    const get = jest.fn().mockResolvedValue({
      data: createOpsApiResponse(),
    });
    const repository = new GetOpsApiTlqvOrderDetailsRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getByTlqvCode({
      tlqvCode: 'tlqv-12903',
    });

    expect(get).toHaveBeenCalledWith('/api/order-details', {
      params: {
        tlqtNumber: 'TLQV-12903',
      },
    });
    expect(result).toEqual({
      found: true,
      orderDetails: {
        tlqvCode: 'TLQV-12903',
        source: 'ops_api',
        saleNumber: '2000016611544830',
        buyerData: {
          cuitComprador: '30601997114',
          cuitCompradorDigits: '30601997114',
          cuitEnvio: '30601997114',
          cuitEnvioDigits: '30601997114',
          nombreDestinatario: 'Marcelo Goy',
          telefono: null,
          direccion: 'Avenida Hermanos Lescano 550',
          ciudad: 'Río Primero',
          provincia: 'Córdoba',
          codigoPostal: '5127',
          email: null,
        },
        product: {
          sku: 'B0BWJ2F8NC',
          asin: null,
          name: 'Vevor Taladro Magnético Eléctrico',
          amazonName: null,
          unitCount: 1,
          bundleCount: 1,
        },
        amounts: {
          salePrice: 880589.01,
          amazonPriceUsd: 155.9,
          amazonUnitPriceUsd: 155.9,
        },
        statuses: {
          estadoVbi: 'ENTREGADO',
          legacyEstado: null,
          amazon: null,
          shipping: null,
          order: null,
        },
        rawPayload: createOpsApiResponse(),
      },
    });
  });

  it('returns not found when Ops API returns HTTP 404', async () => {
    const get = jest.fn().mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 404,
        data: { status: 'not_found' },
      },
    });
    const repository = new GetOpsApiTlqvOrderDetailsRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getByTlqvCode({
      tlqvCode: 'TLQV-99999',
    });

    expect(result).toEqual({
      found: false,
      tlqvCode: 'TLQV-99999',
      source: 'ops_api',
      reason: 'not_found',
      rawPayload: { status: 'not_found' },
    });
  });

  it('rejects an invalid success response', async () => {
    const get = jest.fn().mockResolvedValue({
      data: { status: 'success', sale: { tlqtNumber: 'TLQV-OTHER' } },
    });
    const repository = new GetOpsApiTlqvOrderDetailsRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.getByTlqvCode({ tlqvCode: 'TLQV-12903' }),
    ).rejects.toBeInstanceOf(OpsApiTlqvOrderDetailsInvalidResponseError);
  });

  it('does not leak Axios errors outside the driver', async () => {
    const get = jest.fn().mockRejectedValue(new Error('network detail'));
    const repository = new GetOpsApiTlqvOrderDetailsRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.getByTlqvCode({ tlqvCode: 'TLQV-12903' }),
    ).rejects.toEqual(
      new OpsApiTlqvOrderDetailsRequestError('TLQV-12903', 'network detail'),
    );
  });
});

function createOpsApiResponse() {
  return {
    status: 'success',
    query: {
      tlqtNumber: 'TLQV-12903',
    },
    sale: {
      id: 'e4e3fec3-3b97-4683-b2ba-4e617981a95a',
      tlqtNumber: 'TLQV-12903',
      saleNumber: '2000016611544830',
      statuses: {
        estadoVbi: {
          value: 100000014,
          label: 'ENTREGADO',
        },
        legacyEstado: null,
        amazon: null,
        shipping: null,
        order: null,
      },
      customer: {
        recipientName: 'Marcelo Goy',
        buyerCuit: '30601997114',
        shippingCuit: '30601997114',
        email: null,
        phone: null,
        phoneSource: null,
        canonicalPhone: null,
        legacyPhone: null,
        address: {
          raw: 'Avenida Hermanos Lescano 550',
          city: 'Río Primero\n',
          province: 'Córdoba',
          postalCode: '5127',
        },
      },
      product: {
        sku: 'B0BWJ2F8NC',
        asin: null,
        name: 'Vevor Taladro Magnético Eléctrico',
        amazonName: null,
        unitCount: 1,
        bundleCount: 1,
      },
      amounts: {
        salePrice: 880589.01,
        amazonPriceUsd: 155.9,
        amazonUnitPriceUsd: 155.9,
      },
    },
  };
}
