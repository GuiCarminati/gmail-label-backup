# Gmail Label Management Automation

This project provides tools to automate Gmail label management for Google Workspace users via the Gmail API, using a Google Cloud service account with domain-wide delegation. It includes scripts to:

- **Rename and nest all user-created labels under a parent label** (the user's email address)
- **Apply custom labels to all emails and sent emails**
- **Process multiple users in batch with logging and progress tracking**

The purpose of these scripts is to nest all emails and labels under a single parent label, so that they're organized when migrating the user's mailbox into another user's mailbox. After execution, you can expect the folowing behaviour:
- All received email be labeled with `useremail@companydomain.com/_all`
- All email in the sent folder will be labeled with `useremail@companydomain.com/_sent`
- All (non-system) labels will be nested under the parent label `useremail@companydomain.com` (eg. `useremail@companydomain.com/custom_label`)

---

## Features

- **Domain-wide delegation**: Manage any user's Gmail labels in your Workspace domain.
- **Batch processing**: Handle multiple users from a list.
- **Progress bar & logging**: Real-time progress and detailed logs in `execution_logs/`.
- **Resilient API calls**: Automatic retries with exponential backoff on Gmail API errors.

---

## Prerequisites

- **Node.js** (v16+ recommended)
- **Google Workspace Admin** access (to configure domain-wide delegation)
- **Google Cloud account** with permissions to create projects and service accounts

---

## Setup Instructions

### 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project via **IAM & Admin > Create a Project**.

### 2. Enable Gmail API

- In your new project, go to **APIs & Services > Library**.
- Search for **Gmail API** and click **Enable**.

### 3. Configure OAuth Consent Screen

- Go to **APIs & Services > OAuth consent screen**.
- Choose **Internal** (recommended for Workspace domains).
- Fill out required fields and save.
- Add these scopes:
  - `https://www.googleapis.com/auth/gmail.labels`
  - `https://www.googleapis.com/auth/gmail.modify`

### 4. Create a Service Account & Key

- Go to **IAM & Admin > Service Accounts**.
- Click **+ CREATE SERVICE ACCOUNT**.
- Name it (e.g., `gmail-label-manager`).
- After creation, click the account > **Keys** > **Add Key** > **Create new key** > **JSON**.
- Download and save the JSON key file as `serviceAccountKey.json` in your project directory.

### 5. Enable Domain-Wide Delegation

- In the service account details, enable **Domain-wide delegation**.
- Note the **Client ID** (a long number).

### 6. Authorize the Service Account in Google Admin Console

- Go to [admin.google.com](https://admin.google.com/) (as a Workspace super admin).
- Navigate to **Security > Access and data control > API controls > Manage Domain Wide Delegation**.
- Click **Add new**.
- Enter the service account's **Client ID**.
- Enter the scopes, comma-separated:
