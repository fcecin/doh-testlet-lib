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
// Using require('doh-testlet-lib') will automatically load the .env
//   file using the dotenv JS package.
// dotenv doesn't properly search for the .env file; instead, you have
//   to tell it where it is, unless it is in the current directory.
// What we do here is we look for .env in the current directory, and
//   if it is not found, we successively search the parent directory
//   until we find one.
// ---------------------------------------------------------------------

const path = require('path');
const dotenv = require('dotenv');

function __findDotenv(currentDir) {
    const root = path.parse(currentDir).root;
    while (true) {
        const dotenvPath = path.join(currentDir, '.env');
        if (fs.existsSync(dotenvPath))
            return dotenvPath;
        if (currentDir === root)
            return null;
        currentDir = path.join(currentDir, '..');
    }
}

const dotenvPath = __findDotenv(__dirname);
if (dotenvPath) {
    const originalEnv = JSON.parse(JSON.stringify(process.env));

    dotenv.config({ path: dotenvPath });
    console.log('DoH Testlet Lib: applied ' + dotenvPath);

    // Identify new and changed environment variables
    const newVars = [];
    const changedVars = [];
    for (const key in process.env) {
        if (!(key in originalEnv)) {
            newVars.push(key);
        } else if (process.env[key] !== originalEnv[key]) {
            changedVars.push(key);
        }
    }
    console.log("DoH Testlet Lib: environment variables set:");
    newVars.forEach(key => console.log(`  ${key}: ${process.env[key]}`));
    changedVars.forEach(key => console.log(`  ${key}: ${process.env[key]} (was ${originalEnv[key]})`));

} else {
    console.log('WARNING: DoH Testlet Lib: .env file not found');
}

// ---------------------------------------------------------------------
// checkRequiredVariables()
//
// Takes a vararg list of environment variable names and throws an
//   exception if any one of these expected environment variables is
//   unset (i.e. evaluates to an empty string)
// ---------------------------------------------------------------------

function checkRequiredVariables(...variables) {
    const undefinedVariables = variables.filter(variable => !process.env[variable]);
    if (undefinedVariables.length > 0) {
        throw new Error(`ERROR: dohTestletLib.js: checkRequiredVariables(${variables}): Some required environment variables are not defined: ${undefinedVariables.join(', ')}`);
    }
}

// ---------------------------------------------------------------------
// getVariable()
//
// Simple wrapper to process.env that returns "" for nonexistent,
//   undefined environment variables (which is the behavior in shell).
// ---------------------------------------------------------------------

function getVariable(variableName) {
    return process.env[variableName] || "";
}

// ---------------------------------------------------------------------
// singlePushAction()
//
// Pushes the specified cleos command line once to a running blockchain
//   node using cleos.
//
// actionData can be either a string or some Javascript data type. If
//   it is NOT a string, it will be converted to one via
//   JSON.stringify().
// ---------------------------------------------------------------------

function singlePushAction(actionData, contractName, actionName, authority, cleosUrl = "", cleosWalletUrl = "", otherOpts = "") {

    if (typeof actionData !== 'string')
        actionData = JSON.stringify(actionData);

    let cleosUrlOpt = '';
    if (cleosUrl !== '') { cleosUrlOpt = `-u ${cleosUrl}`; }
    let cleosWalletUrlOpt = '';
    if (cleosWalletUrl !== '') { cleosWalletUrlOpt = `--wallet-url ${cleosWalletUrl}`; }

    let cleosCmd = `cleos ${cleosUrlOpt} ${cleosWalletUrlOpt} ${otherOpts} push action ${contractName} ${actionName} '${actionData}' -p ${authority}`;

    // Log it
    console.log(cleosCmd);

    // Throws an exception if cleos fails
    execSync(cleosCmd);
}

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
        throw new Error(`ERROR: pushAction(${args}): Data file '${dataFile}' not found (current working dir: ` + process.cwd() + ')');
    }

    console.log(`pushAction(${args}): loading data file...`);

    let myArray;
    try {
        const data = fs.readFileSync(dataFile, 'utf8');
        myArray = JSON.parse(data);
        if (!Array.isArray(myArray)) {
            throw new Error(`ERROR: pushAction(${args}): Invalid JSON format: DoH data file is not an array.`);
        }
    } catch (error) {
        throw new Error(`ERROR: pushAction(${args}): Failed to load data file:` + error);
    }

    console.log(`pushAction(${args}): pushing ${myArray.length} items...`);

    for (let i = 0; i < myArray.length; i++) {

        // The surrounding brackets [] denote that the parameters to the action are positional,
        //   which is how pushAction() (this batch pushing method) works.
        // The DoH entity data file (.json data file) is in [variantname, variantdata] format,
        //   and that is passed as the single argument to the action.
        //
        let argStr = '[' + JSON.stringify(myArray[i]) + ']';

        singlePushAction(argStr, contractName, actionName, contractName, cleosUrl, cleosWalletUrl, otherOpts);
    }
}

// ---------------------------------------------------------------------
// ---------------------------------------------------------------------

module.exports = {
    checkRequiredVariables,
    getVariable,
    pushAction,
    singlePushAction
};
