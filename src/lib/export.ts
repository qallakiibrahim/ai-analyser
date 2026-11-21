import * as XLSX from 'xlsx';
import {
  Anomaly,
  ExcludedPoint,
  ProductionRow,
  SpecLimits,
  StatsResult,
  calculateStats,
  detectAnomalies,
  extractMetricValues,
  suggestSpecLimits,
} from './stats';
import {
  ColumnTriageItem,
  CorrelationFinding,
  analyzeGroups,
  calculateNonNormalCapability,
} from './advancedStats';
import {
  DoeContextSnapshot,
  RegressionContextSnapshot,
  StageContextSnapshot,
  buildAutoRegressionSnapshot,
} from './aiContext';

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9åäöÅÄÖ_-]+/g, '_').replace(/^_+|_+$/g, '') || 'spc_export';
}

export type CsvExportMode = 'rows' | 'summary';
export type CsvRowFilter = 'all' | 'active' | 'anomalies' | 'excluded';
export type CsvSpcColumnScope = 'active' | 'all_selected' | 'none';

export interface CsvExportSections {
  includeRawRows: boolean;
  includeKpiSummary: boolean;
  includeCorrelationsAndAnova: boolean;
  includeStageSummary: boolean;
  includeRegression: boolean;
  includeDoe: boolean;
}

export interface CsvExportOptions {
  /** Legacy mode kept for backwards compatibility; overridden by sections when provided */
  exportMode?: CsvExportMode;
  sections?: CsvExportSections;
  delimiter?: ';' | ',';
  decimalSeparator?: ',' | '.';
  rowFilter?: CsvRowFilter;
  /** Legacy boolean kept for backwards compatibility; overridden by rowFilter when provided */
  includeExcluded?: boolean;
  includeAnomalies?: boolean;
  includeSpcMetadata?: boolean;
  includeStages?: boolean;
  spcColumnScope?: CsvSpcColumnScope;
  selectedNumericColumns?: string[];
  categoryColumns?: string[];
  specsByColumn?: Record<string, SpecLimits>;
  excludedByMetric?: Record<string, Record<number, ExcludedPoint>>;
  stageSnapshot?: StageContextSnapshot | null;
  triageItems?: ColumnTriageItem[];
  correlations?: CorrelationFinding[];
  regressionSnapshot?: RegressionContextSnapshot | null;
  doeSnapshot?: DoeContextSnapshot | null;
}

