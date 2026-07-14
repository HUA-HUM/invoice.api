import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { MadreXubioComprobantesRepository } from '../src/core/driver/repository/madre-api/xubio/comprobantes/MadreXubioComprobantesRepository';
import type {
  MadreXubioComprobanteDocumentKind,
  MadreXubioComprobanteTlqvLookupItem,
} from '../src/core/entities/madre-api/xubio/comprobantes/MadreXubioComprobante';

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_TIMEOUT_IN_MILLISECONDS = 60_000;
const TLQV_REGEX = /\bTLQV\s*-?\s*(\d+)\b/gi;

interface CliOptions {
  batchSize: number;
  csvPath?: string;
  help: boolean;
  outPath?: string;
  timeoutInMilliseconds: number;
}

interface ParsedCsv {
  dataRows: ParsedCsvRow[];
  delimiter: string;
  headers: string[];
}

interface ParsedCsvRow {
  cells: string[];
  csvRowNumber: number;
}

interface CsvTlqvOccurrence {
  csvRowNumber: number;
  descripcion?: string;
  estadoMensaje?: string;
  fecha?: string;
  importeTotal?: string;
  numeroDocumento?: string;
  obtuvoCae?: string;
  organizacionNombre?: string;
  tipoFactura?: string;
}

interface CsvTlqvAuditReport {
  csvPath: string;
  delimiter: string;
  duplicateCsvTlqvItems: CsvTlqvAuditItem[];
  generatedAt: string;
  missingInMadreItems: CsvTlqvAuditItem[];
  missingInvoiceInMadreItems: CsvTlqvAuditItem[];
  totals: {
    totalCsvRows: number;
    totalCsvRowsWithTlqv: number;
    totalCsvTlqvOccurrences: number;
    totalDuplicateTlqvInCsv: number;
    totalFoundAsInvoiceInMadre: number;
    totalFoundInMadreAnyDocument: number;
    totalMissingInMadre: number;
    totalMissingInvoiceInMadre: number;
    totalUniqueCsvTlqv: number;
  };
  totalsByMadreDocumentKind: Record<string, number>;
}

interface CsvTlqvAuditItem {
  occurrences: CsvTlqvOccurrence[];
  tlqvCode: string;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Audit failed: ${message}`);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  loadDotEnvFile();

  const options = parseCliOptions(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  if (options.csvPath === undefined) {
    printUsage();
    throw new Error('Missing required argument: --csv');
  }

  const csvPath = resolve(process.cwd(), options.csvPath);
  if (!existsSync(csvPath)) {
    throw new Error(`CSV file does not exist: ${csvPath}`);
  }

  const baseUrl = readRequiredEnvironment('MADRE_API_BASE_URL');
  const internalApiKey = readRequiredEnvironment('MADRE_INTERNAL_API_KEY');

  console.error(`Reading Xubio CSV: ${csvPath}`);
  const csv = parseCsv(readFileSync(csvPath, 'utf8'));
  const csvTlqvOccurrences = collectCsvTlqvOccurrences(csv);
  const uniqueCsvTlqvCodes = [...csvTlqvOccurrences.keys()].sort(
    compareTlqvCodes,
  );

  console.error(
    `Found ${uniqueCsvTlqvCodes.length} unique TLQV codes in CSV. Querying Madre in batches of ${options.batchSize}...`,
  );

  const madreRepository = new MadreXubioComprobantesRepository({
    baseUrl,
    internalApiKey,
    timeoutInMilliseconds: options.timeoutInMilliseconds,
  });
  const madreItemsByTlqv = await findMadreItemsByTlqvCode({
    batchSize: options.batchSize,
    madreRepository,
    tlqvCodes: uniqueCsvTlqvCodes,
  });

  const report = buildReport({
    csv,
    csvPath,
    csvTlqvOccurrences,
    madreItemsByTlqv,
  });

  if (options.outPath !== undefined) {
    const outPath = resolve(process.cwd(), options.outPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`Audit report written to: ${outPath}`);
  }

  console.log(JSON.stringify(report, null, 2));
}

function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    batchSize: DEFAULT_BATCH_SIZE,
    help: false,
    timeoutInMilliseconds: DEFAULT_TIMEOUT_IN_MILLISECONDS,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--csv') {
      options.csvPath = readCliValue(arg, next);
      index += 1;
      continue;
    }

    if (arg === '--out') {
      options.outPath = readCliValue(arg, next);
      index += 1;
      continue;
    }

    if (arg === '--batch-size') {
      options.batchSize = readPositiveIntegerCliValue(arg, next);
      index += 1;
      continue;
    }

    if (arg === '--timeout-ms') {
      options.timeoutInMilliseconds = readPositiveIntegerCliValue(arg, next);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function readCliValue(argumentName: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${argumentName} requires a value`);
  }

  return value;
}

