import express from 'express';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUsers
} from '../controllers/user.controller.js';
import { authenticateUser, authorizeAdmin, authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.post('/', authenticate, checkPermission('create.users'), createUser);

router.get('/', authenticate, checkPermission('view.users'), getAllUsers);

router.get('/:id', authenticate, checkPermission('view.users'), getUserById);

router.put('/:id', authenticate, checkPermission('update.users'), updateUser);

router.delete('/', authenticate, checkPermission('delete.users'), deleteUsers);

export default router;

