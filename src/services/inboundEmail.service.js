import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import crypto from 'crypto';

import Company from '../models/Company.model.js';
import Ticket from '../models/Ticket.model.js';
import User from '../models/User.model.js';
import { decrypt } from '../utils/encryption.js';

function getEmailDomain(address = '') {
  const at = address.lastIndexOf('@');
  return at === -1 ? '' : address.slice(at + 1).toLowerCase();
}

function asText(input) {
  if (!input) return '';
  if (typeof input === 'string') return input;
  return String(input);
}

function getProviderDefaults(provider) {
  if (provider === 'gmail') {
    return { imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecure: false };
  }
  if (provider === 'outlook') {
    // Outlook.com / Microsoft 365 generally use these
    return { imapHost: 'outlook.office365.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.office365.com', smtpPort: 587, smtpSecure: false };
  }
  return {};
}

function extractTicketNumber(subject = '') {
  const match = String(subject).toUpperCase().match(/\bTKT-\d{6}\b/);
  return match ? match[0] : null;
}

function normalizeMessageId(value) {
  const raw = asText(value).trim();
  if (!raw) return '';
  // Gmail often uses <...>; store without brackets for easier comparisons
  return raw.replace(/^<|>$/g, '');
}

function stripQuotedEmail(text = '') {
  const input = asText(text).replace(/\r\n/g, '\n');
  if (!input.trim()) return '';

  const lines = input.split('\n');
  const stopPatterns = [
    /^On .+ wrote:\s*$/i,
    /^From:\s.+$/i,
    /^Sent:\s.+$/i,
    /^To:\s.+$/i,
    /^Subject:\s.+$/i,
    /^-{2,}\s*Original Message\s*-{2,}$/i,
    /^_{2,}\s*$/i
  ];

  const result = [];
  for (const line of lines) {
    if (stopPatterns.some((re) => re.test(line.trim()))) break;
    // Common reply quoting in plain text
    if (/^\s*>+/.test(line)) break;
    result.push(line);
  }

  const cleaned = result.join('\n').trim();
  return cleaned || input.trim();
}

