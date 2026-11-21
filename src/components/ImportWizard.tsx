import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  Clipboard,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  X,
  FileSpreadsheet,
  Download,
  Calendar,
  Layers,
  Info,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ProductionRow, SpecLimits } from '../lib/stats';
import {
  ParsedImportDataset,
  isExportedSpcMetadataColumn,
  parseCsvText,
  parseExcelOrStringDate,
  parseNumericCell,
  parseSpreadsheetBuffer,
  parseWorkbookSheet,
} from '../lib/importParser';

interface ImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (
    rows: ProductionRow[],
    columns: string[],
    categoryColumns: string[],
    sourceName: string,
    importedSpecs?: Record<string, SpecLimits>
  ) => void;
  downloadTemplate: () => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

export function ImportWizard({
  isOpen,
  onClose,
  onImport,
  downloadTemplate,
  onNotify,
}: ImportWizardProps) {
  const [activeSourceTab, setActiveSourceTab] = useState<'upload' | 'paste'>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [rawText, setRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [hiddenSpcMetaCols, setHiddenSpcMetaCols] = useState<string[]>([]);
  const [showSpcMetaCols, setShowSpcMetaCols] = useState(false);
  const [selectedMetricColumns, setSelectedMetricColumns] = useState<string[]>([]);
  const [mapTimestamp, setMapTimestamp] = useState<string>('');
  const [fileName, setFileName] = useState('');
  const [extractedSpecs, setExtractedSpecs] = useState<Record<string, SpecLimits>>({});
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [workbookRef, setWorkbookRef] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [cleanseStrategy, setCleanseStrategy] = useState<'skip' | 'prev' | 'average'>('skip');
  const [sortByTimestamp, setSortByTimestamp] = useState<boolean>(true);
  const [removeOutliers, setRemoveOutliers] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const primaryColumn = selectedMetricColumns[0] || '';

  const visibleColumns = useMemo(() => {
    if (showSpcMetaCols || hiddenSpcMetaCols.length === 0) return availableColumns;
    const hiddenSet = new Set(hiddenSpcMetaCols);
    return availableColumns.filter((c) => !hiddenSet.has(c) || selectedMetricColumns.includes(c));
  }, [availableColumns, hiddenSpcMetaCols, showSpcMetaCols, selectedMetricColumns]);

  const cleansingStats = useMemo(() => {
    if (!primaryColumn || parsedRows.length === 0) {
      return { total: parsedRows.length, valid: 0, missing: 0, nonNumeric: 0, outliers: 0 };
    }
    let valid = 0;
    let missing = 0;
    let nonNumeric = 0;
    const nums: number[] = [];

    for (const row of parsedRows) {
      const rawVal = row[primaryColumn];
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
        missing++;
      } else {
        const num = parseNumericCell(rawVal);
        if (isNaN(num)) {
          nonNumeric++;
        } else {
          valid++;
          nums.push(num);
        }
      }
    }

    let outliers = 0;
    if (nums.length > 2) {
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const sd = Math.sqrt(nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / nums.length);
      if (sd > 0) {
        outliers = nums.filter((v) => Math.abs(v - mean) > 3 * sd).length;
      }
    }

    return { total: parsedRows.length, valid, missing, nonNumeric, outliers };
  }, [parsedRows, primaryColumn]);

  const detectedCategoryColumns = useMemo(() => {
    if (parsedRows.length === 0) return [];
    return availableColumns.filter((col) => {
      if (col === mapTimestamp || selectedMetricColumns.includes(col)) return false;
      if (isExportedSpcMetadataColumn(col)) return false;
      const uniques = new Set<string>();
      for (const row of parsedRows) {
        const raw = row[col];
        if (raw !== undefined && raw !== null) {
          const s = String(raw).trim();
          if (s) {
            uniques.add(s);
            if (uniques.size > 20) return false;
          }
        }
      }
      return uniques.size >= 2 && uniques.size <= 20;
    });
  }, [availableColumns, mapTimestamp, selectedMetricColumns, parsedRows]);

  if (!isOpen) return null;

  const handleReset = () => {
    setRawText('');
    setParsedRows([]);
    setAvailableColumns([]);
    setHiddenSpcMetaCols([]);
    setShowSpcMetaCols(false);
    setSelectedMetricColumns([]);
    setMapTimestamp('');
    setFileName('');
    setExtractedSpecs({});
    setImportNotice(null);
    setWorkbookRef(null);
    setSheetNames([]);
    setActiveSheetName('');
    setErrorMsg(null);
    setCleanseStrategy('skip');
    setSortByTimestamp(true);
    setRemoveOutliers(false);
  };

  const applyParsedDataset = (parsed: ParsedImportDataset) => {
    setFileName(parsed.sourceName);
    setAvailableColumns(parsed.headers);
    setParsedRows(parsed.rows);
    setMapTimestamp(parsed.detectedTimeCol);
    setSelectedMetricColumns(parsed.detectedMetricCols);
    setHiddenSpcMetaCols(parsed.hiddenSpcMetaCols);
    setShowSpcMetaCols(false);
    setExtractedSpecs(parsed.extractedSpecs);
    setImportNotice(parsed.importNotice ?? null);
    setSheetNames(parsed.sheetNames ?? []);
    setActiveSheetName(parsed.activeSheetName ?? '');
    setErrorMsg(null);
  };

  const processRawText = (text: string) => {
    if (!text.trim()) {
      setErrorMsg('Klistra in tabellrader först.');
      return;
    }

    try {
      const parsed = parseCsvText(text, 'Urklipp');
      setWorkbookRef(null);
      applyParsedDataset(parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Kunde inte tolka urklipp: ${msg}`);
    }
  };

  const processFileBuffer = (buffer: ArrayBuffer, name: string) => {
    try {
      const { parsed, workbook } = parseSpreadsheetBuffer(buffer, name);
      setWorkbookRef(workbook ?? null);
      applyParsedDataset(parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Kunde inte läsa filen: ${msg}`);
    }
  };

  const handleSwitchExcelSheet = (nextSheet: string) => {
    if (!workbookRef) return;
    try {
      const parsed = parseWorkbookSheet(workbookRef, nextSheet, fileName);
      applyParsedDataset(parsed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Kunde inte läsa kalkylbladet "${nextSheet}": ${msg}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result instanceof ArrayBuffer) {
        processFileBuffer(evt.target.result, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
    // Allow re-uploading the same file name cleanly
    e.target.value = '';
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result instanceof ArrayBuffer) {
        processFileBuffer(evt.target.result, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const toggleMetricColumn = (col: string) => {
    setSelectedMetricColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const handleCopyExample = async () => {
    const tsvData =
      'Tidpunkt\tSkift\tMaskin\tDiameter (mm)\tYtfinhet Ra (µm)\tHårdhet (HRC)\n' +
      '2026-11-20 08:00\tSkift A\tCNC-01\t10.04\t1.52\t58.4\n' +
      '2026-11-20 08:15\tSkift A\tCNC-02\t9.97\t1.61\t58.9\n' +
      '2026-11-20 08:30\tSkift B\tCNC-01\t10.11\t1.55\t58.6\n' +
      '2026-11-20 08:45\tSkift B\tCNC-02\t10.02\t1.49\t59.1';

    try {
      await navigator.clipboard.writeText(tsvData);
      onNotify('success', 'Exempeldata kopierad till urklipp. Klistra in i rutan nedan.');
    } catch {
      setRawText(tsvData);
      onNotify('info', 'Exempeldata infogad direkt i textfältet.');
    }
  };

  const handleSaveImport = () => {
    if (selectedMetricColumns.length === 0) {
      setErrorMsg('Välj minst en numerisk mätkolumn att importera.');
      return;
    }

    try {
      const colStats: Record<string, { mean: number; sd: number; firstValid: number }> = {};
      for (const col of selectedMetricColumns) {
        const nums: number[] = [];
        for (const row of parsedRows) {
          const val = parseNumericCell(row[col]);
          if (!isNaN(val)) nums.push(val);
        }
        const mean = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        const sd =
          nums.length > 1
            ? Math.sqrt(nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / nums.length)
            : 0;
        colStats[col] = { mean, sd, firstValid: nums[0] ?? mean };
      }

      const lastValidByCol: Record<string, number> = {};
      for (const col of selectedMetricColumns) {
        lastValidByCol[col] = colStats[col].firstValid;
      }

      const baseTime = Date.now() - parsedRows.length * 60_000;
      const imported: ProductionRow[] = [];

      parsedRows.forEach((row, idx) => {
        const values: Record<string, number> = {};
        let skipRow = false;

        for (const col of selectedMetricColumns) {
          let num = parseNumericCell(row[col]);
          if (isNaN(num)) {
            if (cleanseStrategy === 'prev') {
              num = lastValidByCol[col];
            } else if (cleanseStrategy === 'average') {
              num = colStats[col].mean;
            } else if (col === primaryColumn) {
              skipRow = true;
              break;
            }
          } else {
            lastValidByCol[col] = num;
          }

          if (
            removeOutliers &&
            !isNaN(num) &&
            colStats[col].sd > 0 &&
            Math.abs(num - colStats[col].mean) > 3 * colStats[col].sd
          ) {
            if (cleanseStrategy === 'prev') {
              num = lastValidByCol[col];
            } else if (cleanseStrategy === 'average') {
              num = colStats[col].mean;
            } else if (col === primaryColumn) {
              skipRow = true;
              break;
            } else {
              num = NaN;
            }
          }

          if (!isNaN(num)) {
            values[col] = num;
          }
        }

        if (skipRow || values[primaryColumn] === undefined) return;

        let dateObj: Date | null = null;
        if (mapTimestamp) {
          dateObj = parseExcelOrStringDate(row[mapTimestamp]);
        }

        const timestamp = dateObj
          ? dateObj.toISOString()
          : new Date(baseTime + idx * 60_000).toISOString();
        const label = dateObj
          ? dateObj.toLocaleString('sv-SE', {
              year: '2-digit',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : mapTimestamp && String(row[mapTimestamp] || '').trim()
          ? String(row[mapTimestamp]).trim()
          : `Rad ${idx + 1}`;

        const categories: Record<string, string> = {};
        for (const catCol of detectedCategoryColumns) {
          const rawCat = row[catCol];
          if (rawCat !== undefined && rawCat !== null && String(rawCat).trim() !== '') {
            categories[catCol] = String(rawCat).trim();
          }
        }

        imported.push({
          rowIndex: idx + 1,
          timestamp,
          label,
          values,
          categories: Object.keys(categories).length > 0 ? categories : undefined,
        });
      });

      if (imported.length === 0) {
        throw new Error('Inga giltiga numeriska rader återstod efter sanering.');
      }

      if (sortByTimestamp && mapTimestamp) {
        imported.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      }

      const finalized = imported.map((r, i) => ({ ...r, rowIndex: i + 1 }));

      const matchingSpecs: Record<string, SpecLimits> = {};
      for (const col of selectedMetricColumns) {
        if (extractedSpecs[col]) {
          matchingSpecs[col] = extractedSpecs[col];
        }
      }

      onImport(
        finalized,
        selectedMetricColumns,
        detectedCategoryColumns,
        fileName || 'Importerat dataset',
        Object.keys(matchingSpecs).length > 0 ? matchingSpecs : undefined
      );
      handleReset();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Importfel: ${msg}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <Card
        padding="none"
        className="w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Importera mätdata (Excel, CSV eller urklipp)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Läser rådata och tidigare exporterade SPC-rapporter (CSV &amp; Excel) och återställer toleransgränser automatiskt.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng importguide"
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMsg && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-lg flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{errorMsg}</p>
            </div>
          )}

          {parsedRows.length === 0 ? (
            <div className="space-y-5">
              <div className="flex border-b border-border gap-4">
                <button
                  type="button"
                  onClick={() => setActiveSourceTab('upload')}
                  className={`py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                    activeSourceTab === 'upload'
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Excel / CSV-fil
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSourceTab('paste')}
                  className={`py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                    activeSourceTab === 'paste'
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Clipboard className="w-4 h-4" />
                  Klistra in tabell
                </button>
              </div>

              {activeSourceTab === 'upload' ? (
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`p-10 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center transition-colors ${
                    dragActive
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-muted/30 hover:bg-muted/50'
                  }`}
                >
                  <Upload className="w-8 h-8 text-primary mb-3" />
                  <p className="text-sm font-semibold text-foreground">
                    Dra och släpp din Excel- eller CSV-fil här
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 mb-5">
                    Stöder .xlsx, .xls, .csv (komma eller semikolon) samt exporterade SPC-rapporter
                  </p>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".xlsx,.xls,.csv,.tsv,.txt"
                    className="hidden"
                  />
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Välj fil
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadTemplate}>
                      <Download className="w-4 h-4" />
                      Ladda ner exempelmall (.xlsx)
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="paste-data" className="text-xs font-medium text-muted-foreground">
                      Klistra in rader direkt från Excel, LibreOffice Calc eller CSV:
                    </label>
                    <button
                      type="button"
                      onClick={handleCopyExample}
                      className="text-xs font-medium text-primary hover:underline cursor-pointer"
                    >
                      Kopiera exempeldata
                    </button>
                  </div>
                  <textarea
                    id="paste-data"
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder={'Tidpunkt\tDiameter (mm)\tYtfinhet Ra (µm)\n2026-11-20 08:00\t10.04\t1.52'}
                    rows={8}
                    className="w-full text-xs font-mono p-3 bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setRawText('')}>
                      Rensa
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => processRawText(rawText)}>
                      Tolka data
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-border text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-semibold text-foreground">{fileName}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {parsedRows.length} rader
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {selectedMetricColumns.length} mätkolumner valda
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs font-medium text-primary hover:underline cursor-pointer"
                >
                  Byt fil
                </button>
              </div>

              {importNotice && (
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-2.5 text-xs text-foreground">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p>{importNotice}</p>
                </div>
              )}

              {sheetNames.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-foreground">Excel-flik:</span>
                  <select
                    value={activeSheetName}
                    onChange={(e) => handleSwitchExcelSheet(e.target.value)}
                    className="h-8 px-2.5 bg-card border border-border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {sheetNames.map((sn) => (
                      <option key={sn} value={sn}>
                        {sn}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Column Selection */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" />
                      Välj mätkolumner att ta med ({selectedMetricColumns.length} valda)
                    </label>
                    {hiddenSpcMetaCols.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowSpcMetaCols((prev) => !prev)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {showSpcMetaCols ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            Dölj beräknade SPC-kolumner ({hiddenSpcMetaCols.length})
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            Visa dolda SPC-exportkolumner ({hiddenSpcMetaCols.length})
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                    {visibleColumns.map((col) => {
                      const checked = selectedMetricColumns.includes(col);
                      const hasSpec = Boolean(extractedSpecs[col]);
                      return (
                        <label
                          key={col}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                            checked
                              ? 'border-primary bg-primary/5 text-foreground font-medium'
                              : 'border-border bg-card text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMetricColumn(col)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary shrink-0"
                          />
                          <span className="truncate flex-1" title={col}>
                            {col}
                          </span>
                          {hasSpec && (
                            <span
                              className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 shrink-0"
                              title={`Återställer LSL=${extractedSpecs[col].lsl}, Target=${extractedSpecs[col].target}, USL=${extractedSpecs[col].usl}`}
                            >
                              Spec
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  {detectedCategoryColumns.length > 0 && (
                    <p className="text-xs text-muted-foreground pt-1">
                      Grupperingskolumner identifierade för automatisk ANOVA:{' '}
                      <span className="font-medium text-foreground">
                        {detectedCategoryColumns.join(', ')}
                      </span>
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="timestamp-col"
                      className="text-xs font-semibold text-foreground flex items-center gap-1.5"
                    >
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      Tidsstämpel / sekvenskolumn (valfritt)
                    </label>
                    <select
                      id="timestamp-col"
                      value={mapTimestamp}
                      onChange={(e) => setMapTimestamp(e.target.value)}
                      className="w-full h-9 text-xs px-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Ingen (använd radnummer 1..N)</option>
                      {visibleColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="cleanse-strategy" className="text-xs font-semibold text-foreground block">
                      Hantering av tomma eller ogiltiga värden
                    </label>
                    <select
                      id="cleanse-strategy"
                      value={cleanseStrategy}
                      onChange={(e) => setCleanseStrategy(e.target.value as 'skip' | 'prev' | 'average')}
                      className="w-full h-9 text-xs px-3 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="skip">Hoppa över felaktiga rader (Rekommenderas för SPC)</option>
                      <option value="prev">Fyll med föregående giltiga värde</option>
                      <option value="average">Fyll med kolumnens medelvärde</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Data Quality Summary (Unboxed flat grid) */}
              {primaryColumn && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-foreground">
                      Datakvalitet för primärkolumn: {primaryColumn}
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      Giltiga: {cleansingStats.valid} / {cleansingStats.total} · Tomma:{' '}
                      {cleansingStats.missing} · Ogiltigt format: {cleansingStats.nonNumeric} · &gt;3σ:{' '}
                      {cleansingStats.outliers}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-6 pt-1">
                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sortByTimestamp}
                        onChange={(e) => setSortByTimestamp(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                      Sortera kronologiskt om tidsstämpel finns
                    </label>
                    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={removeOutliers}
                        onChange={(e) => setRemoveOutliers(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                      />
                      Filtrera extrema mätspikar (&gt;3σ) vid import
                    </label>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground">
                  Förhandsvisning (första 5 rader)
                </p>
                <div className="border border-border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-muted text-muted-foreground border-b border-border">
                        <th className="py-2 px-3 font-medium">#</th>
                        {mapTimestamp && <th className="py-2 px-3 font-medium">{mapTimestamp}</th>}
                        {selectedMetricColumns.slice(0, 5).map((col) => (
                          <th key={col} className="py-2 px-3 font-medium text-right">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono tabular-nums">
                      {parsedRows.slice(0, 5).map((row, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 text-muted-foreground">{idx + 1}</td>
                          {mapTimestamp && (
                            <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                              {(() => {
                                const d = parseExcelOrStringDate(row[mapTimestamp]);
                                return d
                                  ? d.toLocaleString('sv-SE', {
                                      year: '2-digit',
                                      month: '2-digit',
                                      day: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })
                                  : String(row[mapTimestamp] || '–');
                              })()}
                            </td>
                          )}
                          {selectedMetricColumns.slice(0, 5).map((col) => {
                            const val = parseNumericCell(row[col]);
                            return (
                              <td key={col} className="py-2 px-3 text-right text-foreground">
                                {isNaN(val) ? (
                                  <span className="text-rose-600 dark:text-rose-400">Ogiltig</span>
                                ) : (
                                  val.toFixed(3)
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <Button variant="outline" size="sm" onClick={handleReset}>
                  Tillbaka
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={selectedMetricColumns.length === 0}
                  onClick={handleSaveImport}
                >
                  Importera {parsedRows.length} rader
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
