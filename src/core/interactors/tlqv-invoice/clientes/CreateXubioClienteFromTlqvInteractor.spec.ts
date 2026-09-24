import type { IInvoiceClientIssueRepository } from '../../../adapters/repositories/invoice/client-issues/IInvoiceClientIssueRepository';
import type { IMadreXubioComprobantesRepository } from '../../../adapters/repositories/madre-api/xubio/comprobantes/IMadreXubioComprobantesRepository';
import type { IGetTlqvOrderDetailsRepository } from '../../../adapters/repositories/tlqv/order-details/IGetTlqvOrderDetailsRepository';
import type { IGetTusFacturasAfipInfoRepository } from '../../../adapters/repositories/tus-facturas/afip-info/IGetTusFacturasAfipInfoRepository';
import type { ICreateXubioClienteRepository } from '../../../adapters/repositories/xubio/clientes/ICreateXubioClienteRepository';
import type { IFindXubioClienteRepository } from '../../../adapters/repositories/xubio/clientes/IFindXubioClienteRepository';
import type { TlqvOrderBuyerData } from '../../../entities/tlqv/order-details/TlqvOrderDetails';
import { CreateXubioClienteFromTlqvInteractor } from '../clientes/CreateXubioClienteFromTlqvInteractor';

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
    expect(result.orderDetails?.source).toBe('flokzu');
  });

  it.each(['ENTREGADO', 'RECIBIDO_BUENOS_AIRES', 'ETIQUETA_IMPRESA'])(
    'allows other invoiceable order statuses from Ops API (%s)',
    async (estadoVbi) => {
      const repositories = createRepositories();
      repositories.opsOrderDetails.getByTlqvCode.mockResolvedValue({
        found: true,
        orderDetails: createOrderDetails({}, { estadoVbi }),
      });
      const interactor = createInteractor(repositories);

      const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

      expect(result.status).toBe('created');
    },
  );

  it('blocks when the Ops API order status is not invoiceable', async () => {
    const repositories = createRepositories();
    repositories.opsOrderDetails.getByTlqvCode.mockResolvedValue({
      found: true,
      orderDetails: createOrderDetails({}, { estadoVbi: 'EN_TRANSITO' }),
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('blocked');
    expect(result.canContinue).toBe(false);
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      {
        code: 'ORDER_STATUS_NOT_INVOICEABLE',
        message:
          'TLQV-14921 has order status "EN_TRANSITO" in Ops API; it must be one of: DESPACHADA_BUENOS_AIRES, ENTREGADO, RECIBIDO_BUENOS_AIRES, ETIQUETA_IMPRESA.',
      },
    ]);
    expect(repositories.tusFacturas.getAfipInfo).not.toHaveBeenCalled();
    expect(repositories.xubioClientes.create).not.toHaveBeenCalled();
  });

  it('blocks when the Ops API order status is missing', async () => {
    const repositories = createRepositories();
    repositories.opsOrderDetails.getByTlqvCode.mockResolvedValue({
      found: true,
      orderDetails: createOrderDetails({}, { estadoVbi: null }),
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      expect.objectContaining({ code: 'ORDER_STATUS_NOT_INVOICEABLE' }),
    ]);
  });

  it('does not validate order status when order details come from Flokzu', async () => {
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
  });

  it('uses an existing Xubio cliente before calling TusFacturas or create', async () => {
    const repositories = createRepositories();
    repositories.opsOrderDetails.getByTlqvCode.mockResolvedValue({
      found: true,
      orderDetails: createOrderDetails({
        cuitComprador: '44.482.399',
        cuitCompradorDigits: '44482399',
      }),
    });
    repositories.xubioClientesFinder.findByName.mockResolvedValue({
      clientes: [
        {
          clienteId: 10270718,
          nombre: 'Tania Silvia Coronel Alferrano',
          razonSocial: 'Tania Silvia Coronel Alferrano',
          identificacionTributaria: {
            codigo: 'DNI',
          },
          categoriaFiscal: {
            codigo: 'CF',
            nombre: 'Consumidor Final',
          },
          cuit: '44.482.399',
          rawPayload: {},
        },
      ],
      rawPayload: [],
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('already_exists');
    if (result.status !== 'already_exists') {
      throw new Error('Expected already_exists response');
    }
    expect(repositories.xubioClientesFinder.findByName).toHaveBeenCalledWith({
      nombre: 'Tania Silvia Coronel Alferrano',
    });
    expect(repositories.tusFacturas.getAfipInfo).not.toHaveBeenCalled();
    expect(repositories.xubioClientes.create).not.toHaveBeenCalled();
    expect(result.xubioClienteResult.cliente?.clienteId).toBe(10270718);
    expect(result.fiscalInfo.condicionImpositiva).toBe('CONSUMIDOR FINAL');
    expect(result.canContinue).toBe(true);
  });

  it('recovers an existing Xubio cliente stored under a longer name, via the listing (TLQV-17518)', async () => {
    const repositories = createRepositories();
    repositories.xubioClientes.create.mockResolvedValue({
      status: 'already_exists',
      created: false,
      alreadyExistsDetail: 'Ya existe un cliente con ese documento',
      rawPayload: {},
    });
    // Every exact-name lookup misses because Xubio stores the cliente under a
    // longer name than the order carries — the real TLQV-17518 case was an
    // order for "Fabiana Cammajo" against a cliente "FABIANA ICELA CAMMAJO".
    repositories.xubioClientesFinder.findByName.mockResolvedValue({
      clientes: [],
      rawPayload: [],
    });
    // The listing is minimal — id and name only, like the real endpoint.
    repositories.xubioClientesFinder.listAll.mockResolvedValue({
      clientes: [
        {
          clienteId: 10406002,
          nombre: 'TANIA SILVIA CORONEL ALFERRANO DE PEREZ',
          rawPayload: {},
        },
        { clienteId: 10111111, nombre: 'OTRO CLIENTE', rawPayload: {} },
      ],
      rawPayload: [],
    });
    // Re-reading the single hit by exact name returns the full bean, whose
    // document is what actually confirms the match.
    repositories.xubioClientesFinder.findByName.mockImplementation(
      ({ nombre }: { nombre: string }) =>
        Promise.resolve(
          nombre === 'TANIA SILVIA CORONEL ALFERRANO DE PEREZ'
            ? {
                clientes: [
                  {
                    clienteId: 10406002,
                    nombre: 'TANIA SILVIA CORONEL ALFERRANO DE PEREZ',
                    razonSocial: 'TANIA SILVIA CORONEL ALFERRANO DE PEREZ',
                    cuit: '27-18771957-2',
                    rawPayload: {},
                  },
                ],
                rawPayload: [],
              }
            : { clientes: [], rawPayload: [] },
        ),
    );
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(repositories.xubioClientesFinder.listAll).toHaveBeenCalled();
    expect(result.status).toBe('already_exists');
    if (result.status !== 'already_exists') {
      throw new Error('Expected already_exists response');
    }
    expect(result.xubioClienteResult.cliente?.clienteId).toBe(10406002);
    expect(result.canContinue).toBe(true);
    expect(repositories.issues.upsert).not.toHaveBeenCalled();
  });

  it('does not guess when the listing has more than one name match', async () => {
    const repositories = createRepositories();
    repositories.xubioClientes.create.mockResolvedValue({
      status: 'already_exists',
      created: false,
      alreadyExistsDetail: 'Ya existe un cliente con ese documento',
      rawPayload: {},
    });
    repositories.xubioClientesFinder.findByName.mockResolvedValue({
      clientes: [],
      rawPayload: [],
    });
    repositories.xubioClientesFinder.listAll.mockResolvedValue({
      clientes: [
        {
          clienteId: 1,
          nombre: 'TANIA SILVIA CORONEL ALFERRANO DE PEREZ',
          rawPayload: {},
        },
        {
          clienteId: 2,
          nombre: 'TANIA SILVIA CORONEL ALFERRANO DE GOMEZ',
          rawPayload: {},
        },
      ],
      rawPayload: [],
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('blocked');
  });

  it('looks a company CUIT up as CUIT and files it in Xubio as CUIT (TLQV-19277)', async () => {
    const repositories = createRepositories();
    // ONE PACK S.A., CUIT 33-71654296-9.
    repositories.opsOrderDetails.getByTlqvCode.mockResolvedValue({
      found: true,
      orderDetails: createOrderDetails({
        cuitComprador: '33-71654296-9',
        cuitCompradorDigits: '33716542969',
      }),
    });
    repositories.tusFacturas.getAfipInfo.mockResolvedValue({
      found: true,
      status: 'found',
      afipInfo: {
        documentoNro: '33-71654296-9',
        documentoNroDigits: '33716542969',
        documentoTipo: 'CUIT',
        razonSocial: 'ONE PACK S.A.',
        condicionImpositiva: 'RESPONSABLE INSCRIPTO',
        direccion: 'Conesa 2553',
        codigoPostal: '1428',
        provincia: 'Capital Federal',
        rawPayload: {},
      },
    });
    const interactor = createInteractor(repositories);

    await interactor.execute({ tlqvCode: 'TLQV-19277' });

    // This used to send CUIL for every 30/33/34 prefix. TusFacturas answers
    // nothing at all for a CUIL, and it reports that miss with a message that
    // blames a possible ARCA outage, so every company looked like a service
    // problem; the clientes that did get through carried CUIL as their
    // identificacion tributaria instead of their CUIT.
    expect(repositories.tusFacturas.getAfipInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        documentoNro: '33716542969',
        documentoTipo: 'CUIT',
      }),
    );
    expect(repositories.xubioClientes.create).toHaveBeenCalledWith({
      cliente: {
        nombre: 'Tania Silvia Coronel Alferrano',
        razonSocial: 'ONE PACK S.A.',
        primerNombre: 'Tania',
        primerApellido: 'Silvia Coronel Alferrano',
        identificacionTributaria: {
          codigo: 'CUIT',
        },
        categoriaFiscal: {
          codigo: 'RI',
        },
        pais: {
          codigo: 'ARGENTINA',
        },
        cuit: '33-71654296-9',
        CUIT: '33-71654296-9',
        direccion: 'Belgrano 53',
        codigoPostal: '5000',
        provincia: {
          nombre: 'CORDOBA',
        },
        usrCode: 'TLQV-33716542969',
        descripcion: 'Cliente creado automáticamente desde TLQV',
        esclienteextranjero: 0,
        esProveedor: 0,
      },
    });
  });

  it('does not invent a DNI for a company CUIT when the fiscal lookup fails (TLQV-18421)', async () => {
    const repositories = createRepositories();
    // ENSEMBLE S. R. L., CUIT 30-71211042-9.
    repositories.opsOrderDetails.getByTlqvCode.mockResolvedValue({
      found: true,
      orderDetails: createOrderDetails({
        cuitComprador: '30-71211042-9',
        cuitCompradorDigits: '30712110429',
      }),
    });
    // TusFacturas comes back empty — ARCA down, or incomplete constancia.
    repositories.tusFacturas.getAfipInfo.mockResolvedValue({
      found: false,
      status: 'invalid_document',
      invalidDocument: {
        documentoNro: '30-71211042-9',
        documentoTipo: 'CUIT',
        documentoNroDigits: '30712110429',
        message: 'Error EIP14',
        messages: ['Error EIP14'],
        rawPayload: {},
      },
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    // Before the fix this created "ENSEMBLE" with DNI 71.211.042 — the middle
    // digits of the CUIT — and invoiced it as B.
    expect(repositories.xubioClientes.create).not.toHaveBeenCalled();
    expect(result.status).toBe('invalid_fiscal_document');
    expect(result.canContinue).toBe(false);
  });

  it('prefers the cliente holding the full CUIT over the duplicate with the derived DNI', async () => {
    const repositories = createRepositories();
    // Two fichas for the same empresa: the real one with the CUIT, and the one
    // the consumidor final fallback created with the DNI sliced out of it.
    repositories.xubioClientesFinder.findByName.mockResolvedValue({
      clientes: [
        {
          clienteId: 10459207,
          nombre: 'Crystal Ice SRL (duplicado - no usar)',
          cuit: '71.731.090',
          usrCode: 'TLQV-27187719572',
          rawPayload: {},
        },
        {
          clienteId: 10158958,
          nombre: 'CRYSTAL-ICE S. R. L.',
          cuit: '27-18771957-2',
          rawPayload: {},
        },
      ],
      rawPayload: [],
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    if (
      result.status === 'blocked' ||
      result.status === 'invalid_fiscal_document'
    ) {
      throw new Error('Expected the existing cliente to be resolved');
    }
    // The derived DNI matches too, but only by construction — the CUIT wins.
    expect(result.xubioClienteResult.cliente?.clienteId).toBe(10158958);
  });

  it('resolves an existing Xubio cliente before attempting to create it', async () => {
    const repositories = createRepositories();
    repositories.xubioClientes.create.mockResolvedValue({
      status: 'already_exists',
      created: false,
      alreadyExistsDetail:
        'Ya existe el código TLQV-27187719572, este ha sido creado anteriormente como TLQV-27187719572',
      rawPayload: {
        description: 'Ya existe el código TLQV-27187719572',
      },
    });
    repositories.xubioClientesFinder.findByName
      .mockResolvedValueOnce({
        clientes: [],
        rawPayload: [],
      })
      .mockResolvedValueOnce({
        clientes: [],
        rawPayload: [],
      })
      .mockResolvedValueOnce({
        clientes: [],
        rawPayload: [],
      })
      .mockResolvedValueOnce({
        clientes: [],
        rawPayload: [],
      })
      .mockResolvedValueOnce({
        clientes: [],
        rawPayload: [],
      })
      .mockResolvedValueOnce({
        clientes: [],
        rawPayload: [],
      })
      .mockResolvedValue({
        clientes: [
          {
            clienteId: 10256469,
            nombre: 'Tania Silvia Coronel Alferrano',
            razonSocial: 'ARTURO GUTIERREZ',
            usrCode: 'TLQV-27187719572',
            cuit: '27-18771957-2',
            rawPayload: {},
          },
        ],
        rawPayload: [],
      });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('already_exists');
    if (result.status !== 'already_exists') {
      throw new Error('Expected already_exists response');
    }
    expect(repositories.xubioClientesFinder.findByName).toHaveBeenCalledWith({
      nombre: 'TLQV-27187719572',
    });
    // Found by razón social before creating anything, so Xubio is never asked
    // to create a cliente that already exists.
    expect(repositories.xubioClientes.create).not.toHaveBeenCalled();
    expect(result.xubioClienteResult.cliente?.clienteId).toBe(10256469);
    expect(result.canContinue).toBe(true);
    expect(repositories.issues.upsert).not.toHaveBeenCalled();
  });

  it('resolves an existing Xubio cliente by name only when Xubio rejects create as a duplicate name, without logging a spurious issue', async () => {
    const repositories = createRepositories();
    repositories.opsOrderDetails.getByTlqvCode.mockResolvedValue({
      found: true,
      orderDetails: createOrderDetails({
        cuitComprador: '20-20870031-7',
        cuitCompradorDigits: '20208700317',
      }),
    });
    repositories.tusFacturas.getAfipInfo.mockResolvedValue({
      status: 'found',
      found: true,
      afipInfo: {
        documentoNro: '20-20870031-7',
        documentoNroDigits: '20208700317',
        documentoTipo: 'CUIT',
        razonSocial: 'Juan Pablo Quiroga',
        condicionImpositiva: 'MONOTRIBUTO',
        direccion: 'San Juan 824 PA',
        codigoPostal: '5600',
        provincia: 'MENDOZA',
        rawPayload: {},
      },
    });
    repositories.xubioClientes.create.mockResolvedValue({
      status: 'already_exists',
      created: false,
      alreadyExistsDetail:
        'Ya existe el nombre Juan Pablo Quiroga, este ha sido creado anteriormente como Juan Pablo Quiroga.',
      rawPayload: {
        description:
          'Ya existe el nombre Juan Pablo Quiroga, este ha sido creado anteriormente como Juan Pablo Quiroga.',
      },
    });
    // The existing Xubio cliente has no usrCode/cuit recorded (e.g. created
    // by a separate process), so it can only be matched by name.
    repositories.xubioClientesFinder.findByName.mockResolvedValue({
      clientes: [
        {
          clienteId: 10500001,
          nombre: 'Juan Pablo Quiroga',
          razonSocial: 'Juan Pablo Quiroga',
          rawPayload: {},
        },
      ],
      rawPayload: [],
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-18408' });

    expect(result.status).toBe('already_exists');
    if (result.status !== 'already_exists') {
      throw new Error('Expected already_exists response');
    }
    expect(result.canContinue).toBe(true);
    expect(result.xubioClienteResult.cliente?.clienteId).toBe(10500001);
    expect(repositories.issues.upsert).not.toHaveBeenCalled();
  });

  it('blocks when an existing Xubio cliente cannot be found after already_exists', async () => {
    const repositories = createRepositories();
    repositories.xubioClientes.create.mockResolvedValue({
      status: 'already_exists',
      created: false,
      alreadyExistsDetail:
        'Ya existe el código TLQV-27187719572, este ha sido creado anteriormente como TLQV-27187719572',
      rawPayload: {
        description: 'Ya existe el código TLQV-27187719572',
      },
    });
    repositories.xubioClientesFinder.findByName.mockResolvedValue({
      clientes: [],
      rawPayload: [],
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: 'XUBIO_EXISTING_CLIENT_NOT_FOUND',
      }),
    ]);
    expect(repositories.issues.upsert).not.toHaveBeenCalled();
  });

  it('returns blocked when prepare validation blocks the TLQV', async () => {
    const repositories = createRepositories();
    repositories.madre.existsByTlqvCode.mockResolvedValue({
      tlqvCode: 'TLQV-14921',
      exists: true,
    });
    repositories.madre.findFullByTlqvCode.mockResolvedValue({
      items: [
        {
          xubioTransactionId: 76985617,
          documentKind: 'INVOICE',
          rawDetailPayload: {},
        },
      ],
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

  it('creates a consumidor final Xubio cliente when TusFacturas rejects a derivable CUIT', async () => {
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

    expect(result.status).toBe('created');
    if (result.status !== 'created') {
      throw new Error('Expected created response');
    }
    expect(result.canContinue).toBe(true);
    expect(result.fiscalInfo).toEqual({
      documentoNro: '18.771.957',
      documentoNroDigits: '18771957',
      documentoTipo: 'CUIT',
      razonSocial: 'Tania Silvia Coronel Alferrano',
      condicionImpositiva: 'CONSUMIDOR FINAL',
      direccion: 'Belgrano 53',
      codigoPostal: '5000',
      provincia: 'CORDOBA',
      rawPayload: { error: 'S' },
    });
    expect(repositories.xubioClientes.create).toHaveBeenCalledWith({
      cliente: {
        nombre: 'Tania Silvia Coronel Alferrano',
        razonSocial: 'Tania Silvia Coronel Alferrano',
        primerNombre: 'Tania',
        primerApellido: 'Silvia Coronel Alferrano',
        identificacionTributaria: {
          codigo: 'DNI',
        },
        categoriaFiscal: {
          codigo: 'CF',
        },
        pais: {
          codigo: 'ARGENTINA',
        },
        cuit: '18.771.957',
        CUIT: '18.771.957',
        direccion: 'Belgrano 53',
        codigoPostal: '5000',
        provincia: {
          nombre: 'CORDOBA',
        },
        usrCode: 'TLQV-27187719572',
        descripcion: 'Cliente creado automáticamente desde TLQV',
        esclienteextranjero: 0,
        esProveedor: 0,
      },
    });
    expect(repositories.issues.upsert).not.toHaveBeenCalled();
  });

  it('normalizes buyer provincia "Capital Federal" for a consumidor final Xubio cliente', async () => {
    const repositories = createRepositories();
    repositories.opsOrderDetails.getByTlqvCode.mockResolvedValue({
      found: true,
      orderDetails: createOrderDetails({ provincia: 'Capital Federal' }),
    });
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

    await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(repositories.xubioClientes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining() is typed `any` by Jest
        cliente: expect.objectContaining({
          provincia: { nombre: 'Ciudad Autónoma de Buenos Aires' },
        }),
      }),
    );
  });

  it('creates a consumidor final Xubio cliente when TusFacturas rejects a 10 digit document with person prefix', async () => {
    const repositories = createRepositories();
    repositories.opsOrderDetails.getByTlqvCode.mockResolvedValue({
      found: true,
      orderDetails: createOrderDetails({
        cuitComprador: '2722395581',
        cuitCompradorDigits: '2722395581',
      }),
    });
    repositories.tusFacturas.getAfipInfo.mockResolvedValue({
      status: 'invalid_document',
      found: false,
      invalidDocument: {
        documentoNro: '2722395581',
        documentoNroDigits: '2722395581',
        documentoTipo: 'CUIT',
        message: 'No pudimos obtener datos para el CUIT ingresado.',
        messages: ['No pudimos obtener datos para el CUIT ingresado.'],
        rawPayload: { error: 'S' },
      },
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('created');
    if (result.status !== 'created') {
      throw new Error('Expected created response');
    }
    expect(result.fiscalInfo.documentoNroDigits).toBe('22395581');
    expect(repositories.xubioClientes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining() is typed `any` by Jest
        cliente: expect.objectContaining({
          identificacionTributaria: {
            codigo: 'DNI',
          },
          categoriaFiscal: {
            codigo: 'CF',
          },
          cuit: '22.395.581',
          CUIT: '22.395.581',
          usrCode: 'TLQV-2722395581',
        }),
      }),
    );
    expect(repositories.issues.upsert).not.toHaveBeenCalled();
  });

  it('creates a consumidor final Xubio cliente when TusFacturas does not return fiscal condition', async () => {
    const repositories = createRepositories();
    repositories.tusFacturas.getAfipInfo.mockResolvedValue({
      status: 'found',
      found: true,
      afipInfo: {
        documentoNro: '27-18771957-2',
        documentoNroDigits: '27187719572',
        documentoTipo: 'CUIT',
        razonSocial: 'Tania Silvia Coronel Alferrano',
        condicionImpositiva: null,
        direccion: 'Belgrano 53',
        codigoPostal: '5000',
        provincia: 'CORDOBA',
        rawPayload: { condicion_impositiva: '' },
      },
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('created');
    if (result.status !== 'created') {
      throw new Error('Expected created response');
    }
    expect(result.canContinue).toBe(true);
    expect(result.fiscalInfo.condicionImpositiva).toBe('CONSUMIDOR FINAL');
    expect(result.fiscalInfo.documentoNroDigits).toBe('18771957');
    expect(repositories.xubioClientes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining() is typed `any` by Jest
        cliente: expect.objectContaining({
          identificacionTributaria: {
            codigo: 'DNI',
          },
          categoriaFiscal: {
            codigo: 'CF',
          },
          cuit: '18.771.957',
          CUIT: '18.771.957',
        }),
      }),
    );
    expect(repositories.issues.upsert).not.toHaveBeenCalled();
  });

  it('returns invalid_fiscal_document and records issue when TusFacturas rejects a non-derivable document', async () => {
    const repositories = createRepositories();
    repositories.opsOrderDetails.getByTlqvCode.mockResolvedValue({
      found: true,
      orderDetails: createOrderDetails({
        cuitComprador: '1',
        cuitCompradorDigits: '1',
      }),
    });
    repositories.tusFacturas.getAfipInfo.mockResolvedValue({
      status: 'invalid_document',
      found: false,
      invalidDocument: {
        documentoNro: '1',
        documentoNroDigits: '1',
        documentoTipo: 'CUIT',
        message: 'No pudimos obtener datos para el CUIT ingresado.',
        messages: ['No pudimos obtener datos para el CUIT ingresado.'],
        rawPayload: { error: 'S' },
      },
    });
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('invalid_fiscal_document');
    expect(repositories.issues.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tlqvCode: 'TLQV-14921',
        reason: 'INVALID_FISCAL_DOCUMENT',
        source: 'tus_facturas',
        cuit: '1',
        documentoTipo: 'CUIT',
        documentoNro: '1',
        documentoNroDigits: '1',
        message:
          'TLQV-14921 trae documento fiscal "1" (1 dígitos). No se puede consultar TusFacturas ni derivar un DNI/CUIT válido automáticamente. Hay que corregir el documento o cargarlo manualmente como consumidor final.',
        messages: [
          'TLQV-14921 trae documento fiscal "1" (1 dígitos). No se puede consultar TusFacturas ni derivar un DNI/CUIT válido automáticamente. Hay que corregir el documento o cargarlo manualmente como consumidor final.',
          'No pudimos obtener datos para el CUIT ingresado.',
        ],
        rawPayload: { error: 'S' },
        now: new Date('2026-07-07T12:00:00.000Z'),
      }),
    );
    expect(repositories.xubioClientes.create).not.toHaveBeenCalled();
  });

  it('returns blocked instead of throwing when TusFacturas is unavailable', async () => {
    const repositories = createRepositories();
    repositories.tusFacturas.getAfipInfo.mockRejectedValue(
      new Error('timeout of 20000ms exceeded'),
    );
    const interactor = createInteractor(repositories);

    const result = await interactor.execute({ tlqvCode: 'TLQV-14921' });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') {
      throw new Error('Expected blocked response');
    }
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: 'FISCAL_INFO_UNAVAILABLE',
        message:
          'No se pudo validar la condición fiscal en TusFacturas. timeout of 20000ms exceeded',
      }),
    ]);
    expect(repositories.xubioClientes.create).not.toHaveBeenCalled();
  });
});

