import * as XLSX from 'xlsx';
import { Anomaly, ExcludedPoint, ProductionRow, StatsResult } from './stats';

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9åäöÅÄÖ_-]+/g, '_').replace(/^_+|_+$/g, '') || 'spc_export';
}

export interface CsvExportOptions {
  delimiter?: ';' | ',';
  decimalSeparator?: ',' | '.';
  includeExcluded?: boolean;
  includeSpcMetadata?: boolean;
  categoryColumns?: string[];
}

export function exportDatasetToExcel(
  rows: ProductionRow[],
  columns: string[],
  selectedMetric: string,
  stats: StatsResult,
  anomaliesByRow: Record<number, Anomaly[]>,
  datasetName: string,
  excludedPoints: Record<number, ExcludedPoint> = {},
  categoryColumns: string[] = []
): void {
  const excludedCount = Object.keys(excludedPoints).length;
  const summaryRows = [
    { Nyckeltal: 'Dataset', Värde: datasetName },
    { Nyckeltal: 'Analyserad kolumn', Värde: selectedMetric },
    { Nyckeltal: 'Exporterad', Värde: new Date().toLocaleString('sv-SE') },
    { Nyckeltal: 'Antal mätpunkter i analys (N)', Värde: stats.count },
    { Nyckeltal: 'Exkluderade punkter (Special Cause)', Värde: excludedCount },
    { Nyckeltal: 'LSL (Nedre toleransgräns)', Värde: stats.lsl },
    { Nyckeltal: 'Målvärde (Target)', Värde: stats.target },
    { Nyckeltal: 'USL (Övre toleransgräns)', Värde: stats.usl },
    { Nyckeltal: 'Medelvärde (Mean)', Värde: Number(stats.mean.toFixed(4)) },
    { Nyckeltal: 'Median', Värde: Number(stats.median.toFixed(4)) },
    { Nyckeltal: 'Min / Max', Värde: `${stats.min.toFixed(4)} / ${stats.max.toFixed(4)}` },
    { Nyckeltal: 'σ Within (I-MR)', Värde: Number(stats.stdDevWithin.toFixed(4)) },
    { Nyckeltal: 'σ Overall', Värde: Number(stats.stdDev.toFixed(4)) },
    { Nyckeltal: 'MR-medel (MR-bar)', Värde: Number(stats.mrBar.toFixed(4)) },
    { Nyckeltal: 'UCL_MR', Värde: Number(stats.uclMr.toFixed(4)) },
    { Nyckeltal: 'UCL (3σ)', Värde: Number(stats.ucl.toFixed(4)) },
    { Nyckeltal: 'LCL (3σ)', Värde: Number(stats.lcl.toFixed(4)) },
    { Nyckeltal: 'Cp (Potential)', Värde: stats.cp !== null ? Number(stats.cp.toFixed(3)) : 'Ej beräkningsbar' },
    { Nyckeltal: 'Cpk (Potential)', Värde: stats.cpk !== null ? Number(stats.cpk.toFixed(3)) : 'Ej beräkningsbar' },
    { Nyckeltal: 'Pp (Prestanda)', Värde: stats.pp !== null ? Number(stats.pp.toFixed(3)) : 'Ej beräkningsbar' },
    { Nyckeltal: 'Ppk (Prestanda)', Värde: stats.ppk !== null ? Number(stats.ppk.toFixed(3)) : 'Ej beräkningsbar' },
    { Nyckeltal: 'Normalitetstest', Värde: stats.normalityTestName },
    {
      Nyckeltal: 'Normalitet p-värde',
      Värde: stats.normalityPValue !== null ? Number(stats.normalityPValue.toFixed(4)) : 'Kräver minst 8 punkter',
    },
    {
      Nyckeltal: 'Normalfördelad (α = 0.05)',
      Värde: stats.isNormal === null ? 'Ej bedömd' : stats.isNormal ? 'JA' : 'NEJ',
    },
    { Nyckeltal: 'Utanför tolerans (OOS)', Värde: `${stats.oosCount} (${stats.oosPercent.toFixed(2)} %)` },
    { Nyckeltal: 'Observerad PPM', Värde: Math.round(stats.ppmObserved) },
    {
      Nyckeltal: 'Förväntad PPM (Normal)',
      Värde: stats.ppmExpected !== null ? Math.round(stats.ppmExpected) : 'Ej beräkningsbar',
    },
  ];

  const dataRows = rows.map((row) => {
    const excluded = excludedPoints[row.rowIndex];
    const rowAnomalies = anomaliesByRow[row.rowIndex] || [];
    const val = row.values[selectedMetric];
    const isOos =
      !excluded &&
      typeof val === 'number' &&
      stats.usl > stats.lsl &&
      (val > stats.usl || val < stats.lsl);

    const record: Record<string, string | number> = {
      Rad: row.rowIndex,
      Tidpunkt: row.label,
    };
    for (const catCol of categoryColumns) {
      record[catCol] = row.categories?.[catCol] ?? '';
    }
    for (const col of columns) {
      record[col] = row.values[col] !== undefined ? row.values[col] : '';
    }
    record['Status'] = excluded
      ? 'Exkluderad (Special Cause)'
      : isOos
      ? 'Utanför spec (OOS)'
      : rowAnomalies.length > 0
      ? 'Avvikelse'
      : 'OK';
    record['Regelbrott'] = excluded ? 'EXCL' : rowAnomalies.map((a) => a.ruleCode).join(', ');
    record['Kommentar'] = excluded
      ? `Special Cause: ${excluded.reason}`
      : rowAnomalies.map((a) => a.explanation).join(' | ');
    return record;
  });

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  const wsData = XLSX.utils.json_to_sheet(dataRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'SPC-Sammanfattning');
  XLSX.utils.book_append_sheet(wb, wsData, 'Mätdata & Avvikelser');

  XLSX.writeFile(wb, `${safeFileName(datasetName)}_SPC_rapport.xlsx`);
}

