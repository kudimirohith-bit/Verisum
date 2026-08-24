import React, { useState } from 'react';
import { uploadDocument, createSummarizationJob } from '../api/client';
import { FileUp, Sparkles, Check, Stethoscope, FileText, Layers } from 'lucide-react';

interface UploadScreenProps {
  onJobsCreated: (jobIds: string[]) => void;
}

const DOC_TYPES = [
  { id: 'ehr_note', name: 'EHR Clinical Note', desc: 'Inpatient & outpatient progress notes' },
  { id: 'discharge_summary', name: 'Discharge Summary', desc: 'Hospital course & post-discharge instructions' },
  { id: 'radiology_report', name: 'Radiology Report', desc: 'X-Ray, CT, MRI imaging findings' },
  { id: 'dialogue_transcript', name: 'Dialogue Transcript', desc: 'Doctor-patient consultation audio transcripts' },
  { id: 'biomedical_literature', name: 'Biomedical Literature', desc: 'PubMed research articles & trial papers' },
];

const MODEL_BACKENDS = [
  { id: 'mock', name: 'Mock Fast Backend', desc: 'Instant deterministic backend' },
  { id: 'local_clinical_model', name: 'Local Clinical Transformer', desc: 'Domain-adapted model in model-service' },
  { id: 'hosted_llm', name: 'Hosted Claude / GPT LLM', desc: 'High-capacity generative LLM API' },
];

export const UploadScreen: React.FC<UploadScreenProps> = ({ onJobsCreated }) => {
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [docType, setDocType] = useState<string>('ehr_note');
  const [selectedBackends, setSelectedBackends] = useState<string[]>(['mock', 'local_clinical_model']);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const toggleBackend = (id: string) => {
    if (selectedBackends.includes(id)) {
      if (selectedBackends.length > 1) {
        setSelectedBackends(selectedBackends.filter((b) => b !== id));
      }
    } else {
      setSelectedBackends([...selectedBackends, id]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !rawText.trim()) {
      setError('Please attach a document file or paste clinical text.');
      return;
    }
    if (selectedBackends.length === 0) {
      setError('Please select at least one summarization backend model.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Upload Document
      const docRes = await uploadDocument(file, rawText, docType, file?.name || 'pasted_text.txt');
      const docId = docRes.document.id;

      // 2. Create Summarization Job per selected backend model
      const createdJobIds: string[] = [];
      for (const backend of selectedBackends) {
        const jobRes = await createSummarizationJob([docId], backend);
        createdJobIds.push(jobRes.job.id);
      }

      onJobsCreated(createdJobIds);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Document upload/job creation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Title */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-100">
          Document Intake & Benchmarking
        </h2>
        <p className="text-slate-400 text-sm max-w-xl mx-auto">
          Upload clinical notes or literature, configure your note domain, and dispatch jobs across single or multiple model backends for side-by-side verification.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" data-testid="upload-form">
        {/* Document Intake Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 space-y-5 shadow-xl">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-200 border-b border-slate-800 pb-3">
            <FileUp className="w-4 h-4 text-cyan-400" />
            <span>1. Clinical Source Text</span>
          </div>

          {/* File Upload Drop Area */}
          <div className="border-2 border-dashed border-slate-700/80 hover:border-cyan-500/50 rounded-xl p-5 text-center transition-colors bg-slate-950/40">
            <input
              type="file"
              accept=".txt,.pdf,.docx"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload-input"
              data-testid="file-input"
            />
            <label htmlFor="file-upload-input" className="cursor-pointer block space-y-2">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <div className="text-xs text-slate-300 font-semibold">
                {file ? file.name : 'Click to upload .txt, .pdf, or .docx'}
              </div>
              <div className="text-[11px] text-slate-500">De-identification pipeline will redact HIPAA PHI before execution</div>
            </label>
          </div>

          <div className="text-center text-xs font-semibold text-slate-600 uppercase tracking-widest">— OR PASTE RAW TEXT —</div>

          <textarea
            rows={5}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste clinical progress note, radiology report, or transcript text here..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
            data-testid="raw-text-input"
          />
        </div>

        {/* Document Type Selector Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-200 border-b border-slate-800 pb-3">
            <Stethoscope className="w-4 h-4 text-indigo-400" />
            <span>2. Document Category (docType)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="doctype-selector">
            {DOC_TYPES.map((dt) => {
              const active = docType === dt.id;
              return (
                <div
                  key={dt.id}
                  onClick={() => setDocType(dt.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    active
                      ? 'border-cyan-500 bg-cyan-500/10 text-slate-100 shadow-md ring-1 ring-cyan-500/30'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                  }`}
                  data-testid={`doctype-${dt.id}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{dt.name}</span>
                    {active && <Check className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{dt.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Model Backends Multi-Select Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>3. Model Backends (Select 1 or more for comparison)</span>
            </div>
            <span className="text-xs text-amber-400 font-mono font-semibold">
              {selectedBackends.length} selected
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="backend-selector">
            {MODEL_BACKENDS.map((mb) => {
              const active = selectedBackends.includes(mb.id);
              return (
                <div
                  key={mb.id}
                  onClick={() => toggleBackend(mb.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    active
                      ? 'border-amber-500 bg-amber-500/10 text-slate-100 shadow-md ring-1 ring-amber-500/30'
                      : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                  }`}
                  data-testid={`backend-${mb.id}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{mb.name}</span>
                    {active && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{mb.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Submit CTA Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-sm tracking-wider uppercase transition-all duration-200 shadow-xl shadow-cyan-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
          data-testid="submit-job-btn"
        >
          <Sparkles className="w-5 h-5" />
          {loading ? 'Processing Document & Enqueuing Jobs...' : `Dispatch Summarization Jobs (${selectedBackends.length} Backend${selectedBackends.length > 1 ? 's' : ''})`}
        </button>
      </form>
    </div>
  );
};
