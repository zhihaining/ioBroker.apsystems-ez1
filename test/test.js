const { createClient } = require('../lib/api');
(async () => {
  const c = createClient({ ip: '127.0.0.1', port: 8050, timeout: 1000, retries: 0 });
  console.log('Client created', !!c);
})();
