import User from '../models/User.model.js';
import Company from '../models/Company.model.js';

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    Get all users
// @route   GET /api/users
// @access  Private (Admin/Manager)
export const getUsers = async (req, res) => {
    try {
        const { role, companyId, search } = req.query;
        let query = {};

        if (role) {
            // Support comma-separated roles
            const roles = role.split(',');
            if (roles.length > 1) {
                query.role = { $in: roles };
            } else {
                query.role = role;
            }
        }

        // If manager, force query to their company and its client companies
        if (req.user.role === 'company_manager') {
            const userCompany = await Company.findById(req.user.company);
            let companyIds = [req.user.company];

            if (userCompany && userCompany.type === 'main-company') {
                const clientCompanies = await Company.find({ parentCompany: userCompany._id });
                companyIds = [...companyIds, ...clientCompanies.map(c => c._id)];
            }

            query.company = { $in: companyIds };
        } else if (companyId) {
            query.company = companyId;
        }

        if (search && search.trim()) {
            const trimmedSearch = search.trim();
            const searchRegex = new RegExp(escapeRegex(trimmedSearch), 'i');
            const matchingCompanyIds = await Company.distinct('_id', {
                name: searchRegex
            });

            query.$or = [
                { name: searchRegex },
                { email: searchRegex },
                { phone: searchRegex },
                { jobTitle: searchRegex },
            ];

            if (matchingCompanyIds.length > 0) {
                query.$or.push({ company: { $in: matchingCompanyIds } });
            }
        }

        const page = parseInt(req.query.page, 10);
        const limit = parseInt(req.query.limit, 10);
        const shouldPaginate = Number.isInteger(page) || Number.isInteger(limit);
        const currentPage = Number.isInteger(page) && page > 0 ? page : 1;
        const pageSize = Number.isInteger(limit) && limit > 0 ? limit : 20;
        const skip = (currentPage - 1) * pageSize;

        const total = shouldPaginate ? await User.countDocuments(query) : 0;

        const usersQuery = User.find(query)
            .select('-password')
            .populate('company', 'name domain');

        if (shouldPaginate) {
            usersQuery.skip(skip).limit(pageSize);
        }

        const users = await usersQuery;

        const response = {
            status: 'success',
            results: users.length,
            data: { users }
        };

        if (shouldPaginate) {
            response.pagination = {
                total,
                page: currentPage,
                pages: Math.max(1, Math.ceil(total / pageSize)),
                limit: pageSize
            };
        }

        res.status(200).json(response);
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Create new user (admin/manager)
// @route   POST /api/users
// @access  Private (Admin/Manager)
export const createUser = async (req, res) => {
    try {
        const { name, email, password, role, company, phone, jobTitle } = req.body;

        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({
                status: 'error',
                message: 'User already exists'
            });
        }

        let userRole = role || 'customer';
        let userCompany = company;

        // Security check for Managers
        if (req.user.role === 'company_manager') {
            // Managers can only create users for their own company
            userCompany = req.user.company;

            // Managers can only create 'agent' or 'customer' roles
            if (!['agent', 'customer'].includes(userRole)) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Managers can only create Agents or Customers'
                });
            }
        }

        const user = await User.create({
            name,
            email,
            password: password || '123456', // Default password if not provided
            role: userRole,
            company: userCompany,
            phone,
            jobTitle
        });

        res.status(201).json({
            status: 'success',
            data: { user }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private
export const getUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password')
            .populate('company', 'name domain');

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: { user }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private
export const updateUser = async (req, res) => {
    try {
        // Check if user is updating their own profile or is admin
        if (req.params.id !== req.user.id.toString() &&
            !['super_admin', 'admin', 'company_manager'].includes(req.user.role)) {
            return res.status(403).json({
                status: 'error',
                message: 'Not authorized to update this user'
            });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: { user }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Admin only)
export const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        await user.deleteOne();

        res.status(200).json({
            status: 'success',
            message: 'User deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};
