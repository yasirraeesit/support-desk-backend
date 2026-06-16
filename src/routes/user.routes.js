import express from 'express';
import { getUsers, getUser, createUser, updateUser, deleteUser } from '../controllers/user.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// @route   GET /api/users
// @desc    Get all users
// @access  Private (Admin/Manager)
router.get('/', authorize('super_admin', 'admin', 'manager', 'company_manager', 'agent'), getUsers);

// @route   POST /api/users
// @desc    Create new user
// @access  Private (Admin/Manager)
router.post('/', authorize('super_admin', 'admin', 'manager', 'company_manager', 'agent'), createUser);

// @route   GET /api/users/:id
// @desc    Get single user
// @access  Private
router.get('/:id', getUser);

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private (Admin/Manager or own profile)
router.put('/:id', updateUser);

// @route   DELETE /api/users/:id
// @desc    Delete user
// @access  Private (Admin only)
router.delete('/:id', authorize('super_admin', 'admin'), deleteUser);

export default router;
