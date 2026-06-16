import mongoose from 'mongoose';

const companySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a company name'],
        trim: true
    },
    type: {
        type: String,
        enum: ['main-company', 'client-company'],
        default: 'client-company'
    },
    domain: {
        type: String,
        trim: true
    },
    industry: {
        type: String,
        trim: true
    },
    notes: {
        type: String
    },
    features: {
        type: Map,
        of: Boolean,
        default: {}
    },
    parentCompany: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        default: null
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    logo: {
        type: String,
        default: ''
    },
    setupCompleted: {
        type: Boolean,
        default: false
    },
    emailConfig: {
        enabled: {
            type: Boolean,
            default: false
        },
        provider: {
            type: String,
            enum: ['gmail', 'outlook', 'custom'],
            default: 'custom'
        },
        host: {
            type: String,
            trim: true
        },
        port: {
            type: Number
        },
        secure: {
            type: Boolean,
            default: false
        },
        user: {
            type: String,
            trim: true
        },
        pass: {
            type: String  // Will be encrypted
        },
        from: {
            type: String,
            trim: true
        },

        // Inbound email (IMAP polling)
        inboundEnabled: {
            type: Boolean,
            default: false
        },
        imapHost: {
            type: String,
            trim: true
        },
        imapPort: {
            type: Number
        },
        imapSecure: {
            type: Boolean,
            default: true
        },
        imapUser: {
            type: String,
            trim: true
        },
        imapPass: {
            type: String // Will be encrypted
        },
        inboxFolder: {
            type: String,
            default: 'INBOX'
        },
        lastUid: {
            type: Number,
            default: 0
        },
        lastInboundSyncAt: {
            type: Date
        },

    },
    notifications: {
        type: Map,
        of: new mongoose.Schema({
            enabled: { type: Boolean, default: true },
            subject: { type: String },
            body: { type: String }
        }, { _id: false }),
        default: {}
    },
    features: {
        emailIntegration: {
            type: Boolean,
            default: false
        },
        reports: {
            type: Boolean,
            default: true
        },
        clientCompanies: {
            type: Boolean,
            default: false
        },
        customBranding: {
            type: Boolean,
            default: false
        },
        apiAccess: {
            type: Boolean,
            default: false
        }
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Enforce unique company name per user
companySchema.index({ name: 1, createdBy: 1 }, { unique: true });

const Company = mongoose.model('Company', companySchema);

export default Company;
