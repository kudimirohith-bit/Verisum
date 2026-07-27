/**
 * Seed script — inserts demo data into MongoDB.
 * Run via: npm run seed (from backend/ or root workspace)
 */
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { UserModel } from '../src/models/User.js';
import { DocumentModel } from '../src/models/Document.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/verisumm';

async function seed() {
  await connectDB(MONGO_URI);

  console.log('\n[Seed] Clearing existing seed data...');
  await UserModel.deleteMany({ email: { $in: ['admin@verisumm.io', 'clinician@verisumm.io'] } });

  // ─── Admin User ───────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('AdminPass123!', 12);
  const admin = await UserModel.create({
    email: 'admin@verisumm.io',
    role: 'admin',
    passwordHash: adminHash,
  });
  console.log(`[Seed] ✓ Admin user created: ${admin.email} (${admin._id})`);

  // ─── Clinician User ────────────────────────────────────────────────────────
  const clinicianHash = await bcrypt.hash('ClinicianPass123!', 12);
  const clinician = await UserModel.create({
    email: 'clinician@verisumm.io',
    role: 'clinician',
    passwordHash: clinicianHash,
  });
  console.log(`[Seed] ✓ Clinician user created: ${clinician.email} (${clinician._id})`);

  // ─── Sample De-identified Document ─────────────────────────────────────────
  const sampleDoc = await DocumentModel.create({
    ownerId: clinician._id,
    docType: 'discharge_summary',
    rawText:
      'Patient [REDACTED], age [REDACTED], was admitted on [DATE] with acute chest pain. ' +
      'Diagnosis: NSTEMI. Treated with aspirin, heparin, and percutaneous coronary intervention (PCI). ' +
      'Discharged in stable condition after 4 days. Follow-up in 2 weeks.',
    sourceFilename: 'demo_discharge_summary_deidentified.txt',
    phiStatus: 'deidentified',
    uploadedAt: new Date(),
  });
  console.log(`[Seed] ✓ Sample document created: ${sampleDoc.sourceFilename} (${sampleDoc._id})`);

  console.log('\n[Seed] ✅ Demo data seeded successfully.\n');
  await disconnectDB();
}

seed().catch((err) => {
  console.error('[Seed] ❌ Seeding failed:', err);
  process.exit(1);
});