function readPositiveIntegerCliValue(
  argumentName: string,
  value: string | undefined,
): number {
  const rawValue = readCliValue(argumentName, value);
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${argumentName} must be a positive integer`);
  }

  return parsed;
}

function printUsage(): void {
  console.log(`Usage:
  npm run audit:xubio-csv -- --csv "/path/to/xubio-export.csv" [options]

Options:
  --csv             Required. CSV exported from Xubio.
  --out             Optional. Writes the JSON report to this file.
  --batch-size      Optional. Madre lookup batch size. Default: ${DEFAULT_BATCH_SIZE}.
  --timeout-ms      Optional. Madre request timeout. Default: ${DEFAULT_TIMEOUT_IN_MILLISECONDS}.
  --help            Prints this help.

Required environment:
  MADRE_API_BASE_URL
  MADRE_INTERNAL_API_KEY
`);
}

function loadDotEnvFile(): void {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const normalizedLine = line.startsWith('export ')
      ? line.slice('export '.length).trim()
      : line;
    const separatorIndex = normalizedLine.indexOf('=');
    if (separatorIndex < 1) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = unquoteEnvironmentValue(
      normalizedLine.slice(separatorIndex + 1).trim(),
    );
  }
}

function unquoteEnvironmentValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function readRequiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} environment variable is required`);
  }

  return value.trim();
}

function parseCsv(content: string): ParsedCsv {
  const delimiter = detectDelimiter(content);
  const rows = parseDelimitedRows(content, delimiter);
  const headerRowIndex = rows.findIndex((row) =>
    row.some((cell) => cell.trim() !== ''),
  );

  if (headerRowIndex < 0) {
    throw new Error('CSV is empty');
  }

  const headers = rows[headerRowIndex].map((header) => header.trim());
  const dataRows = rows
    .map((cells, index): ParsedCsvRow => ({ cells, csvRowNumber: index + 1 }))
    .slice(headerRowIndex + 1)
    .filter((row) => row.cells.some((cell) => cell.trim() !== ''));

  return {
    dataRows,
    delimiter,
    headers,
  };
}

function detectDelimiter(content: string): string {
  const firstRecord = readFirstLogicalRecord(content);
  const candidates = [',', ';', '\t'];
  const [bestDelimiter] = candidates
    .map((delimiter) => ({
      delimiter,
      total: countDelimiterOutsideQuotes(firstRecord, delimiter),
    }))
    .sort((left, right) => right.total - left.total);

  return bestDelimiter.total > 0 ? bestDelimiter.delimiter : ',';
}