function createInteractor(repositories: ReturnType<typeof createRepositories>) {
  return new CreateXubioClienteFromTlqvInteractor(
    repositories.madre,
    [repositories.opsOrderDetails, repositories.flokzuOrderDetails],
    repositories.tusFacturas,
    repositories.xubioClientes,
    repositories.issues,
    () => new Date('2026-07-07T12:00:00.000Z'),
    repositories.xubioClientesFinder,
  );
}

function createRepositories(): {
  madre: IMadreXubioComprobantesRepository & {
    findByTlqvCodes: jest.Mock;
    findByTlqvCode: jest.Mock;
    findFullByTlqvCode: jest.Mock;
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
  xubioClientesFinder: IFindXubioClienteRepository & {
    findByName: jest.Mock;
    listAll: jest.Mock;
  };
  issues: IInvoiceClientIssueRepository & { upsert: jest.Mock };
} {
  return {
    madre: {
      createSyncRun: jest.fn(),
      updateSyncRun: jest.fn(),
      upsertBatch: jest.fn(),
      findByTlqvCodes: jest.fn(),
      findByTlqvCode: jest.fn(),
      findFullByTlqvCode: jest.fn(),
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
    xubioClientesFinder: {
      findByName: jest.fn().mockResolvedValue({
        clientes: [],
        rawPayload: [],
      }),
      listAll: jest.fn().mockResolvedValue({
        clientes: [],
        rawPayload: [],
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
    provincia: string | null;
  }> = {},
  overrides: {
    estadoVbi?: string | null;
  } = {},
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
    statuses: {
      estadoVbi:
        overrides.estadoVbi === undefined
          ? 'DESPACHADA_BUENOS_AIRES'
          : overrides.estadoVbi,
    },
    rawPayload: {},
  };
}
