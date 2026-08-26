import { test, expect } from '@playwright/test';

test.describe('VeriSum Platform End-to-End Workflow', () => {
  test('Complete Clinical Workflow: Upload -> Job Dispatch -> Summary Review -> Clinician Feedback', async ({ page }) => {
    // 1. Visit application home page
    await page.goto('/');

    // 2. Verify platform branding & title
    await expect(page.locator('h1, h2').first()).toBeVisible();

    // 3. Input synthetic clinical note text
    const clinicalText = `PATIENT: Jonathan Test DOB: 05/12/1980 MRN: 99887766
DATE: 08/25/2026 PHYSICIAN: Dr. Sarah Connor, MD

SUBJECTIVE:
46-year-old male presents for follow-up of type 2 diabetes and hypertension.
Denies chest pain, shortness of breath, or lower extremity edema.

OBJECTIVE:
BP 130/80 mmHg, HR 70 bpm. HbA1c 6.8%, Serum Creatinine 0.9 mg/dL.

ASSESSMENT & PLAN:
1. Type 2 Diabetes Mellitus: Well controlled. Continue Metformin 1000mg BID.
2. Primary Hypertension: Controlled. Continue Lisinopril 20mg daily.`;

    const rawTextInput = page.locator('[data-testid="raw-text-input"]');
    await expect(rawTextInput).toBeVisible();
    await rawTextInput.fill(clinicalText);

    // 4. Select Document Category (EHR Clinical Note)
    const docTypeSelector = page.locator('[data-testid="doctype-ehr_note"]');
    await docTypeSelector.click();

    // 5. Select Mock Fast Backend for deterministic instant summary generation
    const mockBackendBtn = page.locator('[data-testid="backend-mock"]');
    await mockBackendBtn.click();

    // 6. Dispatch Summarization Job
    const submitBtn = page.locator('[data-testid="submit-job-btn"]');
    await submitBtn.click();

    // 7. Wait for Summary Review Screen to render with Generated Summary
    const summaryHeader = page.locator('text=Generated Summary');
    await expect(summaryHeader).toBeVisible({ timeout: 15000 });

    // 8. Submit Clinician Evaluation Feedback
    const starCompleteness = page.locator('[data-testid="completeness-rating-star-5"]');
    if (await starCompleteness.isVisible()) {
      await starCompleteness.click();
      await page.locator('[data-testid="correctness-rating-star-5"]').click();
      await page.locator('[data-testid="conciseness-rating-star-4"]').click();
      await page.locator('[data-testid="feedback-comment"]').fill('E2E automated test: summary accurately captures diagnosis and medication plan.');

      const submitFeedbackBtn = page.locator('[data-testid="submit-feedback-btn"]');
      await submitFeedbackBtn.click();

      // 9. Verify time-on-task research caveat text is displayed
      await expect(page.locator('text=Instrumentation: Time-on-task tracked for research evaluation.')).toBeVisible();

      // 10. Verify success confirmation banner
      await expect(page.locator('text=Evaluation feedback recorded successfully')).toBeVisible({ timeout: 10000 });
    }
  });
});
