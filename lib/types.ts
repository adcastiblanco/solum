// Field names + their human-readable labels for the clinical schema.
// Order here determines display order in the review form.
export const FIELD_LABELS: Record<string, string> = {
  patient_name: "Patient Name",
  patient_dob: "Date of Birth",
  patient_gender: "Gender",
  patient_phone: "Phone",
  patient_address: "Address",
  insurance_company: "Insurance Company",
  member_id: "Member ID",
  group_number: "Group Number",
  provider_name: "Provider Name",
  provider_npi: "Provider NPI",
  facility_name: "Facility Name",
  diagnosis_codes: "Diagnosis Codes",
  diagnosis_descriptions: "Diagnosis Descriptions",
  cpt_codes: "CPT Codes",
  medications: "Medications",
  clinical_history: "Clinical History",
  assessment_scores: "Assessment Scores",
};

export const FIELD_NAMES = Object.keys(FIELD_LABELS);

export const ARRAY_FIELDS = new Set([
  "diagnosis_codes",
  "diagnosis_descriptions",
  "cpt_codes",
  "medications",
]);

export type BBox = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExtractedField = {
  name: string;
  value: string | string[] | null;
  confidence: number | null;
  bbox: BBox | null;
};

export type ExtractedFields = ExtractedField[];
