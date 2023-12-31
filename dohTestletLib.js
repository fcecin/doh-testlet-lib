// ---------------------------------------------------------------------
// DoH Testlet Library
//
// This is where we put all of the JS functionality that the
//   development/interactive tests need.
// ---------------------------------------------------------------------

const fs = require('fs');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------
// config()
//
// Using require('doh-testlet-lib').config() will automatically load
//   the .env file using the dotenv JS package.
// dotenv doesn't properly search for the .env file; instead, you have
//   to tell it where it is, unless it is in the current directory.
// What we do here is we look for .env in the current directory, and
//   if it is not found, we successively search the parent directory
//   until we find one.
//
// EXCEPTION: If the CTH_PATH environment variable is set, then that
//   means we are running inside the cth environment, and not from
//   an interactive setup. In that case, we do not load .env files,
//   and instead rely on the Cth/DoH automated test libraries to
//   set the environment variables to their proper values, allowing
//   testlets called from cth automated tests to find and use the
//   correct, automated-testing-compatible parameter values for cleos.
// ---------------------------------------------------------------------

function config() {

    if (process.env.CTH_PATH) {
        console.log("INFO: dohTestletLib.js: config(): CTH_PATH is set (automated test environment detected, as opposed to interactive), so .env will not be loaded.");

        const sortedEnv = Object.keys(process.env).sort().reduce((sorted, key) => { sorted[key] = process.env[key]; return sorted; }, {});
        console.log("INFO: dohTestletLib.js: config(): Current environment variables (ALL of them): " + JSON.stringify(sortedEnv, null, 2));
    } else {
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

            // NOTE: We are using the { override: true } option in dotenv.config()
            //       This means that loading an .env file WILL overwrite variables that were already defined.
            //       I *think* this is what we want, as it satisfies the Principle of Least Astonishment.
            //
            dotenv.config({ path: dotenvPath, override: true });

            console.log('INFO: dohTestletLib.js: config(): applied ' + dotenvPath);

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
            if (newVars.length === 0 && changedVars.length === 0) {
                console.log("INFO: dohTestletLib.js: config(): no environment variable changes detected.");
            } else {
                console.log("INFO: dohTestletLib.js: config(): environment variables set:");
                newVars.forEach(key => console.log(`  ${key}: ${process.env[key]}`));
                changedVars.forEach(key => console.log(`  ${key}: ${process.env[key]} (was ${originalEnv[key]})`));
            }

        } else {
            console.log('WARNING: dohTestletLib.js: config(): .env file not found');
        }
    }

    // Chain it so you can do
    //   const tl = require('doh-testlet-lib').config();
    return module.exports;
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

    // Options to be moved from the otherOpts string to the globalOpts string
    // (these are global cleos options, instead of options that depend on which
    //   cleos subcommand you are using, which have to appear after the command is stated,
    //   whereas global options have to appear before the command is stated).
    // We don't want to add another environment variable just for this cleos idiosyncrasy.
    const globalOptsList = ['--no-verify', '--no-auto-keosd', '-v', '--verbose', '--print-request', '--print-response', '--http-verbose', '--http-trace'];
    let globalOpts = '';
    otherOpts.split(' ').forEach(opt => {
        if (globalOptsList.includes(opt)) {
            globalOpts += `${opt} `;
            otherOpts = otherOpts.replace(opt, '');
        }
    });

    let cleosCmd = `cleos ${cleosUrlOpt} ${cleosWalletUrlOpt} ${globalOpts} push action ${contractName} ${actionName} '${actionData}' -p ${authority} ${otherOpts}`;

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
    singlePushAction,
    config
};
