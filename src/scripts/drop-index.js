import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const dropIndex = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/supportdesk');
        console.log('MongoDB Connected');

        const collection = mongoose.connection.collection('companies');

        // List indexes
        const indexes = await collection.indexes();
        console.log('Current Indexes:', indexes);

        // Drop the specific unique index on name
        // Usually named "name_1" by default in Mongoose
        try {
            await collection.dropIndex('name_1');
            console.log('Successfully dropped index: name_1');
        } catch (e) {
            console.log('Index name_1 not found or already dropped:', e.message);
        }

        console.log('Done');
        process.exit();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

dropIndex();
