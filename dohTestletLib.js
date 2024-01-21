// ---------------------------------------------------------------------
// DoH Testlet Library
//
// This is where we put all of the JS functionality that the
//   development/interactive tests need.
//
// To reduce verbosity, you have these options:
// - set the environment variable DOH_TESTLET_LIB_QUIET = 1, which
//   reduces diagnostic output.
// - call setEcho(false) at each top-level testlet that you run
//   (that is, call from the shell, or call with dohRunTestlet()),
//   which disables printing the cleos command that is executed.
// - call setEchoResult(false) at each top-level testlet that you
//   run, which disabled printing the cleos command output.
//
// Even with echoResult() disabled, you can still get the result of
//   cleos commands that you care about by capturing the string
//   returned by singlePushAction(), pushAction(), getTable() or
//   cleos().
// ---------------------------------------------------------------------

const fs = require('fs');
const { execSync } = require('child_process');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const deasync = require('deasync');

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
        verboseLog('INFO: dohTestletLib.js: config(): CTH_PATH is set (automated test environment detected, as opposed to interactive), so .env will not be loaded.');

        const sortedEnv = Object.keys(process.env).sort().reduce((sorted, key) => { sorted[key] = process.env[key]; return sorted; }, {});

        // This is too much info; makes the log unusable.
        // Should add it back when we have a way to do a "TRACE=true" option for the testlet lib.
        //
        //verboseLog("INFO: dohTestletLib.js: config(): Current environment variables (ALL of them): " + JSON.stringify(sortedEnv, null, 2));

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
                verboseLog("INFO: dohTestletLib.js: config(): no environment variable changes detected.");
            } else {
                verboseLog("INFO: dohTestletLib.js: config(): environment variables set:");
                newVars.forEach(key => verboseLog(`  ${key}: ${process.env[key]}`));
                changedVars.forEach(key => verboseLog(`  ${key}: ${process.env[key]} (was ${originalEnv[key]})`));
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
// Verbose logging of what the testlets library is doing is disabled if
//   the DOH_TESTLET_LIB_QUIET env var is set.
// ---------------------------------------------------------------------

function verboseLog(...args) {
    if (! (getVariable('DOH_TESTLET_LIB_QUIET'))) {
        console.log(...args);
    }
}

// ---------------------------------------------------------------------
// Enable/disable echoing of cleos commands to the output.
// ---------------------------------------------------------------------

function setEcho(value) {
    __DoHTestletLibEcho = value;
}

function getEcho() {
    // default is echo enabled
    if (typeof __DoHTestletLibEcho === 'undefined') { return true; }
    // otherwise return what is set
    return __DoHTestletLibEcho;
}

// ---------------------------------------------------------------------
// Enable/disable logging of cleos results to the output.
// ---------------------------------------------------------------------

function setEchoResult(value) {
    __DoHTestletLibEchoResult = value;
}

function getEchoResult() {
    // default is echo enabled
    if (typeof __DoHTestletLibEchoResult === 'undefined') { return true; }
    // otherwise return what is set
    return __DoHTestletLibEchoResult;
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

    let cleosCmd = `cleos ${cleosUrlOpt} ${cleosWalletUrlOpt} ${globalOpts} push action ${contractName} ${actionName} '${actionData}' -p ${authority} ${otherOpts} 2>&1`;

    // Log it conditionally
    if (getEcho()) {
        console.log(cleosCmd);
    }

    // execSync() throws an exception if cleos (the invoked process) fails, which is what we want.
    // - Capture the output in a string and return it (so the caller can scan it if needed).
    // - Echo it conditionally (execSync drops stderr, but stderr is piped to stdout with 2>&1 above)
    const output = execSync(cleosCmd, { stdio: 'pipe' }).toString();
    if (getEchoResult()) {
        console.log(output);
    }
    return output;
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

// Async version of singlePushAction() to help parallelize pushAction()
async function singlePushActionAsync(actionData, contractName, actionName, authority, cleosUrl = "", cleosWalletUrl = "", otherOpts = "") {

    if (typeof actionData !== 'string')
        actionData = JSON.stringify(actionData);

    let cleosUrlOpt = '';
    if (cleosUrl !== '') { cleosUrlOpt = `-u ${cleosUrl}`; }
    let cleosWalletUrlOpt = '';
    if (cleosWalletUrl !== '') { cleosWalletUrlOpt = `--wallet-url ${cleosWalletUrl}`; }

    const globalOptsList = ['--no-verify', '--no-auto-keosd', '-v', '--verbose', '--print-request', '--print-response', '--http-verbose', '--http-trace'];
    let globalOpts = '';
    otherOpts.split(' ').forEach(opt => {
        if (globalOptsList.includes(opt)) {
            globalOpts += `${opt} `;
            otherOpts = otherOpts.replace(opt, '');
        }
    });

    let cleosCmd = `cleos ${cleosUrlOpt} ${cleosWalletUrlOpt} ${globalOpts} push action ${contractName} ${actionName} '${actionData}' -p ${authority} ${otherOpts} 2>&1`;

    // This is the different part (await exec vs. execSync)
    const result = await exec(cleosCmd);

    // stdout contains stderr as well due to 2>&1
    // return both the command echo, and the command result; caller
    //   decides what to do with those.
    return [ cleosCmd, result.stdout ];
}

function pushAction(dataFile, contractName, actionName, cleosUrl = "", cleosWalletUrl = "", otherOpts = "") {
    let args = `${contractName}, ${actionName}, ${dataFile}`;

    if (!fs.existsSync(dataFile)) {
        throw new Error(`ERROR: pushAction(${args}): Data file '${dataFile}' not found (current working dir: ` + process.cwd() + ')');
    }

    verboseLog(`pushAction(${args}): loading data file...`);

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

    const maxConcurrentTasks = 100;
    verboseLog(`pushAction(${args}): pushing ${myArray.length} items (in parallel, at most ${maxConcurrentTasks} at a time)...`);

    let allPromisesCompleted = false;
    let currentIndex = 0;
    let activeTasks = 0;
    let results = [];
    const executeNext = async () => {
        if (currentIndex >= myArray.length) {
            if (activeTasks === 0) {
                allPromisesCompleted = true;
            }
            return;
        }
        activeTasks++;
        let item = myArray[currentIndex++];
        let argStr = '[' + JSON.stringify(item) + ']';
        try {
            const result = await singlePushActionAsync(argStr, contractName, actionName, contractName, cleosUrl, cleosWalletUrl, otherOpts);
            results.push(result);
        } finally {
            activeTasks--;
            executeNext();
        }
    };

    // Start initial batch of tasks
    for (let i = 0; i < Math.min(maxConcurrentTasks, myArray.length); i++) {
        executeNext();
    }

    //verboseLog(`pushAction(${args}): waiting for completion (synchronously)...`); // debug only

    deasync.loopWhile(() => !allPromisesCompleted);

    //verboseLog(`pushAction(${args}): completed ...`); // debug only

    // Compute and/or echo combined output
    let returnStr = ''; // Full result for the caller to use
    let echoStr = '';   // Compute the conditional echoing
    results.forEach(res => {
        // command echos are never returned by the function; this is
        //   consistent with singlePushAction(), getTable() and cleos(),
        //   which return stdout/stderr only.
        //returnStr += res[0] + '\n';
        returnStr += res[1] + '\n';
        if (getEcho()) {
            echoStr += res[0] + '\n';
        }
        if (getEchoResult()) {
            echoStr += res[1] + '\n';
        }
    });
    returnStr = returnStr.trim();
    echoStr = echoStr.trim();
    if (echoStr === '') {
        verboseLog(`pushAction(${args}): no output to print for ${myArray.length} results (echo disabled?).`);
    } else {
        verboseLog(`pushAction(${args}): printing ${myArray.length} results ...`);
        console.log(echoStr);
        verboseLog(`pushAction(${args}): finished printing ${myArray.length} results ...`);
    }
    return returnStr;
}

// ---------------------------------------------------------------------
// getTable()
//
// Gets a table with given query parameters, returns the result.
// ---------------------------------------------------------------------

function getTable(contractName, scopeName, tableName, queryOpts, cleosUrl = "", cleosWalletUrl = "", otherOpts = "") {

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

    // For get table, ${otherOpts} (after getting the global options) is dropped (it would contain options that are for
    //   push action, like --force-unique). This allows the caller to use the same options env var for both
    //   push action and get table.

    let cleosCmd = `cleos ${cleosUrlOpt} ${cleosWalletUrlOpt} ${globalOpts} get table ${contractName} ${scopeName} ${tableName} ${queryOpts} 2>&1`;

    // Log it conditionally
    if (getEcho()) {
        console.log(cleosCmd);
    }

    // execSync() throws an exception if cleos (the invoked process) fails, which is what we want.
    // - Capture the output in a string and return it (so the caller can scan it if needed).
    // - Echo it conditionally (execSync drops stderr, but stderr is piped to stdout with 2>&1 above)
    const output = execSync(cleosCmd, { stdio: 'pipe' }).toString();
    if (getEchoResult()) {
        console.log(output);
    }
    return output;
}

// ---------------------------------------------------------------------
// cleos()
//
// Calls cleos with the given parameters and returns the result.
//
// Except for the API node URL and the wallet URL, all cleos options
//   (--force-unique, --verbose, etc.) have to be passed as part of
//   cleosParams.
// ---------------------------------------------------------------------

function cleos(cleosParams, cleosUrl = "", cleosWalletUrl = "") {

    let cleosUrlOpt = '';
    if (cleosUrl !== '') { cleosUrlOpt = `-u ${cleosUrl}`; }
    let cleosWalletUrlOpt = '';
    if (cleosWalletUrl !== '') { cleosWalletUrlOpt = `--wallet-url ${cleosWalletUrl}`; }

    let cleosCmd = `cleos ${cleosUrlOpt} ${cleosWalletUrlOpt} ${cleosParams} 2>&1`;

    // Log it conditionally
    if (getEcho()) {
        console.log(cleosCmd);
    }

    // execSync() throws an exception if cleos (the invoked process) fails, which is what we want.
    // - Capture the output in a string and return it (so the caller can scan it if needed).
    // - Echo it conditionally (execSync drops stderr, but stderr is piped to stdout with 2>&1 above)
    const output = execSync(cleosCmd, { stdio: 'pipe' }).toString();
    if (getEchoResult()) {
        console.log(output);
    }
    return output;
}

// ---------------------------------------------------------------------
// ---------------------------------------------------------------------

module.exports = {
    config,
    setEcho,
    getEcho,
    setEchoResult,
    getEchoResult,
    checkRequiredVariables,
    getVariable,
    pushAction,
    singlePushAction,
    getTable,
    cleos
};
