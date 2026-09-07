// ============================================================
// POINTAGE — Wilayas of Algeria & Temporal Decomposition Engine
// For Granular Database Indexing, Temporal Filtering & Central DB Sync
// ============================================================

export interface WilayaInfo {
  code: string;
  name: string;
  nameAr: string;
  searchTokens: string[];
}

export const ALGERIAN_WILAYAS: WilayaInfo[] = [
  { code: '01', name: 'Adrar', nameAr: 'أدرار', searchTokens: ['adrar'] },
  { code: '02', name: 'Chlef', nameAr: 'الشلف', searchTokens: ['chlef', 'ech-cheliff', 'el asnam'] },
  { code: '03', name: 'Laghouat', nameAr: 'الأغواط', searchTokens: ['laghouat'] },
  { code: '04', name: 'Oum El Bouaghi', nameAr: 'أم البواقي', searchTokens: ['oum el bouaghi', 'oeb'] },
  { code: '05', name: 'Batna', nameAr: 'باتنة', searchTokens: ['batna'] },
  { code: '06', name: 'Béjaïa', nameAr: 'بجاية', searchTokens: ['bejaia', 'béjaïa', 'bougie'] },
  { code: '07', name: 'Biskra', nameAr: 'بسكرة', searchTokens: ['biskra'] },
  { code: '08', name: 'Béchar', nameAr: 'بشار', searchTokens: ['bechar', 'béchar'] },
  { code: '09', name: 'Blida', nameAr: 'البليدة', searchTokens: ['blida', 'boufarik', 'ouled yaich'] },
  { code: '10', name: 'Bouira', nameAr: 'البويرة', searchTokens: ['bouira'] },
  { code: '11', name: 'Tamanrasset', nameAr: 'تمنراست', searchTokens: ['tamanrasset', 'tamanghasset'] },
  { code: '12', name: 'Tébessa', nameAr: 'تبسة', searchTokens: ['tebessa', 'tébessa'] },
  { code: '13', name: 'Tlemcen', nameAr: 'تلمسان', searchTokens: ['tlemcen', 'maghnia'] },
  { code: '14', name: 'Tiaret', nameAr: 'تيارت', searchTokens: ['tiaret'] },
  { code: '15', name: 'Tizi Ouzou', nameAr: 'تيزي وزو', searchTokens: ['tizi ouzou', 'tizi-ouzou', 'tizi'] },
  { code: '16', name: 'Alger', nameAr: 'الجزائر', searchTokens: ['alger', 'algiers', 'algerie', 'bab ezzouar', 'baraki', 'dar el beida', 'kouba', 'hydra', 'cheraga', 'zeralda', 'bir mourad rais', 'rouiba', 'reghaia'] },
  { code: '17', name: 'Djelfa', nameAr: 'الجلفة', searchTokens: ['djelfa'] },
  { code: '18', name: 'Jijel', nameAr: 'جيجل', searchTokens: ['jijel', 'djidjelli'] },
  { code: '19', name: 'Sétif', nameAr: 'سطيف', searchTokens: ['setif', 'sétif', 'el eulma'] },
  { code: '20', name: 'Saïda', nameAr: 'سعيدة', searchTokens: ['saida', 'saïda'] },
  { code: '21', name: 'Skikda', nameAr: 'سكيكدة', searchTokens: ['skikda', 'philippeville'] },
  { code: '22', name: 'Sidi Bel Abbès', nameAr: 'سيدي بلعباس', searchTokens: ['sidi bel abbes', 'sidi bel abbès', 'sba'] },
  { code: '23', name: 'Annaba', nameAr: 'عنابة', searchTokens: ['annaba', 'bône'] },
  { code: '24', name: 'Guelma', nameAr: 'قالمة', searchTokens: ['guelma'] },
  { code: '25', name: 'Constantine', nameAr: 'قسنطينة', searchTokens: ['constantine', 'khroub', 'ali mendjeli'] },
  { code: '26', name: 'Médéa', nameAr: 'المدية', searchTokens: ['medea', 'médéa'] },
  { code: '27', name: 'Mostaganem', nameAr: 'مستغانم', searchTokens: ['mostaganem'] },
  { code: '28', name: 'M\'Sila', nameAr: 'المسيلة', searchTokens: ['msila', "m'sila", 'bousaada'] },
  { code: '29', name: 'Mascara', nameAr: 'معسكر', searchTokens: ['mascara'] },
  { code: '30', name: 'Ouargla', nameAr: 'ورقلة', searchTokens: ['ouargla', 'hassi messaoud'] },
  { code: '31', name: 'Oran', nameAr: 'وهران', searchTokens: ['oran', 'es senia', 'bir el djir', 'arzew'] },
  { code: '32', name: 'El Bayadh', nameAr: 'البيض', searchTokens: ['el bayadh'] },
  { code: '33', name: 'Illizi', nameAr: 'إيليزي', searchTokens: ['illizi'] },
  { code: '34', name: 'Bordj Bou Arréridj', nameAr: 'برج بوعريريج', searchTokens: ['bba', 'bordj bou arreridj', 'bordj bou arréridj', 'bordj'] },
  { code: '35', name: 'Boumerdès', nameAr: 'بومرداس', searchTokens: ['boumerdes', 'boumerdès'] },
  { code: '36', name: 'El Tarf', nameAr: 'الطارف', searchTokens: ['el tarf'] },
  { code: '37', name: 'Tindouf', nameAr: 'تندوف', searchTokens: ['tindouf'] },
  { code: '38', name: 'Tissemsilt', nameAr: 'تيسمسيلت', searchTokens: ['tissemsilt'] },
  { code: '39', name: 'El Oued', nameAr: 'الوادي', searchTokens: ['el oued', 'oued souf'] },
  { code: '40', name: 'Khenchela', nameAr: 'خنشلة', searchTokens: ['khenchela'] },
  { code: '41', name: 'Souk Ahras', nameAr: 'سوق أهراس', searchTokens: ['souk ahras'] },
  { code: '42', name: 'Tipaza', nameAr: 'تيبازة', searchTokens: ['tipaza', 'kolea'] },
  { code: '43', name: 'Mila', nameAr: 'ميلة', searchTokens: ['mila'] },
  { code: '44', name: 'Aïn Defla', nameAr: 'عين الدفلى', searchTokens: ['ain defla', 'aïn defla', 'khemis miliana'] },
  { code: '45', name: 'Naâma', nameAr: 'النعامة', searchTokens: ['naama', 'naâma'] },
  { code: '46', name: 'Aïn Témouchent', nameAr: 'عين تموشنت', searchTokens: ['ain temouchent', 'aïn témouchent'] },
  { code: '47', name: 'Ghardaïa', nameAr: 'غرداية', searchTokens: ['ghardaia', 'ghardaïa'] },
  { code: '48', name: 'Relizane', nameAr: 'غليزان', searchTokens: ['relizane'] },
  { code: '49', name: 'El M\'Ghair', nameAr: 'المغير', searchTokens: ['el mghair', "el m'ghair", 'mghair'] },
  { code: '50', name: 'El Menia', nameAr: 'المنيعة', searchTokens: ['el menia', 'el meniaa', 'el goléa'] },
  { code: '51', name: 'Ouled Djellal', nameAr: 'أولاد جلال', searchTokens: ['ouled djellal'] },
  { code: '52', name: 'Bordj Baji Mokhtar', nameAr: 'برج باجي مختار', searchTokens: ['bordj baji mokhtar', 'bbm'] },
  { code: '53', name: 'Béni Abbès', nameAr: 'بني عباس', searchTokens: ['beni abbes', 'béni abbès'] },
  { code: '54', name: 'Timimoun', nameAr: 'تيميمون', searchTokens: ['timimoun'] },
  { code: '55', name: 'Touggourt', nameAr: 'تقرت', searchTokens: ['touggourt'] },
  { code: '56', name: 'Djanet', nameAr: 'جانت', searchTokens: ['djanet'] },
  { code: '57', name: 'In Salah', nameAr: 'عين صالح', searchTokens: ['in salah', 'ain salah'] },
  { code: '58', name: 'In Guezzam', nameAr: 'عين قزام', searchTokens: ['in guezzam', 'ain guezzam'] },
];

