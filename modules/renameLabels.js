const { google } = require('googleapis');
const fs = require('fs');
const performance = require('perf_hooks').performance;

async function renameAndNestLabels(userEmail, log, jsonkey_file_path) {
  const startTime = performance.now(); // Start timer
  log(' ');
  const startDate = new Date(); // Get current date and time
  log(`Started processing ${userEmail} at: ${startDate.toISOString()}`); // Use ISO format for readability
  log(' ');
  
  const auth = new google.auth.GoogleAuth({
    keyFile: jsonkey_file_path,
    scopes: ['https://www.googleapis.com/auth/gmail.labels'],
    clientOptions: {
      subject: userEmail, // The email of the user you're acting on behalf of
    },
  });

  const gmail = google.gmail({ version: 'v1', auth });

  // Define the parent label name and ID
  const parentLabelName = userEmail;
  let parentLabelId;

  // Check if the parent label already exists; if not, create it
  const listRes = await gmail.users.labels.list({ userId: 'me' });
  const labels = listRes.data.labels;

  const parentLabel = labels.find(label => label.name === parentLabelName);
  if (parentLabel) {
    parentLabelId = parentLabel.id;
  } else {
    const createRes = await gmail.users.labels.create({
      userId: 'me',
      resource: { name: parentLabelName },
    });
    parentLabelId = createRes.data.id;
  }
  
  log(`Using Parent Label: ${parentLabelName}`);

  // System labels to avoid renaming
  const systemLabels = [
    'INBOX', 'SENT', 'DRAFT', 'CHAT', 'SPAM', 'TRASH',
    'IMPORTANT', 'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL',
    'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 
    'UNREAD', 'STARRED'
  ];

  // Rename existing labels and nest under the parent label
  for (const label of labels) {
    if (
      !label.name.startsWith(`${parentLabelName}/`) &&
      label.name !== parentLabelName && // Avoid renaming the parent label
      !systemLabels.includes(label.name) // Avoid renaming system labels
    ) {
      const newLabelName = `${parentLabelName}/${label.name}`;

      // Check if a label with the new name already exists
      const existingLabel = labels.find(existingLabel => existingLabel.name === newLabelName);
      if (existingLabel) {
        log(`Skipped renaming ${label.name}: the label "${newLabelName}" already exists.`);
        continue;
      }

      // Rename label
      try {
        await gmail.users.labels.update({
          userId: 'me',
          id: label.id,
          resource: { name: newLabelName },
        });
        log(`Renamed label: ${label.name} to ${newLabelName}`);
      } catch (error) {
        log(error+'label name'+label.name);
      }
      
    } else {
      log(`Skipped renaming system label: ${label.name}`);
    }
  }
  const endTime = performance.now(); // End timer
  log(`Execution time for renaming labels of ${userEmail}: ${(endTime - startTime).toFixed(2)} ms`);

  log('Label renaming complete.');
}

module.exports = { renameAndNestLabels };

// Call the function for a specific user
// const user_email = example@companydomain.com // Replace with the user's email
// renameAndNestLabels(user_email); 

