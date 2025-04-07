// ===========================================
// IMPORT REQUIRED MODULES
// ===========================================
const express = require("express"); // Express framework for building APIs
const admin = require("firebase-admin"); // Firebase Admin SDK to access Firebase services
const cors = require("cors"); // Middleware for enabling CORS
require("dotenv").config(); // Load environment variables from .env file

// ===========================================
// INITIALISE FIREBASE ADMIN SDK
// ===========================================
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS); // Load Firebase credentials from env
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount), // Authenticate Firebase admin
  databaseURL: "https://hospitalkiosk-a92a4-default-rtdb.europe-west1.firebasedatabase.app" // Realtime DB URL
});

const db = admin.database(); // Get Firebase Realtime DB instance
const app = express(); // Initialize Express app
const PORT = process.env.PORT || 5000; // Define port for server

// ===========================================
// MIDDLEWARE SETUP
// ===========================================
app.use(express.json()); // Parse incoming JSON requests
app.use(cors()); // Enable CORS

const corsOptions = {
  origin: "*", // Allow all origins (change in production)
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // Allowed HTTP methods
  allowedHeaders: ["Content-Type"] // Allowed headers
};
app.use(cors(corsOptions)); // Apply CORS config

// const patientsRef = db.ref("patients"); // Reference to patients collection

// ===========================================
// DATABASE REFS FOR MULTI-HOSPITAL
// ===========================================
const hospitalRefs = {
  hospitalA: db.ref("hospitalA/patients"),
  hospitalB: db.ref("hospitalB/patients")
};


// ===========================================
// MONITOR REALTIME DB CHANGES
// ===========================================
Object.entries(hospitalRefs).forEach(([key, ref]) => {
  ref.on("child_changed", debounce(snapshot => {
    console.log(`${key} patient updated:`, snapshot.val());
  }, 1000));
});

// ===========================================
// WAIT TIME MAPPING BASED ON SEVERITY
// ===========================================
const severityWaitTimes = {
  "Orange": 10,
  "Yellow": 60,
  "Green": 120,
  "Blue": 240
};

// ===========================================
// DECREMENT ESTIMATED WAIT TIMES
// ===========================================
async function monitorQueue(hospitalKey) {
  try {
    // const snap = await patientsRef.once("value"); // Get all patients
    const ref = hospitalRefs[hospitalKey];
    const snap = await ref.once("value");

    if (!snap.exists()) return;

    const updates = {}; // Object to store updates
    snap.forEach(child => {
      const patient = child.val(); // Extract patient
      const key = child.key; // Get DB key

      if (patient.status?.startsWith("Queueing for") && patient.triageTime) {
        const newWaitTime = Math.max((patient.estimatedWaitTime || 0) - 1, 0); // Decrement wait time
        if (newWaitTime <= 0 && patient.status !== "Please See Doctor") {
          updates[`${key}/status`] = "Please See Doctor"; // Update status if ready
        }
        if (newWaitTime !== patient.estimatedWaitTime) {
          updates[`${key}/estimatedWaitTime`] = newWaitTime; // Update wait time
        }
      }
    });

    if (Object.keys(updates).length > 0) {
      await patientsRef.update(updates); // Commit updates to DB
      console.log("⏱ Real-time queue decremented");
    }
  } catch (err) {
    console.error("monitorQueue error:", err); // Handle errors
  }
}

// ===========================================
// PERIODIC LOOP FOR QUEUE MONITORING
// ===========================================
// async function monitorQueueLoop() {
//   await monitorQueue(); // Run monitor
//   setTimeout(monitorQueueLoop, 60000); // Run every 60 seconds
// }
// monitorQueueLoop(); // Start loop

async function monitorQueueLoop() {
  await Promise.all(Object.keys(hospitalRefs).map(key => monitorQueue(key)));
  setTimeout(monitorQueueLoop, 60000); // Every 60 sec
}
monitorQueueLoop();

