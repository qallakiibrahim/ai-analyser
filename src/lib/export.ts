import * as XLSX from 'xlsx';
import { Anomaly, ExcludedPoint, ProductionRow, StatsResult } from './stats';

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9åäöÅÄÖ_-]+/g, '_').replace(/^_+|_+$/g, '') || 'spc_export';
}

export function exportDatasetToExcel(
  rows: ProductionRow[],
  columns: string[],
  selectedMetric: string,
  stats: StatsResult,
  anomaliesByRow: Record<number, Anomaly[]>,
  datasetName: string,
  excludedPoints: Record<number, ExcludedPoint> = {}
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

export function exportDatasetToCsv(
  rows: ProductionRow[],
  columns: string[],
  selectedMetric: string,
  stats: StatsResult,
  anomaliesByRow: Record<number, Anomaly[]>,
  datasetName: string,
  excludedPoints: Record<number, ExcludedPoint> = {}
): void {
  const headers = ['Rad', 'Tidpunkt', ...columns, 'Status', 'Regelbrott', 'Special Cause-orsak'];
  const escapeCsv = (v: string | number) => {
    const str = String(v ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.map(escapeCsv).join(';')];
  for (const row of rows) {
    const excluded = excludedPoints[row.rowIndex];
    const rowAnomalies = anomaliesByRow[row.rowIndex] || [];
    const val = row.values[selectedMetric];
    const isOos =
      !excluded &&
      typeof val === 'number' &&
      stats.usl > stats.lsl &&
      (val > stats.usl || val < stats.lsl);
    const status = excluded
      ? 'Exkluderad'
      : isOos
      ? 'OOS'
      : rowAnomalies.length > 0
      ? 'Avvikelse'
      : 'OK';

    const cells: Array<string | number> = [
      row.rowIndex,
      row.label,
      ...columns.map((c) => (row.values[c] !== undefined ? row.values[c] : '')),
      status,
      excluded ? 'EXCL' : rowAnomalies.map((a) => a.ruleCode).join(', '),
      excluded ? excluded.reason : '',
    ];
    lines.push(cells.map(escapeCsv).join(';'));
  }

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFileName(datasetName)}_sanerad.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