interface ExportTableSection {
  id: string;
  title: string;
  sheetName: string;
  headers: string[];
  rows: Array<Array<string | number>>;
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

function makeCsvFormatters(delimiter: ';' | ',', decimalSeparator: ',' | '.') {
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

  return { fmtNum, escapeCsv };
}

interface PerMetricComputed {
  metric: string;
  spec: SpecLimits;
  stats: StatsResult;
  anomaliesByRow: Record<number, Anomaly[]>;
  excludedPoints: Record<number, ExcludedPoint>;
  mrByRow: Map<number, { mr: number; outOfControl: boolean }>;
}

function computePerMetricSpc(
  rows: ProductionRow[],
  metric: string,
  selectedMetric: string,
  selectedStats: StatsResult,
  selectedAnomaliesByRow: Record<number, Anomaly[]>,
  selectedExcluded: Record<number, ExcludedPoint>,
  specsByColumn?: Record<string, SpecLimits>,
  excludedByMetric?: Record<string, Record<number, ExcludedPoint>>
): PerMetricComputed {
  const excl =
    metric === selectedMetric
      ? selectedExcluded
      : excludedByMetric?.[metric] ?? {};
  const activeRows = rows.filter((r) => !excl[r.rowIndex]);

  let metricStats: StatsResult;
  let metricAnom: Record<number, Anomaly[]>;
  let spec: SpecLimits;

  if (metric === selectedMetric) {
    metricStats = selectedStats;
    metricAnom = selectedAnomaliesByRow;
    spec = specsByColumn?.[metric] ?? {
      usl: selectedStats.usl,
      lsl: selectedStats.lsl,
      target: selectedStats.target,
      uslLabel: 'USL',
      lslLabel: 'LSL',
    };
  } else {
    const vals = extractMetricValues(activeRows, metric);
    spec = specsByColumn?.[metric] ?? {
      ...suggestSpecLimits(vals),
      uslLabel: 'USL',
      lslLabel: 'LSL',
    };
    metricStats = calculateStats(vals, spec.usl, spec.lsl, spec.target);
    metricAnom = detectAnomalies(activeRows, metric, spec.usl, spec.lsl, metricStats).anomaliesByRow;
  }

  const mrByRow = new Map<number, { mr: number; outOfControl: boolean }>();
  let prevActiveVal: number | null = null;
  for (const row of rows) {
    if (excl[row.rowIndex]) continue;
    const val = row.values[metric];
    if (typeof val !== 'number' || !Number.isFinite(val)) continue;
    if (prevActiveVal !== null) {
      const mr = Math.abs(val - prevActiveVal);
      const outOfControl = metricStats.mrBar > 1e-12 && mr > metricStats.uclMr;
      mrByRow.set(row.rowIndex, { mr, outOfControl });
    }
    prevActiveVal = val;
  }

  return {
    metric,
    spec,
    stats: metricStats,
    anomaliesByRow: metricAnom,
    excludedPoints: excl,
    mrByRow,
  };
}

function buildRowsSection(
  rows: ProductionRow[],
  columns: string[],
  selectedMetric: string,
  stats: StatsResult,
  anomaliesByRow: Record<number, Anomaly[]>,
  excludedPoints: Record<number, ExcludedPoint>,
  options: CsvExportOptions,
  fmtNum: (n: number | null | undefined, digits?: number) => string
): ExportTableSection {
  const rowFilter: CsvRowFilter =
    options.rowFilter ?? (options.includeExcluded === false ? 'active' : 'all');
  const spcScope: CsvSpcColumnScope = options.spcColumnScope ?? 'active';
  const includeAnomalies = options.includeAnomalies ?? true;
  const includeSpcMetadata = options.includeSpcMetadata ?? true;
  const includeStages = options.includeStages ?? false;
  const categoryColumns = options.categoryColumns ?? [];

  const exportNumericColumns =
    options.selectedNumericColumns !== undefined
      ? options.selectedNumericColumns.filter((c) => columns.includes(c))
      : columns;

  const spcMetricsList: string[] =
    spcScope === 'none'
      ? []
      : spcScope === 'all_selected'
      ? exportNumericColumns.length > 0
        ? exportNumericColumns
        : [selectedMetric]
      : [selectedMetric];

  const perMetricMap = new Map<string, PerMetricComputed>();
  for (const m of spcMetricsList) {
    perMetricMap.set(
      m,
      computePerMetricSpc(
        rows,
        m,
        selectedMetric,
        stats,
        anomaliesByRow,
        excludedPoints,
        options.specsByColumn,
        options.excludedByMetric
      )
    );
  }

  const activeMetricComputed =
    perMetricMap.get(selectedMetric) ??
    computePerMetricSpc(
      rows,
      selectedMetric,
      selectedMetric,
      stats,
      anomaliesByRow,
      excludedPoints,
      options.specsByColumn,
      options.excludedByMetric
    );

  const stageStages = options.stageSnapshot?.stages ?? [];
  const findStageForRow = (rowIndex: number) =>
    stageStages.find((st) => rowIndex >= st.startRow && rowIndex <= st.endRow) ?? null;

  const headers: string[] = ['Rad', 'Tidpunkt', ...categoryColumns, ...exportNumericColumns];

  if (includeStages && stageStages.length > 0) {
    headers.push('Fas_Nr', 'Fas_Namn', 'Fas_Medel', 'Fas_Cpk', 'Fas_Ppk');
  }

  const isMultiMetricSpc = spcScope === 'all_selected' && spcMetricsList.length > 1;

  for (const m of spcMetricsList) {
    const prefix = isMultiMetricSpc ? `${m}_` : '';
    if (!isMultiMetricSpc && (includeAnomalies || includeSpcMetadata)) {
      headers.push('Analyserad_Kolumn');
    }
    if (includeAnomalies) {
      headers.push(
        `${prefix}Status`,
        `${prefix}Exkluderad`,
        `${prefix}Special_Cause_Orsak`,
        `${prefix}Exkluderad_Tidpunkt`,
        `${prefix}Utanfor_Spec_OOS`,
        `${prefix}Anomali_Flaggad`,
        `${prefix}Anomali_Regler`,
        `${prefix}Anomali_Allvarlighetsgrad`,
        `${prefix}Anomali_Beskrivning`
      );
    }
    if (includeSpcMetadata) {
      headers.push(
        `${prefix}Moving_Range`,
        `${prefix}MR_Ur_Kontroll`,
        `${prefix}CL_Mean`,
        `${prefix}UCL_3s`,
        `${prefix}LCL_3s`,
        `${prefix}LSL`,
        `${prefix}Target`,
        `${prefix}USL`
      );
    }
  }

  const outRows: Array<Array<string | number>> = [];

  for (const row of rows) {
    const filterTargets = spcMetricsList.length > 0 ? spcMetricsList : [selectedMetric];
    const isRowExcludedInScope = filterTargets.some((m) => {
      const pm = perMetricMap.get(m) ?? activeMetricComputed;
      return Boolean(pm.excludedPoints[row.rowIndex]);
    });
    const isRowAnomalyOrOosInScope = filterTargets.some((m) => {
      const pm = perMetricMap.get(m) ?? activeMetricComputed;
      if (pm.excludedPoints[row.rowIndex]) return false;
      const val = row.values[m];
      const oos =
        typeof val === 'number' &&
        pm.stats.usl > pm.stats.lsl &&
        (val > pm.stats.usl || val < pm.stats.lsl);
      const hasAnom = (pm.anomaliesByRow[row.rowIndex] || []).length > 0;
      const mrOoc = pm.mrByRow.get(row.rowIndex)?.outOfControl ?? false;
      return oos || hasAnom || mrOoc;
    });

    if (rowFilter === 'active' && isRowExcludedInScope) continue;
    if (rowFilter === 'excluded' && !isRowExcludedInScope) continue;
    if (rowFilter === 'anomalies' && !isRowAnomalyOrOosInScope) continue;

    const cells: Array<string | number> = [
      row.rowIndex,
      row.label,
      ...categoryColumns.map((cat) => row.categories?.[cat] ?? ''),
      ...exportNumericColumns.map((c) => fmtNum(row.values[c], 6)),
    ];

    if (includeStages && stageStages.length > 0) {
      const st = findStageForRow(row.rowIndex);
      cells.push(
        st ? st.stageIndex : '',
        st ? st.label : '',
        st ? fmtNum(st.mean, 6) : '',
        st ? fmtNum(st.cpk, 4) : '',
        st ? fmtNum(st.ppk, 4) : ''
      );
    }

    for (const m of spcMetricsList) {
      const pm = perMetricMap.get(m)!;
      const excluded = pm.excludedPoints[row.rowIndex];
      const rowAnomalies = excluded ? [] : pm.anomaliesByRow[row.rowIndex] || [];
      const val = row.values[m];
      const isOos =
        !excluded &&
        typeof val === 'number' &&
        pm.stats.usl > pm.stats.lsl &&
        (val > pm.stats.usl || val < pm.stats.lsl);
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

      if (!isMultiMetricSpc && (includeAnomalies || includeSpcMetadata)) {
        cells.push(m);
      }

      if (includeAnomalies) {
        cells.push(
          status,
          excluded ? 'JA' : 'NEJ',
          excluded ? excluded.reason : '',
          excluded ? excluded.excludedAt : '',
          isOos ? 'JA' : 'NEJ',
          hasAnomaly ? 'JA' : 'NEJ',
          excluded ? 'EXCL' : rowAnomalies.map((a) => a.ruleCode).join(', '),
          severityLabel,
          excluded ? '' : rowAnomalies.map((a) => `${a.ruleCode}: ${a.explanation}`).join(' | ')
        );
      }

      if (includeSpcMetadata) {
        const mrEntry = pm.mrByRow.get(row.rowIndex);
        cells.push(
          mrEntry ? fmtNum(mrEntry.mr, 6) : '',
          mrEntry ? (mrEntry.outOfControl ? 'JA' : 'NEJ') : '',
          fmtNum(pm.stats.mean, 6),
          fmtNum(pm.stats.ucl, 6),
          fmtNum(pm.stats.lcl, 6),
          fmtNum(pm.stats.lsl, 6),
          fmtNum(pm.stats.target, 6),
          fmtNum(pm.stats.usl, 6)
        );
      }
    }

    outRows.push(cells);
  }

  return {
    id: 'rows',
    title: `MÄTDATA RAD FÖR RAD (${outRows.length} RADER)`,
    sheetName: 'Mätdata',
    headers,
    rows: outRows,
  };
}

function buildKpiSummarySection(
  rows: ProductionRow[],
  columns: string[],
  selectedMetric: string,
  stats: StatsResult,
  anomaliesByRow: Record<number, Anomaly[]>,
  excludedPoints: Record<number, ExcludedPoint>,
  options: CsvExportOptions,
  fmtNum: (n: number | null | undefined, digits?: number) => string
): ExportTableSection {
  const exportMetrics =
    options.selectedNumericColumns && options.selectedNumericColumns.length > 0
      ? options.selectedNumericColumns.filter((c) => columns.includes(c))
      : columns;

  const headers = [
    'Variabel',
    'Aktiva_N',
    'Exkluderade',
    'LSL',
    'Target',
    'USL',
    'Medelvarde',
    'Median',
    'Min',
    'Max',
    'Sigma_Within',
    'Sigma_Overall',
    'CL_Mean',
    'UCL_3s',
    'LCL_3s',
    'MR_Bar',
    'UCL_MR',
    'Cp',
    'Cpk',
    'Pp',
    'Ppk',
    'Icke_Normal_Ppk',
    'Normalitet_p',
    'Normalfordelad',
    'OOS_Antal',
    'OOS_Procent',
    'PPM_Observerad',
    'PPM_Forvantad',
    'Anomalier_Antal',
    'MR_Ur_Kontroll',
    'Status',
  ];

  const outRows: Array<Array<string | number>> = [];

  for (const col of exportMetrics) {
    const computed = computePerMetricSpc(
      rows,
      col,
      selectedMetric,
      stats,
      anomaliesByRow,
      excludedPoints,
      options.specsByColumn,
      options.excludedByMetric
    );
    const activeRows = rows.filter((r) => !computed.excludedPoints[r.rowIndex]);
    const vals = extractMetricValues(activeRows, col);
    const nonNorm = calculateNonNormalCapability(vals, computed.spec.usl, computed.spec.lsl);
    const anomalyCount = Object.values(computed.anomaliesByRow).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    const excludedCount = Object.keys(computed.excludedPoints).length;
    const effPpk =
      computed.stats.isNormal === false && nonNorm.ppk !== null
        ? nonNorm.ppk
        : computed.stats.ppk;
    const statusLabel =
      computed.stats.oosCount > 0 || (effPpk !== null && effPpk < 1.0)
        ? 'Kritisk'
        : (effPpk !== null && effPpk < 1.33) || anomalyCount > 0 || computed.stats.isNormal === false
        ? 'Varning'
        : 'OK';

    outRows.push([
      col,
      computed.stats.count,
      excludedCount,
      fmtNum(computed.spec.lsl, 6),
      fmtNum(computed.spec.target, 6),
      fmtNum(computed.spec.usl, 6),
      fmtNum(computed.stats.mean, 6),
      fmtNum(computed.stats.median, 6),
      fmtNum(computed.stats.min, 6),
      fmtNum(computed.stats.max, 6),
      fmtNum(computed.stats.stdDevWithin, 6),
      fmtNum(computed.stats.stdDev, 6),
      fmtNum(computed.stats.mean, 6),
      fmtNum(computed.stats.ucl, 6),
      fmtNum(computed.stats.lcl, 6),
      fmtNum(computed.stats.mrBar, 6),
      fmtNum(computed.stats.uclMr, 6),
      fmtNum(computed.stats.cp, 4),
      fmtNum(computed.stats.cpk, 4),
      fmtNum(computed.stats.pp, 4),
      fmtNum(computed.stats.ppk, 4),
      fmtNum(nonNorm.ppk, 4),
      fmtNum(computed.stats.normalityPValue, 5),
      computed.stats.isNormal === null ? 'Ej bedömd' : computed.stats.isNormal ? 'JA' : 'NEJ',
      computed.stats.oosCount,
      fmtNum(computed.stats.oosPercent, 2),
      Math.round(computed.stats.ppmObserved),
      computed.stats.ppmExpected !== null ? Math.round(computed.stats.ppmExpected) : '',
      anomalyCount,
      computed.stats.mrOutOfControlCount,
      statusLabel,
    ]);
  }

  return {
    id: 'summary',
    title: `NYCKELTAL & KAPABILITET (${outRows.length} VARIABLER)`,
    sheetName: 'Nyckeltal',
    headers,
    rows: outRows,
  };
}

function buildCorrelationsAndAnovaSection(
  rows: ProductionRow[],
  selectedMetric: string,
  stats: StatsResult,
  excludedPoints: Record<number, ExcludedPoint>,
  options: CsvExportOptions,
  fmtNum: (n: number | null | undefined, digits?: number) => string
): ExportTableSection | null {
  const correlations = options.correlations ?? [];
  const categoryColumns = options.categoryColumns ?? [];
  const activeRows = rows.filter((r) => !excludedPoints[r.rowIndex]);

  const outRows: Array<Array<string | number>> = [];
  for (const c of correlations) {
    outRows.push([
      'Korrelation',
      selectedMetric,
      c.predictor,
      c.n,
      fmtNum(c.r, 4),
      fmtNum(c.rSquared, 4),
      fmtNum(c.pValue, 5),
      c.isSignificant ? 'JA' : 'NEJ',
      `${c.strength} (${c.direction})`,
    ]);
  }

  for (const cat of categoryColumns) {
    const anova = analyzeGroups(activeRows, selectedMetric, cat, stats.usl, stats.lsl);
    if (!anova) continue;
    outRows.push([
      'Kategori-ANOVA',
      selectedMetric,
      cat,
      activeRows.length,
      fmtNum(anova.fStat, 4),
      fmtNum(anova.etaSquared, 4),
      fmtNum(anova.pValue, 5),
      anova.isSignificant ? 'JA' : 'NEJ',
      anova.verdict,
    ]);
  }

  if (outRows.length === 0) return null;

  return {
    id: 'correlations',
    title: `KORRELATIONER & KATEGORI-ANOVA (${selectedMetric})`,
    sheetName: 'Korrelation_ANOVA',
    headers: [
      'Analys',
      'Malvariabel_Y',
      'Faktor_X_eller_Kategori',
      'N',
      'r_eller_F',
      'R2_eller_Eta2',
      'p_varde',
      'Signifikant',
      'Tolkning',
    ],
    rows: outRows,
  };
}

function buildStageSummarySection(
  options: CsvExportOptions,
  fmtNum: (n: number | null | undefined, digits?: number) => string
): ExportTableSection | null {
  const stages = options.stageSnapshot?.stages ?? [];
  if (stages.length === 0) return null;

  return {
    id: 'stages',
    title: `FASER / STAGES (${stages.length} FASER)`,
    sheetName: 'Faser',
    headers: [
      'Fas_Nr',
      'Fas_Namn',
      'Start_Rad',
      'Slut_Rad',
      'Antal_N',
      'Medelvarde',
      'StdAvvikelse',
      'MR_Bar',
      'Cpk',
      'Ppk',
      'OOS_Antal',
    ],
    rows: stages.map((st) => [
      st.stageIndex,
      st.label,
      st.startRow,
      st.endRow,
      st.count,
      fmtNum(st.mean, 6),
      fmtNum(st.stdDev, 6),
      fmtNum(st.mrBar, 6),
      fmtNum(st.cpk, 4),
      fmtNum(st.ppk, 4),
      st.oosCount,
    ]),
  };
}

function buildRegressionSection(
  rows: ProductionRow[],
  columns: string[],
  selectedMetric: string,
  excludedPoints: Record<number, ExcludedPoint>,
  options: CsvExportOptions,
  fmtNum: (n: number | null | undefined, digits?: number) => string
): ExportTableSection | null {
  const activeRows = rows.filter((r) => !excludedPoints[r.rowIndex]);
  const reg =
    options.regressionSnapshot && options.regressionSnapshot.target === selectedMetric
      ? options.regressionSnapshot
      : buildAutoRegressionSnapshot(
          activeRows,
          selectedMetric,
          columns,
          options.correlations ?? []
        );

  if (!reg) return null;

  const outRows: Array<Array<string | number>> = [
    [
      'Multipel modell',
      reg.target,
      reg.equationText,
      fmtNum(reg.rSquared, 4),
      fmtNum(reg.adjRSquared, 4),
      fmtNum(reg.rmse, 4),
      fmtNum(reg.modelPValue, 5),
      '',
      reg.summaryVerdict,
    ],
  ];

  for (const term of reg.topTerms) {
    outRows.push([
      'Koefficient',
      term.term,
      fmtNum(term.estimate, 6),
      '',
      '',
      fmtNum(term.tStat, 3),
      fmtNum(term.pValue, 5),
      fmtNum(term.vif, 2),
      term.isSignificant ? 'Signifikant (p < 0,05)' : 'Ej signifikant',
    ]);
  }

  if (reg.fittedLine) {
    outRows.push([
      `Fitted Line (${reg.fittedLine.degreeLabel})`,
      reg.fittedLine.factor,
      reg.fittedLine.equationText,
      fmtNum(reg.fittedLine.rSquared, 4),
      fmtNum(reg.fittedLine.adjRSquared, 4),
      fmtNum(reg.fittedLine.rmse, 4),
      '',
      fmtNum(reg.fittedLine.aicc, 2),
      reg.fittedLine.recommendationReason,
    ]);
  }

  return {
    id: 'regression',
    title: `REGRESSION & FITTED LINE PLOT (${reg.target})`,
    sheetName: 'Regression',
    headers: [
      'Typ',
      'Term_eller_Mal',
      'Varde_eller_Ekvation',
      'R2',
      'Adj_R2',
      'RMSE_eller_t',
      'p_varde',
      'VIF_eller_AICc',
      'Kommentar',
    ],
    rows: outRows,
  };
}

function buildDoeSection(
  options: CsvExportOptions,
  fmtNum: (n: number | null | undefined, digits?: number) => string
): ExportTableSection | null {
  const doe = options.doeSnapshot;
  if (!doe) return null;

  const outRows: Array<Array<string | number>> = [
    [
      'DOE-modell',
      doe.experimentName,
      doe.designLabel,
      doe.actualEquation,
      fmtNum(doe.rSquared, 4),
      fmtNum(doe.adjRSquared, 4),
      fmtNum(doe.modelPValue, 5),
      doe.summaryVerdict,
    ],
  ];

  for (const eff of doe.topEffects) {
    outRows.push([
      eff.isInteraction ? 'Samspel' : 'Huvudeffekt',
      eff.code,
      eff.label,
      fmtNum(eff.effect, 4),
      '',
      '',
      fmtNum(eff.pValue, 5),
      eff.isSignificant ? 'Signifikant' : 'Ej signifikant',
    ]);
  }

  if (doe.curvature.hasCenterPoints) {
    outRows.push([
      'Krökningstest',
      'Centrum',
      doe.curvature.isSignificant ? 'Signifikant krökning' : 'Linjär modell OK',
      '',
      '',
      '',
      fmtNum(doe.curvature.pValue, 5),
      doe.curvature.message,
    ]);
  }

  if (doe.optimization) {
    const settingStr = Object.entries(doe.optimization.settings)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' | ');
    outRows.push([
      'Optimering',
      doe.optimization.goal,
      `Förutspått Y = ${fmtNum(doe.optimization.predictedY, 4)} ${doe.responseUnit}`,
      settingStr,
      '',
      '',
      '',
      `Mål: ${doe.optimization.targetValue}`,
    ]);
  }

