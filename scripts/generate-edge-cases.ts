// Generate a battery of synthetic PDFs that stress different parts of the
// extraction pipeline. Each output is paired with a row in
// docs/TEST_CASES.md explaining what we expect from it.
//
// Usage:  npx tsx scripts/generate-edge-cases.ts
// Output: files/edge-cases/*.pdf

import * as fs from "node:fs";
import * as path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const OUT = path.resolve(__dirname, "../files/edge-cases");
fs.mkdirSync(OUT, { recursive: true });

type WriteOpts = {
  size?: number;
  x?: number;
  y?: number;
  maxWidth?: number;
  bold?: boolean;
  color?: { r: number; g: number; b: number };
};

function makeWriter(page: PDFPage, font: PDFFont, fontBold: PDFFont, width: number) {
  let cursorY = page.getHeight() - 50;
  return {
    text(line: string, opts: WriteOpts = {}) {
      const size = opts.size ?? 11;
      const x = opts.x ?? 50;
      const y = opts.y ?? cursorY;
      const f = opts.bold ? fontBold : font;
      const color = opts.color
        ? rgb(opts.color.r, opts.color.g, opts.color.b)
        : rgb(0, 0, 0);
      // simple word-wrap
      const maxW = opts.maxWidth ?? width - 100;
      const words = line.split(/\s+/);
      let buf = "";
      let yy = y;
      for (const w of words) {
        const test = buf ? `${buf} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxW && buf) {
          page.drawText(buf, { x, y: yy, size, font: f, color });
          buf = w;
          yy -= size + 4;
        } else {
          buf = test;
        }
      }
      if (buf) {
        page.drawText(buf, { x, y: yy, size, font: f, color });
        yy -= size + 4;
      }
      cursorY = yy - 2;
    },
    gap(px = 8) {
      cursorY -= px;
    },
    moveTo(y: number) {
      cursorY = y;
    },
    page,
  };
}

async function newDoc() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, font, fontBold };
}

async function save(doc: PDFDocument, filename: string) {
  const bytes = await doc.save();
  fs.writeFileSync(path.join(OUT, filename), bytes);
  console.log(`✓ ${filename}`);
}

// ─────────────────────────────────────────────────────────────────────────
// E01 — Negative test: non-clinical document. Pipeline should return
// mostly nulls, no hallucinated patient/provider/codes.
// ─────────────────────────────────────────────────────────────────────────
async function negativeNonClinical() {
  const { doc, font, fontBold } = await newDoc();
  const page = doc.addPage();
  const { width } = page.getSize();
  const w = makeWriter(page, font, fontBold, width);
  w.text("BELLA NAPOLI — PIZZA MENU", { size: 22, bold: true });
  w.gap(8);
  w.text("123 Restaurant Row, Brooklyn NY 11201 · (718) 555-0100");
  w.gap(16);
  w.text("STARTERS", { bold: true, size: 14 });
  w.text("Garlic knots ............ $6.00");
  w.text("Caprese salad ........... $9.50");
  w.gap(10);
  w.text("PIZZA", { bold: true, size: 14 });
  w.text("Margherita (12\") ........ $14.00");
  w.text("Pepperoni (16\") ......... $18.50");
  w.text("Quattro Stagioni ........ $19.00");
  w.gap(10);
  w.text("Today's special: order any 16\" pizza and get a free order of");
  w.text("garlic knots. Open daily 11am–11pm. Closed Tuesdays.");
  await save(doc, "E01-pizza-menu.pdf");
}

// ─────────────────────────────────────────────────────────────────────────
// E02 — Blank document. Just a logo and whitespace. Every field should be
// null. Catches over-eager extractors that fabricate from nothing.
// ─────────────────────────────────────────────────────────────────────────
async function blankPage() {
  const { doc, font, fontBold } = await newDoc();
  const page = doc.addPage();
  const { width } = page.getSize();
  const w = makeWriter(page, font, fontBold, width);
  w.moveTo(page.getHeight() / 2);
  w.text("Clinic intake — please bring this completed form to your visit.", { size: 10, color: { r: 0.6, g: 0.6, b: 0.6 } });
  await save(doc, "E02-blank-form.pdf");
}

// ─────────────────────────────────────────────────────────────────────────
// E03 — Heavy clinical abbreviations. Tests whether the structurer's
// semantic mapping holds when the doc uses jargon (c/o, f/u, w/, h/o).
// ─────────────────────────────────────────────────────────────────────────
async function heavyAbbreviations() {
  const { doc, font, fontBold } = await newDoc();
  const page = doc.addPage();
  const { width } = page.getSize();
  const w = makeWriter(page, font, fontBold, width);
  w.text("PROGRESS NOTE — Cardiology Clinic", { size: 16, bold: true });
  w.gap(8);
  w.text("Pt: Reyes, Marcelo / DOB 06/19/1958 / MRN: BCH-22910");
  w.text("Ins: Humana Gold Plus / Mbr#: H-77234182");
  w.text("Date: 03/12/2026 / Provider: Dr. T. Liu, MD / NPI 1928374650");
  w.gap(10);
  w.text("S:", { bold: true });
  w.text("64 y/o M, h/o CAD s/p CABG '19, HTN, T2DM, presents for f/u.");
  w.text("c/o intermittent SOB on exertion, denies CP, palpitations, syncope.");
  w.text("Adherent to meds. No edema. Pt walks ~30 min/day w/o limitation.");
  w.gap(10);
  w.text("O:", { bold: true });
  w.text("BP 132/78, HR 72, RR 16, SpO2 97% RA, wt 84 kg.");
  w.text("CV: RRR, no m/r/g. Lungs: CTAB. Ext: no edema, pulses 2+ b/l.");
  w.text("Labs: A1c 7.1 (was 7.6 on 12/04/25), LDL 89, K+ 4.2.");
  w.gap(10);
  w.text("A/P:", { bold: true });
  w.text("1) CAD — stable. Continue ASA 81mg, atorvastatin 40mg qHS, metoprolol 25mg BID.");
  w.text("2) T2DM — improving. Continue metformin 1000mg BID, empagliflozin 10mg daily.");
  w.text("3) HTN — at goal.");
  w.text("Dx codes: I25.10, E11.65, I10");
  w.text("F/u 3 mo. Labs in 2 mo. Cardiac stress test if sx worsen.");
  await save(doc, "E03-abbreviated-cardiology-note.pdf");
}

// ─────────────────────────────────────────────────────────────────────────
// E04 — Spanish-language clinical note. Tests semantic mapping across
// languages — the schema is English but the source is Spanish.
// ─────────────────────────────────────────────────────────────────────────
async function spanishNote() {
  const { doc, font, fontBold } = await newDoc();
  const page = doc.addPage();
  const { width } = page.getSize();
  const w = makeWriter(page, font, fontBold, width);
  w.text("NOTA DE EVOLUCION — Psiquiatria", { size: 16, bold: true });
  w.gap(6);
  w.text("Fecha: 15/02/2026  Hora: 10:30");
  w.text("Paciente: Maria Soledad Cabrera Vela");
  w.text("Fecha de nacimiento: 22/11/1988  Sexo: Femenino");
  w.text("ID asegurada: BCBS-MX-9920-441");
  w.text("Telefono: +52 55 4421 8800");
  w.text("Aseguradora: Blue Cross Blue Shield Mexico");
  w.gap(8);
  w.text("Provedor solicitante: Dra. Lucia Hernandez Mora");
  w.text("NPI: 1102938475   Cedula: 8843219");
  w.text("Clinica: Centro de Salud Mental Polanco");
  w.gap(8);
  w.text("Motivo de consulta:", { bold: true });
  w.text("La paciente refiere animo deprimido desde hace 4 meses, anhedonia,");
  w.text("insomnio de mantenimiento, perdida de apetito y sentimientos de culpa.");
  w.text("Niega ideacion suicida activa.");
  w.gap(6);
  w.text("Antecedentes:", { bold: true });
  w.text("Episodio depresivo previo en 2022 tratado con sertralina, buena respuesta.");
  w.text("Sin hospitalizaciones. Madre con trastorno de ansiedad.");
  w.gap(6);
  w.text("Medicamentos actuales:", { bold: true });
  w.text("Sertralina 50 mg c/24h (iniciada hace 3 semanas)");
  w.text("Trazodona 50 mg al acostarse PRN");
  w.gap(6);
  w.text("Evaluaciones:", { bold: true });
  w.text("PHQ-9: 16 (anterior 22 el 15/01/2026)");
  w.gap(6);
  w.text("Impresion diagnostica: Trastorno depresivo mayor, recurrente, moderado (F33.1).");
  w.text("Plan: continuar sertralina, aumentar a 100 mg en 2 semanas si tolera.");
  w.text("Cita de seguimiento en 4 semanas. Psicoterapia semanal con Lic. Ortiz.");
  await save(doc, "E04-spanish-psych-note.pdf");
}

// ─────────────────────────────────────────────────────────────────────────
// E05 — Two patients on one document (subscriber vs. patient). Tests
// disambiguation when multiple "names" / "DOBs" appear.
// ─────────────────────────────────────────────────────────────────────────
async function dualPatient() {
  const { doc, font, fontBold } = await newDoc();
  const page = doc.addPage();
  const { width } = page.getSize();
  const w = makeWriter(page, font, fontBold, width);
  w.text("PRIOR AUTHORIZATION REQUEST", { size: 16, bold: true });
  w.gap(10);
  w.text("PATIENT (the person receiving care):", { bold: true });
  w.text("Name: Aiden Cole Pereira");
  w.text("DOB: 04/02/2018  (7 years old)");
  w.text("Gender: Male");
  w.text("Relationship to subscriber: Son");
  w.gap(10);
  w.text("SUBSCRIBER / POLICY HOLDER (the parent on the insurance):", { bold: true });
  w.text("Name: Lauren Marie Pereira");
  w.text("DOB: 07/18/1985");
  w.text("Member ID: BCBSAL-3349-2218");
  w.text("Group #: SCH-44120");
  w.gap(10);
  w.text("PROVIDER:", { bold: true });
  w.text("Dr. Anand Krishnan, MD  NPI: 1554678902");
  w.text("Pediatric Behavioral Health Associates");
  w.gap(10);
  w.text("REQUESTED SERVICE: Outpatient psychotherapy, 12 sessions");
  w.text("Diagnosis: F90.0 ADHD, predominantly inattentive type");
  w.text("CPT: 90834");
  w.gap(10);
  w.text("NOTE: All clinical info below pertains to the PATIENT (Aiden), not the subscriber.");
  await save(doc, "E05-dual-patient-prior-auth.pdf");
}

// ─────────────────────────────────────────────────────────────────────────
// E06 — Long medication list (10 rows). Tests that the medications table
// doesn't get truncated and that grounding emits one bbox per row.
// ─────────────────────────────────────────────────────────────────────────
async function longMedList() {
  const { doc, font, fontBold } = await newDoc();
  const page = doc.addPage();
  const { width } = page.getSize();
  const w = makeWriter(page, font, fontBold, width);
  w.text("MEDICATION RECONCILIATION — Geriatric Clinic", { size: 16, bold: true });
  w.gap(6);
  w.text("Patient: Eleanor M. Whitfield   DOB: 02/14/1942   MRN: GC-88204");
  w.text("Insurance: Medicare Part D + Aetna Supplement   Member: AET-W884412");
  w.text("Date of visit: 04/02/2026   PCP: Dr. Hiroshi Nakamura, MD  NPI 1789452310");
  w.gap(10);
  w.text("Current medications:", { bold: true });
  const meds: [string, string, string][] = [
    ["Lisinopril 20 mg", "once daily", "Nakamura"],
    ["Atorvastatin 40 mg", "once daily at bedtime", "Nakamura"],
    ["Metformin 500 mg", "twice daily with meals", "Nakamura"],
    ["Levothyroxine 75 mcg", "once daily on empty stomach", "Singh, endo"],
    ["Aspirin 81 mg", "once daily", "Nakamura"],
    ["Donepezil 10 mg", "once daily at bedtime", "Patel, neuro"],
    ["Vitamin D3 2000 IU", "once daily", "OTC"],
    ["Calcium carbonate 600 mg", "twice daily", "OTC"],
    ["Tamsulosin 0.4 mg", "once daily at bedtime", "Nakamura"],
    ["Sertraline 50 mg", "once daily", "Brooks, psych"],
  ];
  for (const [med, freq, presc] of meds) {
    w.text(`- ${med} — ${freq} — prescriber: ${presc}`);
  }
  w.gap(10);
  w.text("Adherence: patient uses a weekly pillbox, reports no missed doses.");
  await save(doc, "E06-long-medication-list.pdf");
}

// ─────────────────────────────────────────────────────────────────────────
// E07 — Multi-page History & Physical. 3 pages. Tests that multi-page
// extraction works end-to-end, and that ICD-10 codes scattered across
// pages are all captured.
// ─────────────────────────────────────────────────────────────────────────
async function multiPageHP() {
  const { doc, font, fontBold } = await newDoc();
  let p = doc.addPage();
  let w = makeWriter(p, font, fontBold, p.getWidth());
  // page 1
  w.text("HISTORY & PHYSICAL — Internal Medicine", { size: 16, bold: true });
  w.gap(6);
  w.text("Patient: Jamil A. Robinson   DOB: 09/30/1971   MRN: IM-554210");
  w.text("Insurance: Anthem BCBS / W-77231906 / Group 88410");
  w.text("Provider: Dr. Sasha Petrova, MD  NPI: 1665789023");
  w.gap(10);
  w.text("Chief complaint:", { bold: true });
  w.text("54 y/o M with progressive dyspnea on exertion x 3 months,");
  w.text("now occurring at rest. Associated with bilateral lower extremity swelling.");
  w.gap(10);
  w.text("History of present illness:", { bold: true });
  w.text("Symptoms began gradually in January. Patient initially attributed");
  w.text("to deconditioning. Over the past 4 weeks, dyspnea has worsened");
  w.text("and now occurs after walking <100 feet. Reports orthopnea,");
  w.text("requires 3 pillows to sleep. Two episodes of PND in past week.");
  w.text("Lower extremity swelling worse in evenings, improves with elevation.");
  w.text("Denies chest pain, syncope, palpitations, hemoptysis.");
  // page 2
  p = doc.addPage();
  w = makeWriter(p, font, fontBold, p.getWidth());
  w.text("Past medical history:", { bold: true });
  w.text("HTN (15 years), T2DM (8 years), HLD, OSA on CPAP, prior MI 2018 s/p PCI to LAD.");
  w.text("Medications: lisinopril 40 mg, metoprolol 50 mg BID, atorvastatin 80 mg,");
  w.text("metformin 1000 mg BID, aspirin 81 mg, ezetimibe 10 mg.");
  w.gap(10);
  w.text("Physical exam:", { bold: true });
  w.text("Vitals: BP 158/94, HR 98, RR 22, SpO2 92% RA, wt 102 kg.");
  w.text("Gen: mild respiratory distress at rest.");
  w.text("Neck: JVD to 10 cm. CV: tachy, S3 gallop, no m/r/g.");
  w.text("Lungs: bibasilar crackles to mid-lung fields.");
  w.text("Ext: 2+ pitting edema to mid-shin bilaterally.");
  w.gap(10);
  w.text("Labs / Studies:", { bold: true });
  w.text("BNP 1820, troponin <0.01, Cr 1.4 (baseline 1.0), Na 134, K+ 4.6.");
  w.text("CXR: cardiomegaly, bilateral pulmonary edema.");
  w.text("EKG: NSR, LBBB (new vs. 2018), no acute ischemic changes.");
  w.text("Echo: EF 25% (was 45% in 2019), severe global LV hypokinesis.");
  // page 3
  p = doc.addPage();
  w = makeWriter(p, font, fontBold, p.getWidth());
  w.text("Assessment:", { bold: true });
  w.text("1. Acute decompensated heart failure with reduced EF (I50.21).");
  w.text("2. Hypertensive heart disease (I11.0).");
  w.text("3. Type 2 diabetes mellitus, uncontrolled (E11.65).");
  w.text("4. Hyperlipidemia (E78.5).");
  w.text("5. Obstructive sleep apnea on CPAP (G47.33).");
  w.text("6. Acute kidney injury, likely cardiorenal (N17.9).");
  w.gap(10);
  w.text("Plan:", { bold: true });
  w.text("- Admit to cardiology for IV diuresis (furosemide 80 mg IV BID).");
  w.text("- Initiate sacubitril/valsartan, target dose over 2 weeks.");
  w.text("- Continue metoprolol, hold lisinopril given AKI.");
  w.text("- Daily weights, strict I/O, low-sodium diet (<2g/day).");
  w.text("- Echo with strain in 1 week.");
  w.text("- Cardiology f/u in 2 weeks post-discharge.");
  w.text("- Patient/family education on HF self-management.");
  await save(doc, "E07-multipage-hp.pdf");
}

// ─────────────────────────────────────────────────────────────────────────
// E08 — Date format ambiguity. Mixes US (MM/DD/YYYY) and international
// (DD/MM/YYYY). Tests whether the model preserves what's in the document
// without "fixing" it to one convention.
// ─────────────────────────────────────────────────────────────────────────
async function dateAmbiguity() {
  const { doc, font, fontBold } = await newDoc();
  const page = doc.addPage();
  const { width } = page.getSize();
  const w = makeWriter(page, font, fontBold, width);
  w.text("CONSULT REPORT — Sleep Medicine", { size: 16, bold: true });
  w.gap(6);
  w.text("Patient: Anika Sharma   DOB: 11.03.1990   MRN: SM-22041");
  w.text("Date of consult: 03/11/2026   (US format: March 11, 2026)");
  w.text("Date of prior PSG study: 14/12/2025   (EU format: Dec 14, 2025)");
  w.text("Insurance: Cigna Global / Mbr: CGN-INT-993421");
  w.gap(10);
  w.text("Reason for consult:", { bold: true });
  w.text("Excessive daytime sleepiness. Epworth 17/24 on 03/05/2026.");
  w.gap(10);
  w.text("Note to abstractor: dates above intentionally mix formats — preserve verbatim.");
  await save(doc, "E08-date-format-ambiguity.pdf");
}

(async () => {
  await negativeNonClinical();
  await blankPage();
  await heavyAbbreviations();
  await spanishNote();
  await dualPatient();
  await longMedList();
  await multiPageHP();
  await dateAmbiguity();
  console.log(`\nDone. PDFs in ${OUT}`);
})();
