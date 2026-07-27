/**
 * Tests for the de-identification module (regexDeid) and
 * the document ingestion API endpoints (POST/GET /documents).
 *
 * PHI test set: 5 synthetic clinical notes with known PHI spans.
 * Acceptance criteria: all tagged PHI categories are caught (regex-only pass).
 */

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../src/app';
import { UserModel } from '../src/models/User';
import { DocumentModel } from '../src/models/Document';
import { regexDeid } from '../src/deid/index';
import { signAccessToken } from '../src/auth/tokens';

let mongod: MongoMemoryServer;

// ── DB lifecycle ───────────────────────────────────────────────────────────────
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────
async function createUser(
  email: string,
  role: 'clinician' | 'researcher' | 'admin' = 'clinician',
) {
  const hash = await bcrypt.hash('testPass1!', 1);
  const user = await UserModel.create({ email, role, passwordHash: hash });
  const token = signAccessToken({ sub: user._id.toString(), email: user.email, role: user.role });
  return { user, token };
}

// ══════════════════════════════════════════════════════════════════════════════
// PHI DE-IDENTIFICATION UNIT TESTS — 5 synthetic clinical notes
// ══════════════════════════════════════════════════════════════════════════════

describe('De-identification — regexDeid() — synthetic PHI recall test set', () => {
  /**
   * Note 1 — EHR note with MRN, DOB, phone number, and SSN
   */
  it('[Note 1] redacts MRN, phone number, SSN, and date', () => {
    const note = `
      Patient: Jane Doe
      MRN: 8834521
      Date of Birth: 03/15/1978
      Phone: (555) 234-7890
      SSN: 123-45-6789
      Chief Complaint: Hypertension follow-up.
    `;

    const { deidentifiedText, phiMatchCount } = regexDeid(note);

    expect(deidentifiedText).toContain('[MRN]');
    expect(deidentifiedText).toContain('[DATE]');
    expect(deidentifiedText).toContain('[PHONE]');
    expect(deidentifiedText).toContain('[SSN]');
    expect(phiMatchCount).toBeGreaterThanOrEqual(4);

    // Must NOT contain the real MRN or phone
    expect(deidentifiedText).not.toContain('8834521');
    expect(deidentifiedText).not.toContain('(555) 234-7890');
    expect(deidentifiedText).not.toContain('123-45-6789');
  });

  /**
   * Note 2 — Discharge summary with date, email, and ZIP
   */
  it('[Note 2] redacts admission date, email address, and ZIP code', () => {
    const note = `
      Discharge Summary
      Admission Date: January 22, 2024
      Discharge Date: 2024-01-28
      Contact Email: john.smith@email.com
      Mailing ZIP: 94103
      Patient presented with acute appendicitis.
    `;

    const { deidentifiedText, phiMatchCount } = regexDeid(note);

    expect(deidentifiedText).toContain('[DATE]');
    expect(deidentifiedText).toContain('[EMAIL]');
    expect(deidentifiedText).toContain('[ZIP]');
    expect(phiMatchCount).toBeGreaterThanOrEqual(3);

    expect(deidentifiedText).not.toContain('january 22, 2024');
    expect(deidentifiedText).not.toContain('john.smith@email.com');
    expect(deidentifiedText).not.toContain('94103');
  });

  /**
   * Note 3 — Radiology report with Patient ID, age, and URL
   */
  it('[Note 3] redacts Patient ID, age, and URL', () => {
    const note = `
      Radiology Report — CT Chest
      Patient ID: 4492871
      Patient is a 67-year-old male.
      Reference: https://pacs.hospital.internal/study/CT-4492871
      Findings: No acute cardiopulmonary process.
    `;

    const { deidentifiedText, phiMatchCount } = regexDeid(note);

    expect(deidentifiedText).toContain('[PATIENT_ID]');
    expect(deidentifiedText).toContain('[AGE]');
    expect(deidentifiedText).toContain('[URL]');
    expect(phiMatchCount).toBeGreaterThanOrEqual(3);

    expect(deidentifiedText).not.toContain('4492871');
    expect(deidentifiedText).not.toContain('67-year-old');
    expect(deidentifiedText).not.toContain('https://pacs.hospital.internal');
  });

  /**
   * Note 4 — Dialogue transcript with multiple dates and phone number
   */
  it('[Note 4] redacts multiple dates and phone in dialogue transcript', () => {
    const note = `
      [Clinician]: When were you last seen?
      [Patient]: I was here on 12/05/2023 and before that on 08/20/2023.
      [Clinician]: Your next appointment is 15 March 2024. We'll call you at 555-987-6543.
    `;

    const { deidentifiedText, phiMatchCount } = regexDeid(note);

    expect(deidentifiedText).toContain('[DATE]');
    expect(deidentifiedText).toContain('[PHONE]');

    // Three distinct dates + 1 phone should be caught
    expect(phiMatchCount).toBeGreaterThanOrEqual(4);

    expect(deidentifiedText).not.toContain('12/05/2023');
    expect(deidentifiedText).not.toContain('08/20/2023');
    expect(deidentifiedText).not.toContain('555-987-6543');
  });

  /**
   * Note 5 — Biomedical literature excerpt with IP address and email
   */
  it('[Note 5] redacts IP address and researcher email in biomedical excerpt', () => {
    const note = `
      Data was collected from the hospital information system at 192.168.1.45.
      Queries were submitted on 2023-09-15.
      For correspondence: dr.researcher@biolab.edu
      IRB approval: 2023-09-01.
    `;

    const { deidentifiedText, phiMatchCount } = regexDeid(note);

    expect(deidentifiedText).toContain('[IP_ADDRESS]');
    expect(deidentifiedText).toContain('[EMAIL]');
    expect(deidentifiedText).toContain('[DATE]');
    expect(phiMatchCount).toBeGreaterThanOrEqual(4);

    expect(deidentifiedText).not.toContain('192.168.1.45');
    expect(deidentifiedText).not.toContain('dr.researcher@biolab.edu');
  });

  /**
   * Clean text — no PHI should produce no replacements
   */
  it('[Clean] clean clinical text has phiMatchCount = 0', () => {
    const note = `
      The patient was evaluated for chronic lower back pain.
      Physical examination reveals mild tenderness at L4-L5.
      Plan: Continue NSAIDs, physiotherapy twice weekly.
    `;

    const { phiMatchCount } = regexDeid(note);
    expect(phiMatchCount).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INGESTION API TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('POST /documents — text upload (pasted text)', () => {
  it('clinician can upload a pasted note and it is de-identified', async () => {
    const { token } = await createUser('clinician@upload.io', 'clinician');

    const res = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        docType: 'ehr_note',
        rawText: 'Patient MRN: 1234567. DOB: 01/01/1980. Phone: (555) 000-1234.',
      });

    expect(res.status).toBe(201);
    expect(res.body.document.phiStatus).toBe('deidentified');
    expect(res.body.document.phiMatchCount).toBeGreaterThanOrEqual(3);
  });

  it('researcher can upload a pasted note', async () => {
    const { token } = await createUser('researcher@upload.io', 'researcher');

    const res = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ docType: 'biomedical_literature', rawText: 'Background: clinical trial results.' });

    expect(res.status).toBe(201);
  });

  it('unauthenticated request returns 401', async () => {
    const res = await request(app)
      .post('/documents')
      .send({ docType: 'ehr_note', rawText: 'Test note.' });

    expect(res.status).toBe(401);
  });

  it('missing docType returns 400', async () => {
    const { token } = await createUser('bad@upload.io', 'clinician');

    const res = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ rawText: 'No docType here.' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ValidationError');
  });

  it('missing both file and rawText returns 400', async () => {
    const { token } = await createUser('empty@upload.io', 'clinician');

    const res = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ docType: 'ehr_note' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BadRequest');
  });
});

