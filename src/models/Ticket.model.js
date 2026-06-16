import mongoose from 'mongoose';
import Counter from './Counter.model.js';

const ticketSchema = new mongoose.Schema({
    ticketNumber: {
        type: String,
        unique: true
    },
    subject: {
        type: String,
        required: [true, 'Please provide a subject'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Please provide a description']
    },
    status: {
        type: String,
        enum: ['open', 'pending', 'in_progress', 'resolved', 'closed'],
        default: 'open'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    category: {
        type: String,
        default: 'General'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    company: {
        type: String,
        default: ''
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
    },
    to: [{
        type: String
    }],
    cc: [{
        type: String
    }],
    tags: [{
        type: String
    }],
    attachments: [{
        filename: String,
        url: String,
        uploadedAt: Date
    }],
    comments: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        message: String,
        emailMessageId: String,
        to: [String], // Array of email addresses
        cc: [String], // Array of email addresses
        isInternal: {
            type: Boolean,
            default: false
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        attachments: [{
            filename: String,
            url: String,
            uploadedAt: Date
        }]
    }],
    dueDate: {
        type: Date
    },
    resolvedAt: {
        type: Date
    }
    ,
    email: {
        messageId: {
            type: String,
            index: true
        },
        threadRootMessageId: String,
        lastSentMessageId: String,
        notifiedRecipients: {
            type: [String],
            default: []
        },
        from: String,
        to: [String],
        cc: [String],
        receivedAt: Date,
        subject: String
    }
}, {
    timestamps: true
});

// De-dup inbound emails
ticketSchema.index({ 'email.messageId': 1 }, { unique: true, sparse: true });

// Auto-generate ticket number
ticketSchema.pre('save', async function (next) {
    if (!this.ticketNumber) {
        // Use an atomic counter to avoid duplicate ticket numbers under concurrency
        let counter = await Counter.findOne({ key: 'ticketNumber' });

        // Initialize counter from current max ticket number if missing (safe for existing DBs)
        if (!counter) {
            const last = await mongoose
                .model('Ticket')
                .findOne({ ticketNumber: /^TKT-\d{6}$/ })
                .sort({ ticketNumber: -1 })
                .select('ticketNumber')
                .lean();
            const lastSeq = last?.ticketNumber ? Number.parseInt(String(last.ticketNumber).slice(4), 10) : 0;
            counter = await Counter.findOneAndUpdate(
                { key: 'ticketNumber' },
                { $setOnInsert: { seq: Number.isFinite(lastSeq) ? lastSeq : 0 } },
                { new: true, upsert: true }
            );
        }

        const updated = await Counter.findOneAndUpdate(
            { key: 'ticketNumber' },
            { $inc: { seq: 1 } },
            { new: true }
        );
        this.ticketNumber = `TKT-${String(updated.seq).padStart(6, '0')}`;
    }
    next();
});

const Ticket = mongoose.model('Ticket', ticketSchema);

export default Ticket;
