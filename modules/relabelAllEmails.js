const { renameAndNestLabels } = require('./renameLabels.js'); // Ensure the function is exported in relabelAllEmails.js

process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error.message}\n${error.stack}`);
  process.exit(1); // Exit the process after logging
});

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled Rejection at: ${promise}\nReason: ${reason}`);
});

const { google } = require('googleapis');
const fs = require('fs');
const performance = require('perf_hooks').performance;

// Delay function for throttling requests
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Counter variables
let totalProcessed = 0;
let totalLabeledAll = 0;
let totalLabeledSent = 0;
let totalFailed = 0;
let totalEmails = 0;


// Progress bar function
function displayProgressBar(total, processed, log) {
  const validProcessed = Math.min(processed, total); // Ensure processed doesn't exceed total
  const percentage = total ? ((validProcessed / total) * 100).toFixed(2) : 0; // Prevent division by zero
  const barLength = 40; // Length of the progress bar
  const filledLength = Math.round((barLength * percentage) / 100);
  const bar = '█'.repeat(filledLength) + '-'.repeat(barLength - filledLength);

  // Write to console
  process.stdout.write(`\r[${bar}] ${percentage}% (${validProcessed}/${total})`);

  // Log to file (overwrite last progress state)
  if (log) {
    log(`[${bar}] ${percentage}% (${validProcessed}/${total})`);
  }
}
// Function to manage Gmail labels
async function manageGmailLabels(userEmail, log, jsonkey_file_path) {
  const startTime = performance.now(); // Start timer
  log(' ');
  const startDate = new Date(); // Get current date and time
  log(`Started processing ${userEmail} at: ${startDate.toISOString()}`); // Use ISO format for readability
  log(' ');


  // Reset counters for each user
  totalProcessed = 0; // Reset for each user
  totalLabeledAll = 0;
  totalLabeledSent = 0;
  totalFailed = 0;

  const auth = new google.auth.GoogleAuth({
    keyFile: jsonkey_file_path,
    scopes: ['https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.labels'],
    clientOptions: {
      subject: userEmail, // The email of the user you're acting on behalf of
    },
  });

  const gmail = google.gmail({ version: 'v1', auth });
/////////////
  // // Create the parent label if it doesn't exist
  const parentLabelName = userEmail; // Use the user's email as the parent label name
  // // Check if the parent label already exists
  const listRes = await gmail.users.labels.list({ userId: 'me' });
  const labels = listRes.data.labels;

  await renameAndNestLabels(userEmail,log,jsonkey_file_path);
  // Create and apply the new label for all emails that have no labels
  const newLabelName = `${parentLabelName}/_all`;
  let newLabelId;

  // Check if the new label already exists
  const existingNewLabel = labels.find(label => label.name === newLabelName);
  if (existingNewLabel) {
    newLabelId = existingNewLabel.id;
  } else {
    const createNewRes = await gmail.users.labels.create({
      userId: 'me',
      resource: { name: newLabelName },
    });
    newLabelId = createNewRes.data.id;
  }

  // Apply the new label to all emails that have no labels, excluding sent emails
  let nextPageToken;
  
  // Count total emails for progress bar
  let totalEmails = 0;
  log(`Calculating Total Emails Count...`);
  do {
    const allEmailsRes = await gmail.users.messages.list({
      userId: 'me',
      q: '-in:sent', // doesnt work
      maxResults: 100, // Adjust the limit as needed
      pageToken: nextPageToken,
    });

    const allMessages = allEmailsRes.data.messages || [];
    totalEmails += allMessages.length; // Increment the total emails count
    nextPageToken = allEmailsRes.data.nextPageToken;
  } while (nextPageToken);
  
  log(`Applying label '${newLabelName}' to all emails that have no labels, excluding sent emails...`);
  // Reset nextPageToken to process emails
  nextPageToken = null;
  do {
    const allEmailsRes = await gmail.users.messages.list({
      userId: 'me',
      q: '-in:sent', // doesnt work
      maxResults: 100, // Adjust the limit as needed
      pageToken: nextPageToken,
    });

    const allMessages = allEmailsRes.data.messages || [];
    const batch = []; // To hold messages for batch processing
    for (const message of allMessages) {
      batch.push(message); // Collect messages for batch processing
    }

    // Process messages in batches
    for (const message of batch) {
      totalProcessed++;
      displayProgressBar(totalEmails, totalProcessed); // Update the progress bar

      // Fetch the message details to check for existing labels
      const messageRes = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'full',
      });
	  
      // Check if the message has no labels and is not in Sent
      const isSent = messageRes.data.labelIds && messageRes.data.labelIds.includes('SENT');
      if (!messageRes.data.labelIds || messageRes.data.labelIds.length === 0) {
        const success = await modifyMessageWithRetry(gmail, message.id, [newLabelId]);
        if (success) totalLabeledAll++;
      } else if (!isSent) {
        // Optionally, apply the label if it has other labels but is not sent
        const success = await modifyMessageWithRetry(gmail, message.id, [newLabelId]);
        if (success) totalLabeledAll++;
      }
    }
	displayProgressBar(totalEmails, totalProcessed, log); // update to the progress bar for _all label


    // Update the nextPageToken
    nextPageToken = allEmailsRes.data.nextPageToken;
  } while (nextPageToken);

  // Apply the _sent label to all sent emails
  const sentLabelName = `${parentLabelName}/_sent`;
  let sentLabelId;

  log(`Applying '${sentLabelName}' to all sent emails...`);

  // Check if the _sent label already exists
  const sentLabel = labels.find(label => label.name === sentLabelName);
  if (sentLabel) {
    sentLabelId = sentLabel.id;
  } else {
    const createSentRes = await gmail.users.labels.create({
      userId: 'me',
      resource: { name: sentLabelName },
    });
    sentLabelId = createSentRes.data.id;
  }

  log(`Using Sent Label: ${sentLabelName}`);

  nextPageToken = null;  
  // Count total emails for progress bar
  let totalSent = 0;
  // Apply the _sent label to all sent emails
  log(`Calculating Total Sent Email Count...`);
  do {
    const sentEmailsRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:sent',
      maxResults: 100, // Adjust the limit as needed
      pageToken: nextPageToken,
    });

    const sentMessages = sentEmailsRes.data.messages || [];
    totalSent += sentMessages.length; // Increment the total emails count
    nextPageToken = sentEmailsRes.data.nextPageToken;
  } while (nextPageToken);

  
  let totalSentProcessed = 0;
  nextPageToken = null;
  do {
    const sentEmailsRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:sent',
      maxResults: 100, // Adjust the limit as needed
      pageToken: nextPageToken,
    });

    const sentMessages = sentEmailsRes.data.messages || [];
    for (const message of sentMessages) {
      totalSentProcessed++;
	  totalProcessed++;
      displayProgressBar(totalSent, totalSentProcessed); // Update the progress bar
      const success = await modifyMessageWithRetry(gmail, message.id, [sentLabelId]);
      if (success) totalLabeledSent++;
    }
    displayProgressBar(totalSent, totalSentProcessed, log); // update to the progress bar for _sent label

    // Update the nextPageToken
    nextPageToken = sentEmailsRes.data.nextPageToken;
  } while (nextPageToken);

  // execution results summary
  // displayProgressBar(totalEmails, totalProcessed, log); // Final update of the progress bar
  log('\n\nProcess Complete\n');
  log(`Total Emails Processed: ${totalProcessed}`);
  log(`Total Labeled with "_all": ${totalLabeledAll}`);
  log(`Total Labeled with "_sent": ${totalLabeledSent}`);
  log(`Total Failed to Label: ${totalFailed}`);

  const endTime = performance.now(); // End timer
  log(`Execution time for ${userEmail}: ${(endTime - startTime).toFixed(2)} ms`);

  totalSent = 0;
  totalEmails = 0; // Reset totalEmails to avoid carry-over

}

// Helper function to modify messages with retry logic
async function modifyMessageWithRetry(gmail, messageId, addLabelIds) {
  const maxRetries = 5;
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        resource: {
          addLabelIds,
        },
      });
      return true; // Modification successful
    } catch (error) {
      attempts++;
      if (attempts >= maxRetries) {
        log(`ERROR: Failed to modify message ${messageId} after ${maxRetries} attempts: ${error}`);
        totalFailed++;
        return false; // All attempts failed
      }
      log(`WARNING: Error modifying message ${messageId}. Retrying... (${attempts}/${maxRetries})`);
      await delay(Math.pow(2, attempts) * 100); // Exponential backoff delay
    }
  }
}

// Call the manageGmailLabels function with user email
//manageGmailLabels(user_email).catch(console.error);

module.exports = { manageGmailLabels };

