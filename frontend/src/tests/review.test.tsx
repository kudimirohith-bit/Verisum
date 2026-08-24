import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlaggedClaimHighlight } from '../components/FlaggedClaimHighlight';
import { FeedbackForm } from '../components/FeedbackForm';
import * as apiClient from '../api/client';

// Mock API client
vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    submitClinicianFeedback: vi.fn().mockResolvedValue({
      message: 'Feedback submitted successfully.',
      feedback: {
        _id: 'fb-123',
        summaryId: 'summary-1',
        reviewerId: 'user-1',
        completenessRating: 4,
        correctnessRating: 5,
        concisenessRating: 4,
        comment: 'Great summary, very accurate.',
        createdAt: new Date().toISOString(),
      },
    }),
  };
});

describe('Chunk 0.8 — React Components Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('FlaggedClaimHighlight Component', () => {
    const summaryText =
      'Patient is a 58yo male with hypertension. His blood pressure today was recorded as 180/110 mmHg. He was prescribed Amoxicillin 500mg daily.';

    const flaggedClaims: apiClient.FlaggedClaim[] = [
      {
        claimText: 'He was prescribed Amoxicillin 500mg daily.',
        sentence: 'He was prescribed Amoxicillin 500mg daily.',
        verdict: 'ungrounded',
        confidence: 0.95,
        reason: "Ungrounded numeric/medication entity 'Amoxicillin 500mg' not found in source text.",
        sourceChunkId: 'chunk-2',
      },
    ];

    it('renders normal and highlighted text correctly', () => {
      render(
        <FlaggedClaimHighlight
          summaryText={summaryText}
          flaggedClaims={flaggedClaims}
        />
      );

      // Check unflagged sentence
      expect(screen.getByText(/Patient is a 58yo male with hypertension/i)).toBeInTheDocument();

      // Check flagged sentence element
      const highlight = screen.getByTestId('flagged-claim-highlight');
      expect(highlight).toBeInTheDocument();
      expect(highlight).toHaveTextContent(/He was prescribed Amoxicillin 500mg daily/i);
    });

    it('opens popover on click and triggers jump to source chunk callback', () => {
      const onSelectChunkMock = vi.fn();

      render(
        <FlaggedClaimHighlight
          summaryText={summaryText}
          flaggedClaims={flaggedClaims}
          onSelectSourceChunk={onSelectChunkMock}
        />
      );

      const highlight = screen.getByTestId('flagged-claim-highlight');
      fireEvent.click(highlight);

      // Verify popover appears
      const popover = screen.getByTestId('flagged-claim-popover');
      expect(popover).toBeInTheDocument();
      expect(popover).toHaveTextContent(/ungrounded/i);
      expect(popover).toHaveTextContent(/Ungrounded numeric\/medication entity/i);

      // Click Jump to Source Chunk button
      const jumpBtn = screen.getByRole('button', { name: /Jump to Source Chunk/i });
      fireEvent.click(jumpBtn);

      expect(onSelectChunkMock).toHaveBeenCalledWith('chunk-2');
    });
  });

  describe('FeedbackForm Component', () => {
    it('allows clinician role to select ratings, type comment, and submit feedback', async () => {
      const onSubmittedMock = vi.fn();

      render(
        <FeedbackForm
          summaryId="summary-1"
          userRole="clinician"
          onFeedbackSubmitted={onSubmittedMock}
        />
      );

      // Check form renders
      expect(screen.getByTestId('feedback-form')).toBeInTheDocument();

      // Select Completeness rating 4
      const compStar4 = screen.getByTestId('completeness-rating-star-4');
      fireEvent.click(compStar4);

      // Select Correctness rating 5
      const corrStar5 = screen.getByTestId('correctness-rating-star-5');
      fireEvent.click(corrStar5);

      // Type comment
      const commentInput = screen.getByTestId('feedback-comment');
      fireEvent.change(commentInput, { target: { value: 'Verified clinical notes accurately.' } });

      // Submit form
      const submitBtn = screen.getByTestId('submit-feedback-btn');
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(apiClient.submitClinicianFeedback).toHaveBeenCalledWith('summary-1', {
          completenessRating: 4,
          correctnessRating: 5,
          concisenessRating: 5,
          comment: 'Verified clinical notes accurately.',
        });
      });

      expect(screen.getByText(/Evaluation feedback recorded successfully/i)).toBeInTheDocument();
    });

    it('enforces read-only mode for researcher role', () => {
      render(
        <FeedbackForm
          summaryId="summary-1"
          userRole="researcher"
        />
      );

      // Should show read-only banner
      expect(screen.getByText(/Read-Only \(Researcher Role\)/i)).toBeInTheDocument();

      // Submit button should NOT be present
      expect(screen.queryByTestId('submit-feedback-btn')).not.toBeInTheDocument();

      // Comment field should be disabled
      const commentInput = screen.getByTestId('feedback-comment') as HTMLTextAreaElement;
      expect(commentInput.disabled).toBe(true);
    });
  });
});