  return {
    id: 'doe',
    title: `DOE / FÖRSÖKSPLANERING (${doe.experimentName})`,
    sheetName: 'DOE',
    headers: [
      'Typ',
      'Kod_eller_Namn',
      'Beskrivning',
      'Effekt_eller_Inställning',
      'R2',
      'Adj_R2',
      'p_varde',
      'Kommentar',
    ],
    rows: outRows,
  };
}

function collectExportSections(
  rows: ProductionRow[],
  columns: string[],
  selectedMetric: string,
  stats: StatsResult,
  anomaliesByRow: Record<number, Anomaly[]>,
  excludedPoints: Record<number, ExcludedPoint>,
  options: CsvExportOptions,
  fmtNum: (n: number | null | undefined, digits?: number) => string
): ExportTableSection[] {
  const sectionsCfg: CsvExportSections = options.sections ?? {
    includeRawRows: options.exportMode !== 'summary',
    includeKpiSummary: options.exportMode === 'summary',
    includeCorrelationsAndAnova: false,
    includeStageSummary: false,
    includeRegression: false,
    includeDoe: false,
  };

  const sections: ExportTableSection[] = [];

  if (sectionsCfg.includeRawRows) {
    sections.push(
      buildRowsSection(
        rows,
        columns,
        selectedMetric,
        stats,
        anomaliesByRow,
        excludedPoints,
        options,
        fmtNum
      )
    );
  }

  if (sectionsCfg.includeKpiSummary) {
    sections.push(
      buildKpiSummarySection(
        rows,
        columns,
        selectedMetric,
        stats,
        anomaliesByRow,
        excludedPoints,
        options,
        fmtNum
      )
    );
  }

  if (sectionsCfg.includeCorrelationsAndAnova) {
    const s = buildCorrelationsAndAnovaSection(
      rows,
      selectedMetric,
      stats,
      excludedPoints,
      options,
      fmtNum
    );
    if (s) sections.push(s);
  }

  if (sectionsCfg.includeStageSummary) {
    const s = buildStageSummarySection(options, fmtNum);
    if (s) sections.push(s);
  }

  if (sectionsCfg.includeRegression) {
    const s = buildRegressionSection(
      rows,
      columns,
      selectedMetric,
      excludedPoints,
      options,
      fmtNum
    );
    if (s) sections.push(s);
  }

  if (sectionsCfg.includeDoe) {
    const s = buildDoeSection(options, fmtNum);
    if (s) sections.push(s);
  }

  return sections;
}

