import fixturesJson from './clinical_fixtures.json';

export interface ExpectedPhiSpan {
  text: string;
  category: string;
}

export interface FabricatedClaimFixture {
  claim: string;
  verified: boolean;
  contradictionReason: string;
}

export interface ClinicalFixture {
  id: string;
  docType: string;
  title: string;
  rawText: string;
  expectedPhi: ExpectedPhiSpan[];
  hasInjectedFabrications: boolean;
  fabricatedClaims?: FabricatedClaimFixture[];
}

export const CLINICAL_FIXTURES: ClinicalFixture[] = fixturesJson as ClinicalFixture[];

export function getFixtureById(id: string): ClinicalFixture | undefined {
  return CLINICAL_FIXTURES.find((f) => f.id === id);
}

export function getFixturesByDocType(docType: string): ClinicalFixture[] {
  return CLINICAL_FIXTURES.filter((f) => f.docType === docType);
}

export function getFabricatedFixtures(): ClinicalFixture[] {
  return CLINICAL_FIXTURES.filter((f) => f.hasInjectedFabrications);
}
