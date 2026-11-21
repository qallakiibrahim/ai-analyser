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
} from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ProductionRow } from '../lib/stats';

interface ImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (
    rows: ProductionRow[],
    columns: string[],
    categoryColumns: string[],
    sourceName: string
  ) => void;
  downloadTemplate: () => void;
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}

function parseNumericCell(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : NaN;
  }
  if (raw === undefined || raw === null) return NaN;
  const trimmed = String(raw).trim();
  if (!trimmed) return NaN;

  // Handle Swedish/European numbers like "1 234,56" or "10,45 mm"
  let normalized = trimmed.replace(/\s+/g, '');
  if (normalized.includes(',') && !normalized.includes('.')) {
    normalized = normalized.replace(',', '.');
  } else if (normalized.includes(',') && normalized.includes('.')) {
    // Decide which is decimal separator by last occurrence
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  }
  const match = normalized.match(/-?\d+(\.\d+)?([eE][+-]?\d+)?/);
  if (!match) return NaN;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : NaN;
}

function parseExcelOrStringDate(raw: unknown): Date | null {
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

  // ISO or Swedish YYYY-MM-DD HH:mm(:ss)
  const isoCandidate = str.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, '$1T$2');
  const d1 = new Date(isoCandidate);
  if (!isNaN(d1.getTime())) return d1;

  // DD/MM/YYYY or DD.MM.YYYY
  const dmy = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
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
  const [selectedMetricColumns, setSelectedMetricColumns] = useState<string[]>([]);
  const [mapTimestamp, setMapTimestamp] = useState<string>('');
  const [fileName, setFileName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [cleanseStrategy, setCleanseStrategy] = useState<'skip' | 'prev' | 'average'>('skip');
  const [sortByTimestamp, setSortByTimestamp] = useState<boolean>(true);
  const [removeOutliers, setRemoveOutliers] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const primaryColumn = selectedMetricColumns[0] || '';

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
    setSelectedMetricColumns([]);
    setMapTimestamp('');
    setFileName('');
    setErrorMsg(null);
    setCleanseStrategy('skip');
    setSortByTimestamp(true);
    setRemoveOutliers(false);
  };

  const setupDetectedColumns = (headers: string[], rows: Record<string, unknown>[], sourceName: string) => {
    setFileName(sourceName);
    setAvailableColumns(headers);
    setParsedRows(rows);
    setErrorMsg(null);

    const timeCol =
      headers.find((h) => {
        const l = h.toLowerCase();
        return (
          l.includes('tid') ||
          l.includes('datum') ||
          l.includes('time') ||
          l.includes('date') ||
          l.includes('stämpel') ||
          l.includes('klockslag')
        );
      }) || '';

    // Detect all columns that have at least 50% numeric values (excluding the timestamp column)
    const sampleSize = Math.min(rows.length, 40);
    const detectedNumeric = headers.filter((col) => {
      if (col === timeCol) return false;
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

    setMapTimestamp(timeCol);
    setSelectedMetricColumns(
      detectedNumeric.length > 0
        ? detectedNumeric
        : headers.filter((h) => h !== timeCol).slice(0, 1)
    );
  };

  const processRawText = (text: string) => {
    if (!text.trim()) {
      setErrorMsg('Klistra in tabellrader först.');
      return;
    }

    try {
      const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        throw new Error('Minst en rubrikrad och en datarad krävs.');
      }

      const firstLine = lines[0];
      let delimiter = '\t';
      if (!firstLine.includes('\t')) {
        if (firstLine.includes(';')) delimiter = ';';
        else if (firstLine.includes(',')) delimiter = ',';
      }

      const headers = firstLine
        .split(delimiter)
        .map((h, i) => h.replace(/^["']|["']$/g, '').trim() || `Kolumn ${i + 1}`);

      const rows: Record<string, unknown>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(delimiter).map((c) => c.replace(/^["']|["']$/g, '').trim());
        const obj: Record<string, unknown> = {};
        headers.forEach((h, idx) => {
          obj[h] = cells[idx] ?? '';
        });
        rows.push(obj);
      }

      setupDetectedColumns(headers, rows, 'Urklipp');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Kunde inte tolka urklipp: ${msg}`);
    }
  };

  const processExcelBuffer = (buffer: ArrayBuffer, name: string) => {
    try {
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

      if (!rawData || rawData.length === 0) {
        throw new Error('Kalkylbladet är tomt eller saknar rader.');
      }

      const headers = Object.keys(rawData[0]);
      setupDetectedColumns(headers, rawData, name);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Kunde inte läsa filen: ${msg}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result instanceof ArrayBuffer) {
        processExcelBuffer(evt.target.result, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
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
        processExcelBuffer(evt.target.result, file.name);
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
      // Precompute column stats for imputation and optional 3σ outlier removal
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

      // Re-index cleanly 1..N in final order
      const finalized = imported.map((r, i) => ({ ...r, rowIndex: i + 1 }));

      onImport(
        finalized,
        selectedMetricColumns,
        detectedCategoryColumns,
        fileName || 'Importerat dataset'
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
              Välj fritt vilka numeriska kolumner som ska analyseras — inga värden hittas på automatiskt.
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
                    Stöder .xlsx, .xls och .csv med svenska decimalkomman och Excel-datumserienummer
                  </p>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".xlsx,.xls,.csv"
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
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-semibold text-foreground">{fileName}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {parsedRows.length} rader
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {availableColumns.length} kolumner
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

              {/* Column Selection */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    Välj mätkolumner att ta med ({selectedMetricColumns.length} valda)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {availableColumns.map((col) => {
                      const checked = selectedMetricColumns.includes(col);
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
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <span className="truncate" title={col}>
                            {col}
                          </span>
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
                      {availableColumns.map((col) => (
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
