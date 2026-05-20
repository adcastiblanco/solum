// Schema aligned to the Service Request Form (Doc 07).
// Each field belongs to a section (matches the form's layout) and has a type:
//   - "text": single-line value (e.g. patient name)
//   - "longtext": paragraph (e.g. clinical history, justification)
//   - "list": array of single-line values (e.g. CPT codes)
//   - "table": array of structured rows (e.g. medications table)
//
// `extractable: false` marks fields the source documents typically don't carry —
// they exist on the form but the human reviewer fills them in (request dates,
// medical necessity justification, etc.). The extractor returns null for these.

export type FieldType = "text" | "longtext" | "list" | "table";

export type TableColumn = { key: string; label: string };

export type FieldDef = {
  name: string;
  label: string;
  type: FieldType;
  extractable: boolean;
  columns?: TableColumn[]; // for type=table
};

export type SectionDef = {
  key: string;
  title: string;
  fields: FieldDef[];
};

export const FORM_SECTIONS: SectionDef[] = [
  {
    key: "header",
    title: "Request Header",
    fields: [
      { name: "payer.name", label: "Payer", type: "text", extractable: true },
      { name: "payer.fax", label: "Payer Fax", type: "text", extractable: true },
      { name: "payer.phone", label: "Payer Phone", type: "text", extractable: true },
      { name: "request.date", label: "Date of Request", type: "text", extractable: true },
    ],
  },
  {
    key: "member",
    title: "Section A — Member Information",
    fields: [
      { name: "member.last_name", label: "Last Name", type: "text", extractable: true },
      { name: "member.first_name", label: "First Name", type: "text", extractable: true },
      { name: "member.middle_initial", label: "Middle Initial", type: "text", extractable: true },
      { name: "member.dob", label: "Date of Birth", type: "text", extractable: true },
      { name: "member.gender", label: "Gender", type: "text", extractable: true },
      { name: "member.member_id", label: "Member ID", type: "text", extractable: true },
      { name: "member.group_number", label: "Group Number", type: "text", extractable: true },
      { name: "member.phone", label: "Phone Number", type: "text", extractable: true },
      { name: "member.address", label: "Address", type: "longtext", extractable: true },
    ],
  },
  {
    key: "requesting_provider",
    title: "Section B — Requesting Provider",
    fields: [
      { name: "requesting_provider.name", label: "Provider Name", type: "text", extractable: true },
      { name: "requesting_provider.npi", label: "Provider NPI", type: "text", extractable: true },
      { name: "requesting_provider.facility", label: "Facility/Practice Name", type: "text", extractable: true },
      { name: "requesting_provider.tax_id", label: "Tax ID", type: "text", extractable: true },
      { name: "requesting_provider.phone", label: "Phone", type: "text", extractable: true },
      { name: "requesting_provider.fax", label: "Fax", type: "text", extractable: true },
      { name: "requesting_provider.address", label: "Address", type: "longtext", extractable: true },
    ],
  },
  {
    key: "referring_provider",
    title: "Section C — Referring Provider (if different)",
    fields: [
      { name: "referring_provider.name", label: "Referring Provider Name", type: "text", extractable: true },
      { name: "referring_provider.npi", label: "Referring Provider NPI", type: "text", extractable: true },
      { name: "referring_provider.phone", label: "Phone", type: "text", extractable: true },
    ],
  },
  {
    key: "service",
    title: "Section D — Service Information",
    fields: [
      {
        name: "service.type",
        label: "Type of Service Requested",
        type: "text",
        extractable: false,
      },
      { name: "service.setting", label: "Service Setting", type: "text", extractable: false },
      { name: "service.cpt_codes", label: "CPT / HCPCS Code(s)", type: "list", extractable: true },
      { name: "service.icd10_codes", label: "ICD-10 Diagnosis Code(s)", type: "list", extractable: true },
      {
        name: "service.diagnosis_descriptions",
        label: "Diagnosis Description(s)",
        type: "list",
        extractable: true,
      },
      { name: "service.start_date", label: "Requested Start Date", type: "text", extractable: false },
      { name: "service.end_date", label: "Requested End Date", type: "text", extractable: false },
      { name: "service.sessions", label: "Number of Sessions / Units", type: "text", extractable: false },
      { name: "service.frequency", label: "Frequency", type: "text", extractable: false },
    ],
  },
  {
    key: "clinical",
    title: "Section E — Clinical Information",
    fields: [
      {
        name: "clinical.presenting_symptoms",
        label: "Presenting symptoms and functional impairment",
        type: "longtext",
        extractable: true,
      },
      {
        name: "clinical.history",
        label: "Relevant clinical history (prior treatments, medications, response)",
        type: "longtext",
        extractable: true,
      },
      {
        name: "clinical.medications",
        label: "Current medications",
        type: "table",
        extractable: true,
        columns: [
          { key: "medication", label: "Medication" },
          { key: "dose", label: "Dose" },
          { key: "frequency", label: "Frequency" },
          { key: "prescriber", label: "Prescriber" },
        ],
      },
      {
        name: "clinical.assessments",
        label: "Most recent validated assessment scores",
        type: "table",
        extractable: true,
        columns: [
          { key: "tool", label: "Tool" },
          { key: "score", label: "Score" },
          { key: "date", label: "Date" },
        ],
      },
      {
        name: "clinical.treatment_goals",
        label: "Treatment goals and expected outcomes",
        type: "longtext",
        extractable: false,
      },
    ],
  },
  {
    key: "justification",
    title: "Section F — Clinical Justification",
    fields: [
      {
        name: "justification.medical_necessity",
        label: "Why is this level of care medically necessary?",
        type: "longtext",
        extractable: false,
      },
      {
        name: "justification.risk_if_not_provided",
        label: "What is the risk if services are not provided?",
        type: "longtext",
        extractable: false,
      },
    ],
  },
];

// Flat lookup helpers
export const FIELD_DEFS: Record<string, FieldDef> = Object.fromEntries(
  FORM_SECTIONS.flatMap((s) => s.fields.map((f) => [f.name, f])),
);

export const FIELD_NAMES = Object.keys(FIELD_DEFS);

export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_DEFS).map(([k, v]) => [k, v.label]),
);

export const EXTRACTABLE_FIELDS = FIELD_NAMES.filter((n) => FIELD_DEFS[n].extractable);

// Runtime value types per field
export type TableRow = Record<string, string>;
export type FieldValue = string | string[] | TableRow[] | null;

export type BBox = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExtractedField = {
  name: string;
  value: FieldValue;
  confidence: number | null;
  bbox: BBox | null;
  source_quote?: string | null; // verbatim text from the source markdown supporting this value
};

export type ExtractedFields = ExtractedField[];