export function buildProcessedCsvContent(
  rows: ProductionRow[],
  columns: string[],
  selectedMetric: string,
  stats: StatsResult,
  anomaliesByRow: Record<number, Anomaly[]>,
  excludedPoints: Record<number, ExcludedPoint> = {},
  options: CsvExportOptions = {}
): {
  csv: string;
  rowCount: number;
  columnCount: number;
  sectionCount: number;
  dataRowCount: number;
  previewLines: string[];
} {
  const delimiter = options.delimiter ?? ';';
  const decimalSeparator = options.decimalSeparator ?? (delimiter === ';' ? ',' : '.');
  const { fmtNum, escapeCsv } = makeCsvFormatters(delimiter, decimalSeparator);

  const sections = collectExportSections(
    rows,
    columns,
    selectedMetric,
    stats,
    anomaliesByRow,
    excludedPoints,
    options,
    fmtNum
  );

  if (sections.length === 0) {
    return {
      csv: '',
      rowCount: 0,
      columnCount: 0,
      sectionCount: 0,
      dataRowCount: 0,
      previewLines: [],
    };
  }

  const lines: string[] = [];
  let totalRows = 0;
  let maxCols = 0;
  let dataRowCount = 0;
  const isMultiSection = sections.length > 1;

  sections.forEach((sec, idx) => {
    if (sec.id === 'rows') {
      dataRowCount = sec.rows.length;
    }
    totalRows += sec.rows.length;
    maxCols = Math.max(maxCols, sec.headers.length);

    if (isMultiSection) {
      if (idx > 0) lines.push('');
      lines.push(escapeCsv(`=== ${sec.title} ===`));
    }
    lines.push(sec.headers.map(escapeCsv).join(delimiter));
    for (const r of sec.rows) {
      lines.push(r.map(escapeCsv).join(delimiter));
    }
  });

  return {
    csv: lines.join('\r\n'),
    rowCount: totalRows,
    columnCount: maxCols,
    sectionCount: sections.length,
    dataRowCount,
    previewLines: lines.slice(0, 7),
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
): { rowCount: number; columnCount: number; sectionCount: number; fileName: string } {
  const { csv, rowCount, columnCount, sectionCount } = buildProcessedCsvContent(
    rows,
    columns,
    selectedMetric,
    stats,
    anomaliesByRow,
    excludedPoints,
    options
  );

  const suffix =
    sectionCount > 1
      ? 'komplett_rapport'
      : options.sections?.includeKpiSummary && !options.sections?.includeRawRows
      ? 'nyckeltal_SPC'
      : 'matdata_SPC';
  const fileName = `${safeFileName(datasetName)}_${suffix}.csv`;
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { rowCount, columnCount, sectionCount, fileName };
}

export function exportSelectedToExcelWorkbook(
  rows: ProductionRow[],
  columns: string[],
  selectedMetric: string,
  stats: StatsResult,
  anomaliesByRow: Record<number, Anomaly[]>,
  datasetName: string,
  excludedPoints: Record<number, ExcludedPoint> = {},
  options: CsvExportOptions = {}
): { rowCount: number; sheetCount: number; fileName: string } {
  // Always use standard dot decimal numbers internally for native Excel numeric cells
  const fmtNum = (n: number | null | undefined, digits: number = 4): string => {
    if (n === null || n === undefined || !Number.isFinite(n)) return '';
    return Number(n.toFixed(digits)).toString();
  };

  const sections = collectExportSections(
    rows,
    columns,
    selectedMetric,
    stats,
    anomaliesByRow,
    excludedPoints,
    options,
    fmtNum
  );

  const wb = XLSX.utils.book_new();
  let totalRows = 0;

  for (const sec of sections) {
    totalRows += sec.rows.length;
    const aoa: Array<Array<string | number>> = [
      sec.headers,
      ...sec.rows.map((r) =>
        r.map((cell) => {
          if (typeof cell === 'number') return cell;
          if (cell !== '' && /^-?\d+(\.\d+)?$/.test(cell)) {
            const num = Number(cell);
            if (Number.isFinite(num)) return num;
          }
          return cell;
        })
      ),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sec.sheetName.slice(0, 31));
  }

  const fileName = `${safeFileName(datasetName)}_komplett_analys.xlsx`;
  XLSX.writeFile(wb, fileName);

  return { rowCount: totalRows, sheetCount: sections.length, fileName };
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
