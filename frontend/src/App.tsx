import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { checkBackendHealth, JobStatusResponse, loginUser } from './api/client';
import { Navbar } from './components/Navbar';
import { UploadScreen } from './components/UploadScreen';
import { JobStatusScreen } from './components/JobStatusScreen';
import { SummaryReviewScreen } from './components/SummaryReviewScreen';
import { ComparisonView } from './components/ComparisonView';

function MainApplication() {
  const [userRole, setUserRole] = useState<'clinician' | 'researcher' | 'admin'>('clinician');
  const [backendStatus, setBackendStatus] = useState<string>('checking...');
  const [currentTab, setCurrentTab] = useState<'upload' | 'jobs' | 'review'>('upload');
  const [activeJobIds, setActiveJobIds] = useState<string[]>([]);
  const [completedJobResults, setCompletedJobResults] = useState<JobStatusResponse[]>([]);

  useEffect(() => {
    checkBackendHealth()
      .then((res) => setBackendStatus(res.status))
      .catch(() => setBackendStatus('offline'));

    // Synchronize JWT auth header for selected role
    loginUser(`user_${userRole}@verisumm.io`, userRole).catch(console.error);
  }, [userRole]);

  const handleJobsCreated = (jobIds: string[]) => {
    setActiveJobIds(jobIds);
    setCompletedJobResults([]);
    setCurrentTab('jobs');
  };

  const handleAllJobsCompleted = (jobResults: JobStatusResponse[]) => {
    setCompletedJobResults(jobResults);
    setCurrentTab('review');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col justify-between selection:bg-cyan-500 selection:text-slate-950">
      <Navbar
        userRole={userRole}
        setUserRole={setUserRole}
        backendStatus={backendStatus}
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
      />

      <main className="max-w-7xl mx-auto w-full p-4 sm:p-8 flex-1">
        {currentTab === 'upload' && (
          <UploadScreen onJobsCreated={handleJobsCreated} />
        )}

        {currentTab === 'jobs' && (
          <JobStatusScreen
            jobIds={activeJobIds.length > 0 ? activeJobIds : ['mock-demo-job-id']}
            onAllCompleted={handleAllJobsCompleted}
          />
        )}

        {currentTab === 'review' && (
          completedJobResults.length > 1 ? (
            <ComparisonView
              jobResults={completedJobResults}
              userRole={userRole}
              onBackToUpload={() => setCurrentTab('upload')}
            />
          ) : (
            <SummaryReviewScreen
              jobResult={
                completedJobResults[0] || {
                  job: {
                    id: 'demo-job-1',
                    documentIds: ['doc-1'],
                    modelBackend: 'local_clinical_model',
                    status: 'completed',
                    createdAt: new Date().toISOString(),
                  },
                  documents: [
                    {
                      _id: 'doc-1',
                      docType: 'ehr_note',
                      rawText:
                        'Patient is a 58-year-old male with a history of hypertension. BP today is 135/85 mmHg. Continue Lisinopril 10mg daily. Patient reports a dry cough for 3 weeks.',
                    },
                  ],
                  summary: {
                    _id: 'summary-1',
                    jobId: 'demo-job-1',
                    summaryText:
                      'The patient is a 58-year-old male with hypertension. His BP is 135/85 mmHg and he takes Lisinopril 10mg daily. He also reports a mild cough lasting for 3 weeks.',
                    tokenCount: 42,
                    consistencyScore: 0.95,
                    flaggedClaims: [],
                    automaticMetrics: { modelName: 'local_clinical_model', latencyMs: 340, rougeL: 0.88, bertScore: 0.92 },
                    createdAt: new Date().toISOString(),
                  },
                  feedback: [],
                }
              }
              userRole={userRole}
              onBackToUpload={() => setCurrentTab('upload')}
            />
          )
        )}
      </main>

      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600 max-w-7xl mx-auto w-full">
        VeriSumm &copy; {new Date().getFullYear()} — Safety-First Factual Verification & Clinician Feedback System (Chunk 0.8)
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<MainApplication />} />
      </Routes>
    </BrowserRouter>
  );
}
