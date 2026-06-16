import Ticket from '../models/Ticket.model.js';
import User from '../models/User.model.js';

// @desc    Get aggregated report data
// @route   GET /api/reports/dashboard
// @access  Private
export const getReportData = async (req, res) => {
    try {
        const { range = '7d' } = req.query;
        const now = new Date();
        let startDate = new Date();

        switch (range) {
            case '30d':
                startDate.setDate(now.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(now.getDate() - 90);
                break;
            case '1y':
                startDate.setFullYear(now.getFullYear() - 1);
                break;
            default: // 7d
                startDate.setDate(now.getDate() - 7);
        }

        // 1. Ticket Volume (Daily)
        const volumeStats = await Ticket.aggregate([
            {
                $match: {
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    tickets: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            { $project: { date: '$_id', tickets: 1, _id: 0 } }
        ]);

        // 2. Created vs Resolved (by week/period)
        // Simplified: Total created vs resolved in the period
        const createdCount = await Ticket.countDocuments({ createdAt: { $gte: startDate } });
        const resolvedCount = await Ticket.countDocuments({
            status: 'resolved',
            updatedAt: { $gte: startDate }
        });

        // 3. Status Distribution
        const statusStats = await Ticket.aggregate([
            { $group: { _id: '$status', value: { $sum: 1 } } }
        ]);

        // 4. Agent Performance (Top Agents)
        const agentStats = await Ticket.aggregate([
            { $match: { assignedTo: { $ne: null } } },
            {
                $group: {
                    _id: '$assignedTo',
                    resolved: {
                        $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
                    },
                    total: { $sum: 1 }
                }
            },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'agent' } },
            { $unwind: '$agent' },
            {
                $project: {
                    name: '$agent.name',
                    resolved: 1,
                    total: 1,
                    satisfaction: { $literal: 95 }, // Placeholder
                    avgTime: { $literal: '2h 15m' } // Placeholder
                }
            },
            { $sort: { resolved: -1 } },
            { $limit: 5 }
        ]);

        res.status(200).json({
            status: 'success',
            data: {
                volume: volumeStats,
                summary: {
                    created: createdCount,
                    resolved: resolvedCount
                },
                statusDistribution: statusStats.map(s => ({ name: s._id, value: s.value })),
                agentPerformance: agentStats
            }
        });

    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};
