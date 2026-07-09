/**
 * Hand-rolled CSV parser for ECI-style voter rolls — no new dependency.
 * Handles quoted fields (embedded commas/quotes/newlines) and flexible,
 * case-insensitive header aliases so exports from different tools import
 * without manual reshaping.
 */

export interface ParsedVoterRow {
  epicNo?: string;
  serialNo?: number;
  nameEn: string;
  nameTe?: string;
  relationName?: string;
  relationType?: string;
  gender?: string;
  age?: number;
  houseNo?: string;
  address?: string;
  mobile?: string;
  partNo?: number;
  sectionNo?: number;
  acNo?: number;
}

export interface CsvRowError {
  row: number;
  reason: string;
}

const HEADER_ALIASES: Record<string, keyof ParsedVoterRow> = {
  epicno: "epicNo",
  epic: "epicNo",
  epic_no: "epicNo",
  epiccard: "epicNo",
  cardno: "epicNo",
  serialno: "serialNo",
  serial: "serialNo",
  serial_no: "serialNo",
  slno: "serialNo",
  sl_no: "serialNo",
  sno: "serialNo",
  s_no: "serialNo",
  name: "nameEn",
  nameen: "nameEn",
  name_en: "nameEn",
  votername: "nameEn",
  voter_name: "nameEn",
  fullname: "nameEn",
  namete: "nameTe",
  name_te: "nameTe",
  nametelugu: "nameTe",
  relationname: "relationName",
  relation_name: "relationName",
  fathername: "relationName",
  father_name: "relationName",
  husbandname: "relationName",
  husband_name: "relationName",
  guardianname: "relationName",
  relationtype: "relationType",
  relation_type: "relationType",
  relation: "relationType",
  gender: "gender",
  sex: "gender",
  age: "age",
  houseno: "houseNo",
  house_no: "houseNo",
  house: "houseNo",
  doorno: "houseNo",
  door_no: "houseNo",
  address: "address",
  mobile: "mobile",
  phone: "mobile",
  mobileno: "mobile",
  phone_number: "mobile",
  partno: "partNo",
  part_no: "partNo",
  part: "partNo",
  sectionno: "sectionNo",
  section_no: "sectionNo",
  section: "sectionNo",
  acno: "acNo",
  ac_no: "acNo",
  ac: "acNo",
};

const NUMERIC_FIELDS = new Set<keyof ParsedVoterRow>(["serialNo", "age", "partNo", "sectionNo", "acNo"]);

/** RFC-4180-ish tokenizer: quoted fields may contain commas, quotes ("") and newlines. */
export function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop rows that are entirely empty (trailing newlines etc).
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function normalizeGender(raw: string): string | undefined {
  const g = raw.trim().toUpperCase();
  if (!g) return undefined;
  if (g.startsWith("M")) return "M";
  if (g.startsWith("F")) return "F";
  return "O";
}

export function parseVoterCsv(text: string): { rows: ParsedVoterRow[]; errors: CsvRowError[] } {
  const raw = tokenizeCsv(text);
  if (raw.length === 0) return { rows: [], errors: [] };

  const header = raw[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""));
  const mapping: Array<keyof ParsedVoterRow | null> = header.map((h) => HEADER_ALIASES[h] ?? null);
  if (!mapping.includes("nameEn")) {
    return {
      rows: [],
      errors: [{ row: 1, reason: "Header must include a name column (name / nameEn / voter_name)." }],
    };
  }

  const rows: ParsedVoterRow[] = [];
  const errors: CsvRowError[] = [];
  for (let i = 1; i < raw.length; i++) {
    const cells = raw[i];
    const out: Partial<Record<keyof ParsedVoterRow, string | number>> = {};
    for (let c = 0; c < mapping.length && c < cells.length; c++) {
      const key = mapping[c];
      const value = cells[c]?.trim();
      if (!key || !value) continue;
      if (NUMERIC_FIELDS.has(key)) {
        const n = Number(value.replace(/[^\d.-]/g, ""));
        if (Number.isFinite(n)) out[key] = Math.trunc(n);
      } else if (key === "gender") {
        const g = normalizeGender(value);
        if (g) out.gender = g;
      } else {
        out[key] = value;
      }
    }
    if (!out.nameEn || typeof out.nameEn !== "string") {
      errors.push({ row: i + 1, reason: "Missing voter name." });
      continue;
    }
    const age = out.age as number | undefined;
    if (age !== undefined && (age < 18 || age > 120)) {
      errors.push({ row: i + 1, reason: `Implausible age ${age}.` });
      continue;
    }
    rows.push(out as unknown as ParsedVoterRow);
  }
  return { rows, errors };
}