export function buildProcessedCsvContent(
  rows: ProductionRow[],
  columns: string[],
  selectedMetric: string,
  stats: StatsResult,
  anomaliesByRow: Record<number, Anomaly[]>,
  excludedPoints: Record<number, ExcludedPoint> = {},
  options: CsvExportOptions = {}
): { csv: string; rowCount: number; columnCount: number; previewLines: string[] } {
  const delimiter = options.delimiter ?? ';';
  const decimalSeparator = options.decimalSeparator ?? (delimiter === ';' ? ',' : '.');
  const includeExcluded = options.includeExcluded ?? true;
  const includeSpcMetadata = options.includeSpcMetadata ?? true;
  const categoryColumns = options.categoryColumns ?? [];

  const fmtNum = (n: number | null | undefined, digits: number = 4): string => {
    if (n === null || n === undefined || !Number.isFinite(n)) return '';
    const formatted = Number(n.toFixed(digits)).toString();
    return decimalSeparator === ',' ? formatted.replace('.', ',') : formatted;
  };

  const escapeCsv = (v: string | number | null | undefined): string => {
    const str = String(v ?? '');
    if (
      str.includes(delimiter) ||
      str.includes('"') ||
      str.includes('\n') ||
      str.includes('\r')
    ) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers: string[] = [
    'Rad',
    'Tidpunkt',
    ...categoryColumns,
    ...columns,
    'Analyserad_Kolumn',
    'Status',
    'Exkluderad',
    'Special_Cause_Orsak',
    'Exkluderad_Tidpunkt',
    'Utanfor_Spec_OOS',
    'Anomali_Flaggad',
    'Anomali_Regler',
    'Anomali_Allvarlighetsgrad',
    'Anomali_Beskrivning',
  ];

  if (includeSpcMetadata) {
    headers.push(
      'Moving_Range',
      'MR_Ur_Kontroll',
      'CL_Mean',
      'UCL_3s',
      'LCL_3s',
      'LSL',
      'Target',
      'USL'
    );
  }

  // Precompute Moving Range across active (non-excluded) rows so external analysis matches I-MR exactly
  const mrByRow = new Map<number, { mr: number; outOfControl: boolean }>();
  let prevActiveVal: number | null = null;
  for (const row of rows) {
    if (excludedPoints[row.rowIndex]) continue;
    const val = row.values[selectedMetric];
    if (typeof val !== 'number' || !Number.isFinite(val)) continue;
    if (prevActiveVal !== null) {
      const mr = Math.abs(val - prevActiveVal);
      const outOfControl = stats.mrBar > 1e-12 && mr > stats.uclMr;
      mrByRow.set(row.rowIndex, { mr, outOfControl });
    }
    prevActiveVal = val;
  }

  const lines: string[] = [headers.map(escapeCsv).join(delimiter)];
  let exportedRowCount = 0;

  for (const row of rows) {
    const excluded = excludedPoints[row.rowIndex];
    if (excluded && !includeExcluded) continue;

    const rowAnomalies = excluded ? [] : anomaliesByRow[row.rowIndex] || [];
    const val = row.values[selectedMetric];
    const isOos =
      !excluded &&
      typeof val === 'number' &&
      stats.usl > stats.lsl &&
      (val > stats.usl || val < stats.lsl);
    const hasAnomaly = rowAnomalies.length > 0;
    const hasCritical = rowAnomalies.some((a) => a.severity === 'critical');

    const status = excluded
      ? 'Exkluderad (Special Cause)'
      : isOos
      ? 'Utanför spec (OOS)'
      : hasAnomaly
      ? 'Avvikelse'
      : 'OK';

    const severityLabel = excluded
      ? 'Exkluderad'
      : hasCritical || isOos
      ? 'Kritisk'
      : hasAnomaly
      ? 'Varning'
      : 'Normal';

    const cells: Array<string | number> = [
      row.rowIndex,
      row.label,
      ...categoryColumns.map((cat) => row.categories?.[cat] ?? ''),
      ...columns.map((c) => fmtNum(row.values[c], 6)),
      selectedMetric,
      status,
      excluded ? 'JA' : 'NEJ',
      excluded ? excluded.reason : '',
      excluded ? excluded.excludedAt : '',
      isOos ? 'JA' : 'NEJ',
      hasAnomaly ? 'JA' : 'NEJ',
      excluded ? 'EXCL' : rowAnomalies.map((a) => a.ruleCode).join(', '),
      severityLabel,
      excluded ? '' : rowAnomalies.map((a) => `${a.ruleCode}: ${a.explanation}`).join(' | '),
    ];

    if (includeSpcMetadata) {
      const mrEntry = mrByRow.get(row.rowIndex);
      cells.push(
        mrEntry ? fmtNum(mrEntry.mr, 6) : '',
        mrEntry ? (mrEntry.outOfControl ? 'JA' : 'NEJ') : '',
        fmtNum(stats.mean, 6),
        fmtNum(stats.ucl, 6),
        fmtNum(stats.lcl, 6),
        fmtNum(stats.lsl, 6),
        fmtNum(stats.target, 6),
        fmtNum(stats.usl, 6)
      );
    }

    lines.push(cells.map(escapeCsv).join(delimiter));
    exportedRowCount++;
  }

  return {
    csv: lines.join('\r\n'),
    rowCount: exportedRowCount,
    columnCount: headers.length,
    previewLines: lines.slice(0, 5),
  };
}

export function exportDatasetToCsv(
  rows: ProductionRow[],
  columns: string[],
  selectedMetric: string,
  stats: StatsResult,
  anomaliesByRow: Record<number, Anomaly[]>,
  datasetName: string,
  excludedPoints: Record<number, ExcludedPoint> = {},
  options: CsvExportOptions = {}
): { rowCount: number; columnCount: number; fileName: string } {
  const { csv, rowCount, columnCount } = buildProcessedCsvContent(
    rows,
    columns,
    selectedMetric,
    stats,
    anomaliesByRow,
    excludedPoints,
    options
  );

  const fileName = `${safeFileName(datasetName)}_bearbetad_SPC.csv`;
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { rowCount, columnCount, fileName };
}

export function downloadExcelTemplate(): void {
  const now = Date.now();
  const templateData = [
    {
      Tidpunkt: new Date(now - 600_000).toLocaleString('sv-SE'),
      Skift: 'Skift A',
      Maskin: 'CNC-01',
      'Diameter (mm)': 10.04,
      'Ytfinhet Ra (µm)': 1.52,
      'Kylvätsketemp (°C)': 21.8,
    },
    {
      Tidpunkt: new Date(now - 300_000).toLocaleString('sv-SE'),
      Skift: 'Skift A',
      Maskin: 'CNC-02',
      'Diameter (mm)': 9.96,
      'Ytfinhet Ra (µm)': 1.61,
      'Kylvätsketemp (°C)': 22.1,
    },
    {
      Tidpunkt: new Date(now).toLocaleString('sv-SE'),
      Skift: 'Skift B',
      Maskin: 'CNC-01',
      'Diameter (mm)': 10.12,
      'Ytfinhet Ra (µm)': 1.58,
      'Kylvätsketemp (°C)': 22.3,
    },
  ];
  const ws = XLSX.utils.json_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mätdata');
  XLSX.writeFile(wb, 'produktionsdata_mall.xlsx');
}
