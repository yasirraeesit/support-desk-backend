import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.model.js';
import Ticket from '../models/Ticket.model.js';
import Company from '../models/Company.model.js';

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

        // 2. Create Support Desk HQ (Admin Company)
        const adminCompany = await Company.create({
            name: 'Support Desk HQ',
            domain: 'supportdesk.com',
            type: 'main-company',
            industry: 'Technology',
            status: 'active',
            setupCompleted: true
        });

        await User.create({
            name: 'Super Admin',
            email: 'superadmin@test.com',
            password: 'password123',
            role: 'super_admin',
            company: adminCompany._id,
            isActive: true
        });

        // 3. Create 5 Main Companies
        console.log('🏢 Creating 5 Main Companies...');
        const mainCompanies = [];
        for (let i = 1; i <= 5; i++) {
            const comp = await Company.create({
                name: `Company ${i}`,
                domain: `company${i}.com`,
                type: 'main-company',
                industry: 'Support Services',
                status: 'active',
                setupCompleted: true
            });
            mainCompanies.push(comp);
            console.log(`   ✓ Created Company ${i}`);

            // 4. Create 5 Agents for each company
            const agents = [];
            for (let a = 1; a <= 5; a++) {
                const agent = await User.create({
                    name: `Agent ${a} (Co ${i})`,
                    email: `agent${a}.c${i}@test.com`,
                    password: 'password123',
                    role: 'agent',
                    company: comp._id,
                    permissions: ['view_all_tickets'],
                    isActive: true
                });
                agents.push(agent);
            }

            // 5. Create 1 Manager for each company
            await User.create({
                name: `Manager (Co ${i})`,
                email: `manager.c${i}@test.com`,
                password: 'password123',
                role: 'manager',
                company: comp._id,
                isActive: true
            });

            // 6. Create 1 Client Company for each Main Company
            const clientComp = await Company.create({
                name: `Client of Co ${i}`,
                domain: `client${i}.com`,
                type: 'client-company',
                parentCompany: comp._id,
                status: 'active',
                setupCompleted: true
            });

            // 7. Create 1 Contact for the client
            const contact = await User.create({
                name: `Contact for Client ${i}`,
                email: `contact${i}@client.com`,
                password: 'password123',
                role: 'customer',
                company: clientComp._id,
                isActive: true
            });

            // 8. Create 5 Tickets for each company (assigned to agents)
            for (let t = 1; t <= 5; t++) {
                const randomAgent = agents[Math.floor(Math.random() * agents.length)];
                await Ticket.create({
                    subject: `Co ${i} Ticket ${t}`,
                    description: `This is ticket #${t} for Company ${i}. Requested by Client ${i}.`,
                    status: 'open',
                    priority: 'medium',
                    company: clientComp.name,
                    companyId: clientComp._id,
                    createdBy: contact._id,
                    assignedTo: randomAgent._id,
                    ticketNumber: `C${i}T${t}`.padStart(6, '0')
                });
            }
        }

        console.log('\n✅ Database Seeded Successfully!');
        console.log('Total: 6 Companies, 31 Users, 25 Tickets');
        console.log('Try logging in with:');
        console.log('- Manager: manager.c1@test.com / password123');
        console.log('- Agent: agent1.c1@test.com / password123');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
};

seedDB();
