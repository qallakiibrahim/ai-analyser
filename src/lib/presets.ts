import { SpecLimits } from './stats';

export interface ArticlePreset {
  id: string;
  name: string;
  description?: string;
  specs: Record<string, SpecLimits>;
  updatedAt: string;
}

const STORAGE_KEY = 'production_ai_article_presets_v1';

const DEFAULT_PRESETS: ArticlePreset[] = [
  {
    id: 'preset-cnc-44120',
    name: 'Art. 44120 — CNC-axel Ø10 mm',
    description: 'Standardtoleranser för exempeldataset (Diameter, Ra, Kylvätsketemp)',
    specs: {
      'Diameter (mm)': { lsl: 9.2, usl: 10.8, target: 10.0, uslLabel: 'USL', lslLabel: 'LSL' },
      'Ytfinhet Ra (µm)': { lsl: 0.8, usl: 2.4, target: 1.6, uslLabel: 'USL', lslLabel: 'LSL' },
      'Kylvätsketemp (°C)': { lsl: 18.0, usl: 27.0, target: 22.0, uslLabel: 'USL', lslLabel: 'LSL' },
      'Matning (mm/varv)': { lsl: 0.12, usl: 0.28, target: 0.2, uslLabel: 'USL', lslLabel: 'LSL' },
      'Spindelvarvtal (RPM)': { lsl: 2200, usl: 2800, target: 2500, uslLabel: 'USL', lslLabel: 'LSL' },
    },
    updatedAt: new Date().toISOString(),
  },
];

export function loadArticlePresets(): ArticlePreset[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRESETS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PRESETS;
    return parsed;
  } catch {
    return DEFAULT_PRESETS;
  }
}

export function saveArticlePresets(presets: ArticlePreset[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Ignore storage quota errors cleanly
  }
}
