import mongoose from 'mongoose';
import Ticket from '../models/Ticket.model.js';
import Company from '../models/Company.model.js';
import User from '../models/User.model.js';
import { sendEmail, generateTicketReplyEmail, generateNewTicketEmail } from '../services/email.service.js';

// @desc    Get all tickets
// @route   GET /api/tickets
// @access  Private
export const getTickets = async (req, res) => {
    try {
        // Sanitize query params to remove 'undefined', 'null' or 'any' strings
        const params = { ...req.query };
        Object.keys(params).forEach(key => {
            if (params[key] === 'undefined' || params[key] === 'null' || params[key] === 'any') {
                delete params[key];
            }
        });

        const { status, priority, assignedTo, createdBy, company, search } = params;

        // Build query
        let query = {};

        // Restrict Admin from seeing tickets
        if (req.user.role === 'admin') {
            return res.status(200).json({
                status: 'success',
                results: 0,
                data: { tickets: [] }
            });
        }

        // Filter by role
        if (req.user.role === 'customer') {
            query.createdBy = req.user.id;
        } else if (req.user.role === 'company_manager' || req.user.role === 'agent') {
            // Managers and Agents see tickets for:
            // 1. Their Employer Company
            // 2. Client Companies if they are part of a Main Company
            // 3. For Managers: Client Companies they created
            // 4. Any ticket assigned to them

            let allowedCompanyNames = [];

            // 1. Get Employer Company
            if (req.user.company) {
                const employerCompany = await Company.findById(req.user.company);
                if (employerCompany) {
                    allowedCompanyNames.push(employerCompany.name);

                    // 2. If Main Company, include its own Client Companies
                    if (employerCompany.type === 'main-company') {
                        const clientCompanies = await Company.find({ parentCompany: employerCompany._id });
                        const clientNames = clientCompanies.map(c => c.name);
                        allowedCompanyNames = [...allowedCompanyNames, ...clientNames];
                    }
                }
            }

            // 3. For Managers: Get Client Companies created by Manager (if not already included)
            if (req.user.role === 'company_manager') {
                const createdCompanies = await Company.find({ createdBy: req.user.id });
                const createdCompanyNames = createdCompanies.map(c => c.name);
                allowedCompanyNames = [...new Set([...allowedCompanyNames, ...createdCompanyNames])];
            }

            // 4. Construct Query
            let companyMatch = { company: { $in: allowedCompanyNames } };

            if (req.user.role === 'agent') {
                // Strict view: Only tickets assigned to this agent
                query.assignedTo = req.user.id;
            } else if (req.user.role === 'company_manager' && employerCompany && employerCompany.type === 'main-company') {
                // Main Company Manager: Involvement rule for other companies
                const companyAgents = await User.find({ company: employerCompany._id, role: 'agent' });
                const agentIds = [req.user.id, ...companyAgents.map(a => a._id)];
                const agentEmails = [req.user.email.toLowerCase(), ...companyAgents.map(a => a.email.toLowerCase())];

                const employerCompanyName = employerCompany.name;
                const otherCompanyNames = allowedCompanyNames.filter(c => c !== employerCompanyName);

                query.$or = [
                    { company: employerCompanyName }, // Full access to own company
                    {
                        company: { $in: otherCompanyNames },
                        $or: [
                            { createdBy: { $in: agentIds } },
                            { assignedTo: { $in: agentIds } },
                            { to: { $in: agentEmails } },
                            { cc: { $in: agentEmails } }
                        ]
                    },
                    { assignedTo: req.user.id },
                    { createdBy: req.user.id }
                ];
            } else {
                // Regular Manager or Staff
                query.company = { $in: allowedCompanyNames };
            }
        }

        // Additional filters
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            query.$or = query.$or || [];
            query.$or.push(
                { subject: searchRegex },
                { ticketNumber: searchRegex }
            );
        }
        if (assignedTo) {
            if (assignedTo === 'unassigned') {
                query.assignedTo = { $exists: false };
            } else {
                query.assignedTo = assignedTo;
            }
        }
        if (createdBy) query.createdBy = createdBy;
        if (company) query.company = { $regex: company, $options: 'i' }; // Case insensitive search

        // Pagination
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const skip = (page - 1) * limit;

        const total = await Ticket.countDocuments(query);
        const pages = Math.ceil(total / limit);

        const tickets = await Ticket.find(query)
            .populate('createdBy', 'name email')
            .populate('assignedTo', 'name email')
            .select({ comments: { $slice: -1 } }) // Get only the last comment
            .populate('comments.user', 'name email role') // Populate user details for that comment
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            status: 'success',
            results: tickets.length,
            pagination: {
                total,
                page,
                pages,
                limit
            },
            data: { tickets }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Get single ticket
// @route   GET /api/tickets/:id
// @access  Private
export const getTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id)
            .populate('createdBy', 'name email')
            .populate('assignedTo', 'name email')
            .populate('comments.user', 'name email');

        if (!ticket) {
            return res.status(404).json({
                status: 'error',
                message: 'Ticket not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: { ticket }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Create new ticket
// @route   POST /api/tickets
// @access  Private
export const createTicket = async (req, res) => {
    try {
        let creatorId = req.user.id;

        // Allow agents/admins/managers to create tickets on behalf of others
        if (['agent', 'admin', 'super_admin', 'company_manager'].includes(req.user.role) && req.body.createdBy) {
            creatorId = req.body.createdBy;
        }

        // Fetch creator's details to get company info
        const creator = await User.findById(creatorId).populate('company');

        // Check if ticketing is enabled for this company
        if (creator.company && creator.company.features) {
            // Check Map or Object. If Map, use .get(), if Object usage direct access via key.
            // Model definition said Map of Boolean, but Mongoose Maps are accessed via .get() in code usually, 
            // OR if it was just an object in schema Features: { type: Map, of: Boolean } -> .get('ticketing')
            // Let's check Schema quickly or assume object access if toJSON/toObject virtuals apply, 
            // but safer to try both or debug. Mongoose Maps need .get().
            // Wait, schema was: features: { type: Map, of: Boolean, default: {} }
            // So we must use .get('ticketing').

            const ticketingEnabled = creator.company.features.get ? creator.company.features.get('ticketing') : (creator.company.features.ticketing ?? true);

            // Default is true if not set? Or false? Schema default was empty object.
            // Let's assume default is TRUE if undefined? Or FALSE? 
            // If the map is empty, .get('ticketing') is undefined.
            // In frontend logic we used ?? true. Let's align.
            if (ticketingEnabled === false) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Ticketing system is disabled for your company.'
                });
            }
        }

        const ticketData = {
            ...req.body,
            createdBy: creatorId,
            status: 'open',
            companyId: creator.company ? creator.company._id : undefined,
            company: creator.company ? creator.company.name : '',
            to: req.body.to ? (typeof req.body.to === 'string' ? req.body.to.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : req.body.to.map(e => e.toLowerCase())) : [],
            cc: req.body.cc ? (typeof req.body.cc === 'string' ? req.body.cc.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : req.body.cc.map(e => e.toLowerCase())) : []
        };

        // Handle attachments
        if (req.files && req.files.length > 0) {
            ticketData.attachments = req.files.map(file => ({
                filename: file.originalname,
                url: `/uploads/${file.filename}`, // In production, this would be S3 URL
                uploadedAt: Date.now()
            }));
        }

        const ticket = await Ticket.create(ticketData);

        // Send Email Notification to Creator (and potential CCs if passed)
        try {
            // Get Company for email settings
            let company = null;
            if (creator.company) {
                // Already populated above
                company = creator.company;
            } else if (ticketData.companyId) {
                company = await Company.findById(ticketData.companyId);
            }

            // Check if notification is enabled (default to true if not specified)
            const isEnabled = company?.emailConfig?.notifications?.new_ticket_requester?.enabled ?? true;

            if (isEnabled) {
                const emailHtml = generateNewTicketEmail(ticket, creator);

                // Recipients: Creator + any To/CC provided in body (if UI supports it)
                // Note: Frontend might strictly be using 'addComment' for CC, but if creating new ticket, 
                // we usually send to creator.
                const recipients = [creator.email];

                // If body has to/cc (optional support)
                if (req.body.cc) {
                    const ccs = typeof req.body.cc === 'string' ? req.body.cc.split(',') : req.body.cc;
                    recipients.push(...ccs);
                }

                for (const recipient of recipients) {
                    if (!recipient) continue;
                    await sendEmail(company, {
                        to: recipient,
                        subject: `Request Received: ${ticket.subject} [#${ticket.ticketNumber || ticket._id.toString().slice(-6)}]`,
                        html: emailHtml,
                        text: `Ticket Created: ${ticket.subject}`
                    });
                }
            }
        } catch (emailError) {
            console.error("Failed to send ticket creation email:", emailError);
            // Non-blocking error
        }

        res.status(201).json({
            status: 'success',
            data: { ticket }
        });
    } catch (error) {
        console.error("Create Ticket Error:", error);
        console.error("Request Body:", req.body);
        console.error("User:", req.user);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Update ticket
// @route   PUT /api/tickets/:id
// @access  Private
export const updateTicket = async (req, res) => {
    try {
        let ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                status: 'error',
                message: 'Ticket not found'
            });
        }

        // Update resolved date if status changed to resolved
        if (req.body.status === 'resolved' && ticket.status !== 'resolved') {
            req.body.resolvedAt = new Date();
        }

        ticket = await Ticket.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('createdBy', 'name email').populate('assignedTo', 'name email');

        res.status(200).json({
            status: 'success',
            data: { ticket }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Add comment to ticket
// @route   POST /api/tickets/:id/comments
// @access  Private
export const addComment = async (req, res) => {
    try {
        const { message, isInternal, to, cc } = req.body;

        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                status: 'error',
                message: 'Ticket not found'
            });
        }

        // Helper to normalize recipients (handle FormData string vs array)
        const parseRecipients = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val;
            if (typeof val === 'string') {
                try {
                    // Try parsing as JSON array first (e.g. "['a','b']")
                    const parsed = JSON.parse(val);
                    if (Array.isArray(parsed)) return parsed;
                } catch (e) {
                    // If not JSON, treat as single value or comma-separated
                    return val.split(',').map(s => s.trim()).filter(Boolean);
                }
                return [val];
            }
            return [];
        };

        const toEmails = parseRecipients(to);
        const ccEmails = parseRecipients(cc);

        const parseBool = (val, defaultValue = false) => {
            if (val == null) return defaultValue;
            if (typeof val === 'boolean') return val;
            const normalized = String(val).trim().toLowerCase();
            if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
            if (['0', 'false', 'no', 'n', 'off', ''].includes(normalized)) return false;
            return defaultValue;
        };

        // FormData sends booleans as strings, normalize to actual boolean
        const internalFlag = parseBool(isInternal, false);

        // If agent replies without explicitly setting To/Cc, default to the inbound email participants
        // so replies behave like a normal email thread.
        const isAgentReply = req.user.role !== 'customer';
        if (isAgentReply && toEmails.length === 0) {
            const inboundFrom = ticket?.email?.from;
            if (inboundFrom) {
                toEmails.push(inboundFrom);
            }
        }
        if (isAgentReply && ccEmails.length === 0) {
            const inboundCc = Array.isArray(ticket?.email?.cc) ? ticket.email.cc : [];
            // Optionally include original "to" recipients (excluding the support mailbox) as CC
            const inboundTo = Array.isArray(ticket?.email?.to) ? ticket.email.to : [];
            const extraCc = [...inboundCc, ...inboundTo]
                .filter(Boolean)
                .map(e => String(e).trim().toLowerCase())
                .filter(e => e.includes('@'));
            ccEmails.push(...extraCc);
        }

        // Normalize + de-dupe
        const normalizeList = (list) => [...new Set((list || []).map(e => String(e).trim().toLowerCase()).filter(Boolean))];
        const normalizedTo = normalizeList(toEmails);
        const normalizedCc = normalizeList(ccEmails).filter(e => !normalizedTo.includes(e));

        // Auto-create users for new emails
        const allRecipients = [...new Set([...normalizedTo, ...normalizedCc])];

        for (const email of allRecipients) {
            if (!email || !email.includes('@')) continue;
            const userExists = await User.findOne({ email });
            if (!userExists) {
                try {
                    const name = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    await User.create({
                        name,
                        email,
                        password: 'Password@123',
                        role: 'customer'
                    });
                    console.log(`[Auto-create] Created new user for ${email}`);
                } catch (err) {
                    console.error(`[Auto-create] Failed to create user for ${email}:`, err);
                }
            }
        }

        const comment = {
            user: req.user.id,
            message,
            isInternal: internalFlag,
            to: normalizedTo,
            cc: normalizedCc,
            createdAt: Date.now(),
            attachments: []
        };

        if (req.files && req.files.length > 0) {
            comment.attachments = req.files.map(file => ({
                filename: file.originalname,
                url: `/uploads/${file.filename}`, // In production, this would be S3 URL
                uploadedAt: Date.now()
            }));
        }

        ticket.comments.push(comment);

        // Update root to/cc with new recipients for visibility scoping
        if (normalizedTo.length > 0) {
            ticket.to = [...new Set([...(ticket.to || []), ...normalizedTo])];
        }
        if (normalizedCc.length > 0) {
            ticket.cc = [...new Set([...(ticket.cc || []), ...normalizedCc])];
        }

        // Auto-update status to 'in_progress' if it's 'open' and agent replies
        if (req.user.role !== 'customer' && ticket.status === 'open') {
            ticket.status = 'in_progress';
        }

        // Update resolved date if needed (unlikely on comment but good practice to check logic elsewhere)

        await ticket.save();

        // Populate user info for the new comment to return it immediately
        // We need to re-fetch or just populate the last comment
        // Easier to just re-fetch the ticket with populated comments
        const updatedTicket = await Ticket.findById(req.params.id)
            .populate('createdBy', 'name email')
            .populate('assignedTo', 'name email')
            .populate('comments.user', 'name email');

        // Send Email Notification
        try {
            // Only send if the reply is NOT internal
            if (!internalFlag) {
                // Get sender's company for email config
                let senderCompany = null;
                if (req.user.company) {
                    senderCompany = await Company.findById(req.user.company);
                } else if (ticket.companyId) {
                    senderCompany = await Company.findById(ticket.companyId);
                }

                // Determine recipients
                const senderEmail = String(req.user.email || '').trim().toLowerCase();
                const toSet = new Set(normalizedTo);
                const ccSet = new Set(normalizedCc);

                // If the creator didn't send the comment, ensure they are included
                if (ticket.createdBy && ticket.createdBy.toString() !== req.user.id) {
                    const creator = await User.findById(ticket.createdBy);
                    if (creator?.email) {
                        const creatorEmail = String(creator.email).trim().toLowerCase();
                        if (!toSet.size) toSet.add(creatorEmail);
                        else ccSet.add(creatorEmail);
                    }
                }

                // Don't email the sender
                if (senderEmail) {
                    toSet.delete(senderEmail);
                    ccSet.delete(senderEmail);
                }

                // If still no recipients, don't attempt
                if ((toSet.size > 0 || ccSet.size > 0) && senderCompany) {
                    // Recipient segmentation:
                    // - Existing participants get only the latest message (Gmail thread already contains history).
                    // - Newly added recipients (first time on this ticket) get full ticket history once.
                    const normalizeEmail = (val) => String(val || '').trim().toLowerCase();
                    const allRecipients = [...toSet, ...ccSet].map(normalizeEmail).filter(Boolean);
                    const alreadyNotified = new Set((ticket?.email?.notifiedRecipients || []).map(normalizeEmail));
                    const newRecipients = allRecipients.filter((e) => !alreadyNotified.has(e));
                    const existingRecipients = allRecipients.filter((e) => alreadyNotified.has(e));

                    const emailHtmlLatestOnly = generateTicketReplyEmail(
                        updatedTicket,
                        { ...comment, author: req.user?.name || req.user?.email || 'Support Team' },
                        { historyMode: 'none' }
                    );
                    const emailHtmlFullHistory = generateTicketReplyEmail(
                        updatedTicket,
                        { ...comment, author: req.user?.name || req.user?.email || 'Support Team' },
                        { historyMode: 'full' }
                    );
                    const ticketRef = ticket.ticketNumber || ticket._id.toString().slice(-6);

                    try {
                        const threading = {
                            inReplyTo: ticket?.email?.lastSentMessageId || ticket?.email?.threadRootMessageId || ticket?.email?.messageId || undefined,
                            references: [
                                ticket?.email?.threadRootMessageId || ticket?.email?.messageId,
                                ticket?.email?.lastSentMessageId
                            ].filter(Boolean),
                            headers: { 'X-WorkDesks-Ticket': ticketRef }
                        };

                        // Send to existing participants (latest only)
                        let sendRes = null;
                        if (existingRecipients.length > 0) {
                            sendRes = await sendEmail(senderCompany, {
                                to: existingRecipients,
                                subject: `Re: ${ticket.subject} [#${ticketRef}]`,
                                html: emailHtmlLatestOnly,
                                text: `New reply on ticket: ${message}`,
                                ...threading
                            });
                        }

                        // Send to newly added participants (full history once)
                        if (newRecipients.length > 0) {
                            await sendEmail(senderCompany, {
                                to: newRecipients,
                                subject: `Re: ${ticket.subject} [#${ticketRef}]`,
                                html: emailHtmlFullHistory,
                                text: `New reply on ticket: ${message}`,
                                ...threading
                            });
                        }

                        // Persist threading info so inbound replies can attach using In-Reply-To/References
                        if (sendRes?.messageId) {
                            ticket.email = ticket.email || {};
                            if (!ticket.email.threadRootMessageId && ticket.email.messageId) {
                                ticket.email.threadRootMessageId = ticket.email.messageId;
                            }
                            ticket.email.lastSentMessageId = String(sendRes.messageId).replace(/^<|>$/g, '');
                        }

                        // Persist notified recipient list
                        ticket.email = ticket.email || {};
                        ticket.email.notifiedRecipients = Array.from(new Set([...(ticket.email.notifiedRecipients || []), ...allRecipients]));
                        await ticket.save();
                    } catch (emailErr) {
                        console.error('Failed to send ticket reply email:', emailErr.message);
                    }
                }
            }
        } catch (emailError) {
            console.error("Email notification error:", emailError);
        }

        res.status(200).json({
            status: 'success',
            data: { ticket: updatedTicket }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Delete ticket
// @route   DELETE /api/tickets/:id
// @access  Private
export const deleteTicket = async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                status: 'error',
                message: 'Ticket not found'
            });
        }

        await ticket.deleteOne();

        res.status(200).json({
            status: 'success',
            message: 'Ticket deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Forward ticket via email
// @route   POST /api/tickets/:id/forward
// @access  Private
export const forwardTicket = async (req, res) => {
    try {
        const { email, message, includeHistory } = req.body;

        const ticket = await Ticket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({
                status: 'error',
                message: 'Ticket not found'
            });
        }

        // Simulate sending email
        console.log(`[Mock Email] Forwarding Ticket #${ticket._id} to ${email}`);
        console.log(`[Mock Email] Message: ${message}`);
        console.log(`[Mock Email] Include History: ${includeHistory}`);

        // Add system comment
        const comment = {
            user: req.user.id,
            message: `<strong>Forwarded ticket to ${email}</strong><br/>${message}`,
            isInternal: true, // System actions usually internal or visible? Let's make it internal for now as it's an agent action.
            createdAt: Date.now()
        };

        ticket.comments.push(comment);
        await ticket.save();

        res.status(200).json({
            status: 'success',
            message: `Ticket forwarded to ${email}`
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// @desc    Get ticket statistics
// @route   GET /api/tickets/stats
// @access  Private
export const getTicketStats = async (req, res) => {
    try {
        let matchStage = {};
        let adminStats = null;

        // Apply role-based filtering
        if (req.user.role === 'admin' || req.user.role === 'super_admin') {
            const totalUsers = await User.countDocuments({});
            const totalCompanies = await Company.countDocuments({});
            const totalClientCompanies = await Company.countDocuments({ type: 'client-company' });

            adminStats = {
                totalUsers,
                totalCompanies,
                totalClientCompanies
            };
            // matchStage remains empty {} for global stats for admins
        } else if (req.user.role === 'customer') {
            matchStage.createdBy = req.user.id;
        } else if (req.user.role === 'company_manager' || req.user.role === 'agent') {
            let allowedCompanyNames = [];

            if (req.user.company) {
                const employerCompany = await Company.findById(req.user.company);
                if (employerCompany) {
                    allowedCompanyNames.push(employerCompany.name);

                    // 2. If Main Company, include its own Client Companies
                    if (employerCompany.type === 'main-company') {
                        const clientCompanies = await Company.find({ parentCompany: employerCompany._id });
                        const clientNames = clientCompanies.map(c => c.name);
                        allowedCompanyNames = [...allowedCompanyNames, ...clientNames];
                    }
                }
            }

            if (req.user.role === 'company_manager') {
                const createdCompanies = await Company.find({ createdBy: req.user.id });
                const createdCompanyNames = createdCompanies.map(c => c.name);
                allowedCompanyNames = [...new Set([...allowedCompanyNames, ...createdCompanyNames])];
            }

            let companyMatch = { company: { $in: allowedCompanyNames } };

            if (req.user.role === 'agent') {
                matchStage.assignedTo = new mongoose.Types.ObjectId(req.user.id);
            } else if (req.user.role === 'company_manager' && employerCompany && employerCompany.type === 'main-company') {
                // Main Company Manager: Involvement rule for stats
                const companyAgents = await User.find({ company: employerCompany._id, role: 'agent' });
                const agentIds = [new mongoose.Types.ObjectId(req.user.id), ...companyAgents.map(a => new mongoose.Types.ObjectId(a._id))];
                const agentEmails = [req.user.email.toLowerCase(), ...companyAgents.map(a => a.email.toLowerCase())];

                const employerCompanyName = employerCompany.name;
                const otherCompanyNames = allowedCompanyNames.filter(c => c !== employerCompanyName);

                matchStage.$or = [
                    { company: employerCompanyName },
                    {
                        company: { $in: otherCompanyNames },
                        $or: [
                            { createdBy: { $in: agentIds } },
                            { assignedTo: { $in: agentIds } },
                            { cc: { $in: [...agentEmails, employerCompanyName] } }
                        ]
                    },
                    { assignedTo: new mongoose.Types.ObjectId(req.user.id) },
                    { createdBy: new mongoose.Types.ObjectId(req.user.id) }
                ];
            } else {
                // Regular Manager
                matchStage.$or = [
                    { company: { $in: allowedCompanyNames } },
                    { assignedTo: new mongoose.Types.ObjectId(req.user.id) },
                    { createdBy: new mongoose.Types.ObjectId(req.user.id) }
                ];
            }
            console.log('Stats Match Stage (Staff):', JSON.stringify(matchStage, null, 2));
        } else {
            console.log('Stats Match Stage (Other):', JSON.stringify(matchStage, null, 2));
        }

        // 1. Get counts by status
        const statusStats = await Ticket.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // 2. Get counts by priority
        const priorityStats = await Ticket.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: '$priority',
                    count: { $sum: 1 }
                }
            }
        ]);

        // 3. Get total tickets
        // Note: countDocuments supports a query filter, so we use matchStage directly (if it's a simple object)
        // However, matchStage can contain $or, which countDocuments handles.
        // BUT if matchStage is {}, it counts all.
        const totalTickets = await Ticket.countDocuments(matchStage);

        // 4. Get tickets created in last 7 days (volume)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Combine matchStage with date filter
        const volumeMatch = { ...matchStage, createdAt: { $gte: sevenDaysAgo } };
        // NOTE: matchStage might have $or. We need to be careful merging.
        // Correct way: use $and if matchStage has complex logic, or just merge if simple.
        // If matchStage has $or, we can't just spread it if we want to AND it with createdAt.
        // Safer approach for aggregate: use $match pipeline stages.

        const volumePipeline = [
            { $match: matchStage }, // Filter by role first
            { $match: { createdAt: { $gte: sevenDaysAgo } } }, // Then by date
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ];

        const volumeStats = await Ticket.aggregate(volumePipeline);

        // Format data for frontend
        const stats = {
            total: totalTickets,
            status: statusStats.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {}),
            priority: priorityStats.map(p => ({ name: p._id, value: p.count })),
            volume: volumeStats.map(v => ({ date: v._id, tickets: v.count })),
            adminStats
        };

        res.status(200).json({
            status: 'success',
            data: { stats }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};
