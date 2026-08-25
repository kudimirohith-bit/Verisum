"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectionsRouter = void 0;
const express_1 = require("express");
const middleware_js_1 = require("../auth/middleware.js");
const DocumentCollection_js_1 = require("../models/DocumentCollection.js");
const Document_js_1 = require("../models/Document.js");
const SummarizationJob_js_1 = require("../models/SummarizationJob.js");
const processor_js_1 = require("../jobs/processor.js");
const queue_js_1 = require("../jobs/queue.js");
const AuditLogger_js_1 = require("../audit/AuditLogger.js");
exports.collectionsRouter = (0, express_1.Router)();
// Apply auth middleware to all collection routes
exports.collectionsRouter.use(middleware_js_1.requireAuth);
/**
 * POST /collections
 * Create a new document collection
 */
exports.collectionsRouter.post('/', async (req, res) => {
    try {
        const { name, docType, description } = req.body;
        if (!name || typeof name !== 'string') {
            res.status(400).json({ message: 'Collection name is required.' });
            return;
        }
        const userId = req.user?.sub;
        const collection = await DocumentCollection_js_1.DocumentCollectionModel.create({
            name,
            ownerId: userId,
            docType: docType || 'biomedical_literature',
            description: description || '',
        });
        await AuditLogger_js_1.AuditLogger.log({
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
    }
    catch (error) {
        console.error('Error creating collection:', error);
        res.status(500).json({ message: error.message || 'Internal server error' });
    }
});
/**
 * GET /collections
 * List all document collections belonging to the current user
 */
exports.collectionsRouter.get('/', async (req, res) => {
    try {
        const userId = req.user?.sub;
        const collections = await DocumentCollection_js_1.DocumentCollectionModel.find({ ownerId: userId }).sort({
            createdAt: -1,
        });
        // Populate document count for each collection
        const enrichedCollections = await Promise.all(collections.map(async (c) => {
            const docCount = await Document_js_1.DocumentModel.countDocuments({ collectionId: c._id });
            return {
                ...c.toObject(),
                documentCount: docCount,
            };
        }));
        res.json({ collections: enrichedCollections });
    }
    catch (error) {
        console.error('Error listing collections:', error);
        res.status(500).json({ message: error.message || 'Internal server error' });
    }
});
/**
 * GET /collections/:id
 * Retrieve collection details and its attached documents
 */
exports.collectionsRouter.get('/:id', async (req, res) => {
    try {
        const collection = await DocumentCollection_js_1.DocumentCollectionModel.findById(req.params.id);
        if (!collection) {
            res.status(404).json({ message: 'Collection not found' });
            return;
        }
        const documents = await Document_js_1.DocumentModel.find({ collectionId: collection._id }).sort({
            uploadedAt: 1,
        });
        res.json({ collection, documents });
    }
    catch (error) {
        console.error('Error fetching collection:', error);
        res.status(500).json({ message: error.message || 'Internal server error' });
    }
});
/**
 * POST /collections/:id/documents
 * Attach existing documents or upload batch of documents to a collection
 */
exports.collectionsRouter.post('/:id/documents', async (req, res) => {
    try {
        const collection = await DocumentCollection_js_1.DocumentCollectionModel.findById(req.params.id);
        if (!collection) {
            res.status(404).json({ message: 'Collection not found' });
            return;
        }
        const userId = req.user?.sub;
        const { documentIds, documents } = req.body;
        const attachedDocIds = [];
        // 1. Attach existing document IDs
        if (Array.isArray(documentIds) && documentIds.length > 0) {
            await Document_js_1.DocumentModel.updateMany({ _id: { $in: documentIds } }, { $set: { collectionId: collection._id } });
            attachedDocIds.push(...documentIds);
        }
        // 2. Batch upload new documents directly into the collection
        if (Array.isArray(documents) && documents.length > 0) {
            for (const d of documents) {
                if (d.rawText && d.sourceFilename) {
                    const doc = await Document_js_1.DocumentModel.create({
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
        const updatedDocuments = await Document_js_1.DocumentModel.find({ collectionId: collection._id }).sort({
            uploadedAt: 1,
        });
        res.json({
            message: `Successfully attached ${attachedDocIds.length} documents to collection.`,
            collection,
            documents: updatedDocuments,
        });
    }
    catch (error) {
        console.error('Error attaching documents to collection:', error);
        res.status(500).json({ message: error.message || 'Internal server error' });
    }
});
/**
 * POST /collections/:id/summarize
 * Trigger multi-document collection summarization across all documents in collection
 */
exports.collectionsRouter.post('/:id/summarize', async (req, res) => {
    try {
        const collection = await DocumentCollection_js_1.DocumentCollectionModel.findById(req.params.id);
        if (!collection) {
            res.status(404).json({ message: 'Collection not found' });
            return;
        }
        const documents = await Document_js_1.DocumentModel.find({ collectionId: collection._id }).sort({
            uploadedAt: 1,
        });
        if (documents.length === 0) {
            res.status(400).json({ message: 'Collection contains no documents to summarize.' });
            return;
        }
        const modelBackend = req.body.modelBackend || 'local_clinical_model';
        const documentIds = documents.map((d) => d._id);
        // Create SummarizationJob
        const job = await SummarizationJob_js_1.SummarizationJobModel.create({
            documentIds,
            collectionId: collection._id,
            modelBackend,
            status: 'queued',
        });
        // Enqueue or execute synchronously for responsive API test flow
        if (process.env.NODE_ENV === 'test') {
            await (0, processor_js_1.processSummarizationJob)(job._id.toString());
        }
        else {
            await (0, queue_js_1.enqueueSummarizationJob)(job._id.toString());
        }
        await AuditLogger_js_1.AuditLogger.log({
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
        const updatedJob = await SummarizationJob_js_1.SummarizationJobModel.findById(job._id);
        res.status(201).json({
            message: 'Collection summarization job created.',
            job: updatedJob,
            jobId: job._id.toString(),
        });
    }
    catch (error) {
        console.error('Error triggering collection summarization:', error);
        res.status(500).json({ message: error.message || 'Internal server error' });
    }
});
