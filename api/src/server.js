import { migrate } from './db.js';
import { seedOwner } from './auth.js';
import { createApp } from './app.js';
import { startBot } from './telegram.js';

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET kamida 32 belgi bölişi kerak'); process.exit(1);
}
await migrate();
await seedOwner();
const port = Number(process.env.PORT || 3000);
createApp().listen(port, () => console.log(`[api] ${port}-portda işlayapti`));
startBot();
