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
const PRODUCT_IMAGE_MAX_BYTES = 2_000_000;
const PRODUCT_IMAGE_TIMEOUT_MS = 4_000;
const DEFAULT_LOGO_PATH = join(
  process.cwd(),
  'assets',
  'branding',
  'tienda-logo-navbar.png',
);

@Injectable()
export class TlqvInvoiceDocumentsPdfService {
  constructor(private readonly configService: ConfigService) {}

  async generateCombinedPdf(data: TlqvInvoiceDocumentsData): Promise<Buffer> {
    const productImage = await this.loadProductImage(
      data.catalogProductDetails?.thumbnail,
    );

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
      doc.addPage();
      this.drawDeliveryNotePage(doc, data, productImage);
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

    const normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      return null;
    }

    try {
      const response = await fetch(normalizedUrl, {
        signal: AbortSignal.timeout(PRODUCT_IMAGE_TIMEOUT_MS),
      });
      if (!response.ok) {
        return null;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().startsWith('image/')) {
        return null;
      }

      const contentLength = response.headers.get('content-length');
      if (
        contentLength !== null &&
        Number(contentLength) > PRODUCT_IMAGE_MAX_BYTES
      ) {
        return null;
      }

      const image = Buffer.from(await response.arrayBuffer());
      return image.length > PRODUCT_IMAGE_MAX_BYTES ? null : image;
    } catch {
      return null;
    }
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

    const top = 104;
    drawSectionTitle(doc, 'Datos principales', PAGE_MARGIN, top);
    drawKeyValueGrid(
      doc,
      [
        ['TLQV', data.tlqvCode],
        ['Factura', comprobante.numeroDocumento ?? '-'],
        ['Fecha factura', formatDate(comprobante.fechaEmision)],
        ['Orden ML', comprobante.mlOrderId ?? orderDetails?.saleNumber ?? '-'],
        ['Estado orden', orderDetails?.statuses?.estadoVbi ?? '-'],
        ['SKU', orderDetails?.product?.sku ?? '-'],
      ],
      PAGE_MARGIN,
      top + 22,
      523,
    );

    const buyerTop = top + 116;
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

    const productTop = buyerTop + 116;
    drawSectionTitle(doc, 'Producto vendido', PAGE_MARGIN, productTop);
    const hasProductImage = productImage !== null;
    const productDetailsWidth = hasProductImage ? 413 : 523;
    drawKeyValueGrid(
      doc,
      [
        [
          'SKU',
          orderDetails?.product?.sku ?? catalogProductDetails?.sku ?? '-',
        ],
        ['Producto orden', orderDetails?.product?.name ?? '-'],
        ['Producto catalogo', catalogProductDetails?.title ?? '-'],
        ['Marca', catalogProductDetails?.brand ?? '-'],
        ['Item ML', catalogProductDetails?.itemId ?? '-'],
        [
          'Precio catalogo',
          formatMoney(
            catalogProductDetails?.price,
            catalogProductDetails?.currencyId ?? 'ARS',
          ),
        ],
        ['Unidades', formatNumber(orderDetails?.product?.unitCount)],
        ['Link ML', catalogProductDetails?.permalink ?? '-'],
      ],
      PAGE_MARGIN,
      productTop + 22,
      productDetailsWidth,
      2,
    );

    if (hasProductImage) {
      drawProductImage(doc, productImage, PAGE_MARGIN + 423, productTop + 22);
    }

    const xubioItemsTop = productTop + 144;
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
    const logoPath =
      this.configService.get<string>('TLQ_LOGO_PATH')?.trim() ??
      DEFAULT_LOGO_PATH;

    drawBox(doc, PAGE_MARGIN, PAGE_MARGIN, 523, 54);
    if (logoPath !== '' && existsSync(logoPath)) {
      doc.image(logoPath, PAGE_MARGIN + 8, PAGE_MARGIN + 8, {
        fit: [118, 36],
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

function drawProductImage(
  doc: PDFKit.PDFDocument,
  image: Buffer,
  x: number,
  y: number,
): void {
  drawBox(doc, x, y, 100, 96, LIGHT_BORDER_COLOR);
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
