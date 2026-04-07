import express from 'express';
import * as contactController from '../controllers/contact.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';
import { uploadSingle } from '../utils/upload.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

// Static routes MUST come before /:id param routes
router.get('/stats/summary', checkPermission('view.contacts'), contactController.getContactStats);
router.get('/export/status/:jobId', checkPermission('export.contacts'), contactController.getExportStatus);
router.get('/export/download/:filename', checkPermission('export.contacts'), contactController.downloadExport);
router.post('/import', checkPlanLimit('contacts'), uploadSingle('imports', 'file'), checkPermission('import.contacts'), contactController.importContactsFromCSV);
router.post('/export', checkPermission('export.contacts'), contactController.exportContacts);

// Frontend calls DELETE / (root) with { ids } body — support both root and /delete
router.delete('/', checkPermission('delete.contacts'), contactController.bulkDeleteContacts);
router.delete('/delete', checkPermission('delete.contacts'), contactController.bulkDeleteContacts);

router.post('/', checkPlanLimit('contacts'), checkPermission('create.contacts'), contactController.createContact);
router.get('/', checkPermission('view.contacts'), contactController.getContacts);
router.get('/:id', checkPermission('view.contacts'), contactController.getContactById);
router.put('/:id', checkPermission('update.contacts'), contactController.updateContact);

export default router;
