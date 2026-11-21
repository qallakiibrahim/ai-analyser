import * as XLSX from 'xlsx';
import { SpecLimits } from './stats';

export interface ParsedImportDataset {
  headers: string[];
  rows: Record<string, unknown>[];
  sourceName: string;
  detectedTimeCol: string;
  detectedMetricCols: string[];
  hiddenSpcMetaCols: string[];
  extractedSpecs: Record<string, SpecLimits>;
  sheetNames?: string[];
  activeSheetName?: string;
  importNotice?: string;
}

const EXACT_SPC_META_HEADERS = new Set([
  'rad',
  'row',
  'rowindex',
  '#',
  'analyserad_kolumn',
  'status',
  'regelbrott',
  'kommentar',
  'exkluderad',
  'special_cause_orsak',
  'exkluderad_tidpunkt',
  'utanfor_spec_oos',
  'anomali_flaggad',
  'anomali_regler',
  'anomali_allvarlighetsgrad',
  'anomali_beskrivning',
  'moving_range',
  'mr_ur_kontroll',
  'cl_mean',
  'ucl_3s',
  'lcl_3s',
  'lsl',
  'target',
  'usl',
  'fas_nr',
  'fas_namn',
  'fas_medel',
  'fas_cpk',
  'fas_ppk',
]);

const SPC_META_SUFFIXES = [
  '_status',
  '_exkluderad',
  '_special_cause_orsak',
  '_exkluderad_tidpunkt',
  '_utanfor_spec_oos',
  '_anomali_flaggad',
  '_anomali_regler',
  '_anomali_allvarlighetsgrad',
  '_anomali_beskrivning',
  '_moving_range',
  '_mr_ur_kontroll',
  '_cl_mean',
  '_ucl_3s',
  '_lcl_3s',
  '_lsl',
  '_target',
  '_usl',
];

export function isExportedSpcMetadataColumn(header: string): boolean {
  const lower = header.trim().toLowerCase();
  if (EXACT_SPC_META_HEADERS.has(lower)) return true;
  return SPC_META_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

export function parseNumericCell(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : NaN;
  }
  if (raw === undefined || raw === null) return NaN;
  const trimmed = String(raw).trim();
  if (!trimmed) return NaN;

  // Reject alphanumeric identifiers like "CNC-01", "Batch-2", "Skift 1", "A-12"
  // A numeric measurement must start with an optional sign and digit (optionally followed by a unit like mm, °C, %, µm)
  const unitStripped = trimmed.replace(/\s*(?:[a-zA-Z%°µμ/²³]+)$/, '').trim();
  if (!unitStripped) return NaN;

  // Handle Swedish/European thousands spaces & decimal commas like "1 234,56" or "10,45"
  let normalized = unitStripped.replace(/\s+/g, '');
  if (normalized.includes(',') && !normalized.includes('.')) {
    normalized = normalized.replace(',', '.');
  } else if (normalized.includes(',') && normalized.includes('.')) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  }
  if (!/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(normalized)) {
    return NaN;
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
}

export function parseExcelOrStringDate(raw: unknown): Date | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;

  // Excel serial date number (e.g. 45814.5)
  if (typeof raw === 'number' && raw > 20000 && raw < 90000) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed) {
      return new Date(
        parsed.y,
        parsed.m - 1,
        parsed.d,
        parsed.H || 0,
        parsed.M || 0,
        Math.floor(parsed.S || 0)
      );
    }
  }

  const str = String(raw).trim();
  if (!str) return null;

  // Short Swedish DD/MM HH:mm (e.g. "21/11 16:18" exported by this app)
  const dmShort = str.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (dmShort) {
    const nowYear = new Date().getFullYear();
    const dShort = new Date(
      nowYear,
      Number(dmShort[2]) - 1,
      Number(dmShort[1]),
      Number(dmShort[3]),
      Number(dmShort[4]),
      Number(dmShort[5] || 0)
    );
    if (!isNaN(dShort.getTime())) return dShort;
  }

  // Short 2-digit year YY-MM-DD HH:mm (from sv-SE toLocaleString)
  const ymdShort = str.match(/^(\d{2})-(\d{2})-(\d{2})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ymdShort) {
    const dYmd = new Date(
      2000 + Number(ymdShort[1]),
      Number(ymdShort[2]) - 1,
      Number(ymdShort[3]),
      Number(ymdShort[4] || 0),
      Number(ymdShort[5] || 0),
      Number(ymdShort[6] || 0)
    );
    if (!isNaN(dYmd.getTime())) return dYmd;
  }

  // ISO or Swedish YYYY-MM-DD HH:mm(:ss)
  const isoCandidate = str.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, '$1T$2');
  if (/^\d{4}-\d{2}-\d{2}/.test(isoCandidate)) {
    const d1 = new Date(isoCandidate);
    if (!isNaN(d1.getTime())) return d1;
  }

  // DD/MM/YYYY or DD.MM.YYYY
  const dmy = str.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (dmy) {
    const d2 = new Date(
      Number(dmy[3]),
      Number(dmy[2]) - 1,
      Number(dmy[1]),
      Number(dmy[4] || 0),
      Number(dmy[5] || 0),
      Number(dmy[6] || 0)
    );
    if (!isNaN(d2.getTime())) return d2;
  }

  return null;
}

