import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TlqvInvoiceDocumentsData } from '../../core/entities/tlqv/TlqvInvoiceDocuments';

const PAGE_MARGIN = 36;
const TABLE_BORDER_COLOR = '#222222';
const LIGHT_BORDER_COLOR = '#cccccc';
const HEADER_FILL_COLOR = '#f1f1f1';
const BRAND_COLOR = '#111827';
const ACCENT_COLOR = '#0f766e';
const SOFT_ACCENT_COLOR = '#ecfdf5';
const SOFT_GRAY_COLOR = '#f8fafc';
const PRODUCT_IMAGE_MAX_BYTES = 2_000_000;
const PRODUCT_IMAGE_TIMEOUT_MS = 4_000;
const LOGO_RELATIVE_PATH = join('assets', 'branding', 'tienda-logo-navbar.png');

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

    this.drawBrandHeader(doc, 'FACTURA DE VENTA');
    this.drawInvoiceMeta(doc, data);

    const clientTop = 144;
    drawBox(doc, PAGE_MARGIN, clientTop, 523, 82);
    drawLine(
      doc,
      PAGE_MARGIN,
      clientTop + 28,
      PAGE_MARGIN + 523,
      clientTop + 28,
    );
    drawLine(
      doc,
      PAGE_MARGIN,
      clientTop + 56,
      PAGE_MARGIN + 523,
      clientTop + 56,
    );
    drawLine(
      doc,
      PAGE_MARGIN + 300,
      clientTop,
      PAGE_MARGIN + 300,
      clientTop + 82,
    );
    writeText(
      doc,
      `Sr. (es): ${comprobante.clienteNombre ?? '-'}`,
      PAGE_MARGIN + 8,
      clientTop + 9,
      284,
    );
    writeText(
      doc,
      'CUIT: No disponible en Madre',
      PAGE_MARGIN + 308,
      clientTop + 9,
      200,
      {
        color: '#666666',
      },
    );
    writeText(
      doc,
      'Domicilio: No disponible en Madre',
      PAGE_MARGIN + 8,
      clientTop + 37,
      284,
      {
        color: '#666666',
      },
    );
    writeText(
      doc,
      'Cond. IVA: No disponible en Madre',
      PAGE_MARGIN + 308,
      clientTop + 37,
      200,
      {
        color: '#666666',
      },
    );
    writeText(
      doc,
      `Moneda: ${comprobante.monedaNombre ?? '-'}`,
      PAGE_MARGIN + 8,
      clientTop + 65,
      284,
    );
    writeText(
      doc,
      [
        `Prov. Destino: ${comprobante.provinciaNombre ?? '-'}`,
        `Fecha Vto.: ${formatDate(comprobante.fechaVencimiento)}`,
        `Forma de pago: ${formatPaymentCondition(comprobante.condicionPago)}`,
      ].join('\n'),
      PAGE_MARGIN + 308,
      clientTop + 61,
      200,
    );

    const tableTop = 246;
    this.drawProductItemsTable(doc, comprobante.productItems ?? [], tableTop);

    const observationsTop = tableTop + 132;
    writeText(doc, 'Observaciones:', PAGE_MARGIN, observationsTop, 523, {
      font: 'Helvetica-Bold',
    });
    writeText(
      doc,
      comprobante.descripcion ?? '',
      PAGE_MARGIN,
      observationsTop + 16,
      523,
    );

    const totalsTop = observationsTop + 62;
    this.drawInvoiceTotals(doc, data, totalsTop);

    writeText(
      doc,
      `CAE: ${comprobante.cae ?? '-'}\nFecha Vto. CAE: ${formatDate(comprobante.caeFechaVencimiento)}`,
      PAGE_MARGIN + 335,
      totalsTop + 96,
      188,
      {
        align: 'right',
      },
    );
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

    const buyerTop = productTop + 184;
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

    const xubioItemsTop = buyerTop + 116;
    drawSectionTitle(doc, 'Detalle contable Xubio', PAGE_MARGIN, xubioItemsTop);
    this.drawRemitoItemsTable(
      doc,
      comprobante.productItems ?? [],
      xubioItemsTop + 22,
    );

    if (data.warnings.length > 0) {
      drawSectionTitle(doc, 'Advertencias', PAGE_MARGIN, 710);
      writeText(
        doc,
        data.warnings.map((warning) => `- ${warning}`).join('\n'),
        PAGE_MARGIN,
        730,
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
    drawBox(doc, PAGE_MARGIN, 98, 523, 34);
    writeText(doc, 'A', PAGE_MARGIN + 252, 101, 20, {
      font: 'Helvetica-Bold',
      fontSize: 19,
      align: 'center',
    });
    writeText(doc, '001', PAGE_MARGIN + 252, 121, 20, {
      fontSize: 8,
      align: 'center',
    });
    writeText(
      doc,
      [
        `Numero: ${comprobante.numeroDocumento ?? '-'}`,
        `Fecha: ${formatDate(comprobante.fechaEmision)}`,
        'CUIT: 33-71780304-9',
        'Ing. Brutos: 163003011',
      ].join('   '),
      PAGE_MARGIN + 8,
      111,
      507,
      {
        fontSize: 8,
      },
    );
  }

  private drawProductItemsTable(
    doc: PDFKit.PDFDocument,
    items: Array<{
      productoCodigo?: string | null;
      productoNombre?: string | null;
      descripcion?: string | null;
      cantidad?: number | null;
      precio?: number | null;
      porcentajeDescuento?: number | null;
      importe?: number | null;
      iva?: number | null;
      total?: number | null;
    }>,
    y: number,
  ): void {
    const columns = [
      { label: 'Cod.', width: 44 },
      { label: 'Articulo', width: 105 },
      { label: 'Observaciones', width: 100 },
      { label: 'Cant.', width: 38 },
      { label: 'Precio', width: 58 },
      { label: '%Dto.', width: 38 },
      { label: 'Importe', width: 58 },
      { label: 'IVA', width: 38 },
      { label: 'Total', width: 44 },
    ];
    drawTableHeader(doc, columns, PAGE_MARGIN, y, 22);

    let rowY = y + 22;
    for (const item of items.slice(0, 8)) {
      const ivaRate =
        item.iva === undefined || item.iva === null || item.iva === 0 ? 0 : 21;
      drawTableRow(doc, columns, PAGE_MARGIN, rowY, 22, [
        item.productoCodigo === 'COMISIONES_EXTERNAS' ? 'COMEX' : '',
        item.productoNombre ?? '',
        item.descripcion ?? '',
        formatNumber(item.cantidad),
        formatNumber(item.precio),
        formatNumber(item.porcentajeDescuento ?? 0),
        formatNumber(item.importe),
        `${ivaRate.toFixed(2)}%`,
        formatNumber(item.total),
      ]);
      rowY += 22;
    }
  }

  private drawRemitoItemsTable(
    doc: PDFKit.PDFDocument,
    items: Array<{
      productoNombre?: string | null;
      descripcion?: string | null;
      cantidad?: number | null;
      total?: number | null;
    }>,
    y: number,
  ): void {
    const columns = [
      { label: '#', width: 26 },
      { label: 'Producto', width: 190 },
      { label: 'Detalle', width: 190 },
      { label: 'Cant.', width: 48 },
      { label: 'Total', width: 69 },
    ];
    drawTableHeader(doc, columns, PAGE_MARGIN, y, 22);

    let rowY = y + 22;
    items.slice(0, 10).forEach((item, index) => {
      drawTableRow(doc, columns, PAGE_MARGIN, rowY, 24, [
        String(index + 1),
        item.productoNombre ?? '',
        item.descripcion ?? '',
        formatNumber(item.cantidad),
        formatNumber(item.total),
      ]);
      rowY += 24;
    });
  }

  private drawInvoiceTotals(
    doc: PDFKit.PDFDocument,
    data: TlqvInvoiceDocumentsData,
    y: number,
  ): void {
    const { comprobante } = data;
    drawBox(doc, PAGE_MARGIN, y, 523, 74);
    drawLine(doc, PAGE_MARGIN, y + 24, PAGE_MARGIN + 523, y + 24);
    for (const x of [104, 208, 313, 418]) {
      drawLine(doc, PAGE_MARGIN + x, y, PAGE_MARGIN + x, y + 74);
    }

    writeText(doc, 'IVA 2.5: 0.00', PAGE_MARGIN + 8, y + 8, 90);
    writeText(doc, 'IVA 5: 0.00', PAGE_MARGIN + 112, y + 8, 90);
    writeText(doc, 'IVA 10.5: 0.00', PAGE_MARGIN + 216, y + 8, 90);
    writeText(
      doc,
      `IVA 21: ${formatNumber(comprobante.importeImpuestos)}`,
      PAGE_MARGIN + 321,
      y + 8,
      90,
    );
    writeText(doc, 'IVA 27: 0.00', PAGE_MARGIN + 426, y + 8, 90);

    writeText(
      doc,
      `Bruto:\n${formatNumber(comprobante.importeGravado)}`,
      PAGE_MARGIN + 8,
      y + 36,
      90,
      {
        font: 'Helvetica-Bold',
        fontSize: 13,
      },
    );
    writeText(
      doc,
      `Impuestos:\n${formatNumber(comprobante.importeImpuestos)}`,
      PAGE_MARGIN + 216,
      y + 36,
      95,
      {
        font: 'Helvetica-Bold',
        fontSize: 13,
      },
    );
    writeText(
      doc,
      `Total: $\n${formatNumber(comprobante.importeTotal)}`,
      PAGE_MARGIN + 426,
      y + 36,
      90,
      {
        font: 'Helvetica-Bold',
        fontSize: 13,
      },
    );
  }

  private drawPageFooters(doc: PDFKit.PDFDocument): void {
    const pageCount = doc.bufferedPageRange().count;
    for (let index = 0; index < pageCount; index += 1) {
      doc.switchToPage(index);
      writeText(
        doc,
        `Generado desde Invoice API - pagina ${index + 1}/${pageCount}`,
        PAGE_MARGIN,
        806,
        523,
        {
          fontSize: 7,
          color: '#777777',
          align: 'right',
        },
      );
    }
  }
}

