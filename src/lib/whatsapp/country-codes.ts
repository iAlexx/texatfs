/** Dialing codes for WhatsApp phone registration (E.164 without +). */
export interface CountryDialCode {
  code: string;
  labelAr: string;
  labelEn: string;
  /** Typical national number length excluding country code */
  minNationalLength: number;
  maxNationalLength: number;
}

export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { code: "963", labelAr: "سوريا", labelEn: "Syria", minNationalLength: 8, maxNationalLength: 9 },
  { code: "961", labelAr: "لبنان", labelEn: "Lebanon", minNationalLength: 7, maxNationalLength: 8 },
  { code: "962", labelAr: "الأردن", labelEn: "Jordan", minNationalLength: 8, maxNationalLength: 9 },
  { code: "964", labelAr: "العراق", labelEn: "Iraq", minNationalLength: 9, maxNationalLength: 10 },
  { code: "965", labelAr: "الكويت", labelEn: "Kuwait", minNationalLength: 8, maxNationalLength: 8 },
  { code: "966", labelAr: "السعودية", labelEn: "Saudi Arabia", minNationalLength: 9, maxNationalLength: 9 },
  { code: "971", labelAr: "الإمارات", labelEn: "UAE", minNationalLength: 9, maxNationalLength: 9 },
  { code: "974", labelAr: "قطر", labelEn: "Qatar", minNationalLength: 8, maxNationalLength: 8 },
  { code: "973", labelAr: "البحرين", labelEn: "Bahrain", minNationalLength: 8, maxNationalLength: 8 },
  { code: "968", labelAr: "عُمان", labelEn: "Oman", minNationalLength: 8, maxNationalLength: 8 },
  { code: "970", labelAr: "فلسطين", labelEn: "Palestine", minNationalLength: 8, maxNationalLength: 9 },
  { code: "20", labelAr: "مصر", labelEn: "Egypt", minNationalLength: 9, maxNationalLength: 10 },
  { code: "90", labelAr: "تركيا", labelEn: "Turkey", minNationalLength: 10, maxNationalLength: 10 },
  { code: "1", labelAr: "الولايات المتحدة/كندا", labelEn: "US/Canada", minNationalLength: 10, maxNationalLength: 10 },
  { code: "44", labelAr: "بريطانيا", labelEn: "UK", minNationalLength: 10, maxNationalLength: 10 },
  { code: "49", labelAr: "ألمانيا", labelEn: "Germany", minNationalLength: 10, maxNationalLength: 11 },
  { code: "33", labelAr: "فرنسا", labelEn: "France", minNationalLength: 9, maxNationalLength: 9 },
  { code: "39", labelAr: "إيطاليا", labelEn: "Italy", minNationalLength: 9, maxNationalLength: 10 },
  { code: "34", labelAr: "إسبانيا", labelEn: "Spain", minNationalLength: 9, maxNationalLength: 9 },
  { code: "7", labelAr: "روسيا", labelEn: "Russia", minNationalLength: 10, maxNationalLength: 10 },
  { code: "91", labelAr: "الهند", labelEn: "India", minNationalLength: 10, maxNationalLength: 10 },
  { code: "92", labelAr: "باكستان", labelEn: "Pakistan", minNationalLength: 10, maxNationalLength: 10 },
];

export const DEFAULT_COUNTRY_CODE =
  process.env.DEFAULT_WHATSAPP_COUNTRY_CODE?.trim() || "963";

export function findCountryDialCode(code: string): CountryDialCode | undefined {
  const norm = code.replace(/\D/g, "");
  return COUNTRY_DIAL_CODES.find((c) => c.code === norm);
}
