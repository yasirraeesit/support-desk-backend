import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.model.js';
import Company from '../models/Company.model.js';
import Ticket from '../models/Ticket.model.js';
import { connectDB } from '../config/database.js';

dotenv.config();

const industries = ['Technology', 'Healthcare', 'Finance', 'Retail', 'Manufacturing'];
const mainCompanyNames = ['TechCorp Solutions', 'HealthFirst Medical', 'FinanceHub Group', 'RetailMax Inc', 'InnovateTech Systems'];

const ticketSubjects = [
    'Unable to access account',
    'Feature request for new functionality',
    'Billing inquiry',
    'Technical support needed',
    'Password reset request',
    'Integration issue',
    'Performance optimization request',
    'Bug report - UI not loading',
    'Data export request',
    'Account upgrade inquiry'
];

const ticketDescriptions = [
    'I am experiencing issues accessing my account. Please help resolve this as soon as possible.',
    'Would like to request a new feature that would improve our workflow significantly.',
    'I have questions regarding the recent billing statement. Please clarify the charges.',
    'Need technical assistance with the system configuration and setup.',
    'Unable to reset my password. The reset link is not working.',
    'Having trouble integrating with our existing systems. Need guidance.',
    'The system is running slow. Can we optimize the performance?',
    'The user interface is not loading properly on certain browsers.',
    'Need to export data for reporting purposes. How can I do this?',
    'Interested in upgrading our account to access premium features.'
];

const priorities = ['low', 'medium', 'high', 'urgent'];
const statuses = ['open', 'pending', 'in_progress', 'resolved', 'closed'];
const categories = ['Technical', 'Billing', 'General', 'Feature Request', 'Bug Report'];

const generateClientCompanyName = (mainCompanyName, index) => {
    const prefixes = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    return `${mainCompanyName} - ${prefixes[index]} Division`;
};

const generateEmail = (name, companyDomain) => {
    const cleanName = name.toLowerCase().replace(/\s+/g, '.');
    return `${cleanName}@${companyDomain}`;
};

