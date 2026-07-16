import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TlqvInvoiceDocumentsData } from '../../core/entities/tlqv/TlqvInvoiceDocuments';

const PAGE_MARGIN = 36;
const TABLE_BORDER_COLOR = '#222222';
const LIGHT_BORDER_COLOR = '#cccccc';
const INVOICE_HEADER_FILL_COLOR = '#dff4ff';
const INVOICE_HEADER_BORDER_COLOR = '#8bd8ff';
const BRAND_COLOR = '#111827';
const ACCENT_COLOR = '#0f766e';
const SOFT_ACCENT_COLOR = '#ecfdf5';
const SOFT_GRAY_COLOR = '#f8fafc';
const PRODUCT_IMAGE_MAX_BYTES = 2_000_000;
const PRODUCT_IMAGE_TIMEOUT_MS = 4_000;
const LOGO_RELATIVE_PATH = join('assets', 'branding', 'tienda-logo-navbar.png');

interface InvoiceLineItem {
  productoCodigo?: string | null;
  productoNombre?: string | null;
  descripcion?: string | null;
  cantidad?: number | null;
  precio?: number | null;
  porcentajeDescuento?: number | null;
  importe?: number | null;
  iva?: number | null;
  total?: number | null;
}

@Injectable()
export class TlqvInvoiceDocumentsPdfService {
  constructor(private readonly configService: ConfigService) {}

