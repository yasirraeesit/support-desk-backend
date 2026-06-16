import express from 'express';
import {
    getTickets,
    getTicket,
    createTicket,
    updateTicket,
    deleteTicket,
    addComment,
    getTicketStats,
    forwardTicket
} from '../controllers/ticket.controller.js';
import { protect } from '../middleware/auth.middleware.js';

import upload from '../middleware/upload.middleware.js';

const router = express.Router();

// All routes are protected
router.use(protect);

// @route   GET /api/tickets
// @desc    Get all tickets
// @access  Private
router.get('/', getTickets);

// @route   GET /api/tickets/stats
// @desc    Get ticket statistics
// @access  Private
router.get('/stats', getTicketStats);

// @route   GET /api/tickets/:id
// @desc    Get single ticket
// @access  Private
router.get('/:id', getTicket);

// @route   POST /api/tickets
// @desc    Create new ticket
// @access  Private
router.post('/', upload.array('attachments', 5), createTicket);

// @route   PUT /api/tickets/:id
// @desc    Update ticket
// @access  Private
router.put('/:id', updateTicket);

// @route   DELETE /api/tickets/:id
// @desc    Delete ticket
// @access  Private
router.delete('/:id', deleteTicket);

// @route   POST /api/tickets/:id/comments
// @desc    Add comment to ticket
// @access  Private
router.post('/:id/comments', upload.array('attachments', 5), addComment);

// @route   POST /api/tickets/:id/forward
// @desc    Forward ticket via email
// @access  Private
router.post('/:id/forward', forwardTicket);

export default router;
