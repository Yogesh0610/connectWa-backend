import express from 'express';
import {
    getAllModels,
    getModelById,
    createModel,
    updateModel,
    bulkDeleteModels,
    toggleModelStatus,
    testModelApi
} from '../controllers/ai-model.controller.js';
import { checkPermission } from '../middlewares/permission.js';
import { authenticate, authorizeAdmin } from '../middlewares/auth.js';

const router = express.Router();


router.get('/models', authenticate, checkPermission('view.ai_models'), getAllModels);
router.get('/models/:id', authenticate, checkPermission('view.ai_models'), getModelById);
router.post('/models', authenticate, checkPermission('create.ai_models'), createModel);
router.put('/models/:id', authenticate, checkPermission('update.ai_models'), updateModel);
router.post('/delete', authenticate, checkPermission('delete.ai_models'), bulkDeleteModels);
router.patch('/models/:id/status', authenticate, checkPermission('update.ai_models'), toggleModelStatus);
router.post('/models/test', authenticate, checkPermission('create.ai_models'), testModelApi);

export default router;