/**
 * Normalizes text for tolerant geographical matching.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Automatically detects an Algerian Wilaya from client name, address, or header text.
 */
export function detectWilaya(text?: string | null): { wilaya: string; wilayaCode: string } | null {
  if (!text) return null;
  const clean = normalizeText(text);
  if (!clean) return null;

  // 1. Direct wilaya code match (e.g., "16000", "w16", "wilaya 16", "(16)")
  const codeRegex = /\b(?:w|wilaya\s*)?(0[1-9]|[1-4][0-9]|5[0-8])\b/i;
  const codeMatch = clean.match(codeRegex);
  if (codeMatch) {
    const code = codeMatch[1].padStart(2, '0');
    const info = ALGERIAN_WILAYAS.find((w) => w.code === code);
    if (info) {
      return {
        wilaya: `${info.code} - ${info.name}`,
        wilayaCode: info.code,
      };
    }
  }

  // 2. Token match against Wilaya names and known communes
  for (const w of ALGERIAN_WILAYAS) {
    for (const token of w.searchTokens) {
      const normToken = normalizeText(token);
      const regex = new RegExp(`\\b${normToken}\\b`, 'i');
      if (regex.test(clean)) {
        return {
          wilaya: `${w.code} - ${w.name}`,
          wilayaCode: w.code,
        };
      }
    }
  }

  return null;
}

export interface DecomposedTimestamp {
  iso: string;
  timestamp: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm:ss
}

/**
 * Decomposes any ISO date string, Date object, or Unix timestamp into granular
 * temporal components for fast indexing and filtering.
 */
export function decomposeTimestamp(input?: string | Date | number | null): DecomposedTimestamp {
  let date: Date;

  if (!input) {
    date = new Date();
  } else if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'number') {
    date = new Date(input);
  } else {
    // string parsing with fallback
    const parsed = new Date(input);
    date = isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate(); // 1-31
  const hour = date.getHours(); // 0-23
  const minute = date.getMinutes(); // 0-59
  const second = date.getSeconds(); // 0-59

  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${year}-${pad(month)}-${pad(day)}`;
  const timeStr = `${pad(hour)}:${pad(minute)}:${pad(second)}`;

  return {
    iso: date.toISOString(),
    timestamp: date.getTime(),
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateStr,
    timeStr,
  };
}
