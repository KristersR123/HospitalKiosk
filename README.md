# Real-Time A&E Wait Time Tracker – Final Year Project

## Project Setup and Deployment Guidelines

### 1. Firebase Realtime Database Setup
- Create a Firebase account at (https://firebase.google.com).
- Create a new Firebase project.
- In your Firebase console:
  - Enable Realtime Database.
  - Start in test mode initially (you can modify database rules later).
- Create two top-level nodes:
  - `hospitalA-patients`
  - `hospitalB-patients`
- Set up the correct database structure with patient fields such as condition, severity, and check-in time.
- Navigate to **Project Settings > Service Accounts**:
  - Generate a new private key (JSON file) for backend authentication.

### 2. Firebase Cloud Functions Setup (Billing)
- Add a billing account (credit or debit card) to Firebase to enable Cloud Functions.
- Firebase billing must be active (Blaze Plan) for server functions to operate properly.

### 3. Backend Server Setup (Node.js and Render.com)
- Clone the backend server code from the repository.
- Inside the backend project folder, create a `.env` file with the following content:

```ini
FIREBASE_DATABASE_URL=your-firebase-realtime-db-url
FIREBASE_PROJECT_ID=your-firebase-project-id
PRIVATE_KEY=your-private-key (escaped format if multiline)
CLIENT_EMAIL=your-firebase-client-email
```

- Update any hardcoded Firebase Database URLs in the backend files (such as `firebase.js` or `server.js`) to your new Firebase Realtime Database URL.

- Create an account at (https://render.com).
- Deploy a new Web Service:
  - Connect your GitHub repository.
  - Choose Node.js as the environment.
  - Set all environment variables based on your `.env` file.
  - Deploy and retrieve your new backend API URL.

### 4. Mobile Application Setup (Android Studio)
- Open Android Studio.
- Open the `mobile-app/` project directory.
- In the mobile application code:
  - Open `WaitlistRepository.kt`.
  - Update the base URL to point to your deployed Render backend API URL.
- Check any other places where API URLs are referenced and update if necessary.
- Make sure the app has:
  - Internet permission (declared in `AndroidManifest.xml`)
  - Fine location permission (for GPS-based hospital detection)
- Connect a real Android device or start an Android emulator.
- Build and run the mobile application.

### 5. Important Configuration Notes
- Ensure the Firebase Realtime Database paths (`hospitalA-patients` and `hospitalB-patients`) match exactly in both backend and mobile code.
- Fine Location permission must be accepted by the user for GPS-based hospital filtering.
- The backend server (Render.com service) must remain active and reachable for the mobile application to function.
- Firebase billing must remain active for any production use of Cloud Functions or database listening.


## Technologies Used
- Android Studio (Mobile App Development)
- Kotlin Programming Language
- Jetpack Compose (Modern Android UI Toolkit)
- Node.js Server Environment
- Express.js Framework
- Firebase Realtime Database (Cloud Data Storage)
- Render.com (Backend Hosting Platform)


## Author
Kristers Rakstins  
Student ID: K00273773  