describe('POST /documents — .txt file upload', () => {
  it('correctly extracts text from a .txt file upload', async () => {
    const { token } = await createUser('txtuser@upload.io', 'clinician');

    const res = await request(app)
      .post('/documents')
      .set('Authorization', `Bearer ${token}`)
      .field('docType', 'ehr_note')
      .attach('file', Buffer.from('Patient MRN: 9988776. Phone: 555-111-2222.'), 'note.txt');

    expect(res.status).toBe(201);
    expect(res.body.document.phiStatus).toBe('deidentified');
    expect(res.body.document.phiMatchCount).toBeGreaterThanOrEqual(2);
  });
});

describe('GET /documents/:id', () => {
  it('owner can retrieve their own document', async () => {
    const { user, token } = await createUser('owner@get.io', 'clinician');

    const doc = await DocumentModel.create({
      ownerId: user._id,
      docType: 'ehr_note',
      rawText: 'De-identified note content.',
      sourceFilename: 'note.txt',
      phiStatus: 'deidentified',
    });

    const res = await request(app)
      .get(`/documents/${doc._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.document.rawText).toBe('De-identified note content.');
    expect(res.body.document.phiStatus).toBe('deidentified');
  });

  it('non-owner returns 403', async () => {
    const { user: owner } = await createUser('owner2@get.io', 'clinician');
    const { token: otherToken } = await createUser('other@get.io', 'clinician');

    const doc = await DocumentModel.create({
      ownerId: owner._id,
      docType: 'ehr_note',
      rawText: 'Private note.',
      sourceFilename: 'note.txt',
      phiStatus: 'deidentified',
    });

    const res = await request(app)
      .get(`/documents/${doc._id}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });

  it('admin can view any document', async () => {
    const { user: owner } = await createUser('owner3@get.io', 'clinician');
    const { token: adminToken } = await createUser('admin@get.io', 'admin');

    const doc = await DocumentModel.create({
      ownerId: owner._id,
      docType: 'ehr_note',
      rawText: 'Admin-visible note.',
      sourceFilename: 'note.txt',
      phiStatus: 'deidentified',
    });

    const res = await request(app)
      .get(`/documents/${doc._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('unknown document id returns 404', async () => {
    const { token } = await createUser('nobody@get.io', 'clinician');
    const fakeId = new mongoose.Types.ObjectId();

    const res = await request(app)
      .get(`/documents/${fakeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
