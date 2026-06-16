import express from 'express';
import { getReportData } from '../controllers/report.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(protect);

router.get('/dashboard', authorize('manager', 'company_manager', 'admin', 'super_admin', 'agent'), getReportData);

export default router;
