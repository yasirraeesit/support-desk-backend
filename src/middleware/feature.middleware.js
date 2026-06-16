import Company from '../models/Company.model.js';

/**
 * Middleware to check if a company has access to a specific feature
 * @param {string} featureName - Name of the feature to check
 * @returns {Function} Express middleware function
 */
export const requireFeature = (featureName) => {
    return async (req, res, next) => {
        try {
            // Skip feature check for super admins
            if (req.user.role === 'super_admin') {
                return next();
            }

            // Get user's company
            if (!req.user.company) {
                return res.status(403).json({
                    status: 'error',
                    message: 'No company associated with your account'
                });
            }

            const company = await Company.findById(req.user.company);

            if (!company) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Company not found'
                });
            }

            // Check if feature is enabled
            if (!company.features || company.features[featureName] !== true) {
                return res.status(403).json({
                    status: 'error',
                    message: `This feature is not available in your plan. Please contact your administrator to enable '${featureName}'.`
                });
            }

            next();
        } catch (error) {
            return res.status(500).json({
                status: 'error',
                message: error.message
            });
        }
    };
};
