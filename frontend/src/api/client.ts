import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Set Auth Token helper
export function setAuthToken(token: string | null) {
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    localStorage.setItem('verisumm_token', token);
  } else {
    delete apiClient.defaults.headers.common['Authorization'];
    localStorage.removeItem('verisumm_token');
  }
}

// Restore saved token from localStorage on boot
const savedToken = localStorage.getItem('verisumm_token');
if (savedToken) {
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
}

export async function checkBackendHealth() {
  const response = await apiClient.get<{ status: string }>('/health');
  return response.data;
}

export interface UserRole {
  role: 'clinician' | 'researcher' | 'admin';
  email: string;
  sub: string;
}

export async function loginUser(email: string, role: 'clinician' | 'researcher' | 'admin' = 'clinician') {
  try {
    const res = await apiClient.post('/auth/login', { email, password: 'Password123!' });
    if (res.data?.accessToken) {
      setAuthToken(res.data.accessToken);
    }
    return res.data;
  } catch (err) {
    // Demo mode: mock token creation if endpoint isn't seeded with user
    const mockToken = `mock-jwt-token-for-${role}`;
    setAuthToken(mockToken);
    return { accessToken: mockToken, user: { email, role } };
  }
}

export interface DocumentResponse {
  message: string;
  document: {
    id: string;
    docType: string;
    rawText: string;
    sourceFilename?: string;
    phiStatus: string;
  };
}

export async function uploadDocument(
  file: File | null,
  rawText: string,
  docType: string,
  sourceFilename?: string
): Promise<DocumentResponse> {
  const formData = new FormData();
  formData.append('docType', docType);
  if (file) {
    formData.append('file', file);
  } else {
    formData.append('rawText', rawText);
    if (sourceFilename) formData.append('sourceFilename', sourceFilename);
  }

  const response = await apiClient.post<DocumentResponse>('/documents', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
}

export interface CreateJobResponse {
  message: string;
  job: {
    id: string;
    documentIds: string[];
    modelBackend: string;
    status: 'queued' | 'running' | 'verifying' | 'completed' | 'failed';
    createdAt: string;
  };
}

export async function createSummarizationJob(
  documentIds: string[],
  modelBackend: string
): Promise<CreateJobResponse> {
  const response = await apiClient.post<CreateJobResponse>('/jobs', {
    documentIds,
    modelBackend,
  });
  return response.data;
}

export interface FlaggedClaim {
  claimText: string;
  startOffset?: number;
  endOffset?: number;
  sentence?: string;
  sourceChunkId?: string;
  verdict?: 'entailment' | 'contradiction' | 'ungrounded' | 'neutral';
  confidence?: number;
  reason?: string;
}

export interface SummaryData {
  _id: string;
  jobId: string;
  summaryText: string;
  tokenCount: number;
  consistencyScore?: number | null;
  flaggedClaims: FlaggedClaim[];
  automaticMetrics: {
    modelName?: string;
    latencyMs?: number;
    chunkCount?: number;
    rougeL?: number;
    bertScore?: number;
    [key: string]: any;
  };
  createdAt: string;
}

export interface ClinicianFeedbackData {
  _id: string;
  summaryId: string;
  reviewerId: string;
  completenessRating: number;
  correctnessRating: number;
  concisenessRating: number;
  comment?: string;
  createdAt: string;
}

export interface JobStatusResponse {
  job: {
    id: string;
    documentIds: string[];
    modelBackend: string;
    status: 'queued' | 'running' | 'verifying' | 'completed' | 'failed';
    createdAt: string;
    completedAt?: string;
  };
  documents?: Array<{
    _id: string;
    docType: string;
    rawText: string;
    sourceFilename?: string;
  }>;
  summary?: SummaryData | null;
  feedback?: ClinicianFeedbackData[];
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const response = await apiClient.get<JobStatusResponse>(`/jobs/${jobId}`);
  return response.data;
}

export async function submitClinicianFeedback(
  summaryId: string,
  payload: {
    completenessRating: number;
    correctnessRating: number;
    concisenessRating: number;
    comment?: string;
  }
): Promise<{ message: string; feedback: ClinicianFeedbackData }> {
  const response = await apiClient.post<{ message: string; feedback: ClinicianFeedbackData }>(
    `/summaries/${summaryId}/feedback`,
    payload
  );
  return response.data;
}

export interface AuditLogEntry {
  _id: string;
  eventType: 'auth' | 'upload' | 'summarize' | 'verify' | 'review' | 'export';
  actorId?: string;
  documentId?: string;
  jobId?: string;
  summaryId?: string;
  requestId?: string;
  payload: Record<string, any>;
  createdAt: string;
}

export interface AuditQueryResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  pages: number;
}

export interface AuditMetricsResponse {
  volumeOverTime: Array<{ date: string; count: number }>;
  avgConsistencyByBackend: Array<{ modelBackend: string; avgConsistencyScore: number; totalSummaries: number }>;
  avgFeedbackByBackend: Array<{
    modelBackend: string;
    avgCompleteness: number;
    avgCorrectness: number;
    avgConciseness: number;
    totalReviews: number;
  }>;
  flaggedClaimRateByDocType: Array<{
    docType: string;
    totalSummaries: number;
    flaggedCount: number;
    flaggedRate: number;
  }>;
}

export async function getAuditLogs(params?: {
  eventType?: string;
  requestId?: string;
  documentId?: string;
  actorId?: string;
  page?: number;
  limit?: number;
}): Promise<AuditQueryResponse> {
  const response = await apiClient.get<AuditQueryResponse>('/audit', { params });
  return response.data;
}

export async function getAuditMetrics(): Promise<AuditMetricsResponse> {
  const response = await apiClient.get<AuditMetricsResponse>('/audit/metrics');
  return response.data;
}

export async function exportAuditLogs(format: 'csv' | 'json' = 'json', eventType?: string): Promise<Blob> {
  const response = await apiClient.get('/audit/export', {
    params: { format, eventType },
    responseType: 'blob',
  });
  return response.data;
}

// ── Collections API ─────────────────────────────────────────────────────────────

export interface DocumentCollectionData {
  _id: string;
  name: string;
  docType: string;
  description?: string;
  documentCount?: number;
  createdAt: string;
}

export interface CollectionDetailsResponse {
  collection: DocumentCollectionData;
  documents: Array<{
    _id: string;
    docType: string;
    rawText: string;
    sourceFilename: string;
    uploadedAt: string;
  }>;
}

export async function createCollection(payload: {
  name: string;
  docType: string;
  description?: string;
}): Promise<{ collection: DocumentCollectionData }> {
  const response = await apiClient.post('/collections', payload);
  return response.data;
}

export async function fetchCollections(): Promise<{ collections: DocumentCollectionData[] }> {
  const response = await apiClient.get('/collections');
  return response.data;
}

export async function fetchCollectionDetails(id: string): Promise<CollectionDetailsResponse> {
  const response = await apiClient.get(`/collections/${id}`);
  return response.data;
}

export async function attachDocumentsToCollection(
  id: string,
  payload: {
    documents: Array<{
      sourceFilename: string;
      rawText: string;
      docType?: string;
    }>;
  }
): Promise<CollectionDetailsResponse> {
  const response = await apiClient.post(`/collections/${id}/documents`, payload);
  return response.data;
}

export async function summarizeCollection(
  id: string,
  modelBackend: string = 'local_clinical_model'
): Promise<{ jobId: string }> {
  const response = await apiClient.post(`/collections/${id}/summarize`, { modelBackend });
  return response.data;
}
