// ---------------------------------------------------------------------
// DoH Testlet Library
//
// This is where we put all of the JS functionality that the
//   development/interactive tests need.
//
// This probably goes into a node_modules in doh-tester that can be
//   require()'d by any testlet in any application contract repository
//   and directory. It's in the same directory as the testlet because
//   this is a demo.
// ---------------------------------------------------------------------

const fs = require('fs');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------
// pushAction()
//
// This loads an entity dataFile in the standard DoH2 format and
//   pushes them to a running blockchain node using cleos, using
//   the given parameters to compose the cleos calls.
//
// This will later be converted to async/parallel code.
// ---------------------------------------------------------------------

function pushAction(dataFile, contractName, actionName, cleosUrl = "", cleosWalletUrl = "", otherOpts = "") {

    let args = `${contractName}, ${actionName}, ${dataFile}`;

    if (! fs.existsSync(dataFile)) {
        throw new Error(`ERROR: dohPush(${args}): Data file '${dataFile}' not found (current working dir: ` + process.cwd() + ')');
    }

    console.log(`dohPush(${args}): loading data file...`);

    let myArray;
    try {
        const data = fs.readFileSync(dataFile, 'utf8');
        myArray = JSON.parse(data);
        if (!Array.isArray(myArray)) {
            throw new Error(`ERROR: dohPush(${args}): Invalid JSON format: DoH data file is not an array.`);
        }
    } catch (error) {
        throw new Error(`ERROR: dohPush(${args}): Failed to load data file:` + error);
    }

    console.log(`dohPush(${args}): pushing ${myArray.length} items...`);

    let cleosUrlOpt = '';
    if (cleosUrl !== '') { cleosUrlOpt = `-u ${cleosUrl}`; }
    let cleosWalletUrlOpt = '';
    if (cleosWalletUrl !== '') { cleosWalletUrlOpt = `--wallet-url ${cleosUrl}`; }

    const { exec } = require('child_process');
    
    for (let i = 0; i < myArray.length; i++) {
        let argStr = JSON.stringify(myArray[i]);

        // Throws an exception if cleos fails
        execSync(`cleos ${cleosUrlOpt} ${cleosWalletUrlOpt} ${otherOpts} push action ${contractName} ${actionName} '[${argStr}]' -p ${contractName}`);
    }
}

// ---------------------------------------------------------------------
// ---------------------------------------------------------------------

module.exports = {
    pushAction
};
