import React, { useEffect, useMemo, useState } from 'react';
import { X, Download, FileSpreadsheet, Check } from 'lucide-react';
import { Anomaly, ExcludedPoint, ProductionRow, SpecLimits, StatsResult } from '@/src/lib/stats';
import { CorrelationFinding } from '@/src/lib/advancedStats';
import {
  DoeContextSnapshot,
  RegressionContextSnapshot,
  StageContextSnapshot,
} from '@/src/lib/aiContext';
import {
  buildProcessedCsvContent,
  exportDatasetToCsv,
  exportSelectedToExcelWorkbook,
  CsvExportOptions,
  CsvExportSections,
  CsvRowFilter,
  CsvSpcColumnScope,
} from '@/src/lib/export';
import { cn } from '@/src/lib/utils';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface CsvExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: ProductionRow[];
  columns: string[];
  categoryColumns: string[];
  selectedMetric: string;
  stats: StatsResult;
  anomaliesByRow: Record<number, Anomaly[]>;
  excludedPoints: Record<number, ExcludedPoint>;
  specsByColumn?: Record<string, SpecLimits>;
  excludedByMetric?: Record<string, Record<number, ExcludedPoint>>;
  stageSnapshot?: StageContextSnapshot | null;
  correlations?: CorrelationFinding[];
  regressionSnapshot?: RegressionContextSnapshot | null;
  doeSnapshot?: DoeContextSnapshot | null;
  datasetName: string;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

type FormatPreset = 'excel_se' | 'standard_rfc';

