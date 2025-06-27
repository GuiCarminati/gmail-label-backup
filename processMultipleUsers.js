const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { manageGmailLabels } = require('./modules/relabelAllEmails'); // Ensure the function is exported in relabelAllEmails.js
const { renameAndNestLabels } = require('./modules/renameLabels'); // Ensure the function is exported in renameLabels.js
const performance = require('perf_hooks').performance;

let jsonkey_file_path = './resources/'; // folder location (file name will be selected based on user's execution input (process.argv[2]))

// Ensure the execution_logs folder exists
const logFolder = path.join(__dirname, 'execution_logs');
if (!fs.existsSync(logFolder)) {
  fs.mkdirSync(logFolder);
}

// Create a timestamped log file
const logFileName = `log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
const logFilePath = path.join(logFolder, logFileName);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

// Helper function to log messages
function log(message) {
  const timestampedMessage = `[${new Date().toISOString()}] ${message}`;
  console.log(timestampedMessage); // Output to console
  logStream.write(`${timestampedMessage}\n`); // Append to log file
}

// Function to read emails from the text file
function readEmailsFromFile(filePath) {
  const data = fs.readFileSync(filePath, 'utf-8');
  return data.split(',').map(email => email.trim());
}

// Function to prompt user for input
async function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

function getServiceKeyFileName(){
  const arg = process.argv[2];
  switch(arg){
    case 'erin': return 'serviceAccountKey_erin.json';
    case 'leevin': return 'serviceAccountKey_leevin.json';
    default: return 'serviceAccountKey.json';
  }
}


// Main function
async function main() {
  const startTotalTime = performance.now(); // Start total timer
  const emailList = readEmailsFromFile('./resources/multipleUserEmails.txt');
  log(`Available emails: ${emailList.join(', ')}`);
  // Prompt user to choose the action to be performed
  const action = await promptUser('Choose an action (1: Rename Labels, 2: Relabel All Emails): ');

  
  jsonkey_file_path += getServiceKeyFileName(); // 

  for (const userEmail of emailList) {
    if (action === '1') {
      log(`Running renameLabels for: ${userEmail}`);
      await renameAndNestLabels(userEmail, log, jsonkey_file_path); // Pass log function as a callback
    } else if (action === '2') {
      log(`Running relabelAllEmails for: ${userEmail}`);
      await manageGmailLabels(userEmail, log, jsonkey_file_path); // Pass log function as a callback
    } else {
      log('Invalid action. Please enter 1 or 2.');
    }
  }

  const endTotalTime = performance.now(); // End total timer
  log(`Total execution time: ${(endTotalTime - startTotalTime).toFixed(2)} ms`);

  // Close the log stream when done
  logStream.end();
}

// Start the process
main().catch(error => {
  log(`Error: ${error.message}`);
});