const dns = require('dns');

const hostname = '_mongodb._tcp.chatappcluster.sea1igh.mongodb.net';

console.log(`Attempting to resolve SRV record for: ${hostname}`);

dns.resolveSrv(hostname, (err, addresses) => {
    if (err) {
        console.error('DNS Resolution Failed:', err);
        console.log('\nPotential causes:');
        console.log('1. Your specific DNS server is blocking or timing out on this request.');
        console.log('2. A firewall is blocking DNS queries.');
        console.log('3. ISP filtering.');
    } else {
        console.log('DNS Resolution Successful!');
        console.log('Addresses:', addresses);
    }
});