const seedData = async () => {
    try {
        await connectDB();

        // Clear existing data
        console.log('🗑️  Clearing existing data...');
        await User.deleteMany({});
        await Company.deleteMany({});
        await Ticket.deleteMany({});
        console.log('✅ Cleared existing data');

        // Create Super Admin
        const superAdmin = await User.create({
            name: 'Super Admin',
            email: 'superadmin@workdesks.com',
            password: 'super123',
            role: 'super_admin',
        });
        console.log('✅ Created Super Admin');

        let totalManagers = 0;
        let totalAgents = 0;
        let totalContacts = 0;
        let totalMainCompanies = 0;
        let totalClientCompanies = 0;
        let totalTickets = 0;

        // Create 5 main companies
        for (let i = 0; i < 5; i++) {
            const mainCompanyDomain = mainCompanyNames[i].toLowerCase().replace(/\s+/g, '') + '.com';

            // Create main company
            const mainCompany = await Company.create({
                name: mainCompanyNames[i],
                type: 'main-company',
                domain: mainCompanyDomain,
                industry: industries[i],
                status: 'active',
                setupCompleted: true,
                createdBy: superAdmin._id,
                features: {
                    emailIntegration: true,
                    reports: true,
                    clientCompanies: true,
                    customBranding: true,
                    apiAccess: true
                }
            });
            totalMainCompanies++;
            console.log(`✅ Created main company: ${mainCompany.name}`);

            // Create 1 manager for the main company
            const manager = await User.create({
                name: `Manager ${i + 1}`,
                email: i === 0 ? 'manager@workdesks.com' : generateEmail(`manager${i + 1}`, mainCompanyDomain),
                password: 'manager123',
                role: 'manager',
                company: mainCompany._id,
                jobTitle: 'Support Manager'
            });
            totalManagers++;

            // Create 5 agents for the main company
            const agents = [];
            for (let j = 0; j < 5; j++) {
                const agent = await User.create({
                    name: `Agent ${i + 1}-${j + 1}`,
                    email: i === 0 && j === 0 ? 'agent@workdesks.com' : generateEmail(`agent${i + 1}.${j + 1}`, mainCompanyDomain),
                    password: 'agent123',
                    role: 'agent',
                    company: mainCompany._id,
                    jobTitle: 'Support Agent'
                });
                agents.push(agent);
                totalAgents++;
            }

            // Create 10 contacts for the main company
            const contacts = [];
            for (let k = 0; k < 10; k++) {
                const contact = await User.create({
                    name: `Contact ${i + 1}-${k + 1}`,
                    email: i === 0 && k === 0 ? 'customer@workdesks.com' : generateEmail(`contact${i + 1}.${k + 1}`, mainCompanyDomain),
                    password: 'customer123',
                    role: 'customer',
                    company: mainCompany._id,
                    jobTitle: 'Customer'
                });
                contacts.push(contact);
                totalContacts++;
            }

            // Create 5 client companies for each main company
            for (let c = 0; c < 5; c++) {
                const clientCompanyName = generateClientCompanyName(mainCompanyNames[i], c);
                const clientCompanyDomain = clientCompanyName.toLowerCase().replace(/\s+/g, '').replace(/-/g, '') + '.com';

                const clientCompany = await Company.create({
                    name: clientCompanyName,
                    type: 'client-company',
                    domain: clientCompanyDomain,
                    industry: industries[i],
                    status: 'active',
                    setupCompleted: true,
                    createdBy: manager._id,
                    features: {
                        emailIntegration: false,
                        reports: true,
                        clientCompanies: false,
                        customBranding: false,
                        apiAccess: false
                    }
                });
                totalClientCompanies++;

                // Create 10 contacts for each client company
                const clientContacts = [];
                for (let k = 0; k < 10; k++) {
                    const clientContact = await User.create({
                        name: `Client Contact ${i + 1}-${c + 1}-${k + 1}`,
                        email: generateEmail(`contact${c + 1}.${k + 1}`, clientCompanyDomain),
                        password: 'contact123',
                        role: 'customer',
                        company: clientCompany._id,
                        jobTitle: 'Client Contact'
                    });
                    clientContacts.push(clientContact);
                    totalContacts++;
                }

                // Create 5 tickets for each client company
                for (let t = 0; t < 5; t++) {
                    const randomContact = clientContacts[Math.floor(Math.random() * clientContacts.length)];
                    const randomAgent = agents[Math.floor(Math.random() * agents.length)];

                    await Ticket.create({
                        subject: ticketSubjects[t % ticketSubjects.length],
                        description: ticketDescriptions[t % ticketDescriptions.length],
                        category: categories[t % categories.length],
                        priority: priorities[Math.floor(Math.random() * priorities.length)],
                        status: statuses[Math.floor(Math.random() * statuses.length)],
                        createdBy: randomContact._id,
                        assignedTo: randomAgent._id,
                        companyId: clientCompany._id,
                        company: clientCompany.name
                    });
                    totalTickets++;
                }
            }

            console.log(`✅ Completed setup for ${mainCompany.name}`);
        }

        console.log('\n📊 Seed Data Summary:');
        console.log('═══════════════════════════════════════');
        console.log(`Super Admins:      1`);
        console.log(`Main Companies:    ${totalMainCompanies}`);
        console.log(`Client Companies:  ${totalClientCompanies}`);
        console.log(`Managers:          ${totalManagers} (1 per main company)`);
        console.log(`Agents:            ${totalAgents} (5 per main company)`);
        console.log(`Contacts:          ${totalContacts} (10 per main company + 10 per client company)`);
        console.log(`Tickets:           ${totalTickets} (5 per client company)`);
        console.log('═══════════════════════════════════════');

        console.log('\n🔐 Sample Login Credentials:');
        console.log('═══════════════════════════════════════');
        console.log('Super Admin:  superadmin@workdesks.com / super123');
        console.log('Manager:      manager@workdesks.com / manager123');
        console.log('Agent:        agent@workdesks.com / agent123');
        console.log('Customer:     customer@workdesks.com / customer123');
        console.log('═══════════════════════════════════════');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding data:', error);
        process.exit(1);
    }
};

seedData();
