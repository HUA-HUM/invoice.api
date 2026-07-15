import type { AxiosInstance } from 'axios';
import {
  CatalogSyncSkuDetailsInvalidResponseError,
  CatalogSyncSkuDetailsRequestError,
  GetDetailsSkuRepository,
} from './GetDetailsSkuRepository';

describe('GetDetailsSkuRepository', () => {
  it('gets Catalog Sync product details by SKU', async () => {
    const get = jest.fn().mockResolvedValue({
      data: createCatalogResponse(),
    });
    const repository = new GetDetailsSkuRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getDetailsBySku({ sku: ' b0byzx8x9h ' });

    expect(get).toHaveBeenCalledWith('/analytics/products/performance', {
      params: {
        sku: 'B0BYZX8X9H',
      },
    });
    expect(result).toEqual({
      found: true,
      productDetails: {
        sku: 'B0BYZX8X9H',
        sellerId: '1757836744',
        itemId: 'MLA1757293798',
        title: 'Freidora De Aire Cosori Pro Iii Dual Blaze 6.8l Color',
        brand: 'Cosori',
        categoryId: 'MLA456045',
        domainId: 'MLA-AIR_FRYERS',
        status: 'paused',
        condition: 'new',
        price: 1123000,
        currencyId: 'ARS',
        stock: 0,
        availableQuantity: 0,
        catalogSoldQuantity: 1,
        permalink:
          'https://articulo.mercadolibre.com.ar/MLA-1757293798-freidora-de-aire-cosori-pro-iii-dual-blaze-68l-color-_JM',
        thumbnail:
          'http://http2.mlstatic.com/D_627648-MLA96667737460_112025-I.jpg',
        rawPayload: createCatalogResponse().products[0],
      },
    });
  });

  it('returns not found when SKU is not in products', async () => {
    const get = jest.fn().mockResolvedValue({
      data: {
        products: [],
      },
    });
    const repository = new GetDetailsSkuRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    const result = await repository.getDetailsBySku({ sku: 'B0BYZX8X9H' });

    expect(result).toEqual({
      found: false,
      sku: 'B0BYZX8X9H',
      rawPayload: {
        products: [],
      },
    });
  });

  it('rejects invalid response bodies', async () => {
    const get = jest.fn().mockResolvedValue({
      data: {
        products: {},
      },
    });
    const repository = new GetDetailsSkuRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.getDetailsBySku({ sku: 'B0BYZX8X9H' }),
    ).rejects.toBeInstanceOf(CatalogSyncSkuDetailsInvalidResponseError);
  });

  it('does not leak Axios errors outside the driver', async () => {
    const get = jest.fn().mockRejectedValue(new Error('network detail'));
    const repository = new GetDetailsSkuRepository({
      httpClient: { get } as unknown as AxiosInstance,
    });

    await expect(
      repository.getDetailsBySku({ sku: 'B0BYZX8X9H' }),
    ).rejects.toEqual(
      new CatalogSyncSkuDetailsRequestError('B0BYZX8X9H', 'network detail'),
    );
  });
});

function createCatalogResponse() {
  return {
    products: [
      {
        seller_id: '1757836744',
        item_id: 'MLA1757293798',
        title: 'Freidora De Aire Cosori Pro Iii Dual Blaze 6.8l Color',
        sku: 'B0BYZX8X9H',
        brand: 'Cosori',
        category_id: 'MLA456045',
        domain_id: 'MLA-AIR_FRYERS',
        status: 'paused',
        condition: 'new',
        price: '1123000.00',
        currency_id: 'ARS',
        stock: 0,
        available_quantity: 0,
        catalog_sold_quantity: 1,
        permalink:
          'https://articulo.mercadolibre.com.ar/MLA-1757293798-freidora-de-aire-cosori-pro-iii-dual-blaze-68l-color-_JM',
        thumbnail:
          'http://http2.mlstatic.com/D_627648-MLA96667737460_112025-I.jpg',
      },
    ],
  };
}