function htmlToPlainText(html = '') {
  const input = asText(html);
  if (!input.trim()) return '';

  // Remove scripts/styles
  let text = input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Convert common block/line-break tags to newlines
  text = text
    .replace(/<\/(p|div|tr|table|blockquote)>/gi, '\n')
    .replace(/<(br|br\/|\/br)\s*>/gi, '\n')
    .replace(/<(li)\b[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n');

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode a few common entities
  text = text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");

  // Normalize whitespace
  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

async function ensureCustomer({ email, name, companyId }) {
  const existing = await User.findOne({ email });
  if (existing) return existing;

  const password = crypto.randomBytes(12).toString('hex');
  return await User.create({
    name: name || email,
    email,
    password,
    role: 'customer',
    company: companyId,
    isActive: true
  });
}

async function resolveCompanyForSender({ mainCompanyId, senderEmail }) {
  const domain = getEmailDomain(senderEmail);
  if (!domain) return null;

  // Prefer a matching client-company under this main company
  const clientCompany = await Company.findOne({
    type: 'client-company',
    parentCompany: mainCompanyId,
    domain: domain
  });
  if (clientCompany) return clientCompany;

  // Fallback: match by suffix (e.g., user@client.subdomain.com matching stored domain)
  const bySuffix = await Company.findOne({
    type: 'client-company',
    parentCompany: mainCompanyId,
    domain: { $exists: true, $ne: '' }
  }).lean();
  if (bySuffix?.domain && domain.endsWith(bySuffix.domain.toLowerCase())) {
    return await Company.findById(bySuffix._id);
  }

  return null;
}

export async function syncInboundEmailForCompany(company) {
  if (!company?.emailConfig?.enabled || !company.emailConfig.inboundEnabled) return { synced: 0 };

  const provider = company.emailConfig.provider || 'custom';
  const defaults = getProviderDefaults(provider);

  const imapHost = company.emailConfig.imapHost || defaults.imapHost;
  const imapPort = company.emailConfig.imapPort || defaults.imapPort || 993;
  const imapSecure = typeof company.emailConfig.imapSecure === 'boolean' ? company.emailConfig.imapSecure : (defaults.imapSecure ?? true);
  const imapUser = company.emailConfig.imapUser || company.emailConfig.user;
  const imapPass = company.emailConfig.imapPass ? decrypt(company.emailConfig.imapPass) : (company.emailConfig.pass ? decrypt(company.emailConfig.pass) : undefined);
  const mailbox = company.emailConfig.inboxFolder || 'INBOX';

  if (!imapHost || !imapUser || !imapPass) {
    throw new Error(`IMAP is not configured for company ${company._id} (${company.name})`);
  }

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: imapSecure,
    auth: {
      user: imapUser,
      pass: imapPass
    }
  });

  let synced = 0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);
    try {
      const lastUid = company.emailConfig.lastUid || 0;
      const range = `${Math.max(1, lastUid + 1)}:*`;

      // Fetch new messages by UID
      for await (const msg of client.fetch(range, { uid: true, envelope: true, source: true, internalDate: true })) {
        const uid = msg.uid;
        const parsed = await simpleParser(msg.source);
        const messageId = normalizeMessageId(parsed.messageId || msg.envelope?.messageId || '');
        const inReplyTo = normalizeMessageId(parsed.inReplyTo || '');
        const references = (Array.isArray(parsed.references) ? parsed.references : [])
          .map(normalizeMessageId)
          .filter(Boolean);
        const fromAddr = parsed.from?.value?.[0]?.address || msg.envelope?.from?.[0]?.address || '';

        // Dedupe: if we don't have a messageId, we still advance UID and skip
        if (messageId) {
          const exists = await Ticket.exists({ 'email.messageId': messageId });
          const existsAsComment = await Ticket.exists({ 'comments.emailMessageId': messageId });
          if (!exists) {
            if (existsAsComment) {
              company.emailConfig.lastUid = Math.max(company.emailConfig.lastUid || 0, uid);
              continue;
            }

            const clientCompany = await resolveCompanyForSender({ mainCompanyId: company._id, senderEmail: fromAddr });
            const ticketCompany = clientCompany || company;

            const creator = await ensureCustomer({
              email: fromAddr || `unknown-${uid}@inbound.local`,
              name: parsed.from?.value?.[0]?.name,
              companyId: ticketCompany._id
            });

            const subject = asText(parsed.subject || '(No subject)').slice(0, 250);
            const rawText = asText(parsed.text || '').trim();
            const fallbackFromHtml = !rawText ? htmlToPlainText(parsed.html || '') : '';
            const rawBody = rawText || fallbackFromHtml;
            const body = stripQuotedEmail(rawBody) || '(No message content)';

            // Prefer threading by In-Reply-To / References, then fallback to ticket number in subject.
            const replyIds = [inReplyTo, ...references].filter(Boolean);
            let existingTicket = null;

            if (replyIds.length > 0) {
              existingTicket = await Ticket.findOne({
                companyId: ticketCompany._id,
                $or: [
                  { 'email.messageId': { $in: replyIds } },
                  { 'email.threadRootMessageId': { $in: replyIds } },
                  { 'email.lastSentMessageId': { $in: replyIds } },
                  { 'comments.emailMessageId': { $in: replyIds } }
                ]
              });
            }

            const ticketNumber = extractTicketNumber(subject);
            if (ticketNumber) {
              if (!existingTicket) {
                existingTicket = await Ticket.findOne({
                  ticketNumber,
                  companyId: ticketCompany._id
                });
              }

              if (existingTicket) {
                existingTicket.comments.push({
                  user: creator._id,
                  message: body,
                  emailMessageId: messageId,
                  to: (parsed.to?.value || []).map(v => v.address).filter(Boolean),
                  cc: (parsed.cc?.value || []).map(v => v.address).filter(Boolean),
                  isInternal: false,
                  createdAt: msg.internalDate || parsed.date || new Date(),
                  attachments: []
                });

                existingTicket.to = [...new Set([...(existingTicket.to || []), ...(parsed.to?.value || []).map(v => v.address).filter(Boolean)])];
                existingTicket.cc = [...new Set([...(existingTicket.cc || []), ...(parsed.cc?.value || []).map(v => v.address).filter(Boolean)])];
                if (!existingTicket.email?.threadRootMessageId && existingTicket.email?.messageId) {
                  existingTicket.email.threadRootMessageId = normalizeMessageId(existingTicket.email.messageId);
                }

                await existingTicket.save();
                synced += 1;
                company.emailConfig.lastUid = Math.max(company.emailConfig.lastUid || 0, uid);
                continue;
              }
            }

            await Ticket.create({
              subject,
              description: body,
              status: 'open',
              priority: 'medium',
              createdBy: creator._id,
              company: ticketCompany.name,
              companyId: ticketCompany._id,
              // Store original recipients for later replies/visibility
              to: (parsed.to?.value || []).map(v => v.address).filter(Boolean),
              cc: (parsed.cc?.value || []).map(v => v.address).filter(Boolean),
              email: {
                messageId,
                threadRootMessageId: messageId,
                from: fromAddr,
                to: (parsed.to?.value || []).map(v => v.address).filter(Boolean),
                cc: (parsed.cc?.value || []).map(v => v.address).filter(Boolean),
                receivedAt: msg.internalDate || parsed.date || new Date(),
                subject
              }
            });
            synced += 1;
          }
        }

        // Advance checkpoint no matter what (prevents re-reading the same email forever)
        company.emailConfig.lastUid = Math.max(company.emailConfig.lastUid || 0, uid);
      }

      company.emailConfig.lastInboundSyncAt = new Date();
      await company.save();
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }

  return { synced };
}

export async function syncInboundEmailForAllCompanies() {
  const companies = await Company.find({
    type: 'main-company',
    'emailConfig.enabled': true,
    'emailConfig.inboundEnabled': true
  });

  let total = 0;
  for (const company of companies) {
    try {
      const res = await syncInboundEmailForCompany(company);
      total += res.synced;
    } catch (e) {
      console.error(`Inbound sync failed for ${company.name}:`, e.message);
    }
  }
  return { total };
}

export async function testImapConnectionForCompany(company) {
  const provider = company?.emailConfig?.provider || 'custom';
  const defaults = getProviderDefaults(provider);

  const imapHost = company.emailConfig.imapHost || defaults.imapHost;
  const imapPort = company.emailConfig.imapPort || defaults.imapPort || 993;
  const imapSecure = typeof company.emailConfig.imapSecure === 'boolean' ? company.emailConfig.imapSecure : (defaults.imapSecure ?? true);
  const imapUser = company.emailConfig.imapUser || company.emailConfig.user;
  const imapPass = company.emailConfig.imapPass ? decrypt(company.emailConfig.imapPass) : (company.emailConfig.pass ? decrypt(company.emailConfig.pass) : undefined);
  const mailbox = company.emailConfig.inboxFolder || 'INBOX';

  if (!imapHost || !imapUser || !imapPass) {
    throw new Error('IMAP settings are incomplete');
  }

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: imapSecure,
    auth: { user: imapUser, pass: imapPass }
  });

  try {
    await client.connect();
    await client.mailboxOpen(mailbox);
    return { success: true, message: `IMAP connected and opened ${mailbox}` };
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }
}