export function CsvExportModal({
  isOpen,
  onClose,
  rows,
  columns,
  categoryColumns,
  selectedMetric,
  stats,
  anomaliesByRow,
  excludedPoints,
  specsByColumn,
  excludedByMetric,
  stageSnapshot,
  correlations = [],
  regressionSnapshot,
  doeSnapshot,
  datasetName,
  onNotify,
}: CsvExportModalProps) {
  const [preset, setPreset] = useState<FormatPreset>('excel_se');
  const [sections, setSections] = useState<CsvExportSections>({
    includeRawRows: true,
    includeKpiSummary: false,
    includeCorrelationsAndAnova: false,
    includeStageSummary: false,
    includeRegression: false,
    includeDoe: false,
  });

  const [rowFilter, setRowFilter] = useState<CsvRowFilter>('all');
  const [spcColumnScope, setSpcColumnScope] = useState<CsvSpcColumnScope>('all_selected');
  const [includeAnomalies, setIncludeAnomalies] = useState(true);
  const [includeSpcMetadata, setIncludeSpcMetadata] = useState(true);
  const [includeStages, setIncludeStages] = useState(false);

  const [selectedNumCols, setSelectedNumCols] = useState<string[]>(columns);
  const [selectedCatCols, setSelectedCatCols] = useState<string[]>(categoryColumns);

  useEffect(() => {
    setSelectedNumCols((prev) => {
      const valid = prev.filter((c) => columns.includes(c));
      return valid.length > 0 ? valid : columns;
    });
  }, [columns]);

  useEffect(() => {
    setSelectedCatCols((prev) => {
      const valid = prev.filter((c) => categoryColumns.includes(c));
      return valid.length > 0 || prev.length === 0
        ? prev.length === 0
          ? categoryColumns
          : valid
        : categoryColumns;
    });
  }, [categoryColumns]);

  const hasMultiStages = (stageSnapshot?.stages.length ?? 0) > 1;
  const canRunRegression = columns.length >= 2 && rows.length >= 6;
  const hasCorrelationsOrAnova = correlations.length > 0 || categoryColumns.length > 0;
  const hasDoeData = Boolean(doeSnapshot);

  useEffect(() => {
    if (isOpen && hasMultiStages) {
      setIncludeStages(true);
    }
  }, [isOpen, hasMultiStages]);

  const exportOptions: CsvExportOptions = useMemo(
    () => ({
      sections,
      delimiter: preset === 'excel_se' ? ';' : ',',
      decimalSeparator: preset === 'excel_se' ? ',' : '.',
      rowFilter,
      includeAnomalies,
      includeSpcMetadata,
      includeStages: includeStages && hasMultiStages,
      spcColumnScope,
      selectedNumericColumns: selectedNumCols,
      categoryColumns: selectedCatCols,
      specsByColumn,
      excludedByMetric,
      stageSnapshot,
      correlations,
      regressionSnapshot,
      doeSnapshot,
    }),
    [
      sections,
      preset,
      rowFilter,
      includeAnomalies,
      includeSpcMetadata,
      includeStages,
      hasMultiStages,
      spcColumnScope,
      selectedNumCols,
      selectedCatCols,
      specsByColumn,
      excludedByMetric,
      stageSnapshot,
      correlations,
      regressionSnapshot,
      doeSnapshot,
    ]
  );

  const preview = useMemo(() => {
    if (!isOpen) {
      return {
        rowCount: 0,
        columnCount: 0,
        sectionCount: 0,
        dataRowCount: 0,
        previewLines: [] as string[],
      };
    }
    return buildProcessedCsvContent(
      rows,
      columns,
      selectedMetric,
      stats,
      anomaliesByRow,
      excludedPoints,
      exportOptions
    );
  }, [isOpen, rows, columns, selectedMetric, stats, anomaliesByRow, excludedPoints, exportOptions]);

  if (!isOpen) return null;

  const toggleSection = (key: keyof CsvExportSections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectAllSections = () => {
    setSections({
      includeRawRows: true,
      includeKpiSummary: true,
      includeCorrelationsAndAnova: hasCorrelationsOrAnova,
      includeStageSummary: hasMultiStages,
      includeRegression: canRunRegression,
      includeDoe: hasDoeData,
    });
  };

  const selectRowsOnly = () => {
    setSections({
      includeRawRows: true,
      includeKpiSummary: false,
      includeCorrelationsAndAnova: false,
      includeStageSummary: false,
      includeRegression: false,
      includeDoe: false,
    });
  };

  const toggleNumCol = (col: string) => {
    setSelectedNumCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const toggleCatCol = (col: string) => {
    setSelectedCatCols((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const canDownload = preview.sectionCount > 0 && preview.rowCount > 0;

  const handleDownloadCsv = () => {
    if (!canDownload) return;
    const result = exportDatasetToCsv(
      rows,
      columns,
      selectedMetric,
      stats,
      anomaliesByRow,
      datasetName,
      excludedPoints,
      exportOptions
    );
    onNotify(
      'success',
      `Exporterade ${result.rowCount} rader (${result.sectionCount} delar) till "${result.fileName}".`
    );
    onClose();
  };

  const handleDownloadExcel = () => {
    if (!canDownload) return;
    const result = exportSelectedToExcelWorkbook(
      rows,
      columns,
      selectedMetric,
      stats,
      anomaliesByRow,
      datasetName,
      excludedPoints,
      exportOptions
    );
    onNotify(
      'success',
      `Exporterade ${result.sheetCount} flik(ar) och ${result.rowCount} rader till "${result.fileName}".`
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <Card padding="none" className="w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Exportera data &amp; analyser (CSV / Excel)
              </h2>
              <p className="text-xs text-muted-foreground">
                {datasetName} · Aktiv kolumn:{' '}
                <span className="font-medium text-foreground">{selectedMetric}</span>
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Stäng">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-5 space-y-5 text-xs overflow-y-auto flex-1">
          {/* Summary Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 border border-border rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-border bg-muted/25">
            <div className="px-3.5 py-2.5">
              <p className="text-[11px] text-muted-foreground">Mätrader i export</p>
              <p className="font-mono tabular-nums text-base font-semibold text-foreground mt-0.5">
                {sections.includeRawRows ? preview.dataRowCount : 0}
                <span className="text-[11px] font-sans font-normal text-muted-foreground ml-1">
                  av {rows.length}
                </span>
              </p>
            </div>
            <div className="px-3.5 py-2.5">
              <p className="text-[11px] text-muted-foreground">Valda delar</p>
              <p className="font-mono tabular-nums text-base font-semibold text-foreground mt-0.5">
                {preview.sectionCount}{' '}
                <span className="text-[11px] font-sans font-normal text-muted-foreground">
                  {preview.sectionCount === 1 ? 'tabell' : 'tabeller'}
                </span>
              </p>
            </div>
            <div className="px-3.5 py-2.5">
              <p className="text-[11px] text-muted-foreground">Valda kolumner</p>
              <p className="font-mono tabular-nums text-base font-semibold text-foreground mt-0.5">
                {selectedNumCols.length}/{columns.length}
                {categoryColumns.length > 0 && (
                  <span className="text-[11px] font-sans font-normal text-muted-foreground ml-1">
                    +{selectedCatCols.length} kat.
                  </span>
                )}
              </p>
            </div>
            <div className="px-3.5 py-2.5">
              <p className="text-[11px] text-muted-foreground">Totalt rader</p>
              <p className="font-mono tabular-nums text-base font-semibold text-foreground mt-0.5">
                {preview.rowCount}
              </p>
            </div>
          </div>

          {/* 1. Multi-select Data & Analysis Sections */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-foreground">
                1. Välj vilka delar som ska med (du kan kombinera flera)
              </p>
              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={selectAllSections}
                  className="px-2 py-1 rounded border border-border bg-card hover:bg-muted text-foreground font-medium cursor-pointer"
                >
                  Välj allt
                </button>
                <button
                  type="button"
                  onClick={selectRowsOnly}
                  className="px-2 py-1 rounded border border-border bg-card hover:bg-muted text-foreground font-medium cursor-pointer"
                >
                  Bara mätrader ({rows.length})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(
                [
                  {
                    key: 'includeRawRows' as const,
                    label: `Mätdata rad för rad (${rows.length} rader)`,
                    sub: 'Alla enskilda mätvärden + valda SPC-kolumner',
                    disabled: false,
                  },
                  {
                    key: 'includeKpiSummary' as const,
                    label: `Nyckeltal & Kapabilitet (${selectedNumCols.length} var.)`,
                    sub: 'Cp/Cpk, Pp/Ppk, icke-normal Ppk, normalitet & PPM',
                    disabled: false,
                  },
                  {
                    key: 'includeCorrelationsAndAnova' as const,
                    label: 'Korrelationer & ANOVA',
                    sub: hasCorrelationsOrAnova
                      ? `${correlations.length} korrelationer + kategoritester`
                      : 'Kräver fler kolumner/kategorier',
                    disabled: !hasCorrelationsOrAnova,
                  },
                  {
                    key: 'includeStageSummary' as const,
                    label: 'Faser (Stages)',
                    sub: hasMultiStages
                      ? `${stageSnapshot?.stages.length} aktiva faser med Cpk/medel`
                      : 'Aktivera faser i kontrollgrafen först',
                    disabled: !hasMultiStages,
                  },
                  {
                    key: 'includeRegression' as const,
                    label: 'Regression & Fitted Line',
                    sub: canRunRegression
                      ? 'Ekvation, R², p-värden, VIF & bästa kurvform'
                      : 'Kräver minst 2 kolumner & 6 rader',
                    disabled: !canRunRegression,
                  },
                  {
                    key: 'includeDoe' as const,
                    label: 'DOE (Försöksplanering)',
                    sub: hasDoeData
                      ? `${doeSnapshot?.experimentName} (${doeSnapshot?.nCompleted}/${doeSnapshot?.nTotal})`
                      : 'Fyll i resultat (Y) i DOE-fliken först',
                    disabled: !hasDoeData,
                  },
                ]
              ).map((item) => {
                const checked = sections[item.key] && !item.disabled;
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => toggleSection(item.key)}
                    className={cn(
                      'p-2.5 rounded-lg border text-left flex items-start gap-2 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed',
                      checked
                        ? 'border-primary/60 bg-primary/[0.06]'
                        : 'border-border bg-card hover:bg-muted/40'
                    )}
                  >
                    <span
                      className={cn(
                        'w-4 h-4 mt-0.5 rounded flex items-center justify-center border shrink-0',
                        checked
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border bg-background'
                      )}
                    >
                      {checked && <Check className="w-3 h-3" />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground leading-snug">{item.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        {item.sub}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            {preview.sectionCount > 1 && (
              <p className="text-[11px] text-muted-foreground">
                Tips: När flera delar är valda skrivs alla i samma CSV med sektionsrubriker — eller klicka{' '}
                <span className="font-medium text-foreground">Ladda ner Excel (.xlsx)</span> för en egen flik per tabell.
              </p>
            )}
          </div>

          {/* 2. Column Picker */}
          {(sections.includeRawRows || sections.includeKpiSummary) && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-foreground">2. Välj vilka kolumner som ska med</p>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNumCols(columns);
                      setSelectedCatCols(categoryColumns);
                    }}
                    className="px-2 py-1 rounded border border-border bg-card hover:bg-muted text-foreground font-medium cursor-pointer"
                  >
                    Välj alla
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedNumCols([selectedMetric])}
                    className="px-2 py-1 rounded border border-border bg-card hover:bg-muted text-foreground font-medium cursor-pointer"
                  >
                    Bara aktiv ({selectedMetric})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNumCols([]);
                      setSelectedCatCols([]);
                    }}
                    className="px-2 py-1 rounded border border-border bg-card hover:bg-muted text-muted-foreground cursor-pointer"
                  >
                    Avmarkera
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-3">
                <div className="space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Mätkolumner ({selectedNumCols.length} av {columns.length} valda)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {columns.map((col) => {
                      const checked = selectedNumCols.includes(col);
                      return (
                        <button
                          key={col}
                          type="button"
                          onClick={() => toggleNumCol(col)}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs transition-colors cursor-pointer',
                            checked
                              ? 'border-primary/60 bg-primary/10 text-foreground font-medium'
                              : 'border-border bg-card text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <span
                            className={cn(
                              'w-3.5 h-3.5 rounded flex items-center justify-center border',
                              checked
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'border-border bg-background'
                            )}
                          >
                            {checked && <Check className="w-2.5 h-2.5" />}
                          </span>
                          <span>{col}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {sections.includeRawRows && categoryColumns.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Kategorikolumner ({selectedCatCols.length} av {categoryColumns.length} valda)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {categoryColumns.map((cat) => {
                        const checked = selectedCatCols.includes(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => toggleCatCol(cat)}
                            className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs transition-colors cursor-pointer',
                              checked
                                ? 'border-primary/60 bg-primary/10 text-foreground font-medium'
                                : 'border-border bg-card text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <span
                              className={cn(
                                'w-3.5 h-3.5 rounded flex items-center justify-center border',
                                checked
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-border bg-background'
                              )}
                            >
                              {checked && <Check className="w-2.5 h-2.5" />}
                            </span>
                            <span>{cat}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. Row Filter & SPC Column Scope (when Raw Rows is selected) */}
          {sections.includeRawRows && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="font-semibold text-foreground">3. Vilka mätrader ska ingå?</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: 'all', label: `Alla rader (${rows.length})`, sub: 'Inkl. exkluderade' },
                      { id: 'active', label: 'Endast aktiva', sub: 'Utan exkluderade' },
                      { id: 'anomalies', label: 'Endast avvikelser', sub: 'OOS & Nelson-larm' },
                      { id: 'excluded', label: 'Endast exkluderade', sub: 'Special Cause-logg' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setRowFilter(opt.id)}
                      className={cn(
                        'p-2.5 rounded-lg border text-left transition-colors cursor-pointer',
                        rowFilter === opt.id
                          ? 'border-primary bg-primary/[0.05]'
                          : 'border-border bg-card hover:bg-muted/40'
                      )}
                    >
                      <p className="font-medium text-foreground">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground">{opt.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-foreground">4. SPC-tillägg på varje mätrad</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'all_selected', label: 'Alla valda', sub: 'Komplett SPC' },
                      { id: 'active', label: 'Bara aktiv', sub: 'Kompakt' },
                      { id: 'none', label: 'Bara rådata', sub: 'Inga tillägg' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSpcColumnScope(opt.id)}
                      className={cn(
                        'p-2.5 rounded-lg border text-left transition-colors cursor-pointer',
                        spcColumnScope === opt.id
                          ? 'border-primary bg-primary/[0.05]'
                          : 'border-border bg-card hover:bg-muted/40'
                      )}
                    >
                      <p className="font-medium text-foreground">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground">{opt.sub}</p>
                    </button>
                  ))}
                </div>

                {spcColumnScope !== 'none' && (
                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeAnomalies}
                        onChange={(e) => setIncludeAnomalies(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-foreground">
                        Status, OOS, Nelson-anomalier &amp; Special Cause-orsaker
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeSpcMetadata}
                        onChange={(e) => setIncludeSpcMetadata(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-foreground">
                        Moving Range, kontrollgränser (CL/UCL/LCL) &amp; LSL/Target/USL
                      </span>
                    </label>
                    <label
                      className={cn(
                        'flex items-center gap-2 select-none',
                        hasMultiStages ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={includeStages && hasMultiStages}
                        disabled={!hasMultiStages}
                        onChange={(e) => setIncludeStages(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-foreground">
                        Fas-kolumner på varje rad{' '}
                        <span className="text-muted-foreground">
                          {hasMultiStages
                            ? `(${stageSnapshot?.stages.length} faser)`
                            : '(aktivera faser i kontrollgrafen)'}
                        </span>
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CSV Dialect Selector */}
          <div className="space-y-2">
            <p className="font-semibold text-foreground">CSV-format (gäller CSV-nedladdning)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPreset('excel_se')}
                className={cn(
                  'p-2.5 rounded-lg border text-left transition-colors cursor-pointer space-y-0.5',
                  preset === 'excel_se'
                    ? 'border-primary bg-primary/[0.05]'
                    : 'border-border bg-card hover:bg-muted/40'
                )}
              >
                <p className="font-semibold text-foreground">Svensk Excel (.csv)</p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Avgränsare: ; · Decimal: , · UTF-8 BOM
                </p>
              </button>

              <button
                type="button"
                onClick={() => setPreset('standard_rfc')}
                className={cn(
                  'p-2.5 rounded-lg border text-left transition-colors cursor-pointer space-y-0.5',
                  preset === 'standard_rfc'
                    ? 'border-primary bg-primary/[0.05]'
                    : 'border-border bg-card hover:bg-muted/40'
                )}
              >
                <p className="font-semibold text-foreground">Python / R / Minitab / Power BI</p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  Avgränsare: , · Decimal: . · RFC-4180
                </p>
              </button>
            </div>
          </div>

          {/* Live Raw CSV Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">
                Förhandsgranskning (första rader av totalt {preview.rowCount})
              </span>
              <span className="font-mono">
                {preview.sectionCount} {preview.sectionCount === 1 ? 'tabell' : 'tabeller'} · UTF-8
              </span>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/40 overflow-x-auto">
              <pre className="font-mono text-[11px] leading-relaxed text-foreground whitespace-pre">
                {preview.previewLines.length > 0
                  ? preview.previewLines.join('\n')
                  : 'Välj minst en del ovan för att förhandsgranska.'}
              </pre>
            </div>
          </div>
        </div>

        {/* Sticky Footer Actions */}
        <div className="px-5 py-3.5 border-t border-border flex flex-wrap items-center justify-between gap-2 shrink-0 bg-card rounded-b-xl">
          <p className="text-[11px] text-muted-foreground">
            {!canDownload
              ? 'Välj minst en del med rader för att exportera.'
              : `${preview.rowCount} rader (${preview.sectionCount} ${
                  preview.sectionCount === 1 ? 'tabell' : 'tabeller'
                }) redo för nedladdning.`}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Avbryt
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canDownload}
              onClick={handleDownloadExcel}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Ladda ner Excel (.xlsx)
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!canDownload}
              onClick={handleDownloadCsv}
            >
              <Download className="w-3.5 h-3.5" />
              Ladda ner CSV ({preview.rowCount} rader)
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
