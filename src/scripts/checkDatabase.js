import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from '../config/database.js';
import Ticket from '../models/Ticket.model.js';
import User from '../models/User.model.js';

dotenv.config();

const checkDatabase = async () => {
    try {
        await connectDB();

        const ticketCount = await Ticket.countDocuments();
        const userCount = await User.countDocuments();

        console.log('\n📊 Database Status:');
        console.log('==================');
        console.log(`Total Users: ${userCount}`);
        console.log(`Total Tickets: ${ticketCount}`);

        if (ticketCount > 0) {
            console.log('\n🎫 Recent Tickets:');
            const recentTickets = await Ticket.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .select('ticketNumber subject status priority createdAt');

            recentTickets.forEach(ticket => {
                console.log(`  ${ticket.ticketNumber} - ${ticket.subject} (${ticket.status})`);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
};

checkDatabase();
