import Company from '../models/Company.model.js';
import User from '../models/User.model.js';
import Ticket from '../models/Ticket.model.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { testEmailConfig } from '../services/email.service.js';
import { syncInboundEmailForCompany, testImapConnectionForCompany } from '../services/inboundEmail.service.js';

// @desc    Get all companies
// @route   GET /api/companies
// @access  Private
export const getCompanies = async (req, res) => {
    try {
        const { type, search } = req.query;
        let query = {};

        // If manager, only show their own company OR companies they created
        if (req.user.role === 'company_manager') {
            const managerFilter = {
                $or: [
                    { _id: req.user.company },
                    { createdBy: req.user.id }
                ]
            };

            // If type filter is provided, combine it with manager filter
            if (type) {
                query = {
                    $and: [
                        managerFilter,
                        { type: type }
                    ]
                };
            } else {
                query = managerFilter;
            }
        } else {
            // For super admin, just apply type filter if provided
            if (type) {
                query.type = type;
            }
        }

        if (search && search.trim()) {
            const trimmedSearch = search.trim();
            const searchRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            query.$or = [
                { name: searchRegex },
                { domain: searchRegex },
                { industry: searchRegex }
            ];
        }

        const page = parseInt(req.query.page, 10);
        const limit = parseInt(req.query.limit, 10);
        const shouldPaginate = Number.isInteger(page) || Number.isInteger(limit);
        const currentPage = Number.isInteger(page) && page > 0 ? page : 1;
        const pageSize = Number.isInteger(limit) && limit > 0 ? limit : 12;
        const skip = (currentPage - 1) * pageSize;

        const total = shouldPaginate ? await Company.countDocuments(query) : 0;

        const companyQuery = Company.find(query).sort({ createdAt: -1 });
        if (shouldPaginate) {
            companyQuery.skip(skip).limit(pageSize);
        }

        const companies = await companyQuery;

        // Add statistics for each company
        const companiesWithStats = await Promise.all(companies.map(async (company) => {
            const companyObj = company.toObject();

            // Count tickets for this company
            const ticketCount = await Ticket.countDocuments({ companyId: company._id });

            // Count agents (users with role 'agent' in this company)
            const agentCount = await User.countDocuments({
                company: company._id,
                role: 'agent'
            });

            // Count contacts (users with role 'customer' in this company)
            const contactCount = await User.countDocuments({
                company: company._id,
                role: 'customer'
            });

            return {
                ...companyObj,
                ticketCount,
                agentCount,
                contactCount
            };
        }));

        res.status(200).json({
            status: 'success',
            data: { companies: companiesWithStats },
            ...(shouldPaginate ? {
                pagination: {
                    total,
                    page: currentPage,
                    pages: Math.max(1, Math.ceil(total / pageSize)),
                    limit: pageSize
                }
            } : {})
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Get single company
// @route   GET /api/companies/:id
// @access  Private
export const getCompany = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);

        if (!company) {
            return res.status(404).json({
                status: 'error',
                message: 'Company not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: { company }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Create new company
// @route   POST /api/companies
// @access  Private/Manager
export const createCompany = async (req, res) => {
    try {
        const { name, domain, industry, notes, type } = req.body;

        const companyExists = await Company.findOne({
            name,
            createdBy: req.user.id
        });

        if (companyExists) {
            return res.status(400).json({
                status: 'error',
                message: 'Company already exists'
            });
        }

        const company = await Company.create({
            name,
            domain,
            industry,
            notes,
            type: type || 'client-company',
            createdBy: req.user.id
        });

        res.status(201).json({
            status: 'success',
            data: { company }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Update company
// @route   PUT /api/companies/:id
// @access  Private/Manager
export const updateCompany = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);

        if (!company) {
            return res.status(404).json({
                status: 'error',
                message: 'Company not found'
            });
        }

        // If domain and industry are provided, mark setup as completed
        const updateData = { ...req.body };
        if (updateData.domain && updateData.industry && !company.setupCompleted) {
            updateData.setupCompleted = true;
        }

        const updatedCompany = await Company.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        res.status(200).json({
            status: 'success',
            data: { company: updatedCompany }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Delete company
// @route   DELETE /api/companies/:id
// @access  Private/Manager
export const deleteCompany = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);

        if (!company) {
            return res.status(404).json({
                status: 'error',
                message: 'Company not found'
            });
        }

        // Check if company has associated users
        const hasUsers = await User.exists({ company: req.params.id });
        if (hasUsers) {
            return res.status(400).json({
                status: 'error',
                message: 'Cannot delete company with associated users. Please reassign or delete the users first.'
            });
        }

        await company.deleteOne();

        res.status(200).json({
            status: 'success',
            message: 'Company deleted'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Update company email configuration
// @route   PUT /api/companies/:id/email-config
// @access  Private (Manager of the company)
export const updateEmailConfig = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);

        if (!company) {
            return res.status(404).json({
                status: 'error',
                message: 'Company not found'
            });
        }

        // Check authorization
        if (req.user.role !== 'super_admin' &&
            req.user.company?.toString() !== req.params.id) {
            return res.status(403).json({
                status: 'error',
                message: 'Not authorized to update this company'
            });
        }

        const {
            enabled,
            provider,
            host,
            port,
            secure,
            user,
            pass,
            from,
            inboundEnabled,
            imapHost,
            imapPort,
            imapSecure,
            imapUser,
            imapPass,
            inboxFolder,
            notifications
        } = req.body;

        // Encrypt password if provided
        const emailConfig = {
            enabled: enabled || false,
            provider: provider || company.emailConfig?.provider || 'custom',
            host,
            port,
            secure,
            user,
            from,
            inboundEnabled: inboundEnabled || false,
            imapHost,
            imapPort,
            imapSecure,
            imapUser,
            inboxFolder: inboxFolder || company.emailConfig?.inboxFolder || 'INBOX',
            lastUid: company.emailConfig?.lastUid || 0,
            lastInboundSyncAt: company.emailConfig?.lastInboundSyncAt,
            notifications: notifications || {}
        };

        // Only encrypt and update password if a new one is provided
        if (pass) {
            emailConfig.pass = encrypt(pass);
        } else if (company.emailConfig?.pass) {
            // Keep existing encrypted password if no new password provided
            emailConfig.pass = company.emailConfig.pass;
        }

        if (imapPass) {
            emailConfig.imapPass = encrypt(imapPass);
        } else if (company.emailConfig?.imapPass) {
            emailConfig.imapPass = company.emailConfig.imapPass;
        }

        company.emailConfig = emailConfig;
        await company.save();

        // Return config without password
        const safeConfig = {
            ...company.emailConfig.toObject(),
            pass: undefined
        };
        safeConfig.imapPass = undefined;

        res.status(200).json({
            status: 'success',
            data: { emailConfig: safeConfig }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Test email configuration
// @route   POST /api/companies/:id/test-email
// @access  Private (Manager of the company)
export const testEmail = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);

        if (!company) {
            return res.status(404).json({
                status: 'error',
                message: 'Company not found'
            });
        }

        // Check authorization
        if (req.user.role !== 'super_admin' &&
            req.user.company?.toString() !== req.params.id) {
            return res.status(403).json({
                status: 'error',
                message: 'Not authorized to test this company email'
            });
        }

        const { testRecipient } = req.body;

        if (!testRecipient) {
            return res.status(400).json({
                status: 'error',
                message: 'Test recipient email is required'
            });
        }

        // Decrypt password for testing
        const emailConfig = {
            host: company.emailConfig.host,
            port: company.emailConfig.port,
            secure: company.emailConfig.secure,
            user: company.emailConfig.user,
            pass: decrypt(company.emailConfig.pass),
            from: company.emailConfig.from
        };

        const result = await testEmailConfig(emailConfig, testRecipient);

        res.status(result.success ? 200 : 400).json({
            status: result.success ? 'success' : 'error',
            message: result.message
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Test IMAP configuration (inbound)
// @route   POST /api/companies/:id/test-imap
// @access  Private (Manager of the company)
export const testImap = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);

        if (!company) {
            return res.status(404).json({
                status: 'error',
                message: 'Company not found'
            });
        }

        // Check authorization
        if (req.user.role !== 'super_admin' &&
            req.user.company?.toString() !== req.params.id) {
            return res.status(403).json({
                status: 'error',
                message: 'Not authorized to test this company email'
            });
        }

        const result = await testImapConnectionForCompany(company);
        res.status(200).json({
            status: 'success',
            message: result.message
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: `IMAP test failed: ${error.message}`
        });
    }
};

// @desc    Sync inbound emails now (create tickets)
// @route   POST /api/companies/:id/inbound/sync
// @access  Private (Manager of the company)
export const syncInboundNow = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);

        if (!company) {
            return res.status(404).json({
                status: 'error',
                message: 'Company not found'
            });
        }

        // Check authorization
        if (req.user.role !== 'super_admin' &&
            req.user.company?.toString() !== req.params.id) {
            return res.status(403).json({
                status: 'error',
                message: 'Not authorized to sync this company inbox'
            });
        }

        const { synced } = await syncInboundEmailForCompany(company);
        res.status(200).json({
            status: 'success',
            data: { synced }
        });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            message: `Inbound sync failed: ${error.message}`
        });
    }
};

// @desc    Update company features
// @route   PUT /api/companies/:id/features
// @access  Private (Super Admin only)
export const updateCompanyFeatures = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);

        if (!company) {
            return res.status(404).json({
                status: 'error',
                message: 'Company not found'
            });
        }

        // Only super admin can update features
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Only super admins can manage company features'
            });
        }

        const { features } = req.body;

        // Update features
        if (features) {
            company.features = {
                ...company.features,
                ...features
            };
        }

        await company.save();

        res.status(200).json({
            status: 'success',
            data: { company }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};
