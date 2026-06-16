import 'dotenv/config';
import { connectDB } from '../config/database.js';
import User from '../models/User.model.js';

const expected = [
  { email: 'superadmin@workdesks.com', password: 'super123' },
  { email: 'manager@workdesks.com', password: 'manager123' },
  { email: 'agent@workdesks.com', password: 'agent123' },
  { email: 'customer@workdesks.com', password: 'customer123' }
];

const run = async () => {
  const conn = await connectDB();

  console.log('MONGODB_URI:', process.env.MONGODB_URI || '(fallback)');
  if (conn?.connection?.name) console.log('Database:', conn.connection.name);
  const totalUsers = await User.countDocuments();
  console.log('Total users:', totalUsers);

  for (const u of expected) {
    const user = await User.findOne({ email: u.email }).select('+password');
    if (!user) {
      console.log(`❌ Missing: ${u.email}`);
      continue;
    }
    const ok = await user.comparePassword(u.password);
    console.log(`${ok ? '✅' : '❌'} ${u.email} role=${user.role}`);
  }

  process.exit(0);
};

run().catch((err) => {
  console.error('verifyDemoUsers failed:', err);
  process.exit(1);
});