// ===========================================
// HELPER: GET DB REF BY HOSPITAL PARAM
// ===========================================
function getHospitalRef(hospital) {
  return hospitalRefs[hospital] || null;
}


// ===========================================
// CHECK WAIT TIMES ON STARTUP PER HOSPITAL
// ===========================================
async function checkFirebaseWaitTimes() {
  console.log("Checking estimated wait times...");
  for (const hospitalKey of Object.keys(hospitalRefs)) {
    const snapshot = await hospitalRefs[hospitalKey].once("value");
    if (!snapshot.exists()) continue;

    console.log(`📋 ${hospitalKey} patient wait times:`);
    snapshot.forEach(childSnapshot => {
      const patient = childSnapshot.val();
      console.log(`${patient.patientID} => ${patient.estimatedWaitTime || "N/A"} min`);
    });
  }
}
checkFirebaseWaitTimes(); // Run on server start

// ===========================================
// DEBOUNCING REPEATED CHANGE EVENTS
// ===========================================
function debounce(func, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay); // Limit frequent executions
  };
}
Object.entries(hospitalRefs).forEach(([key, ref]) => {
  ref.on("child_changed", debounce(snapshot => {
    console.log(`${key} patient updated:`, snapshot.val());
  }, 1000));
});

// ===========================================
// HOSPITAL A API ENDPOINTS
// ===========================================

// ----------------------------------------------------------
//    GET /hospitalA/patient-wait-time/:patientID
//    Retrieves the estimated wait time for a single patient
// ----------------------------------------------------------
app.get('/hospitalA/patient-wait-time/:patientID', async (req, res) => {
  try {
    const { patientID } = req.params;  // Extract the patientID from URL params
    console.log(`Fetching wait time for patient: ${patientID}`);

    const snapshot = await db.ref('hospitalA-patients').once('value'); // Fetch all patients from HospitalA DB

    if (!snapshot.exists()) {
      console.log('No patients found in the database.');
      return res.status(404).json({ error: 'Patient not found' });
    }

    let patientData = null; // store the matching patient's data here

    // Iterate through all patients to find matching ID
    snapshot.forEach(child => {
      if (child.val().patientID === patientID) {
        patientData = child.val();
      }
    });

    if (!patientData) {
      console.log(`Patient ID ${patientID} not found.`);
      return res.status(404).json({ error: 'Patient not found' });
    }

    console.log(`Patient found: ${JSON.stringify(patientData)}`);

    // Return the estimatedWaitTime if found, or 'Not Available'
    res.json({
      success: true,
      estimatedWaitTime: patientData.estimatedWaitTime || 'Not Available'
    });
  } catch (error) {
    console.error('Error fetching wait time:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ----------------------------------------------------------
//    GET /doctor-queue
//    Retrieves the queue of patients waiting or being seen by doctor
// ----------------------------------------------------------
app.get('/hospitalA/doctor-queue', async (req, res) => {
  try {
    const snapshot = await db.ref('hospitalA-patients')
      .orderByChild('status') // Order by status
      .once('value');        // Fetch the data

    if (!snapshot.exists()) {
      console.log('⚠ No patients are currently being seen.');
      return res.json([]); // Return empty list
    }

    const doctorQueue = []; // accumulate doctor-queue patients here

    snapshot.forEach(childSnapshot => {
      const patient = childSnapshot.val();

      // only want patients with status 'Please See Doctor' or 'With Doctor'
      // Excluding discharged patients or those who have 'wasSeen'
      if ((patient.status === 'Please See Doctor' || patient.status === 'With Doctor') &&
          patient.status !== 'Discharged' &&
          !patient.wasSeen) {
        doctorQueue.push({
          id: childSnapshot.key, // firebase key
          ...patient            // spread the patient's data
        });
      }
    });

    console.log('Doctor queue updated:', doctorQueue);
    res.json(doctorQueue); // Return doctor queue array
  } catch (error) {
    console.error('Error fetching doctor queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------------
//    GET /hospitalA/hospital-wait-time
//    Aggregates the total wait time for all queueing patients
// ----------------------------------------------------------
app.get('/hospitalA/hospital-wait-time', async (req, res) => {
  try {
    const snapshot = await db.ref('hospitalA-patients').once('value'); // Grab all patients
    if (!snapshot.exists()) {
      return res.json({ totalWait: 0, patientCount: 0 }); // No data, no queue
    }

    let totalWaitTime = 0; // sum up all wait times here
    let count = 0;         // Track how many patients are in queue

    snapshot.forEach(childSnapshot => {
      const patient = childSnapshot.val();
      // Only summation for patients who have a 'Queueing for X' status
      if (patient.status && patient.status.startsWith('Queueing for')) {
        totalWaitTime += patient.estimatedWaitTime || 0;
        count++;
      }
    });

    // Return object with totalWait and patientCount
    res.json({
      totalWait: totalWaitTime,
      patientCount: count
    });
  } catch (error) {
    console.error('Error fetching hospital wait time:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ----------------------------------------------------------
//    GET /hospitalA/patients-awaiting-triage
//    Fetch a list of patients who are still waiting for triage
// ----------------------------------------------------------
app.get('/hospitalA/patients-awaiting-triage', async (req, res) => {
  try {
    const snapshot = await db.ref('hospitalA-patients')
      .orderByChild('status')        // order by 'status'
      .equalTo('Waiting for Triage') // only want those awaiting triage
      .once('value');                // Execute the query

    if (!snapshot.exists()) {
      // If no patients match that status, return an empty array
      return res.json([]);
    }

    const patients = []; // store the results here
    snapshot.forEach(childSnapshot => {
      patients.push({
        id: childSnapshot.key,  // firebase unique key
        ...childSnapshot.val()  // spread out the patient's data
      });
    });

    // Return array of all patients who are waiting for triage
    res.json(patients);
  } catch (error) {
    console.error('Error fetching patients awaiting triage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------------
//    GET /hospitalA/waitlist
//    Show the entire waiting list of non-discharged patients
// ----------------------------------------------------------
app.get('/hospitalA/waitlist', async (req, res) => {
  try {
    const snapshot = await db.ref('hospitalA-patients').once('value'); // Get all patient data

    if (!snapshot.exists()) {
      return res.json([]); // Return empty array if no data
    }

    const waitlist = []; // store the queue data here
    snapshot.forEach(childSnapshot => {
      const patient = childSnapshot.val();

      // skip if invalid or if the patient is discharged/wasSeen
      if (!patient || !patient.status || !patient.patientID || patient.status === 'Discharged' || patient.wasSeen) {
        console.warn('⚠ Skipping invalid or discharged patient:', patient);
        return;
      }

      // Otherwise, push them into the waitlist array
      waitlist.push({
        patientID: patient.patientID,
        condition: patient.condition || 'Unknown',
        severity: patient.severity || 'Unknown',
        queueNumber: patient.queueNumber || 0,
        estimatedWaitTime: patient.estimatedWaitTime !== undefined
          ? patient.estimatedWaitTime
          : severityWaitTimes[patient.severity] || 60,
        status: patient.status
      });
    });

    // Return the compiled waitlist
    res.json(waitlist);
  } catch (error) {
    console.error('Error fetching waitlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------------
//    POST /hospitalA/check-in
//    Create a new patient record upon check-in
// ----------------------------------------------------------
app.post('/hospitalA/check-in', async (req, res) => {
  try {
    const { fullName, dob, gender } = req.body; // Extract from request body

    // Validate the essential fields
    if (!fullName || !dob || !gender) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate a custom patient ID with randomization
    const patientID = 'PAT-' + Math.floor(100000 + Math.random() * 900000);
    const checkInTime = new Date().toISOString(); // Track time

    // Create a new entry in 'patients' collection
    const newPatientRef = db.ref('hospitalA-patients').push();
    await newPatientRef.set({
      firebaseKey: newPatientRef.key, // Store the DB key
      patientID,
      fullName,
      dob,
      gender,
      checkInTime,
      status: 'Waiting for Triage' // Default status
    });

    // Send success response with the newly created patient ID
    res.json({ success: true, patientID });
  } catch (error) {
    console.error('Error checking in patient:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ----------------------------------------------------------
//    POST /hopsitalA/accept-patient
//    Marks a patient as 'With Doctor' once accepted
// ----------------------------------------------------------
app.post('/hospitalA/accept-patient', async (req, res) => {
  try {
    const { patientID } = req.body; // Extract the ID

    if (!patientID) {
      return res.status(400).json({ error: 'Missing patient ID' });
    }

    // Search for the patient by their custom ID
    const snapshot = await db.ref('hospitalA-patients').once('value');
    let firebaseKey = null;

    snapshot.forEach(childSnapshot => {
      if (childSnapshot.val().patientID === patientID) {
        firebaseKey = childSnapshot.key; // Found the record
      }
    });

    if (!firebaseKey) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Update the found patient: status -> 'With Doctor', store acceptedTime
    const patientRef = db.ref(`hospitalA-patients/${firebaseKey}`);
    await patientRef.update({
      status: 'With Doctor',
      acceptedTime: new Date().toISOString()
    });

    res.json({ success: true, message: `Patient ${patientID} accepted.` });
  } catch (error) {
    console.error('Error accepting patient:', error);
    res.status(500).json({ success: false, message: 'Error accepting patient.' });
  }
});

// ----------------------------------------------------------
//    POST /hospitalA/discharge-patient
//    Marks a patient as 'Discharged' and flags them as seen
// ----------------------------------------------------------
app.post('/hospitalA/discharge-patient', async (req, res) => {
  try {
    const { patientID } = req.body; // Extract from request body

    if (!patientID) {
      return res.status(400).json({ error: 'Missing patient ID' });
    }

    // Search for the matching patient record
    const snapshot = await db.ref('hospitalA-patients').once('value');
    let firebaseKey = null;

    snapshot.forEach(childSnapshot => {
      if (childSnapshot.val().patientID === patientID) {
        firebaseKey = childSnapshot.key;
      }
    });

    if (!firebaseKey) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Update the patient's status to 'Discharged'
    await db.ref(`hospitalA-patients/${firebaseKey}`).update({
      status: 'Discharged',
      wasSeen: true,
      dischargedTime: new Date().toISOString()
    });

    return res.json({ success: true, message: `Patient ${patientID} discharged.` });
  } catch (error) {
    console.error('Error discharging patient:', error);
    return res.status(500).json({ success: false, message: 'Error discharging patient.' });
  }
});

// ----------------------------------------------------------
//    POST /hospitalA/assign-severity
//    Assigns or updates a severity level for a patient
// ----------------------------------------------------------
app.post('/hospitalA/assign-severity', async (req, res) => {
  try {
    const { patientID, severity } = req.body; // Extract from request

    if (!patientID || !severity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Basic severity -> waitTimes mapping for fallback
    const severityWaitTimes = {
      'Orange': 10,
      'Yellow': 60,
      'Green': 120,
      'Blue': 240
    };

    const baseWaitTime = severityWaitTimes[severity] || 60; // default 60 if unknown
    const patientsRef = db.ref('hospitalA-patients'); // Reference to 'patients'
    const snapshot = await patientsRef.once('value'); // fetch all

    let foundPatientKey = null;
    let condition = null;
    let lastWaitTime = 0;

    // First, find the correct patient record
    snapshot.forEach(childSnapshot => {
      const patient = childSnapshot.val();
      if (patient.patientID === patientID) {
        foundPatientKey = childSnapshot.key;
        condition = patient.condition;
      }
    });

    if (!foundPatientKey) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Then, find the largest waitTime among patients in the same condition & severity
    snapshot.forEach(childSnapshot => {
      const patient = childSnapshot.val();
      if (
        patient.condition === condition &&
        patient.severity === severity &&
        patient.status.startsWith('Queueing for')
      ) {
        lastWaitTime = Math.max(lastWaitTime, patient.estimatedWaitTime);
      }
    });

    // The estimated wait time for this patient is the largest found + baseWaitTime
    const estimatedWaitTime = lastWaitTime + baseWaitTime;

    // Update the patient record with the new severity, wait time, status, and triageTime
    await db.ref(`hospitalA-patients/${foundPatientKey}`).update({
      severity,
      estimatedWaitTime,
      status: `Queueing for ${severity}`,
      triageTime: new Date().toISOString()
    });

    console.log(`Severity assigned for patient ${patientID} with wait time ${estimatedWaitTime} min.`);

    res.json({ success: true, estimatedWaitTime }); // Return success
  } catch (error) {
    console.error('Error assigning severity:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// ----------------------------------------------------------
//    POST /hospitalA/assign-condition
//    Assigns or updates a medical condition for a patient
// ----------------------------------------------------------
app.post('/hospitalA/assign-condition', async (req, res) => {
  try {
    const { patientID, condition } = req.body; // Extract from request

    if (!patientID || !condition) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const patientsRef = db.ref('hospitalA-patients'); // reference to the entire 'patients' list
    const snapshot = await patientsRef.once('value'); // fetch all

    let foundPatientKey = null;
    // Find the matching patient by custom ID
    snapshot.forEach(childSnapshot => {
      if (childSnapshot.val().patientID === patientID) {
        foundPatientKey = childSnapshot.key;
      }
    });

    if (!foundPatientKey) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // track how many have the same condition, to increment a queue number
    const queueRef = db.ref(`hospitalA-queueNumbers/${condition}`);
    const queueSnapshot = await queueRef.once('value');
    const queueNumber = queueSnapshot.exists() ? queueSnapshot.val() + 1 : 1;

    console.log(`Assigning queue number: ${queueNumber} for condition: ${condition}`);

    // Update the patient's record with the new condition, queue number, etc.
    await db.ref(`hospitalA-patients/${foundPatientKey}`).update({
      condition: condition,
      status: 'Waiting for Triage',
      queueNumber: queueNumber
    });

    // Save back the updated queue number so future patients get the next number
    await queueRef.set(queueNumber);

    res.json({ success: true, queueNumber });
  } catch (error) {
    console.error('Error assigning condition:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ===========================================
// HOSPITAL B API ENDPOINTS
// ===========================================

// ----------------------------------------------------------
//    GET /hospitalA/patient-wait-time/:patientID
//    Retrieves the estimated wait time for a single patient
// ----------------------------------------------------------
app.get('/hospitalB/patient-wait-time/:patientID', async (req, res) => {
  try {
    const { patientID } = req.params;  // Extract the patientID from URL params
    console.log(`Fetching wait time for patient: ${patientID}`);

    const snapshot = await db.ref('hospitalB-patients').once('value'); // Fetch all patients from HospitalA DB

    if (!snapshot.exists()) {
      console.log('No patients found in the database.');
      return res.status(404).json({ error: 'Patient not found' });
    }

    let patientData = null; // store the matching patient's data here

    // Iterate through all patients to find matching ID
    snapshot.forEach(child => {
      if (child.val().patientID === patientID) {
        patientData = child.val();
      }
    });

    if (!patientData) {
      console.log(`Patient ID ${patientID} not found.`);
      return res.status(404).json({ error: 'Patient not found' });
    }

    console.log(`Patient found: ${JSON.stringify(patientData)}`);

    // Return the estimatedWaitTime if found, or 'Not Available'
    res.json({
      success: true,
      estimatedWaitTime: patientData.estimatedWaitTime || 'Not Available'
    });
  } catch (error) {
    console.error('Error fetching wait time:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ----------------------------------------------------------
//    GET /hospitalB/doctor-queue
//    Retrieves the queue of patients waiting or being seen by doctor
// ----------------------------------------------------------
app.get('/hospitalB/doctor-queue', async (req, res) => {
  try {
    const snapshot = await db.ref('hospitalB-patients')
      .orderByChild('status') // Order by status
      .once('value');        // Fetch the data

    if (!snapshot.exists()) {
      console.log('⚠ No patients are currently being seen.');
      return res.json([]); // Return empty list
    }

    const doctorQueue = []; // accumulate doctor-queue patients here

    snapshot.forEach(childSnapshot => {
      const patient = childSnapshot.val();

      // only want patients with status 'Please See Doctor' or 'With Doctor'
      // Excluding discharged patients or those who have 'wasSeen'
      if ((patient.status === 'Please See Doctor' || patient.status === 'With Doctor') &&
          patient.status !== 'Discharged' &&
          !patient.wasSeen) {
        doctorQueue.push({
          id: childSnapshot.key, // firebase key
          ...patient            // spread the patient's data
        });
      }
    });

    console.log('Doctor queue updated:', doctorQueue);
    res.json(doctorQueue); // Return doctor queue array
  } catch (error) {
    console.error('Error fetching doctor queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------------
//    GET /hospitalB/hospital-wait-time
//    Aggregates the total wait time for all queueing patients
// ----------------------------------------------------------
app.get('/hospitalB/hospital-wait-time', async (req, res) => {
  try {
    const snapshot = await db.ref('hospitalB-patients').once('value'); // Grab all patients
    if (!snapshot.exists()) {
      return res.json({ totalWait: 0, patientCount: 0 }); // No data, no queue
    }

    let totalWaitTime = 0; // sum up all wait times here
    let count = 0;         // Track how many patients are in queue

    snapshot.forEach(childSnapshot => {
      const patient = childSnapshot.val();
      // Only summation for patients who have a 'Queueing for X' status
      if (patient.status && patient.status.startsWith('Queueing for')) {
        totalWaitTime += patient.estimatedWaitTime || 0;
        count++;
      }
    });

    // Return object with totalWait and patientCount
    res.json({
      totalWait: totalWaitTime,
      patientCount: count
    });
  } catch (error) {
    console.error('Error fetching hospital wait time:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ----------------------------------------------------------
//    GET /hopsitalB/patients-awaiting-triage
//    Fetch a list of patients who are still waiting for triage
// ----------------------------------------------------------
app.get('/hospitalB/patients-awaiting-triage', async (req, res) => {
  try {
    const snapshot = await db.ref('hospitalB-patients')
      .orderByChild('status')        // order by 'status'
      .equalTo('Waiting for Triage') // only want those awaiting triage
      .once('value');                // Execute the query

    if (!snapshot.exists()) {
      // If no patients match that status, return an empty array
      return res.json([]);
    }

    const patients = []; // store the results here
    snapshot.forEach(childSnapshot => {
      patients.push({
        id: childSnapshot.key,  // firebase unique key
        ...childSnapshot.val()  // spread out the patient's data
      });
    });

    // Return array of all patients who are waiting for triage
    res.json(patients);
  } catch (error) {
    console.error('Error fetching patients awaiting triage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------------
//    GET /hospitalB/waitlist
//    Show the entire waiting list of non-discharged patients
// ----------------------------------------------------------
app.get('/hopsitalB/waitlist', async (req, res) => {
  try {
    const snapshot = await db.ref('hospitalB-patients').once('value'); // Get all patient data

    if (!snapshot.exists()) {
      return res.json([]); // Return empty array if no data
    }

    const waitlist = []; // store the queue data here
    snapshot.forEach(childSnapshot => {
      const patient = childSnapshot.val();

      // skip if invalid or if the patient is discharged/wasSeen
      if (!patient || !patient.status || !patient.patientID || patient.status === 'Discharged' || patient.wasSeen) {
        console.warn('⚠ Skipping invalid or discharged patient:', patient);
        return;
      }

      // Otherwise, push them into the waitlist array
      waitlist.push({
        patientID: patient.patientID,
        condition: patient.condition || 'Unknown',
        severity: patient.severity || 'Unknown',
        queueNumber: patient.queueNumber || 0,
        estimatedWaitTime: patient.estimatedWaitTime !== undefined
          ? patient.estimatedWaitTime
          : severityWaitTimes[patient.severity] || 60,
        status: patient.status
      });
    });

    // Return the compiled waitlist
    res.json(waitlist);
  } catch (error) {
    console.error('Error fetching waitlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------------
//    POST /hospitalB/check-in
//    Create a new patient record upon check-in
// ----------------------------------------------------------
app.post('/hospitalB/check-in', async (req, res) => {
try {
  const { fullName, dob, gender } = req.body; // Extract from request body

  // Validate the essential fields
  if (!fullName || !dob || !gender) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Generate a custom patient ID with randomization
  const patientID = 'PAT-' + Math.floor(100000 + Math.random() * 900000);
  const checkInTime = new Date().toISOString(); // Track time

  // Create a new entry in 'patients' collection
  const newPatientRef = db.ref('hospitalB-patients').push();
  await newPatientRef.set({
    firebaseKey: newPatientRef.key, // Store the DB key
    patientID,
    fullName,
    dob,
    gender,
    checkInTime,
    status: 'Waiting for Triage' // Default status
  });

  // Send success response with the newly created patient ID
  res.json({ success: true, patientID });
} catch (error) {
  console.error('Error checking in patient:', error);
  res.status(500).json({ error: 'Internal Server Error' });
}
});

// ----------------------------------------------------------
//    POST /hopsitalA/accept-patient
//    Marks a patient as 'With Doctor' once accepted
// ----------------------------------------------------------
app.post('/hospitalB/accept-patient', async (req, res) => {
  try {
    const { patientID } = req.body; // Extract the ID

    if (!patientID) {
      return res.status(400).json({ error: 'Missing patient ID' });
    }

    // Search for the patient by their custom ID
    const snapshot = await db.ref('hospitalB-patients').once('value');
    let firebaseKey = null;

    snapshot.forEach(childSnapshot => {
      if (childSnapshot.val().patientID === patientID) {
        firebaseKey = childSnapshot.key; // Found the record
      }
    });

    if (!firebaseKey) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Update the found patient: status -> 'With Doctor', store acceptedTime
    const patientRef = db.ref(`hospitalB-patients/${firebaseKey}`);
    await patientRef.update({
      status: 'With Doctor',
      acceptedTime: new Date().toISOString()
    });

    res.json({ success: true, message: `Patient ${patientID} accepted.` });
  } catch (error) {
    console.error('Error accepting patient:', error);
    res.status(500).json({ success: false, message: 'Error accepting patient.' });
  }
});

// ----------------------------------------------------------
//    POST /hospitalB/discharge-patient
//    Marks a patient as 'Discharged' and flags them as seen
// ----------------------------------------------------------
app.post('/hospitalB/discharge-patient', async (req, res) => {
  try {
    const { patientID } = req.body; // Extract from request body

    if (!patientID) {
      return res.status(400).json({ error: 'Missing patient ID' });
    }

    // Search for the matching patient record
    const snapshot = await db.ref('hospitalB-patients').once('value');
    let firebaseKey = null;

    snapshot.forEach(childSnapshot => {
      if (childSnapshot.val().patientID === patientID) {
        firebaseKey = childSnapshot.key;
      }
    });

    if (!firebaseKey) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Update the patient's status to 'Discharged'
    await db.ref(`hospitalB-patients/${firebaseKey}`).update({
      status: 'Discharged',
      wasSeen: true,
      dischargedTime: new Date().toISOString()
    });

    return res.json({ success: true, message: `Patient ${patientID} discharged.` });
  } catch (error) {
    console.error('Error discharging patient:', error);
    return res.status(500).json({ success: false, message: 'Error discharging patient.' });
  }
});

// ----------------------------------------------------------
//    POST /hospitalB/assign-severity
//    Assigns or updates a severity level for a patient
// ----------------------------------------------------------
app.post('/hospitalB/assign-severity', async (req, res) => {
  try {
    const { patientID, severity } = req.body; // Extract from request

    if (!patientID || !severity) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Basic severity -> waitTimes mapping for fallback
    const severityWaitTimes = {
      'Orange': 10,
      'Yellow': 60,
      'Green': 120,
      'Blue': 240
    };

    const baseWaitTime = severityWaitTimes[severity] || 60; // default 60 if unknown
    const patientsRef = db.ref('hospitalB-patients'); // Reference to 'patients'
    const snapshot = await patientsRef.once('value'); // fetch all

    let foundPatientKey = null;
    let condition = null;
    let lastWaitTime = 0;

    // First, find the correct patient record
    snapshot.forEach(childSnapshot => {
      const patient = childSnapshot.val();
      if (patient.patientID === patientID) {
        foundPatientKey = childSnapshot.key;
        condition = patient.condition;
      }
    });

    if (!foundPatientKey) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Then, find the largest waitTime among patients in the same condition & severity
    snapshot.forEach(childSnapshot => {
      const patient = childSnapshot.val();
      if (
        patient.condition === condition &&
        patient.severity === severity &&
        patient.status.startsWith('Queueing for')
      ) {
        lastWaitTime = Math.max(lastWaitTime, patient.estimatedWaitTime);
      }
    });

    // The estimated wait time for this patient is the largest found + baseWaitTime
    const estimatedWaitTime = lastWaitTime + baseWaitTime;

    // Update the patient record with the new severity, wait time, status, and triageTime
    await db.ref(`hospitalB-patients/${foundPatientKey}`).update({
      severity,
      estimatedWaitTime,
      status: `Queueing for ${severity}`,
      triageTime: new Date().toISOString()
    });

    console.log(`Severity assigned for patient ${patientID} with wait time ${estimatedWaitTime} min.`);

    res.json({ success: true, estimatedWaitTime }); // Return success
  } catch (error) {
    console.error('Error assigning severity:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// ----------------------------------------------------------
//    POST /hospitalB/assign-condition
//    Assigns or updates a medical condition for a patient
// ----------------------------------------------------------
app.post('/hospitalB/assign-condition', async (req, res) => {
try {
  const { patientID, condition } = req.body; // Extract from request

  if (!patientID || !condition) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const patientsRef = db.ref('hospitalB-patients'); // reference to the entire 'patients' list
  const snapshot = await patientsRef.once('value'); // fetch all

  let foundPatientKey = null;
  // Find the matching patient by custom ID
  snapshot.forEach(childSnapshot => {
    if (childSnapshot.val().patientID === patientID) {
      foundPatientKey = childSnapshot.key;
    }
  });

  if (!foundPatientKey) {
    return res.status(404).json({ error: 'Patient not found' });
  }

  // track how many have the same condition, to increment a queue number
  const queueRef = db.ref(`hospitalB-queueNumbers/${condition}`);
  const queueSnapshot = await queueRef.once('value');
  const queueNumber = queueSnapshot.exists() ? queueSnapshot.val() + 1 : 1;

  console.log(`Assigning queue number: ${queueNumber} for condition: ${condition}`);

  // Update the patient's record with the new condition, queue number, etc.
  await db.ref(`hospitalB-patients/${foundPatientKey}`).update({
    condition: condition,
    status: 'Waiting for Triage',
    queueNumber: queueNumber
  });

  // Save back the updated queue number so future patients get the next number
  await queueRef.set(queueNumber);

  res.json({ success: true, queueNumber });
} catch (error) {
  console.error('Error assigning condition:', error);
  res.status(500).json({ error: 'Internal server error' });
}
});


// ===========================================
// START THE EXPRESS SERVER
// ===========================================
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// End of file. All endpoints and logic included with line-by-line comments.