import express from 'express';
import {
    getCompanies,
    getCompany,
    createCompany,
    updateCompany,
    deleteCompany,
    updateEmailConfig,
    testEmail,
    testImap,
    syncInboundNow,
    updateCompanyFeatures
} from '../controllers/company.controller.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

router.route('/')
    .get(getCompanies)
    .post(authorize('manager', 'company_manager', 'admin', 'super_admin'), createCompany);

router.route('/:id')
    .get(getCompany)
    .put(authorize('manager', 'company_manager', 'admin', 'super_admin'), updateCompany)
    .delete(authorize('manager', 'company_manager', 'admin', 'super_admin'), deleteCompany);

// Email configuration routes
router.route('/:id/email-config')
    .put(authorize('manager', 'company_manager', 'admin', 'super_admin'), updateEmailConfig);

router.route('/:id/test-email')
    .post(authorize('manager', 'company_manager', 'admin', 'super_admin'), testEmail);

router.route('/:id/test-imap')
    .post(authorize('manager', 'company_manager', 'admin', 'super_admin'), testImap);

router.route('/:id/inbound/sync')
    .post(authorize('manager', 'company_manager', 'admin', 'super_admin'), syncInboundNow);

// Feature management route
router.route('/:id/features')
    .put(authorize('super_admin'), updateCompanyFeatures);

export default router;
