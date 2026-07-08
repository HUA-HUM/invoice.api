import type { IInvoiceClientIssueRepository } from '../../adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import type { IGetTusFacturasAfipInfoRepository } from '../../adapters/repositories/tus-facturas/afip-info/IGetTusFacturasAfipInfoRepository';
import { GetTusFacturasAfipInfoInteractor } from './GetTusFacturasAfipInfoInteractor';

describe('GetTusFacturasAfipInfoInteractor', () => {
  it('delegates AFIP info lookup to the repository', async () => {
    const getAfipInfo = jest.fn().mockResolvedValue({
      status: 'found',
      found: true,
      afipInfo: {
        documentoNro: '20-42433388-4',
        documentoNroDigits: '20424333884',
        documentoTipo: 'CUIT',
        razonSocial: 'ARTURO GUTIERREZ',
        rawPayload: {},
      },
    });
    const repository = {
      getAfipInfo,
    } as unknown as IGetTusFacturasAfipInfoRepository;
    const interactor = new GetTusFacturasAfipInfoInteractor(repository);

    const result = await interactor.execute({
      documentoNro: '20-42433388-4',
      documentoTipo: 'CUIT',
    });

    expect(getAfipInfo).toHaveBeenCalledWith({
      documentoNro: '20-42433388-4',
      documentoTipo: 'CUIT',
    });
    if (result.status !== 'found') {
      throw new Error('Expected found response');
    }
    expect(result.afipInfo.razonSocial).toBe('ARTURO GUTIERREZ');
  });

  it('records an invalid fiscal document issue when TLQV code is present', async () => {
    const getAfipInfo = jest.fn().mockResolvedValue({
      status: 'invalid_document',
      found: false,
      invalidDocument: {
        documentoNro: '20-11111111-4',
        documentoNroDigits: '20111111114',
        documentoTipo: 'CUIT',
        message: 'No pudimos obtener datos para el CUIT ingresado.',
        messages: ['No pudimos obtener datos para el CUIT ingresado.'],
        rawPayload: { error: 'S' },
      },
    });
    const repository = {
      getAfipInfo,
    } as unknown as IGetTusFacturasAfipInfoRepository;
    const upsert = jest.fn().mockResolvedValue(undefined);
    const issueRepository = {
      upsert,
      getSnapshot: jest.fn(),
      getByTlqvCode: jest.fn(),
    } as unknown as IInvoiceClientIssueRepository;
    const interactor = new GetTusFacturasAfipInfoInteractor(
      repository,
      issueRepository,
      () => new Date('2026-07-07T12:00:00.000Z'),
    );

    const result = await interactor.execute({
      tlqvCode: 'TLQV-14921',
      documentoNro: '20-11111111-4',
      issueContext: {
        saleNumber: '200001111',
        buyerName: 'Cliente Test',
        email: 'cliente@test.com',
        metadata: {
          source: 'test',
        },
      },
    });

    expect(result.status).toBe('invalid_document');
    expect(upsert).toHaveBeenCalledWith({
      tlqvCode: 'TLQV-14921',
      reason: 'INVALID_FISCAL_DOCUMENT',
      source: 'tus_facturas',
      saleNumber: '200001111',
      buyerName: 'Cliente Test',
      email: 'cliente@test.com',
      cuit: '20-11111111-4',
      documentoTipo: 'CUIT',
      message: 'No pudimos obtener datos para el CUIT ingresado.',
      messages: ['No pudimos obtener datos para el CUIT ingresado.'],
      rawPayload: { error: 'S' },
      metadata: {
        source: 'test',
      },
      now: new Date('2026-07-07T12:00:00.000Z'),
    });
  });
});