/**
 * RFC-4180 compliant delimiter-separated parser supporting quoted fields,
 * escaped quotes (""), and delimiters inside quotes.
 */
function parseDelimitedRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) {
        records.push(row);
      }
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) {
        records.push(row);
      }
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell.length > 0)) {
      records.push(row);
    }
  }

  return records;
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && ch === delimiter) {
      count++;
    }
  }
  return count;
}

function detectDelimiter(blockText: string): string {
  const sampleLines = blockText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 12);

  if (sampleLines.length === 0) return ',';

  const candidates = ['\t', ';', ','];
  let bestDelim = ',';
  let bestScore = -1;

  for (const delim of candidates) {
    const counts = sampleLines.map((line) => countDelimiterOutsideQuotes(line, delim));
    const headerCount = counts[0];
    if (headerCount === 0) continue;

    // Score consistency across header and data lines
    const matchingLines = counts.filter((c) => c === headerCount).length;
    const score = matchingLines * 100 + headerCount;
    if (score > bestScore) {
      bestScore = score;
      bestDelim = delim;
    }
  }

  return bestDelim;
}

const SECTION_BANNER_REGEX = /^"?===\s*(.+?)\s*==="?$/;

interface RawSectionBlock {
  title: string | null;
  text: string;
}

function splitMultiSectionCsv(text: string): RawSectionBlock[] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/);

  const hasBanner = lines.some((l) => SECTION_BANNER_REGEX.test(l.trim()));
  if (!hasBanner) {
    return [{ title: null, text: cleaned }];
  }

  const blocks: RawSectionBlock[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const bannerMatch = trimmed.match(SECTION_BANNER_REGEX);
    if (bannerMatch) {
      if (currentLines.some((l) => l.trim().length > 0)) {
        blocks.push({ title: currentTitle, text: currentLines.join('\n') });
      }
      currentTitle = bannerMatch[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.some((l) => l.trim().length > 0)) {
    blocks.push({ title: currentTitle, text: currentLines.join('\n') });
  }

  return blocks;
}

function recordsToObjects(records: string[][]): {
  headers: string[];
  rows: Record<string, unknown>[];
} {
  if (records.length < 2) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = records[0];
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, idx) => {
    const base = h.trim() || `Kolumn ${idx + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < records.length; i++) {
    const cells = records[i];
    if (!cells.some((c) => c.trim().length > 0)) continue;
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? '';
    });
    rows.push(obj);
  }

  return { headers, rows };
}

function extractSpecsFromSummaryRows(
  rows: Record<string, unknown>[]
): Record<string, SpecLimits> {
  const specs: Record<string, SpecLimits> = {};
  for (const row of rows) {
    const varName = String(row['Variabel'] ?? '').trim();
    if (!varName) continue;
    const lsl = parseNumericCell(row['LSL']);
    const target = parseNumericCell(row['Target']);
    const usl = parseNumericCell(row['USL']);
    if (!isNaN(lsl) && !isNaN(usl) && usl > lsl) {
      specs[varName] = {
        lsl,
        usl,
        target: !isNaN(target) ? target : Number(((lsl + usl) / 2).toFixed(4)),
        uslLabel: 'USL',
        lslLabel: 'LSL',
      };
    }
  }
  return specs;
}

function extractSpecsFromRowMetadata(
  headers: string[],
  rows: Record<string, unknown>[]
): Record<string, SpecLimits> {
  const specs: Record<string, SpecLimits> = {};
  if (rows.length === 0) return specs;

  const firstRow = rows[0];

  // Case 1: Multi-metric prefixed columns e.g. "Diameter (mm)_LSL", "Diameter (mm)_Target", "Diameter (mm)_USL"
  for (const h of headers) {
    if (!h.endsWith('_LSL')) continue;
    const metric = h.slice(0, -4);
    const uslKey = `${metric}_USL`;
    const targetKey = `${metric}_Target`;
    if (!headers.includes(uslKey)) continue;

    const lsl = parseNumericCell(firstRow[h]);
    const usl = parseNumericCell(firstRow[uslKey]);
    const target = headers.includes(targetKey) ? parseNumericCell(firstRow[targetKey]) : NaN;
    if (!isNaN(lsl) && !isNaN(usl) && usl > lsl) {
      specs[metric] = {
        lsl,
        usl,
        target: !isNaN(target) ? target : Number(((lsl + usl) / 2).toFixed(4)),
        uslLabel: 'USL',
        lslLabel: 'LSL',
      };
    }
  }

  // Case 2: Single-metric unprefixed columns ("Analyserad_Kolumn", "LSL", "Target", "USL")
  if (
    headers.includes('Analyserad_Kolumn') &&
    headers.includes('LSL') &&
    headers.includes('USL')
  ) {
    const metric = String(firstRow['Analyserad_Kolumn'] ?? '').trim();
    const lsl = parseNumericCell(firstRow['LSL']);
    const usl = parseNumericCell(firstRow['USL']);
    const target = headers.includes('Target') ? parseNumericCell(firstRow['Target']) : NaN;
    if (metric && !isNaN(lsl) && !isNaN(usl) && usl > lsl && !specs[metric]) {
      specs[metric] = {
        lsl,
        usl,
        target: !isNaN(target) ? target : Number(((lsl + usl) / 2).toFixed(4)),
        uslLabel: 'USL',
        lslLabel: 'LSL',
      };
    }
  }

  return specs;
}

function finalizeParsedTable(
  headers: string[],
  rows: Record<string, unknown>[],
  sourceName: string,
  extraSpecs: Record<string, SpecLimits> = {},
  options: {
    sheetNames?: string[];
    activeSheetName?: string;
    skippedSections?: string[];
  } = {}
): ParsedImportDataset {
  const timeCol =
    headers.find((h) => {
      const l = h.toLowerCase();
      if (isExportedSpcMetadataColumn(h)) return false;
      return (
        l.includes('tid') ||
        l.includes('datum') ||
        l.includes('time') ||
        l.includes('date') ||
        l.includes('stämpel') ||
        l.includes('klockslag')
      );
    }) || '';

  const hiddenSpcMetaCols = headers.filter(
    (h) => h !== timeCol && isExportedSpcMetadataColumn(h)
  );
  const candidateHeaders = headers.filter(
    (h) => h !== timeCol && !isExportedSpcMetadataColumn(h)
  );

  // Detect all non-metadata columns that have at least 50% numeric values
  const sampleSize = Math.min(rows.length, 40);
  const detectNumericIn = (cols: string[]) =>
    cols.filter((col) => {
      let numericCount = 0;
      let nonEmptyCount = 0;
      for (let i = 0; i < sampleSize; i++) {
        const val = rows[i][col];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          nonEmptyCount++;
          if (!isNaN(parseNumericCell(val))) {
            numericCount++;
          }
        }
      }
      return nonEmptyCount > 0 && numericCount / nonEmptyCount >= 0.5;
    });

  let detectedMetricCols = detectNumericIn(candidateHeaders);
  if (detectedMetricCols.length === 0) {
    // Fallback if user imported a file whose columns happen to match metadata names
    detectedMetricCols = detectNumericIn(headers.filter((h) => h !== timeCol));
  }
  if (detectedMetricCols.length === 0) {
    detectedMetricCols = headers.filter((h) => h !== timeCol).slice(0, 1);
  }

  const rowSpecs = extractSpecsFromRowMetadata(headers, rows);
  const extractedSpecs: Record<string, SpecLimits> = {
    ...rowSpecs,
    ...extraSpecs,
  };

  const noticeParts: string[] = [];
  if (options.skippedSections && options.skippedSections.length > 0) {
    noticeParts.push(
      `läste in mätdata (${rows.length} rader) och hoppade över ${options.skippedSections.length} rapportsektion(er)`
    );
  }
  if (hiddenSpcMetaCols.length > 0) {
    noticeParts.push(`filtrerade bort ${hiddenSpcMetaCols.length} beräknade SPC-exportkolumner`);
  }
  const restoredSpecCount = detectedMetricCols.filter((c) => Boolean(extractedSpecs[c])).length;
  if (restoredSpecCount > 0) {
    noticeParts.push(`återställde toleransgränser (LSL/Target/USL) för ${restoredSpecCount} kolumn(er)`);
  }

  return {
    headers,
    rows,
    sourceName,
    detectedTimeCol: timeCol,
    detectedMetricCols,
    hiddenSpcMetaCols,
    extractedSpecs,
    sheetNames: options.sheetNames,
    activeSheetName: options.activeSheetName,
    importNotice:
      noticeParts.length > 0
        ? `Exporterad SPC-rapport identifierad: ${noticeParts.join(', ')}.`
        : undefined,
  };
}

export function parseCsvText(text: string, sourceName: string = 'Urklipp'): ParsedImportDataset {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    throw new Error('Filen eller urklippet är tomt.');
  }

  const sections = splitMultiSectionCsv(trimmed);

  if (sections.length === 1 && sections[0].title === null) {
    const delim = detectDelimiter(sections[0].text);
    const records = parseDelimitedRecords(sections[0].text, delim);
    if (records.length < 2) {
      throw new Error('Minst en rubrikrad och en datarad krävs.');
    }
    const { headers, rows } = recordsToObjects(records);
    return finalizeParsedTable(headers, rows, sourceName);
  }

  // Multi-section CSV report exported by this app
  const parsedSections = sections
    .map((sec) => {
      const delim = detectDelimiter(sec.text);
      const records = parseDelimitedRecords(sec.text, delim);
      const { headers, rows } = recordsToObjects(records);
      return {
        title: sec.title || 'Sektion',
        headers,
        rows,
      };
    })
    .filter((s) => s.headers.length > 0 && s.rows.length > 0);

  if (parsedSections.length === 0) {
    throw new Error('Kunde inte hitta någon giltig tabell i rapportfilen.');
  }

  // Locate the measurement rows section first
  const dataSection =
    parsedSections.find((s) => /mätdata|matdata/i.test(s.title)) ??
    parsedSections.find(
      (s) => !/nyckeltal|korrelation|anova|faser|regression|doe/i.test(s.title)
    ) ??
    parsedSections[0];

  // Also check if a KPI summary section exists so we can recover exact LSL/Target/USL limits
  const summarySection = parsedSections.find((s) => /nyckeltal|kapabilitet/i.test(s.title));
  const summarySpecs = summarySection ? extractSpecsFromSummaryRows(summarySection.rows) : {};

  const skippedSections = parsedSections
    .filter((s) => s !== dataSection)
    .map((s) => s.title);

  return finalizeParsedTable(dataSection.headers, dataSection.rows, sourceName, summarySpecs, {
    skippedSections,
  });
}

function isLikelyTextFile(buffer: ArrayBuffer, fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    return true;
  }
  const bytes = new Uint8Array(buffer.slice(0, 8));
  // ZIP (.xlsx) starts with PK (0x50 0x4B), OLE (.xls) starts with D0 CF 11 E0
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return false;
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    return false;
  }
  return false;
}

function decodeTextBuffer(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  // If UTF-8 produced replacement chars (e.g. legacy Windows-1252 CSV from Swedish Excel), try windows-1252
  if (utf8.includes('\uFFFD')) {
    try {
      return new TextDecoder('windows-1252').decode(buffer);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

function pickBestExcelSheet(sheetNames: string[]): string {
  if (sheetNames.length <= 1) return sheetNames[0] || '';
  const dataSheet = sheetNames.find((name) => /mätdata|matdata|data|rådata|radata/i.test(name));
  if (dataSheet) return dataSheet;

  const nonSummary = sheetNames.find(
    (name) => !/sammanfattning|nyckeltal|korrelation|anova|faser|regression|doe|summary/i.test(name)
  );
  return nonSummary || sheetNames[0];
}

export function parseWorkbookSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  fileName: string
): ParsedImportDataset {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Kalkylbladet "${sheetName}" hittades inte.`);
  }

  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
  if (!rawData || rawData.length === 0) {
    throw new Error(`Kalkylbladet "${sheetName}" är tomt eller saknar rader.`);
  }

  const headers = Object.keys(rawData[0]);

  // Recover LSL/Target/USL from any Nyckeltal sheet if present in the workbook
  let summarySpecs: Record<string, SpecLimits> = {};
  const kpiSheetName = workbook.SheetNames.find((n) => /nyckeltal/i.test(n));
  if (kpiSheetName && kpiSheetName !== sheetName) {
    const kpiRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[kpiSheetName],
      { defval: '' }
    );
    summarySpecs = extractSpecsFromSummaryRows(kpiRows);
  }

  const skippedSections = workbook.SheetNames.filter((n) => n !== sheetName);

  return finalizeParsedTable(headers, rawData, fileName, summarySpecs, {
    sheetNames: workbook.SheetNames,
    activeSheetName: sheetName,
    skippedSections:
      workbook.SheetNames.length > 1 && /mätdata|matdata/i.test(sheetName)
        ? skippedSections
        : undefined,
  });
}

export function parseSpreadsheetBuffer(
  buffer: ArrayBuffer,
  fileName: string
): { parsed: ParsedImportDataset; workbook?: XLSX.WorkBook } {
  if (isLikelyTextFile(buffer, fileName)) {
    const text = decodeTextBuffer(buffer);
    return { parsed: parseCsvText(text, fileName) };
  }

  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Excel-filen innehåller inga kalkylblad.');
  }

  const bestSheet = pickBestExcelSheet(workbook.SheetNames);
  const parsed = parseWorkbookSheet(workbook, bestSheet, fileName);
  return { parsed, workbook };
}