function shouldIncludeDeliveryNote(data: TlqvInvoiceDocumentsData): boolean {
  return data.orderDetails != null && data.catalogProductDetails != null;
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
  drawFilledBox(doc, PAGE_MARGIN, y, 523, 144, SOFT_GRAY_COLOR);
  drawBox(doc, PAGE_MARGIN, y, 523, 144, LIGHT_BORDER_COLOR);

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

  writeText(
    doc,
    `Item ML: ${catalogProductDetails?.itemId ?? '-'}\n${catalogProductDetails?.permalink ?? ''}`,
    textX,
    y + 120,
    330,
    {
      fontSize: 7,
      color: '#64748b',
    },
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

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  columns: Array<{ label: string; width: number }>,
  x: number,
  y: number,
  height: number,
): void {
  doc
    .save()
    .rect(x, y, sumColumnWidths(columns), height)
    .fill(HEADER_FILL_COLOR)
    .restore();
  drawTableRow(
    doc,
    columns,
    x,
    y,
    height,
    columns.map((column) => column.label),
    true,
  );
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  columns: Array<{ label: string; width: number }>,
  x: number,
  y: number,
  height: number,
  values: string[],
  bold = false,
): void {
  let currentX = x;
  columns.forEach((column, index) => {
    drawBox(doc, currentX, y, column.width, height, LIGHT_BORDER_COLOR);
    writeText(doc, values[index] ?? '', currentX + 4, y + 6, column.width - 8, {
      font: bold ? 'Helvetica-Bold' : 'Helvetica',
      fontSize: 7,
    });
    currentX += column.width;
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
  } = {},
): void {
  doc
    .save()
    .font(options.font ?? 'Helvetica')
    .fontSize(options.fontSize ?? 8)
    .fillColor(options.color ?? '#111111')
    .text(text, x, y, {
      width,
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

function formatNumber(value: number | null | undefined): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '-';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatMoney(
  value: number | null | undefined,
  currencyId = 'ARS',
): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '-';
  }
  return `${currencyId} ${formatNumber(value)}`;
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