  async generateCombinedPdf(data: TlqvInvoiceDocumentsData): Promise<Buffer> {
    const includeDeliveryNote = shouldIncludeDeliveryNote(data);
    const productImage = includeDeliveryNote
      ? await this.loadProductImage(data.catalogProductDetails?.thumbnail)
      : null;

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: PAGE_MARGIN,
        bufferPages: true,
        info: {
          Title: `Factura y remito ${data.tlqvCode}`,
          Author: 'Invoice API',
          Subject: data.tlqvCode,
        },
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.drawInvoicePage(doc, data);
      if (includeDeliveryNote) {
        doc.addPage();
        this.drawDeliveryNotePage(doc, data, productImage);
      }
      this.drawPageFooters(doc);
      doc.end();
    });
  }

  private async loadProductImage(
    url: string | null | undefined,
  ): Promise<Buffer | null> {
    if (url === undefined || url === null || url.trim() === '') {
      return null;
    }

    const normalizedUrl = normalizeHttpImageUrl(url);
    if (normalizedUrl === null) {
      return null;
    }

    for (const imageUrl of buildProductImageUrlCandidates(normalizedUrl)) {
      try {
        const response = await fetch(imageUrl, {
          signal: AbortSignal.timeout(PRODUCT_IMAGE_TIMEOUT_MS),
        });
        if (!response.ok) {
          continue;
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!isPdfKitSupportedImageContentType(contentType)) {
          continue;
        }

        const contentLength = response.headers.get('content-length');
        if (
          contentLength !== null &&
          Number(contentLength) > PRODUCT_IMAGE_MAX_BYTES
        ) {
          continue;
        }

        const image = Buffer.from(await response.arrayBuffer());
        if (
          image.length <= PRODUCT_IMAGE_MAX_BYTES &&
          isPdfKitSupportedImageBuffer(image)
        ) {
          return image;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private drawInvoicePage(
    doc: PDFKit.PDFDocument,
    data: TlqvInvoiceDocumentsData,
  ): void {
    const { comprobante } = data;

    this.drawInvoiceMeta(doc, data);
    this.drawInvoiceClientSection(doc, data);

    const tableTop = 304;
    const tableBottom = this.drawProductItemsTable(
      doc,
      getInvoiceLineItems(data),
      tableTop,
    );

    const observationsTop = Math.max(tableBottom + 18, 512);
    writeText(doc, 'Observaciones:', PAGE_MARGIN, observationsTop, 523, {
      font: 'Helvetica-Bold',
      fontSize: 11,
    });
    writeText(
      doc,
      comprobante.descripcion ?? '',
      PAGE_MARGIN,
      observationsTop + 16,
      523,
      {
        fontSize: 11,
        height: 52,
      },
    );

    const totalsTop = Math.max(observationsTop + 86, 652);
    this.drawInvoiceTotals(doc, data, totalsTop);
    this.drawInvoiceAuthorizationFooter(doc, data);
  }

  private drawDeliveryNotePage(
    doc: PDFKit.PDFDocument,
    data: TlqvInvoiceDocumentsData,
    productImage: Buffer | null,
  ): void {
    const { comprobante, orderDetails, catalogProductDetails } = data;
    this.drawBrandHeader(doc, 'REMITO / DETALLE DE ORDEN');

    const heroTop = 106;
    drawFilledBox(doc, PAGE_MARGIN, heroTop, 523, 76, SOFT_ACCENT_COLOR);
    drawBox(doc, PAGE_MARGIN, heroTop, 523, 76, '#99f6e4');
    writeText(doc, data.tlqvCode, PAGE_MARGIN + 16, heroTop + 16, 140, {
      font: 'Helvetica-Bold',
      fontSize: 22,
      color: BRAND_COLOR,
    });
    writeText(
      doc,
      `Orden ML: ${comprobante.mlOrderId ?? orderDetails?.saleNumber ?? '-'}`,
      PAGE_MARGIN + 16,
      heroTop + 46,
      220,
      {
        fontSize: 9,
        color: '#334155',
      },
    );
    drawPill(
      doc,
      orderDetails?.statuses?.estadoVbi ?? 'SIN ESTADO',
      PAGE_MARGIN + 398,
      heroTop + 16,
      108,
    );
    writeText(
      doc,
      `Factura ${comprobante.numeroDocumento ?? '-'} - ${formatDate(comprobante.fechaEmision)}`,
      PAGE_MARGIN + 280,
      heroTop + 48,
      226,
      {
        fontSize: 8,
        color: '#334155',
        align: 'right',
      },
    );

    const productTop = 202;
    drawSectionTitle(doc, 'Producto vendido', PAGE_MARGIN, productTop);
    drawProductCard(doc, data, productImage, productTop + 22);

    const buyerTop = productTop + 164;
    drawSectionTitle(doc, 'Entrega / comprador', PAGE_MARGIN, buyerTop);
    drawKeyValueGrid(
      doc,
      [
        [
          'Destinatario',
          orderDetails?.buyerData.nombreDestinatario ??
            comprobante.clienteNombre ??
            '-',
        ],
        [
          'Documento',
          orderDetails?.buyerData.cuitComprador ??
            orderDetails?.buyerData.cuitEnvio ??
            '-',
        ],
        ['Telefono', orderDetails?.buyerData.telefono ?? '-'],
        ['Email', orderDetails?.buyerData.email ?? '-'],
        ['Direccion', orderDetails?.buyerData.direccion ?? '-'],
        [
          'Localidad',
          [
            orderDetails?.buyerData.ciudad,
            orderDetails?.buyerData.provincia,
            orderDetails?.buyerData.codigoPostal,
          ]
            .filter(Boolean)
            .join(' - ') || '-',
        ],
      ],
      PAGE_MARGIN,
      buyerTop + 22,
      523,
    );

    if (data.warnings.length > 0) {
      const warningsTop = buyerTop + 112;
      drawSectionTitle(doc, 'Advertencias', PAGE_MARGIN, warningsTop);
      writeText(
        doc,
        data.warnings.map((warning) => `- ${warning}`).join('\n'),
        PAGE_MARGIN,
        warningsTop + 18,
        523,
        {
          fontSize: 8,
          color: '#777777',
        },
      );
    }
  }

  private drawBrandHeader(doc: PDFKit.PDFDocument, title: string): void {
    const logoPath = resolveLogoPath(this.configService);

    drawBox(doc, PAGE_MARGIN, PAGE_MARGIN, 523, 54);
    if (logoPath !== null) {
      doc.image(logoPath, PAGE_MARGIN + 8, PAGE_MARGIN + 8, {
        fit: [142, 36],
      });
    } else {
      writeText(
        doc,
        'TIENDA LO QUIERO ACA',
        PAGE_MARGIN + 10,
        PAGE_MARGIN + 13,
        190,
        {
          font: 'Helvetica-Bold',
          fontSize: 13,
        },
      );
    }

    writeText(doc, title, PAGE_MARGIN + 255, PAGE_MARGIN + 12, 258, {
      font: 'Helvetica-Bold',
      fontSize: 14,
      align: 'right',
    });
  }

  private drawInvoiceMeta(
    doc: PDFKit.PDFDocument,
    data: TlqvInvoiceDocumentsData,
  ): void {
    const { comprobante } = data;
    const logoPath = resolveLogoPath(this.configService);
    const letter = getInvoiceLetter(comprobante);

    if (logoPath !== null) {
      doc.image(logoPath, PAGE_MARGIN, 58, {
        fit: [132, 44],
      });
    } else {
      writeText(doc, 'TIENDA LO QUIERO ACA', PAGE_MARGIN, 82, 190, {
        font: 'Helvetica-Bold',
        fontSize: 12,
      });
    }

    writeText(doc, 'Razon Social: TLQ SRL', PAGE_MARGIN, 116, 210, {
      fontSize: 9,
    });
    writeText(
      doc,
      'Domicilio: Peru 457 2do B, Capital Federal, Ciudad Autonoma de Buenos Aires, Argentina',
      PAGE_MARGIN,
      139,
      250,
      {
        fontSize: 9,
        height: 28,
      },
    );

    writeText(doc, letter, PAGE_MARGIN + 241, 62, 44, {
      font: 'Helvetica-Bold',
      fontSize: 38,
      align: 'center',
    });
    writeText(doc, '001', PAGE_MARGIN + 241, 112, 44, {
      fontSize: 9,
      align: 'center',
    });
    writeText(
      doc,
      getIssuerFiscalCondition(letter),
      PAGE_MARGIN + 210,
      132,
      106,
      {
        fontSize: 9,
        align: 'center',
      },
    );

    writeText(doc, 'FACTURA DE VENTA', PAGE_MARGIN + 336, 54, 187, {
      font: 'Helvetica-Bold',
      fontSize: 16,
    });
    writeInvoiceMetaRow(
      doc,
      'Numero:',
      comprobante.numeroDocumento ?? '-',
      104,
    );
    writeInvoiceMetaRow(
      doc,
      'Fecha:',
      formatDate(comprobante.fechaEmision),
      118,
    );
    writeInvoiceMetaRow(doc, 'CUIT:', '33-71780304-9', 132);
    writeInvoiceMetaRow(doc, 'Ing. Brutos:', '163003011', 146);
    writeInvoiceMetaRow(doc, 'Inicio Act.:', '01/11/2022', 160);

    drawStrokeLine(doc, PAGE_MARGIN, 184, PAGE_MARGIN + 523, 184);
  }

  private drawInvoiceClientSection(
    doc: PDFKit.PDFDocument,
    data: TlqvInvoiceDocumentsData,
  ): void {
    const { comprobante, orderDetails } = data;
    const buyerDocument =
      orderDetails?.buyerData.cuitComprador ??
      orderDetails?.buyerData.cuitEnvio ??
      '-';
    const buyerAddressParts = [
      orderDetails?.buyerData.direccion,
      orderDetails?.buyerData.ciudad,
      orderDetails?.buyerData.provincia,
      orderDetails?.buyerData.codigoPostal,
    ].filter(Boolean);
    const buyerAddress =
      buyerAddressParts.length > 0
        ? buyerAddressParts.join(', ')
        : (comprobante.provinciaNombre ?? '-');

    writeLabel(doc, 'Sr. (es):', PAGE_MARGIN, 194, 52);
    writeText(
      doc,
      comprobante.clienteNombre ?? '-',
      PAGE_MARGIN + 56,
      194,
      265,
      {
        fontSize: 11,
      },
    );
    writeLabel(doc, 'CUIT:', PAGE_MARGIN + 340, 194, 48);
    writeText(doc, buyerDocument, PAGE_MARGIN + 396, 194, 127, {
      fontSize: 11,
    });

    writeLabel(doc, 'Domicilio:', PAGE_MARGIN, 224, 64);
    writeText(doc, buyerAddress, PAGE_MARGIN + 72, 224, 260, {
      fontSize: 10,
      height: 32,
    });
    writeLabel(doc, 'Cond. IVA:', PAGE_MARGIN + 340, 224, 64);
    writeText(
      doc,
      getCustomerFiscalCondition(getInvoiceLetter(comprobante)),
      PAGE_MARGIN + 422,
      224,
      101,
      {
        fontSize: 10,
      },
    );

    drawStrokeLine(doc, PAGE_MARGIN, 254, PAGE_MARGIN + 523, 254);

    writeLabel(doc, 'Moneda:', PAGE_MARGIN, 264, 50);
    writeText(
      doc,
      comprobante.monedaNombre ?? '-',
      PAGE_MARGIN + 56,
      264,
      130,
      {
        fontSize: 10,
      },
    );
    writeLabel(doc, 'Prov. Destino:', PAGE_MARGIN + 190, 264, 76);
    writeText(
      doc,
      comprobante.provinciaNombre ?? orderDetails?.buyerData.provincia ?? '-',
      PAGE_MARGIN + 274,
      264,
      160,
      {
        fontSize: 10,
      },
    );
    writeText(
      doc,
      `Fecha Vto.:  ${formatDate(comprobante.fechaVencimiento)}\nForma de pago:  ${formatPaymentCondition(comprobante.condicionPago)}`,
      PAGE_MARGIN + 406,
      258,
      117,
      {
        fontSize: 9,
        align: 'right',
      },
    );
  }

  private drawProductItemsTable(
    doc: PDFKit.PDFDocument,
    items: InvoiceLineItem[],
    y: number,
  ): number {
    const columns = [
      { label: 'Cod.', width: 38 },
      { label: 'Articulo', width: 104 },
      { label: 'Observaciones', width: 86 },
      { label: 'Cantidad', width: 40 },
      { label: 'Precio', width: 58 },
      { label: '%Dto.', width: 34 },
      { label: 'Importe', width: 58 },
      { label: 'Alic. IVA', width: 42 },
      { label: 'Impt. c/IVA', width: 63 },
    ];
    drawInvoiceTableHeader(doc, columns, PAGE_MARGIN, y, 18);

    let rowY = y + 18;
    for (const item of items.slice(0, 8)) {
      const rowHeight = 34;
      drawInvoiceTableRow(doc, columns, PAGE_MARGIN, rowY, rowHeight, [
        formatProductCode(item.productoCodigo),
        item.productoNombre ?? '',
        item.descripcion ?? '',
        formatNumber(item.cantidad),
        formatNumber(item.precio),
        formatNumber(item.porcentajeDescuento ?? 0),
        formatNumber(item.importe),
        `${getIvaRate(item).toFixed(2)}%`,
        formatNumber(item.total),
      ]);
      rowY += rowHeight;
    }

    return rowY;
  }

  private drawInvoiceTotals(
    doc: PDFKit.PDFDocument,
    data: TlqvInvoiceDocumentsData,
    y: number,
  ): void {
    const { comprobante } = data;
    drawStrokeLine(doc, PAGE_MARGIN, y, PAGE_MARGIN + 523, y);
    writeText(doc, 'IVA 2.5: 0.00', PAGE_MARGIN + 4, y + 14, 90, {
      fontSize: 8,
    });
    writeText(doc, 'IVA 5: 0.00', PAGE_MARGIN + 122, y + 14, 90, {
      fontSize: 8,
    });
    writeText(doc, 'IVA 10.5: 0.00', PAGE_MARGIN + 230, y + 14, 100, {
      fontSize: 8,
    });
    writeText(
      doc,
      `IVA 21: ${formatNumber(comprobante.importeImpuestos)}`,
      PAGE_MARGIN + 352,
      y + 14,
      90,
      {
        fontSize: 8,
      },
    );
    writeText(doc, 'IVA 27: 0.00', PAGE_MARGIN + 444, y + 14, 75, {
      fontSize: 8,
      align: 'right',
    });

    drawFilledBox(doc, PAGE_MARGIN, y + 32, 523, 24, INVOICE_HEADER_FILL_COLOR);
    drawBox(doc, PAGE_MARGIN, y + 32, 523, 24, INVOICE_HEADER_BORDER_COLOR);

    writeText(
      doc,
      `Bruto:  ${formatNumber(comprobante.importeGravado)}`,
      PAGE_MARGIN + 6,
      y + 39,
      150,
      {
        font: 'Helvetica-Bold',
        fontSize: 9,
      },
    );
    writeText(
      doc,
      `Impuestos: ${formatNumber(comprobante.importeImpuestos)}`,
      PAGE_MARGIN + 230,
      y + 39,
      140,
      {
        font: 'Helvetica-Bold',
        fontSize: 9,
      },
    );
    writeText(
      doc,
      `Total: $ ${formatNumber(comprobante.importeTotal)}`,
      PAGE_MARGIN + 382,
      y + 39,
      135,
      {
        font: 'Helvetica-Bold',
        fontSize: 9,
        align: 'right',
      },
    );
  }

  private drawInvoiceAuthorizationFooter(
    doc: PDFKit.PDFDocument,
    data: TlqvInvoiceDocumentsData,
  ): void {
    const { comprobante } = data;
    const y = 724;

    drawBox(doc, PAGE_MARGIN, y + 12, 48, 48, LIGHT_BORDER_COLOR);
    writeText(doc, 'QR\nAFIP', PAGE_MARGIN + 8, y + 28, 32, {
      font: 'Helvetica-Bold',
      fontSize: 8,
      align: 'center',
    });
    writeText(doc, 'ARCA', PAGE_MARGIN + 70, y + 8, 110, {
      font: 'Helvetica-Bold',
      fontSize: 20,
      color: '#4b5563',
    });
    writeText(
      doc,
      'AGENCIA DE RECAUDACION Y CONTROL ADUANERO',
      PAGE_MARGIN + 70,
      y + 32,
      130,
      {
        fontSize: 5.5,
        color: '#4b5563',
      },
    );
    writeText(doc, 'Comprobante Autorizado', PAGE_MARGIN + 70, y + 48, 160, {
      font: 'Helvetica-BoldOblique',
      fontSize: 9,
    });

    writeText(
      doc,
      `CAE: ${comprobante.cae ?? '-'}\nFecha Vto. CAE: ${formatDate(comprobante.caeFechaVencimiento)}`,
      PAGE_MARGIN + 284,
      y + 8,
      140,
      {
        fontSize: 9,
        align: 'right',
      },
    );
    writeText(doc, 'HECHO EN', PAGE_MARGIN + 444, y + 6, 72, {
      fontSize: 8,
      color: '#666666',
      align: 'center',
    });
    writeText(doc, 'XUBIO.com', PAGE_MARGIN + 414, y + 22, 108, {
      font: 'Helvetica-Bold',
      fontSize: 16,
      color: '#0369a1',
      align: 'center',
    });
  }

  private drawPageFooters(doc: PDFKit.PDFDocument): void {
    const pageCount = doc.bufferedPageRange().count;
    for (let index = 0; index < pageCount; index += 1) {
      doc.switchToPage(index);
      writeText(doc, `Pagina ${index + 1}`, PAGE_MARGIN, 806, 523, {
        fontSize: 7,
        color: '#777777',
        align: 'right',
      });
    }
  }
}

function shouldIncludeDeliveryNote(data: TlqvInvoiceDocumentsData): boolean {
  return data.orderDetails != null && data.catalogProductDetails != null;
}

function getInvoiceLineItems(
  data: TlqvInvoiceDocumentsData,
): InvoiceLineItem[] {
  const normalizedItems = data.comprobante.productItems ?? [];
  if (normalizedItems.length > 0) {
    return normalizedItems;
  }

  const rawItems = readRawProductItems(data.comprobante.rawDetailPayload);
  if (rawItems.length > 0) {
    return rawItems;
  }

  return [
    {
      productoCodigo: data.comprobante.tlqvCode,
      productoNombre: data.orderDetails?.product?.name ?? 'Operacion TLQV',
      descripcion: data.comprobante.descripcion ?? data.tlqvCode,
      cantidad: 1,
      precio: data.comprobante.importeGravado ?? data.comprobante.importeTotal,
      importe: data.comprobante.importeGravado ?? data.comprobante.importeTotal,
      iva: data.comprobante.importeImpuestos,
      total: data.comprobante.importeTotal,
      porcentajeDescuento: 0,
    },
  ];
}

function readRawProductItems(rawDetailPayload: unknown): InvoiceLineItem[] {
  if (!isRecord(rawDetailPayload)) {
    return [];
  }

  const rawItems = rawDetailPayload.transaccionProductoItems;
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems.filter(isRecord).map((item) => {
    const producto = isRecord(item.producto) ? item.producto : {};
    return {
      productoCodigo: readOptionalStringFromRecord(producto, 'codigo'),
      productoNombre: readOptionalStringFromRecord(producto, 'nombre'),
      descripcion: readOptionalStringFromRecord(item, 'descripcion'),
      cantidad: readOptionalNumberFromRecord(item, 'cantidad'),
      precio: readOptionalNumberFromRecord(item, 'precio'),
      importe: readOptionalNumberFromRecord(item, 'importe'),
      iva: readOptionalNumberFromRecord(item, 'iva'),
      total: readOptionalNumberFromRecord(item, 'total'),
      porcentajeDescuento: readOptionalNumberFromRecord(
        item,
        'porcentajeDescuento',
      ),
    };
  });
}

function writeInvoiceMetaRow(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  y: number,
): void {
  writeText(doc, label, PAGE_MARGIN + 336, y, 66, {
    fontSize: 10,
  });
  writeText(doc, value, PAGE_MARGIN + 404, y, 119, {
    fontSize: 10,
  });
}

function writeLabel(
  doc: PDFKit.PDFDocument,
  label: string,
  x: number,
  y: number,
  width: number,
): void {
  writeText(doc, label, x, y, width, {
    fontSize: 10,
  });
}

function getInvoiceLetter(
  comprobante: TlqvInvoiceDocumentsData['comprobante'],
): string {
  if (
    comprobante.letraComprobante !== undefined &&
    comprobante.letraComprobante !== null &&
    comprobante.letraComprobante.trim() !== ''
  ) {
    return comprobante.letraComprobante.trim();
  }

  const match = comprobante.numeroDocumento?.match(/^([A-Z])-?/i);
  return match?.[1]?.toUpperCase() ?? 'A';
}

function getIssuerFiscalCondition(letter: string): string {
  return letter.toUpperCase() === 'A'
    ? 'Responsable Inscripto'
    : 'IVA Responsable Inscripto';
}

function getCustomerFiscalCondition(letter: string): string {
  return letter.toUpperCase() === 'A'
    ? 'Responsable Inscripto'
    : 'Consumidor Final';
}

function formatProductCode(value: string | null | undefined): string {
  if (value === 'COMISIONES_EXTERNAS') {
    return 'COMEX';
  }
  return '';
}

function getIvaRate(item: InvoiceLineItem): number {
  const iva = item.iva ?? 0;
  const importe = item.importe ?? 0;
  if (iva <= 0 || importe <= 0) {
    return 0;
  }

  const rate = (iva / importe) * 100;
  if (Math.abs(rate - 21) < 0.5) {
    return 21;
  }
  if (Math.abs(rate - 10.5) < 0.5) {
    return 10.5;
  }
  if (Math.abs(rate - 27) < 0.5) {
    return 27;
  }
  return rate;
}

function resolveLogoPath(configService: ConfigService): string | null {
  const configuredPath = configService.get<string>('TLQ_LOGO_PATH')?.trim();
  const candidates = [
    configuredPath,
    join(process.cwd(), LOGO_RELATIVE_PATH),
    join(__dirname, '..', '..', '..', LOGO_RELATIVE_PATH),
  ].filter((value): value is string => value !== undefined && value !== '');

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function normalizeHttpImageUrl(value: string): string | null {
  const trimmedValue = value.trim();
  if (!/^https?:\/\//i.test(trimmedValue)) {
    return null;
  }

  return trimmedValue.replace(/^http:\/\//i, 'https://');
}

function buildProductImageUrlCandidates(url: string): string[] {
  const candidates = [url];

  if (/\.webp($|\?)/i.test(url)) {
    candidates.push(url.replace(/\.webp($|\?)/i, '.jpg$1'));
  }

  if (/mlstatic\.com/i.test(url)) {
    const jpgUrl = url.replace(/\.webp($|\?)/i, '.jpg$1');
    candidates.push(
      jpgUrl.replace(/-I\.jpg($|\?)/i, '-O.jpg$1'),
      jpgUrl.replace(/-I\.jpg($|\?)/i, '-F.jpg$1'),
    );
  }

  return [...new Set(candidates)];
}

function isPdfKitSupportedImageContentType(contentType: string): boolean {
  const normalizedContentType = contentType.toLowerCase();
  return (
    normalizedContentType.startsWith('image/jpeg') ||
    normalizedContentType.startsWith('image/jpg') ||
    normalizedContentType.startsWith('image/png')
  );
}

function isPdfKitSupportedImageBuffer(image: Buffer): boolean {
  return isJpeg(image) || isPng(image);
}

function isJpeg(image: Buffer): boolean {
  return image.length > 3 && image[0] === 0xff && image[1] === 0xd8;
}

function isPng(image: Buffer): boolean {
  return (
    image.length > 8 &&
    image[0] === 0x89 &&
    image[1] === 0x50 &&
    image[2] === 0x4e &&
    image[3] === 0x47
  );
}

function drawProductCard(
  doc: PDFKit.PDFDocument,
  data: TlqvInvoiceDocumentsData,
  productImage: Buffer | null,
  y: number,
): void {
  const { orderDetails, catalogProductDetails } = data;
  drawFilledBox(doc, PAGE_MARGIN, y, 523, 124, SOFT_GRAY_COLOR);
  drawBox(doc, PAGE_MARGIN, y, 523, 124, LIGHT_BORDER_COLOR);

  drawProductImage(doc, productImage, PAGE_MARGIN + 16, y + 18);

  const textX = PAGE_MARGIN + 150;
  writeText(
    doc,
    catalogProductDetails?.title ?? orderDetails?.product?.name ?? '-',
    textX,
    y + 18,
    330,
    {
      font: 'Helvetica-Bold',
      fontSize: 13,
      color: BRAND_COLOR,
    },
  );
  writeText(doc, orderDetails?.product?.name ?? '', textX, y + 52, 330, {
    fontSize: 8,
    color: '#475569',
  });

  drawMiniMetric(
    doc,
    'SKU',
    orderDetails?.product?.sku ?? catalogProductDetails?.sku ?? '-',
    textX,
    y + 84,
    84,
  );
  drawMiniMetric(
    doc,
    'Marca',
    catalogProductDetails?.brand ?? '-',
    textX + 92,
    y + 84,
    84,
  );
  drawMiniMetric(
    doc,
    'Cantidad',
    formatNumber(orderDetails?.product?.unitCount),
    textX + 184,
    y + 84,
    64,
  );
  drawMiniMetric(
    doc,
    'Precio',
    formatMoney(
      catalogProductDetails?.price,
      catalogProductDetails?.currencyId ?? 'ARS',
    ),
    textX + 256,
    y + 84,
    84,
  );
}

function drawMiniMetric(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): void {
  drawFilledBox(doc, x, y, width, 28, '#ffffff');
  drawBox(doc, x, y, width, 28, '#e2e8f0');
  writeText(doc, label, x + 6, y + 5, width - 12, {
    fontSize: 6,
    color: '#64748b',
  });
  writeText(doc, value, x + 6, y + 15, width - 12, {
    font: 'Helvetica-Bold',
    fontSize: 7,
    color: BRAND_COLOR,
  });
}

function drawSectionTitle(
  doc: PDFKit.PDFDocument,
  title: string,
  x: number,
  y: number,
): void {
  writeText(doc, title, x, y, 523, {
    font: 'Helvetica-Bold',
    fontSize: 11,
  });
}

function drawKeyValueGrid(
  doc: PDFKit.PDFDocument,
  rows: Array<[string, string | number | null | undefined]>,
  x: number,
  y: number,
  width: number,
  columns = 2,
): void {
  const rowHeight = 24;
  const columnWidth = width / columns;
  const totalRows = Math.ceil(rows.length / columns);
  drawBox(doc, x, y, width, totalRows * rowHeight);

  for (let rowIndex = 1; rowIndex < totalRows; rowIndex += 1) {
    drawLine(
      doc,
      x,
      y + rowIndex * rowHeight,
      x + width,
      y + rowIndex * rowHeight,
    );
  }
  for (let columnIndex = 1; columnIndex < columns; columnIndex += 1) {
    drawLine(
      doc,
      x + columnIndex * columnWidth,
      y,
      x + columnIndex * columnWidth,
      y + totalRows * rowHeight,
    );
  }

  rows.forEach(([label, value], index) => {
    const rowIndex = Math.floor(index / columns);
    const columnIndex = index % columns;
    writeText(
      doc,
      `${label}: ${value ?? '-'}`,
      x + columnIndex * columnWidth + 7,
      y + rowIndex * rowHeight + 7,
      columnWidth - 14,
      {
        fontSize: 8,
      },
    );
  });
}

function drawPill(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
): void {
  doc.save().roundedRect(x, y, width, 22, 11).fill(ACCENT_COLOR).restore();
  writeText(doc, text, x + 8, y + 7, width - 16, {
    font: 'Helvetica-Bold',
    fontSize: 7,
    color: '#ffffff',
    align: 'center',
  });
}

function drawFilledBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  doc.save().rect(x, y, width, height).fill(color).restore();
}

function drawProductImage(
  doc: PDFKit.PDFDocument,
  image: Buffer | null,
  x: number,
  y: number,
): void {
  drawBox(doc, x, y, 100, 96, LIGHT_BORDER_COLOR);
  if (image === null) {
    writeText(doc, 'Imagen no disponible', x + 10, y + 40, 80, {
      fontSize: 7,
      color: '#777777',
      align: 'center',
    });
    return;
  }

  try {
    doc.image(image, x + 8, y + 8, {
      fit: [84, 80],
      align: 'center',
      valign: 'center',
    });
  } catch {
    writeText(doc, 'Imagen no disponible', x + 10, y + 40, 80, {
      fontSize: 7,
      color: '#777777',
      align: 'center',
    });
  }
}

function drawInvoiceTableHeader(
  doc: PDFKit.PDFDocument,
  columns: Array<{ label: string; width: number }>,
  x: number,
  y: number,
  height: number,
): void {
  doc
    .save()
    .roundedRect(x, y, sumColumnWidths(columns), height, 3)
    .fill(INVOICE_HEADER_FILL_COLOR)
    .stroke(INVOICE_HEADER_BORDER_COLOR)
    .restore();

  let currentX = x;
  columns.forEach((column) => {
    writeText(doc, column.label, currentX + 3, y + 5, column.width - 6, {
      font: 'Helvetica-Bold',
      fontSize: 7,
      align:
        column.label === 'Articulo' || column.label === 'Observaciones'
          ? 'left'
          : 'center',
    });
    currentX += column.width;
  });
}

function drawInvoiceTableRow(
  doc: PDFKit.PDFDocument,
  columns: Array<{ label: string; width: number }>,
  x: number,
  y: number,
  height: number,
  values: string[],
): void {
  let currentX = x;
  columns.forEach((column, index) => {
    const isTextColumn =
      column.label === 'Articulo' || column.label === 'Observaciones';
    const isMoneyColumn = ['Precio', 'Importe', 'Impt. c/IVA'].includes(
      column.label,
    );
    writeText(doc, values[index] ?? '', currentX + 3, y + 7, column.width - 6, {
      fontSize: 8,
      align: isTextColumn ? 'left' : isMoneyColumn ? 'right' : 'center',
      height: height - 9,
    });
    currentX += column.width;
  });
  drawStrokeLine(doc, x, y + height, x + sumColumnWidths(columns), y + height, {
    color: '#d6c5c5',
    width: 0.5,
  });
}

function drawBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  color = TABLE_BORDER_COLOR,
): void {
  doc
    .save()
    .strokeColor(color)
    .lineWidth(0.6)
    .rect(x, y, width, height)
    .stroke()
    .restore();
}

function drawLine(
  doc: PDFKit.PDFDocument,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  doc
    .save()
    .strokeColor(LIGHT_BORDER_COLOR)
    .lineWidth(0.4)
    .moveTo(x1, y1)
    .lineTo(x2, y2)
    .stroke()
    .restore();
}

function drawStrokeLine(
  doc: PDFKit.PDFDocument,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options: { color?: string; width?: number } = {},
): void {
  doc
    .save()
    .strokeColor(options.color ?? TABLE_BORDER_COLOR)
    .lineWidth(options.width ?? 0.8)
    .moveTo(x1, y1)
    .lineTo(x2, y2)
    .stroke()
    .restore();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalStringFromRecord(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const rawValue = value[key];
  if (rawValue === undefined || rawValue === null) {
    return null;
  }
  return String(rawValue);
}

function readOptionalNumberFromRecord(
  value: Record<string, unknown>,
  key: string,
): number | null {
  const rawValue = value[key];
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function writeText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  options: {
    font?: string;
    fontSize?: number;
    color?: string;
    align?: 'left' | 'center' | 'right';
    height?: number;
  } = {},
): void {
  doc
    .save()
    .font(options.font ?? 'Helvetica')
    .fontSize(options.fontSize ?? 8)
    .fillColor(options.color ?? '#111111')
    .text(text, x, y, {
      width,
      height: options.height,
      align: options.align ?? 'left',
      ellipsis: true,
    })
    .restore();
}

function formatDate(value: string | null | undefined): string {
  if (value === undefined || value === null || value === '') {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatNumber(value: number | string | null | undefined): string {
  const parsedValue = typeof value === 'string' ? Number(value) : value;
  if (
    parsedValue === undefined ||
    parsedValue === null ||
    !Number.isFinite(parsedValue)
  ) {
    return '-';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsedValue);
}

function formatMoney(
  value: number | string | null | undefined,
  currencyId = 'ARS',
): string {
  const parsedValue = typeof value === 'string' ? Number(value) : value;
  if (
    parsedValue === undefined ||
    parsedValue === null ||
    !Number.isFinite(parsedValue)
  ) {
    return '-';
  }
  return `${currencyId} ${formatNumber(parsedValue)}`;
}

function formatPaymentCondition(value: number | null | undefined): string {
  if (value === 1) {
    return 'Cuenta Corriente';
  }
  if (value === 2) {
    return 'Contado';
  }
  return value === undefined || value === null ? '-' : String(value);
}

function sumColumnWidths(columns: Array<{ width: number }>): number {
  return columns.reduce((total, column) => total + column.width, 0);
}
