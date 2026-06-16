import mongoose from 'mongoose';

export const connectDB = async () => {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/supportdesk';
        if (!process.env.MONGODB_URI) {
            console.warn('⚠️  MONGODB_URI is not set. Falling back to mongodb://127.0.0.1:27017/supportdesk');
            console.warn('   Create `backend/.env` from `backend/.env.example` to configure a different database.');
        }

        const conn = await mongoose.connect(uri);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        return conn;
    } catch (error) {
        console.error(`❌ Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
};
