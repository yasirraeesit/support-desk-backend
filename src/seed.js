
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/User.model.js';
import Ticket from './models/Ticket.model.js';
import Company from './models/Company.model.js';

dotenv.config();

const seedDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected');

        // 1. Clear Database
        console.log('🧹 Clearing database...');
        await Promise.all([
            User.deleteMany({}),
            Ticket.deleteMany({}),
            Company.deleteMany({})
        ]);

        // 2. Create Main Company for Admin Users
        console.log('🏢 Creating Support Desk HQ (Admin Company)...');
        const adminCompany = await Company.create({
            name: 'Support Desk HQ',
            domain: 'supportdesk.com',
            type: 'main-company',
            industry: 'Technology',
            status: 'active',
            setupCompleted: true
        });

        // 3. Create Super Admin and Admin
        console.log('👤 Creating Super Admin and Admin...');
        await User.create({
            name: 'Super Admin',
            email: 'superadmin@test.com',
            password: 'password123',
            role: 'super_admin',
            company: adminCompany._id,
            isActive: true
        });

        await User.create({
            name: 'Admin User',
            email: 'admin@test.com',
            password: 'password123',
            role: 'admin',
            company: adminCompany._id,
            isActive: true
        });

        // 4. Create 5 Main Companies
        console.log('🏢 Creating 5 Main Companies...');
        const mainCompanyNames = ['Tech Solutions Inc', 'Healthcare Partners', 'Financial Services Co', 'Retail Enterprises', 'Logistics Global'];
        const mainCompanyDomains = ['techsolutions.com', 'healthpartners.com', 'finservices.com', 'retailent.com', 'logisticsglobal.com'];
        const industries = ['Technology', 'Healthcare', 'Finance', 'Retail', 'Logistics'];

        for (let i = 0; i < 5; i++) {
            const mainComp = await Company.create({
                name: mainCompanyNames[i],
                domain: mainCompanyDomains[i],
                type: 'main-company',
                industry: industries[i],
                status: 'active',
                setupCompleted: true
            });
            console.log(`   ✓ Created ${mainCompanyNames[i]}`);

            // Create 5 Agents for this main company
            const agents = [];
            for (let a = 1; a <= 5; a++) {
                const agent = await User.create({
                    name: `${mainCompanyNames[i]} Agent ${a}`,
                    email: `agent${a}@${mainCompanyDomains[i]}`,
                    password: 'password123',
                    role: 'agent',
                    company: mainComp._id,
                    permissions: ['view_all_tickets'],
                    isActive: true
                });
                agents.push(agent);
            }

            // 4. Create 5 Client Companies for each Main Company
            console.log(`   📁 Creating 5 Client Companies for ${mainCompanyNames[i]}...`);
            const clientIndustries = ['Software', 'Consulting', 'Manufacturing', 'Education', 'Media'];

            for (let c = 1; c <= 5; c++) {
                const clientName = `${mainCompanyNames[i]} - Client ${c}`;
                const clientDomain = `client${c}.${mainCompanyDomains[i]}`;

                const clientCompany = await Company.create({
                    name: clientName,
                    domain: clientDomain,
                    type: 'client-company',
                    industry: clientIndustries[c - 1],
                    status: 'active',
                    features: { ticketing: true },
                    parentCompany: mainComp._id,
                    setupCompleted: true
                });
                console.log(`      - Created ${clientName}`);

                // Create 1 Manager for this client company
                await User.create({
                    name: `${clientName} Manager`,
                    email: `manager@${clientDomain}`,
                    password: 'password123',
                    role: 'manager',
                    company: clientCompany._id,
                    isActive: true
                });

                // Create 10-15 Contacts (random between 10 and 15)
                const contactCount = Math.floor(Math.random() * 6) + 10; // 10 to 15
                const contacts = [];
                for (let k = 1; k <= contactCount; k++) {
                    const contact = await User.create({
                        name: `${clientName} Contact ${k}`,
                        email: `contact${k}@${clientDomain}`,
                        password: 'password123',
                        role: 'customer',
                        company: clientCompany._id,
                        isActive: true
                    });
                    contacts.push(contact);
                }

                // Create 10 Tickets for this client company
                const statuses = ['open', 'in_progress', 'resolved', 'closed'];
                const priorities = ['low', 'medium', 'high', 'urgent'];

                for (let t = 1; t <= 10; t++) {
                    const randomContact = contacts[Math.floor(Math.random() * contacts.length)];
                    const randomAgent = agents[Math.floor(Math.random() * agents.length)];
                    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
                    const randomPriority = priorities[Math.floor(Math.random() * priorities.length)];

                    await Ticket.create({
                        subject: `${clientName} - Issue ${t}`,
                        description: `This is a sample ticket for ${clientName}. Ticket number ${t}.`,
                        status: randomStatus,
                        priority: randomPriority,
                        company: clientName,
                        companyId: clientCompany._id,
                        createdBy: randomContact._id,
                        assignedTo: randomAgent._id,
                        ticketNumber: `${i}${c}${t}`.padStart(6, '0')
                    });
                }
            }
        }

        console.log('\n✅ Seeding complete!');
        console.log('-----------------------------------');
        console.log('Generated:');
        console.log('- 6 Main Companies (1 for admins + 5 business companies)');
        console.log('- 25 Client Companies (5 per business company)');
        console.log('- 1 Super Admin + 1 Admin');
        console.log('- 25 Agents (5 per main company)');
        console.log('- 25 Managers (1 per client company)');
        console.log('- ~300 Contacts (10-15 per client company)');
        console.log('- 250 Tickets (10 per client company)');
        console.log('-----------------------------------');
        console.log('Login Credentials:');
        console.log('Super Admin: superadmin@test.com / password123');
        console.log('Admin: admin@test.com / password123');
        console.log('Manager Example: manager@client1.techsolutions.com / password123');
        console.log('Agent Example: agent1@techsolutions.com / password123');
        console.log('-----------------------------------');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
};

seedDB();
