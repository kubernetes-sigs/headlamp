import { indexOf } from 'lodash';

const consonants = 'bcdfghjklmnpqrstvwxyz';

export function PluralName(kind: string): string {
  const singular = kind.toLowerCase();
  const lastChar = singular.substring(singular.length - 1, singular.length);
  const beforeLastChar = singular.substring(singular.length - 2, singular.length - 1);

  switch (lastChar) {
    case 's':
    case 'x':
    case 'z': {
      return singular + 'es';
    }
    case 'y':
      if (isConsonant(beforeLastChar)) {
        return iesPlural(singular);
      } else {
        return sPlural(singular);
      }
    case 'h':
      if (beforeLastChar === 'c' || beforeLastChar === 's') {
        return esPlural(singular);
      } else {
        return sPlural(singular);
      }
    case 'e':
      if (beforeLastChar === 'f') {
        return vesPlural(singular.substring(0, singular.length - 1));
      } else {
        return sPlural(singular);
      }
    case 'f':
      return vesPlural(singular);
    default:
      return sPlural(singular);
  }
}

function esPlural(singular: string): string {
  return singular + 'es';
}
function iesPlural(singular: string): string {
  return singular.substring(0, singular.length - 1) + 'ies';
}

function sPlural(singular: string) {
  return singular + 's';
}

function vesPlural(singular: string): string {
  return singular.substring(0, singular.length - 1) + 'ves';
}

function isConsonant(rune: string): boolean {
  return indexOf(consonants, rune) >= 0;
}
