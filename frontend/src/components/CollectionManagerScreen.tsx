import React, { useState, useEffect } from 'react';
import {
  fetchCollections,
  createCollection,
  fetchCollectionDetails,
  attachDocumentsToCollection,
  summarizeCollection,
  getJobStatus,
  DocumentCollectionData,
  JobStatusResponse,
} from '../api/client';
import { SummaryReviewScreen } from './SummaryReviewScreen';
import {
  BookOpen,
  Plus,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

interface CollectionManagerScreenProps {
  userRole: 'clinician' | 'researcher' | 'admin';
}

export const CollectionManagerScreen: React.FC<CollectionManagerScreenProps> = ({ userRole }) => {
  const [collections, setCollections] = useState<DocumentCollectionData[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [activeCollectionDetails, setActiveCollectionDetails] = useState<{
    collection: DocumentCollectionData;
    documents: any[];
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColDocType, setNewColDocType] = useState('biomedical_literature');
  const [newColDesc, setNewColDesc] = useState('');

  // Batch upload inside collection state
  const [batchTexts, setBatchTexts] = useState<Array<{ filename: string; text: string }>>([
    { filename: 'abstract_1_pembrolizumab.txt', text: '' },
    { filename: 'abstract_2_nivolumab.txt', text: '' },
  ]);

  const [selectedBackend, setSelectedBackend] = useState('local_clinical_model');
  const [activeJobResult, setActiveJobResult] = useState<JobStatusResponse | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    setIsLoading(true);
    try {
      const res = await fetchCollections();
      setCollections(res.collections);
      if (res.collections.length > 0 && !selectedCollectionId) {
        handleSelectCollection(res.collections[0]._id);
      }
    } catch (err: any) {
      console.error('Failed to load collections', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCollection = async (id: string) => {
    setSelectedCollectionId(id);
    setActiveJobResult(null);
    try {
      const details = await fetchCollectionDetails(id);
      setActiveCollectionDetails(details);
    } catch (err: any) {
      console.error('Failed to fetch collection details', err);
    }
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim()) return;
    try {
      const res = await createCollection({
        name: newColName,
        docType: newColDocType,
        description: newColDesc,
      });
      setShowCreateModal(false);
      setNewColName('');
      setNewColDesc('');
      setStatusMessage({ type: 'success', text: `Collection "${res.collection.name}" created.` });
      await loadCollections();
      handleSelectCollection(res.collection._id);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to create collection.',
      });
    }
  };

  const handleAddBatchDocumentRow = () => {
    setBatchTexts([
      ...batchTexts,
      { filename: `document_${batchTexts.length + 1}.txt`, text: '' },
    ]);
  };

  const handleAttachDocuments = async () => {
    if (!selectedCollectionId) return;
    const validDocs = batchTexts.filter((d) => d.text.trim().length > 0);
    if (validDocs.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please enter text for at least one document.' });
      return;
    }

    try {
      const res = await attachDocumentsToCollection(selectedCollectionId, {
        documents: validDocs.map((d) => ({
          sourceFilename: d.filename,
          rawText: d.text,
          docType: activeCollectionDetails?.collection.docType,
        })),
      });

      setActiveCollectionDetails(res);
      setStatusMessage({ type: 'success', text: `Attached ${validDocs.length} documents to collection.` });
      // Reset batch input
      setBatchTexts([
        { filename: 'abstract_1_study.txt', text: '' },
        { filename: 'abstract_2_study.txt', text: '' },
      ]);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to attach documents.',
      });
    }
  };

  const handleRunCollectionSummarization = async () => {
    if (!selectedCollectionId || !activeCollectionDetails) return;
    if (activeCollectionDetails.documents.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please attach at least 1 document before summarizing.' });
      return;
    }

    setIsSummarizing(true);
    setStatusMessage(null);
    try {
      const res = await summarizeCollection(selectedCollectionId, selectedBackend);
      const jobRes = await getJobStatus(res.jobId);
      setActiveJobResult(jobRes);
      setStatusMessage({ type: 'success', text: 'Multi-document collection summarization completed!' });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to summarize collection.',
      });
    } finally {
      setIsSummarizing(false);
    }
  };

  // Preset Seeding Helper for Quick Testing
  const handleSeedPresetAbstracts = () => {
    setBatchTexts([
      {
        filename: 'study_1_pembrolizumab_lung.txt',
        text: 'Background: Pembrolizumab evaluated in 120 lung cancer patients. Results: Overall response rate reached 45%. Conclusion: Statistically significant overall survival benefit was observed (p=0.001). Toxicity profile was manageable.',
      },
      {
        filename: 'study_2_nivolumab_phase3.txt',
        text: 'Background: Phase III randomized trial of Nivolumab vs standard chemotherapy in 300 subjects. Results: Median overall survival increased to 14.2 months compared to 9.6 months (p=0.002). Progression-free survival reached 7.1 months.',
      },
      {
        filename: 'study_3_atezolizumab_cohort.txt',
        text: 'Background: Atezolizumab cohort study of 85 subjects with metastatic disease. Results: Objective response rate reached 38% with median duration of response lasting 11.4 months.',
      },
    ]);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-indigo-600" />
            Multi-Document & Biomedical Literature Mode
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Synthesize related document collections (biomedical literature abstracts or patient EHR timelines) into a unified summary with per-claim document attribution.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition flex items-center gap-2 shadow-md"
        >
          <Plus className="w-4 h-4" />
          Create Collection
        </button>
      </div>

      {/* Alert Notifications */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          )}
          {statusMessage.text}
        </div>
      )}

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar: Collections List */}
        <div className="lg:col-span-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-2">
            Your Collections
          </h3>

          {isLoading ? (
            <div className="p-4 text-center text-slate-400 text-xs">Loading collections...</div>
          ) : collections.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-xs">
              No collections found. Click "Create Collection" above.
            </div>
          ) : (
            <div className="space-y-1.5">
              {collections.map((c) => (
                <button
                  key={c._id}
                  onClick={() => handleSelectCollection(c._id)}
                  className={`w-full text-left p-3 rounded-xl transition flex items-center justify-between ${
                    selectedCollectionId === c._id
                      ? 'bg-indigo-50 border border-indigo-200 text-indigo-900 font-semibold'
                      : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                  }`}
                >
                  <div className="truncate">
                    <div className="text-sm truncate">{c.name}</div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span className="capitalize">{c.docType.replace('_', ' ')}</span>
                      <span>•</span>
                      <span>{c.documentCount || 0} docs</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="lg:col-span-3 space-y-6">
          {!activeCollectionDetails ? (
            <div className="bg-white p-12 text-center rounded-2xl border border-slate-200 text-slate-500">
              Select or create a collection to begin multi-document synthesis.
            </div>
          ) : (
            <>
              {/* Collection Header Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-slate-900">
                      {activeCollectionDetails.collection.name}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 uppercase">
                      {activeCollectionDetails.collection.docType.replace('_', ' ')}
                    </span>
                  </div>
                  {activeCollectionDetails.collection.description && (
                    <p className="text-xs text-slate-500 mt-1">
                      {activeCollectionDetails.collection.description}
                    </p>
                  )}
                  <div className="text-xs text-slate-400 mt-2 flex items-center gap-3">
                    <span>
                      Attached Documents: <strong>{activeCollectionDetails.documents.length}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Created: {new Date(activeCollectionDetails.collection.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={selectedBackend}
                    onChange={(e) => setSelectedBackend(e.target.value)}
                    className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700"
                  >
                    <option value="local_clinical_model">Local Clinical Model</option>
                    <option value="hosted_llm">Hosted LLM API</option>
                    <option value="mock">Mock Backend</option>
                  </select>

                  <button
                    onClick={handleRunCollectionSummarization}
                    disabled={isSummarizing || activeCollectionDetails.documents.length === 0}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition flex items-center gap-2 shadow-md disabled:opacity-50"
                  >
                    {isSummarizing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Synthesizing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Summarize Collection
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Attach / Upload Documents Panel */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    Collection Documents ({activeCollectionDetails.documents.length})
                  </h3>
                  <button
                    onClick={handleSeedPresetAbstracts}
                    className="text-xs text-indigo-600 hover:underline font-semibold"
                  >
                    + Load Demo Scientific Abstracts Preset
                  </button>
                </div>

                {/* Attached docs list */}
                {activeCollectionDetails.documents.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-2">
                    {activeCollectionDetails.documents.map((d, i) => (
                      <div
                        key={d._id}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                      >
                        <div className="truncate pr-2">
                          <span className="font-semibold text-slate-800 block truncate">
                            Doc #{i + 1}: {d.sourceFilename}
                          </span>
                          <span className="text-slate-400 text-[11px] truncate block">
                            {d.rawText.slice(0, 75)}...
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-200 text-slate-700 font-mono">
                          {d.rawText.split(/\s+/).length} words
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Batch upload form */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <span className="text-xs font-semibold text-slate-700 block">
                    Attach New Documents to Collection:
                  </span>

                  {batchTexts.map((item, idx) => (
                    <div key={idx} className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={item.filename}
                          onChange={(e) => {
                            const updated = [...batchTexts];
                            updated[idx].filename = e.target.value;
                            setBatchTexts(updated);
                          }}
                          placeholder="Filename (e.g. abstract_1.txt)"
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 w-1/2 focus:outline-none"
                        />
                      </div>
                      <textarea
                        rows={2}
                        value={item.text}
                        onChange={(e) => {
                          const updated = [...batchTexts];
                          updated[idx].text = e.target.value;
                          setBatchTexts(updated);
                        }}
                        placeholder="Paste document text or scientific abstract content here..."
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none font-mono"
                      />
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={handleAddBatchDocumentRow}
                      className="text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      + Add Another Document Entry
                    </button>
                    <button
                      onClick={handleAttachDocuments}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
                    >
                      Attach Documents
                    </button>
                  </div>
                </div>
              </div>

              {/* Render Multi-Document Summary Review Screen if job completed */}
              {activeJobResult && activeJobResult.summary && (
                <div className="border-t-2 border-indigo-500 pt-6">
                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200 mb-6 flex items-center justify-between text-xs font-semibold text-indigo-900">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                      Multi-Document Synthesis Result Ready
                    </span>
                    <span>Backend: {activeJobResult.job.modelBackend}</span>
                  </div>

                  <SummaryReviewScreen
                    jobResult={activeJobResult}
                    userRole={userRole}
                    onBackToUpload={() => setActiveJobResult(null)}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal: Create Collection */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-slate-200 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Create Document Collection</h3>

            <form onSubmit={handleCreateCollection} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Collection Name *
                </label>
                <input
                  type="text"
                  required
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="e.g. Hypertension RCT Literature"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Document Type Workflow *
                </label>
                <select
                  value={newColDocType}
                  onChange={(e) => setNewColDocType(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                >
                  <option value="biomedical_literature">
                    Biomedical Literature (Scientific Abstracts)
                  </option>
                  <option value="ehr_note">EHR Clinical Notes (Chronological Patient Notes)</option>
                  <option value="discharge_summary">Discharge Summaries</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newColDesc}
                  onChange={(e) => setNewColDesc(e.target.value)}
                  placeholder="Notes or clinical rationale for this collection..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
                >
                  Create Collection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
