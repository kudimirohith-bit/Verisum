import { VerificationConfig } from './types.js';

const defaultConfig: VerificationConfig = {
  docType: 'default',
  nliThreshold: 0.70,
  contradictionThreshold: 0.40,
  strictNumericGrounding: true,
  activeStrategies: ['nli', 'entity_grounding'],
};

const docTypeConfigs: Record<string, Partial<VerificationConfig>> = {
  radiology_report: {
    nliThreshold: 0.85,
    contradictionThreshold: 0.25,
    strictNumericGrounding: true,
    activeStrategies: ['nli', 'entity_grounding', 'llm_judge'],
  },
  discharge_summary: {
    nliThreshold: 0.75,
    contradictionThreshold: 0.35,
    strictNumericGrounding: true,
    activeStrategies: ['nli', 'entity_grounding'],
  },
  ehr_note: {
    nliThreshold: 0.70,
    contradictionThreshold: 0.40,
    strictNumericGrounding: true,
    activeStrategies: ['nli', 'entity_grounding'],
  },
  dialogue_transcript: {
    nliThreshold: 0.65,
    contradictionThreshold: 0.45,
    strictNumericGrounding: false,
    activeStrategies: ['nli', 'entity_grounding'],
  },
  biomedical_literature: {
    nliThreshold: 0.80,
    contradictionThreshold: 0.30,
    strictNumericGrounding: true,
    activeStrategies: ['nli', 'entity_grounding'],
  },
};

export function getVerificationConfig(docType: string): VerificationConfig {
  const custom = docTypeConfigs[docType] || {};
  return {
    ...defaultConfig,
    docType,
    ...custom,
  };
}
