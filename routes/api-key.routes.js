import express from 'express';
import apiKeyController from '../controllers/api-key.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.post('/', authenticate, checkPermission('create.api_key'), apiKeyController.createApiKey);
router.get('/', authenticate, checkPermission('view.api_key'), apiKeyController.listApiKeys);
router.post('/delete', authenticate, checkPermission('delete.api_key'), apiKeyController.deleteApiKey);

export default router;

    