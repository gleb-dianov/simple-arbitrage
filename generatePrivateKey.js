const ethWallet = require('ethereumjs-wallet').default;

console.log(ethWallet);

let addressData = ethWallet.generate();
console.log(`Private key = , ${addressData.getPrivateKeyString()}`);
console.log(`Address = , ${addressData.getAddressString()}`);