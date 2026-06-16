import { validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import User from '../models/User.model.js';
import Company from '../models/Company.model.js';

// Generate JWT token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE
    });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                status: 'error',
                errors: errors.array()
            });
        }

        const { name, email, password, role, companyName, jobTitle, phone } = req.body;

        // Check if user exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({
                status: 'error',
                message: 'User already exists'
            });
        }

        let companyId = undefined;

        // If registering as manager, create the company
        if (role === 'company_manager') {
            if (!companyName) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Company name is required for managers'
                });
            }

            // Check if company exists
            const companyExists = await Company.findOne({ name: companyName });
            if (companyExists) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Company already exists'
                });
            }

            const newCompany = await Company.create({
                name: companyName
            });
            companyId = newCompany._id;
        }

        // Create user
        const user = await User.create({
            name,
            email,
            password,
            role: role || 'customer',
            company: companyId,
            jobTitle,
            phone
        });

        // Populate company data for response
        const populatedUser = await User.findById(user._id).populate('company');

        // Generate token
        const token = generateToken(user._id);

        // Check if manager needs to complete company setup
        const needsSetup = role === 'company_manager' && companyId;

        res.status(201).json({
            status: 'success',
            data: {
                user: {
                    id: populatedUser._id,
                    name: populatedUser.name,
                    email: populatedUser.email,
                    role: populatedUser.role,
                    company: populatedUser.company
                },
                token,
                needsSetup
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                status: 'error',
                errors: errors.array()
            });
        }

        const { email, password } = req.body;

        // Check for user
        const user = await User.findOne({ email }).select('+password').populate('company');
        if (!user) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid credentials'
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid credentials'
            });
        }

        // Generate token
        const token = generateToken(user._id);

        // Check if manager needs to complete company setup
        const needsSetup = user.role === 'company_manager' && user.company && !user.company.setupCompleted;

        res.status(200).json({
            status: 'success',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    company: user.company
                },
                token,
                needsSetup
            }
        });
        // Update last login
        user.lastLogin = new Date();
        await user.save();
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        res.status(200).json({
            status: 'success',
            data: {
                user
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};