function readFirstLogicalRecord(content: string): string {
  let insideQuotes = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (char === '"') {
      if (insideQuotes && content[index + 1] === '"') {
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (!insideQuotes && (char === '\n' || char === '\r')) {
      return content.slice(0, index);
    }
  }

  return content;
}

function countDelimiterOutsideQuotes(value: string, delimiter: string): number {
  let count = 0;
  let insideQuotes = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (char === '"') {
      if (insideQuotes && value[index + 1] === '"') {
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (!insideQuotes && char === delimiter) {
      count += 1;
    }
  }

  return count;
}

function parseDelimitedRows(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (insideQuotes) {
      if (char === '"' && content[index + 1] === '"') {
        currentField += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        insideQuotes = false;
        continue;
      }

      currentField += char;
      continue;
    }

    if (char === '"' && currentField.trim() === '') {
      insideQuotes = true;
      continue;
    }

    if (char === delimiter) {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (char === '\n' || char === '\r') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';

      if (char === '\r' && content[index + 1] === '\n') {
        index += 1;
      }

      continue;
    }

    currentField += char;
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

function collectCsvTlqvOccurrences(
  csv: ParsedCsv,
): Map<string, CsvTlqvOccurrence[]> {
  const occurrencesByTlqvCode = new Map<string, CsvTlqvOccurrence[]>();
  const numeroDocumentoIndex = findHeaderIndex(csv.headers, [
    'numerodocumento',
    'documento',
    'comprobante',
    'nrocomprobante',
  ]);
  const fechaIndex = findHeaderIndex(csv.headers, [
    'fecha',
    'fechaemision',
    'fechadeemision',
  ]);
  const descripcionIndex = findHeaderIndex(csv.headers, [
    'descripcion',
    'detalle',
    'concepto',
  ]);
  const estadoMensajeIndex = findHeaderIndex(csv.headers, [
    'descmensajeestado',
    'mensajeestado',
    'estado',
  ]);
  const importeTotalIndex = findHeaderIndex(csv.headers, [
    'importetotal',
    'total',
  ]);
  const obtuvoCaeIndex = findHeaderIndex(csv.headers, ['obtuvocae', 'cae']);
  const organizacionNombreIndex = findHeaderIndex(csv.headers, [
    'organizacionnombre',
    'cliente',
    'nombrecliente',
  ]);
  const tipoFacturaIndex = findHeaderIndex(csv.headers, [
    'tipofactura',
    'tipo',
  ]);

  for (const row of csv.dataRows) {
    const tlqvCodes = extractTlqvCodesFromCsvRow(row, descripcionIndex);
    if (tlqvCodes.length < 1) {
      continue;
    }

    const occurrence: CsvTlqvOccurrence = {
      csvRowNumber: row.csvRowNumber,
      descripcion: readOptionalCell(row, descripcionIndex),
      estadoMensaje: readOptionalCell(row, estadoMensajeIndex),
      fecha: readOptionalCell(row, fechaIndex),
      importeTotal: readOptionalCell(row, importeTotalIndex),
      numeroDocumento: readOptionalCell(row, numeroDocumentoIndex),
      obtuvoCae: readOptionalCell(row, obtuvoCaeIndex),
      organizacionNombre: readOptionalCell(row, organizacionNombreIndex),
      tipoFactura: readOptionalCell(row, tipoFacturaIndex),
    };

    for (const tlqvCode of tlqvCodes) {
      const occurrences = occurrencesByTlqvCode.get(tlqvCode) ?? [];
      occurrences.push(occurrence);
      occurrencesByTlqvCode.set(tlqvCode, occurrences);
    }
  }

  return occurrencesByTlqvCode;
}

function extractTlqvCodesFromCsvRow(
  row: ParsedCsvRow,
  descripcionIndex: number,
): string[] {
  const description = readOptionalCell(row, descripcionIndex);
  const primaryDescriptionTlqvCode =
    extractPrimaryDescriptionTlqvCode(description);

  if (primaryDescriptionTlqvCode !== undefined) {
    return [primaryDescriptionTlqvCode];
  }

  return extractTlqvCodes(row.cells.join(' '));
}

function extractPrimaryDescriptionTlqvCode(
  description: string | undefined,
): string | undefined {
  if (description === undefined) {
    return undefined;
  }

  const primaryDescriptionSegment = description.split(/\bML\s*:/i)[0] ?? '';
  return extractTlqvCodes(primaryDescriptionSegment)[0];
}

function findHeaderIndex(headers: string[], expectedNames: string[]): number {
  const normalizedExpectedNames = new Set(expectedNames);
  return headers.findIndex((header) =>
    normalizedExpectedNames.has(normalizeComparableText(header)),
  );
}

function readOptionalCell(
  row: ParsedCsvRow,
  cellIndex: number,
): string | undefined {
  if (cellIndex < 0) {
    return undefined;
  }

  const value = row.cells[cellIndex];
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  return value.trim();
}

function extractTlqvCodes(value: string): string[] {
  const tlqvCodes = new Set<string>();

  for (const match of value.matchAll(TLQV_REGEX)) {
    const normalized = normalizeTlqvCode(`TLQV-${match[1]}`);
    if (normalized !== undefined) {
      tlqvCodes.add(normalized);
    }
  }

  return [...tlqvCodes].sort(compareTlqvCodes);
}

function normalizeTlqvCode(
  value: string | undefined | null,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const match = /\bTLQV\s*-?\s*(\d+)\b/i.exec(value);
  if (match === null) {
    return undefined;
  }

  const digits = match[1].replace(/^0+/, '') || '0';
  return `TLQV-${digits}`;
}

async function findMadreItemsByTlqvCode(command: {
  batchSize: number;
  madreRepository: MadreXubioComprobantesRepository;
  tlqvCodes: string[];
}): Promise<Map<string, MadreXubioComprobanteTlqvLookupItem[]>> {
  const itemsByTlqvCode = new Map<
    string,
    MadreXubioComprobanteTlqvLookupItem[]
  >();

  for (
    let startIndex = 0;
    startIndex < command.tlqvCodes.length;
    startIndex += command.batchSize
  ) {
    const batch = command.tlqvCodes.slice(
      startIndex,
      startIndex + command.batchSize,
    );
    const batchNumber = Math.floor(startIndex / command.batchSize) + 1;
    const totalBatches = Math.ceil(
      command.tlqvCodes.length / command.batchSize,
    );

    console.error(
      `Querying Madre batch ${batchNumber}/${totalBatches} (${batch.length} TLQV)...`,
    );

    const response = await command.madreRepository.findByTlqvCodes({
      tlqvCodes: batch,
    });

    for (const item of response.items) {
      const normalizedTlqvCode = normalizeTlqvCode(item.tlqvCode);
      if (normalizedTlqvCode === undefined) {
        continue;
      }

      const currentItems = itemsByTlqvCode.get(normalizedTlqvCode) ?? [];
      currentItems.push(item);
      itemsByTlqvCode.set(normalizedTlqvCode, currentItems);
    }
  }

  return itemsByTlqvCode;
}

function buildReport(command: {
  csv: ParsedCsv;
  csvPath: string;
  csvTlqvOccurrences: Map<string, CsvTlqvOccurrence[]>;
  madreItemsByTlqv: Map<string, MadreXubioComprobanteTlqvLookupItem[]>;
}): CsvTlqvAuditReport {
  const csvTlqvCodes = [...command.csvTlqvOccurrences.keys()].sort(
    compareTlqvCodes,
  );
  const csvRowNumbersWithTlqv = new Set<number>();
  const missingInMadreItems: CsvTlqvAuditItem[] = [];
  const missingInvoiceInMadreItems: CsvTlqvAuditItem[] = [];
  const duplicateCsvTlqvItems: CsvTlqvAuditItem[] = [];
  const foundInMadreAnyDocument = new Set<string>();
  const foundAsInvoiceInMadre = new Set<string>();
  const totalsByMadreDocumentKind: Record<string, number> = {};

  for (const [tlqvCode, occurrences] of command.csvTlqvOccurrences) {
    for (const occurrence of occurrences) {
      csvRowNumbersWithTlqv.add(occurrence.csvRowNumber);
    }

    if (occurrences.length > 1) {
      duplicateCsvTlqvItems.push({ occurrences, tlqvCode });
    }
  }

  for (const tlqvCode of csvTlqvCodes) {
    const madreItems = command.madreItemsByTlqv.get(tlqvCode) ?? [];
    const hasAnyDocument = madreItems.length > 0;
    const hasInvoice = madreItems.some(
      (item) => item.documentKind === 'INVOICE',
    );

    for (const item of madreItems) {
      const documentKind = normalizeDocumentKindForReport(item.documentKind);
      totalsByMadreDocumentKind[documentKind] =
        (totalsByMadreDocumentKind[documentKind] ?? 0) + 1;
    }

    if (hasAnyDocument) {
      foundInMadreAnyDocument.add(tlqvCode);
    } else {
      missingInMadreItems.push({
        occurrences: command.csvTlqvOccurrences.get(tlqvCode) ?? [],
        tlqvCode,
      });
    }

    if (hasInvoice) {
      foundAsInvoiceInMadre.add(tlqvCode);
    } else {
      missingInvoiceInMadreItems.push({
        occurrences: command.csvTlqvOccurrences.get(tlqvCode) ?? [],
        tlqvCode,
      });
    }
  }

  return {
    csvPath: command.csvPath,
    delimiter: formatDelimiterForReport(command.csv.delimiter),
    duplicateCsvTlqvItems: duplicateCsvTlqvItems.sort(compareAuditItems),
    generatedAt: new Date().toISOString(),
    missingInMadreItems: missingInMadreItems.sort(compareAuditItems),
    missingInvoiceInMadreItems:
      missingInvoiceInMadreItems.sort(compareAuditItems),
    totals: {
      totalCsvRows: command.csv.dataRows.length,
      totalCsvRowsWithTlqv: csvRowNumbersWithTlqv.size,
      totalCsvTlqvOccurrences: [...command.csvTlqvOccurrences.values()].reduce(
        (total, occurrences) => total + occurrences.length,
        0,
      ),
      totalDuplicateTlqvInCsv: duplicateCsvTlqvItems.length,
      totalFoundAsInvoiceInMadre: foundAsInvoiceInMadre.size,
      totalFoundInMadreAnyDocument: foundInMadreAnyDocument.size,
      totalMissingInMadre: missingInMadreItems.length,
      totalMissingInvoiceInMadre: missingInvoiceInMadreItems.length,
      totalUniqueCsvTlqv: csvTlqvCodes.length,
    },
    totalsByMadreDocumentKind,
  };
}

function normalizeDocumentKindForReport(
  documentKind: MadreXubioComprobanteDocumentKind | null | undefined,
): string {
  return documentKind ?? 'NULL';
}

function compareAuditItems(left: CsvTlqvAuditItem, right: CsvTlqvAuditItem) {
  return compareTlqvCodes(left.tlqvCode, right.tlqvCode);
}

function compareTlqvCodes(left: string, right: string): number {
  const leftNumber = readTlqvNumber(left);
  const rightNumber = readTlqvNumber(right);

  if (leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right);
}

function readTlqvNumber(value: string): number {
  const match = /\d+/.exec(value);
  if (match === null) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(match[0]);
}

function formatDelimiterForReport(delimiter: string): string {
  return delimiter === '\t' ? 'tab' : delimiter;
}

function normalizeComparableText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}
