import 'dotenv/config';
import { connectDB } from '../config/database.js';
import { syncInboundEmailForAllCompanies } from '../services/inboundEmail.service.js';

const intervalMs = Number(process.env.INBOUND_EMAIL_POLL_INTERVAL_MS || 60_000);
const once = process.argv.includes('--once');

const runOnce = async () => {
  const startedAt = Date.now();
  const { total } = await syncInboundEmailForAllCompanies();
  const tookMs = Date.now() - startedAt;
  console.log(`📨 Inbound email sync complete: +${total} ticket(s) (${tookMs}ms)`);
};

const main = async () => {
  await connectDB();

  if (once) {
    await runOnce();
    process.exit(0);
  }

  console.log(`📨 Inbound email worker started (interval ${intervalMs}ms). Use --once for a single sync.`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runOnce();
    } catch (e) {
      console.error('Inbound worker tick failed:', e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
};

main().catch((err) => {
  console.error('Inbound email worker failed:', err);
  process.exit(1);
});

