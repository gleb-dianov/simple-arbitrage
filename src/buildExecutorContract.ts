import path from 'path';
import fs from 'fs';
let solc = require('solc');

// Compile contract
const contractPath = path.resolve(
    __dirname + '/../contracts',
    'BundleExecutor.sol'
);

const source = fs.readFileSync(contractPath, 'utf8');

const input = {
   language: 'Solidity',
   sources: {
      'BundleExecutor.sol': {
         content: source,
      },
   },
   settings: {
      outputSelection: {
         '*': {
            '*': ['*'],
         },
      },
   },
};

const tempFile = JSON.parse(solc.compile(JSON.stringify(input)));
const contractFile = tempFile.contracts['BundleExecutor.sol']['BundleExecutor'];

export default contractFile;