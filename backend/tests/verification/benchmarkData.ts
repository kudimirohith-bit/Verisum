export interface BenchmarkPair {
  id: string;
  docType: string;
  isFaithful: boolean;
  sourceText: string;
  summaryText: string;
  description: string;
}

export const benchmarkDataset: BenchmarkPair[] = [
  // ── Faithful Summaries (10) ──────────────────────────────────────────────────
  {
    id: 'faithful-1',
    docType: 'ehr_note',
    isFaithful: true,
    description: 'Accurate EHR note summary',
    sourceText: 'Patient is a 58-year-old male with a history of hypertension. BP today is 135/85 mmHg. Continue Lisinopril 10mg daily.',
    summaryText: 'The patient is a 58-year-old male with hypertension. His BP is 135/85 mmHg and he takes Lisinopril 10mg daily.',
  },
  {
    id: 'faithful-2',
    docType: 'discharge_summary',
    isFaithful: true,
    description: 'Accurate discharge summary',
    sourceText: 'Admitted on 2024-01-10 with acute cholecystitis. Laparoscopic cholecystectomy performed on 2024-01-11 without complications. Discharged home on 2024-01-13.',
    summaryText: 'The patient underwent an uncomplicated laparoscopic cholecystectomy following admission for acute cholecystitis and was discharged home.',
  },
  {
    id: 'faithful-3',
    docType: 'radiology_report',
    isFaithful: true,
    description: 'Accurate chest CT scan report summary',
    sourceText: 'CT Chest with contrast shows no pulmonary embolism. Mild bibasilar atelectasis noted. Heart size is normal.',
    summaryText: 'Chest CT demonstrated no pulmonary embolism. Mild bibasilar atelectasis was present with normal cardiac size.',
  },
  {
    id: 'faithful-4',
    docType: 'dialogue_transcript',
    isFaithful: true,
    description: 'Accurate clinic dialogue summary',
    sourceText: 'Clinician: How long have you had this cough? Patient: About three weeks now, mostly dry cough at night.',
    summaryText: 'The patient reports a dry cough lasting approximately three weeks, occurring predominantly at night.',
  },
  {
    id: 'faithful-5',
    docType: 'biomedical_literature',
    isFaithful: true,
    description: 'Accurate trial abstract summary',
    sourceText: 'In a randomized controlled trial of 500 patients, drug X reduced 30-day mortality compared to placebo (HR 0.75, 95% CI 0.60-0.92, p=0.006).',
    summaryText: 'A trial of 500 patients showed drug X significantly reduced 30-day mortality relative to placebo.',
  },
  {
    id: 'faithful-6',
    docType: 'ehr_note',
    isFaithful: true,
    description: 'Accurate diabetes follow-up note',
    sourceText: 'Type 2 diabetes mellitus follow-up. HbA1c is 7.2%. Patient denies numbness or tingling in feet.',
    summaryText: 'Follow-up for type 2 diabetes revealed HbA1c of 7.2%. The patient has no peripheral neuropathy symptoms.',
  },
  {
    id: 'faithful-7',
    docType: 'discharge_summary',
    isFaithful: true,
    description: 'Accurate pneumonia discharge summary',
    sourceText: 'Patient treated for community-acquired pneumonia with IV Ceftriaxone. Completed 5-day course with clinical improvement.',
    summaryText: 'The patient completed a 5-day course of IV Ceftriaxone for community-acquired pneumonia with favorable response.',
  },
  {
    id: 'faithful-8',
    docType: 'radiology_report',
    isFaithful: true,
    description: 'Accurate brain MRI report',
    sourceText: 'Brain MRI without contrast: No acute intracranial hemorrhage or cerebral infarction. Ventricles are within normal limits.',
    summaryText: 'Brain MRI showed no acute hemorrhage or acute infarction, with normal ventricular size.',
  },
  {
    id: 'faithful-9',
    docType: 'dialogue_transcript',
    isFaithful: true,
    description: 'Accurate pain clinic encounter',
    sourceText: 'Clinician: Rating your knee pain from 1 to 10? Patient: It is a 4 after taking Tylenol.',
    summaryText: 'The patient reported knee pain rated 4 out of 10 following Tylenol administration.',
  },
  {
    id: 'faithful-10',
    docType: 'biomedical_literature',
    isFaithful: true,
    description: 'Accurate meta-analysis summary',
    sourceText: 'Meta-analysis of 12 studies demonstrated high sensitivity (89%) and specificity (94%) for biomarker Y in early sepsis detection.',
    summaryText: 'Meta-analysis confirmed biomarker Y has high sensitivity (89%) and specificity (94%) for early sepsis.',
  },

  // ── Hallucinated / Unfaithful Summaries (10) ───────────────────────────────
  {
    id: 'hallucinated-1',
    docType: 'ehr_note',
    isFaithful: false,
    description: 'Fabricated drug dosage (Metformin 500mg vs 1000mg in source)',
    sourceText: 'Patient takes Metformin 1000mg twice daily for diabetes control. HbA1c is 6.8%.',
    summaryText: 'The patient takes Metformin 500mg once daily for diabetes control.',
  },
  {
    id: 'hallucinated-2',
    docType: 'discharge_summary',
    isFaithful: false,
    description: 'Fabricated admission date',
    sourceText: 'Patient was admitted on 2024-03-01 following an acute asthma exacerbation.',
    summaryText: 'The patient was admitted on 2024-09-15 due to severe respiratory distress.',
  },
  {
    id: 'hallucinated-3',
    docType: 'radiology_report',
    isFaithful: false,
    description: 'Contradictory finding (hemorrhage fabricated)',
    sourceText: 'Non-contrast CT head shows no evidence of acute intracranial hemorrhage or mass effect.',
    summaryText: 'CT head demonstrated acute intracranial hemorrhage in the left frontal lobe.',
  },
  {
    id: 'hallucinated-4',
    docType: 'dialogue_transcript',
    isFaithful: false,
    description: 'Negation flip (denies chest pain vs has severe chest pain)',
    sourceText: 'Clinician: Are you having any chest pain? Patient: No, I deny any chest pain or shortness of breath.',
    summaryText: 'The patient presented with severe chest pain and severe shortness of breath.',
  },
  {
    id: 'hallucinated-5',
    docType: 'biomedical_literature',
    isFaithful: false,
    description: 'Fabricated statistical outcome (p=0.001 vs non-significant in source)',
    sourceText: 'The primary endpoint did not reach statistical significance between intervention and control groups (p=0.42).',
    summaryText: 'The intervention showed a statistically significant improvement in the primary endpoint (p=0.001).',
  },
  {
    id: 'hallucinated-6',
    docType: 'ehr_note',
    isFaithful: false,
    description: 'Fabricated lab result value (Hemoglobin 6.2 vs 13.5 in source)',
    sourceText: 'Routine lab work: Hemoglobin 13.5 g/dL, WBC 6.5, Platelets 220k.',
    summaryText: 'Lab work revealed severe anemia with Hemoglobin of 6.2 g/dL.',
  },
  {
    id: 'hallucinated-7',
    docType: 'discharge_summary',
    isFaithful: false,
    description: 'Fabricated surgical intervention',
    sourceText: 'Patient treated conservatively for mild pancreatitis with bowel rest and fluid resuscitation.',
    summaryText: 'Patient underwent emergency open laparotomy and pancreatic resection.',
  },
  {
    id: 'hallucinated-8',
    docType: 'radiology_report',
    isFaithful: false,
    description: 'Fabricated fracture finding',
    sourceText: 'Right wrist X-ray: No acute fracture or dislocation. Soft tissues are unremarkable.',
    summaryText: 'Right wrist X-ray showed a displaced distal radius fracture.',
  },
  {
    id: 'hallucinated-9',
    docType: 'dialogue_transcript',
    isFaithful: false,
    description: 'Fabricated allergy history',
    sourceText: 'Clinician: Any medication allergies? Patient: No known drug allergies.',
    summaryText: 'The patient reports severe anaphylactic allergy to penicillin and sulfa drugs.',
  },
  {
    id: 'hallucinated-10',
    docType: 'biomedical_literature',
    isFaithful: false,
    description: 'Fabricated patient sample size (10000 vs 150 in source)',
    sourceText: 'A pilot study enrolled 150 patients across 2 clinical centers to assess feasibility.',
    summaryText: 'A large nationwide study enrolled 10000 patients across 50 medical centers.',
  },
];
