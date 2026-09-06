// ============================================================
// POINTAGE — French Number to Words Converter (DZD Currency)
// Converts numeric amounts to legal uppercase French words matching official Algerian invoices.
// Example: 36555.22 -> "TRENTE-SIX MILLE CINQ CENT CINQUANTE-CINQ DZD ET VINGT-DEUX CENTIMES"
// ============================================================

const ONES = [
  '', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF',
  'DIX', 'ONZE', 'DOUZE', 'TREIZE', 'QUATORZE', 'QUINZE', 'SEIZE',
  'DIX-SEPT', 'DIX-HUIT', 'DIX-NEUF'
];

const TENS = [
  '', '', 'VINGT', 'TRENTE', 'QUARANTE', 'CINQUANTE', 'SOIXANTE',
  'SOIXANTE', 'QUATRE-VINGT', 'QUATRE-VINGT'
];

function convertBelowThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n];

  if (n < 100) {
    const tens = Math.floor(n / 10);
    const units = n % 10;

    // Special handling for 70s and 90s in standard French
    if (tens === 7) {
      if (units === 1) return 'SOIXANTE ET ONZE';
      return `SOIXANTE-${ONES[10 + units]}`;
    }
    if (tens === 9) {
      return `QUATRE-VINGT-${ONES[10 + units]}`;
    }
    if (tens === 8) {
      if (units === 0) return 'QUATRE-VINGTS';
      return `QUATRE-VINGT-${ONES[units]}`;
    }

    if (units === 1) return `${TENS[tens]} ET UN`;
    if (units === 0) return TENS[tens];
    return `${TENS[tens]}-${ONES[units]}`;
  }

  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;

  let hundredStr = '';
  if (hundreds === 1) {
    hundredStr = 'CENT';
  } else {
    hundredStr = `${ONES[hundreds]} CENT${remainder === 0 ? 'S' : ''}`;
  }

  if (remainder === 0) return hundredStr;
  return `${hundredStr} ${convertBelowThousand(remainder)}`;
}

export function numberToWordsFr(num: number): string {
  if (num === 0) return 'ZÉRO';

  const n = Math.abs(Math.floor(num));
  if (n === 0) return 'ZÉRO';

  const parts: string[] = [];

  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const remainder = n % 1_000;

  if (billions > 0) {
    parts.push(billions === 1 ? 'UN MILLIARD' : `${convertBelowThousand(billions)} MILLIARDS`);
  }
  if (millions > 0) {
    parts.push(millions === 1 ? 'UN MILLION' : `${convertBelowThousand(millions)} MILLIONS`);
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? 'MILLE' : `${convertBelowThousand(thousands)} MILLE`);
  }
  if (remainder > 0) {
    parts.push(convertBelowThousand(remainder));
  }

  return parts.join(' ').trim();
}

/**
 * Converts monetary amount to Algerian official invoice phrasing:
 * "TRENTE-SIX MILLE CINQ CENT CINQUANTE-CINQ DZD ET VINGT-DEUX CENTIMES"
 */
export function formatDzdAmountInWords(amount: number): string {
  if (isNaN(amount) || amount < 0) return 'ZÉRO DZD';

  const integerPart = Math.floor(amount);
  const centsPart = Math.round((amount - integerPart + Number.EPSILON) * 100);

  const words = numberToWordsFr(integerPart);
  const dzdText = `${words} DZD`;

  if (centsPart > 0) {
    const centsWords = numberToWordsFr(centsPart);
    return `${dzdText} ET ${centsWords} CENTIME${centsPart > 1 ? 'S' : ''}`;
  }

  return dzdText;
}
