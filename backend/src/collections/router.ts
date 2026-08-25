import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { DocumentCollectionModel } from '../models/DocumentCollection.js';
import { DocumentModel, DocType } from '../models/Document.js';
import { SummarizationJobModel } from '../models/SummarizationJob.js';
import { processSummarizationJob } from '../jobs/processor.js';
import { enqueueSummarizationJob } from '../jobs/queue.js';
import { AuditLogger } from '../audit/AuditLogger.js';
import { validateBackendAccess } from '../config/deployment.js';

export const collectionsRouter = Router();

// Apply auth middleware to all collection routes
collectionsRouter.use(requireAuth);

/**
 * POST /collections
 * Create a new document collection
 */
collectionsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, docType, description } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ message: 'Collection name is required.' });
      return;
    }

    const userId = req.user?.sub;
    const collection = await DocumentCollectionModel.create({
      name,
      ownerId: userId,
      docType: docType || 'biomedical_literature',
      description: description || '',
    });

    await AuditLogger.log({
      eventType: 'upload',
      actorId: userId,
      payload: {
        action: 'collection_created',
        collectionId: collection._id.toString(),
        name,
        docType: collection.docType,
      },
    });

    res.status(201).json({ message: 'Collection created successfully', collection });
  } catch (error: any) {
    console.error('Error creating collection:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /collections
 * List all document collections belonging to the current user
 */
collectionsRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.sub;
    const collections = await DocumentCollectionModel.find({ ownerId: userId }).sort({
      createdAt: -1,
    });

    // Populate document count for each collection
    const enrichedCollections = await Promise.all(
      collections.map(async (c) => {
        const docCount = await DocumentModel.countDocuments({ collectionId: c._id });
        return {
          ...c.toObject(),
          documentCount: docCount,
        };
      }),
    );

    res.json({ collections: enrichedCollections });
  } catch (error: any) {
    console.error('Error listing collections:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * GET /collections/:id
 * Retrieve collection details and its attached documents
 */
collectionsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const collection = await DocumentCollectionModel.findById(req.params.id);
    if (!collection) {
      res.status(404).json({ message: 'Collection not found' });
      return;
    }

    const documents = await DocumentModel.find({ collectionId: collection._id }).sort({
      uploadedAt: 1,
    });

    res.json({ collection, documents });
  } catch (error: any) {
    console.error('Error fetching collection:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * POST /collections/:id/documents
 * Attach existing documents or upload batch of documents to a collection
 */
collectionsRouter.post('/:id/documents', async (req: Request, res: Response): Promise<void> => {
  try {
    const collection = await DocumentCollectionModel.findById(req.params.id);
    if (!collection) {
      res.status(404).json({ message: 'Collection not found' });
      return;
    }

    const userId = req.user?.sub;
    const { documentIds, documents } = req.body;

    const attachedDocIds: string[] = [];

    // 1. Attach existing document IDs
    if (Array.isArray(documentIds) && documentIds.length > 0) {
      await DocumentModel.updateMany(
        { _id: { $in: documentIds } },
        { $set: { collectionId: collection._id } },
      );
      attachedDocIds.push(...documentIds);
    }

    // 2. Batch upload new documents directly into the collection
    if (Array.isArray(documents) && documents.length > 0) {
      for (const d of documents) {
        if (d.rawText && d.sourceFilename) {
          const doc = await DocumentModel.create({
            ownerId: userId,
            docType: d.docType || collection.docType,
            rawText: d.rawText,
            sourceFilename: d.sourceFilename,
            collectionId: collection._id,
            uploadedAt: d.uploadedAt ? new Date(d.uploadedAt) : new Date(),
          });
          attachedDocIds.push(doc._id.toString());
        }
      }
    }

    const updatedDocuments = await DocumentModel.find({ collectionId: collection._id }).sort({
      uploadedAt: 1,
    });

    res.json({
      message: `Successfully attached ${attachedDocIds.length} documents to collection.`,
      collection,
      documents: updatedDocuments,
    });
  } catch (error: any) {
    console.error('Error attaching documents to collection:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});

/**
 * POST /collections/:id/summarize
 * Trigger multi-document collection summarization across all documents in collection
 */
collectionsRouter.post('/:id/summarize', async (req: Request, res: Response): Promise<void> => {
  try {
    const collection = await DocumentCollectionModel.findById(req.params.id);
    if (!collection) {
      res.status(404).json({ message: 'Collection not found' });
      return;
    }

    const modelBackend = req.body.modelBackend || 'local_clinical_model';
    const access = validateBackendAccess(modelBackend);
    if (!access.allowed) {
      res.status(403).json({ error: 'Forbidden', message: access.message });
      return;
    }

    const documents = await DocumentModel.find({ collectionId: collection._id }).sort({
      uploadedAt: 1,
    });

    if (documents.length === 0) {
      res.status(400).json({ message: 'Collection contains no documents to summarize.' });
      return;
    }

    const documentIds = documents.map((d) => d._id);

    // Create SummarizationJob
    const job = await SummarizationJobModel.create({
      documentIds,
      collectionId: collection._id,
      modelBackend,
      status: 'queued',
    });

    // Enqueue or execute synchronously for responsive API test flow
    if (process.env.NODE_ENV === 'test') {
      await processSummarizationJob(job._id.toString());
    } else {
      await enqueueSummarizationJob(job._id.toString());
    }

    await AuditLogger.log({
      eventType: 'summarize',
      actorId: req.user?.sub,
      jobId: job._id.toString(),
      payload: {
        action: 'collection_summarization_triggered',
        collectionId: collection._id.toString(),
        documentCount: documents.length,
        modelBackend,
      },
    });

    const updatedJob = await SummarizationJobModel.findById(job._id);

    res.status(201).json({
      message: 'Collection summarization job created.',
      job: updatedJob,
      jobId: job._id.toString(),
    });
  } catch (error: any) {
    console.error('Error triggering collection summarization:', error);
    res.status(500).json({ message: error.message || 'Internal server error' });
  }
});
