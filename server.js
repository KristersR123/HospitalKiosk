// Import Required Modules
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
require("dotenv").config();

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://hospitalkiosk-a92a4-default-rtdb.europe-west1.firebasedatabase.app"
});

const db = admin.database();
const app = express();
app.use(express.json());
app.use(cors()); // Allow frontend requests

const PORT = process.env.PORT || 5000;

const corsOptions = {
    origin: "*", // Allow all origins (change this in production)
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: ["Content-Type"]
};

app.use(cors(corsOptions));

const patientsRef = db.ref("patients");

// Automatically monitor queue and push updates
patientsRef.on("child_changed", snapshot => {
    console.log("Patient updated:", snapshot.val());
});

// Severity-based Wait Times (Minutes)
const severityWaitTimes = {
    "Red": 0,
    "Orange": 10,
    "Yellow": 60,
    "Green": 120,
    "Blue": 240
};


/* ===================================================
   REAL-TIME MONITOR FUNCTION
=================================================== */
// This function recalculates wait times in real time.
// It uses a stored "baseWaitTime" (set at triage) as the starting point,
// then subtracts the minutes passed since triage,
// and then applies a doctor-based adjustment if a patient is "With Doctor" in the same group.
async function monitorQueue() {
    try {
        const snapshot = await patientsRef.once("value");
        if (!snapshot.exists()) return;

        const now = Date.now();
        const updates = {};

        // Build a mapping of active doctor sessions by "condition-severity".
        // If there is more than one patient with a doctor, we choose the earliest accepted time.
        const doctorSessions = {};
        snapshot.forEach(childSnapshot => {
            const patient = childSnapshot.val();
            if (patient.status === "With Doctor" && patient.acceptedTime) {
                const groupKey = `${patient.condition}-${patient.severity}`;
                const acceptedTime = new Date(patient.acceptedTime).getTime();
                if (!doctorSessions[groupKey] || acceptedTime < doctorSessions[groupKey]) {
                    doctorSessions[groupKey] = acceptedTime;
                }
            }
        });

        // Loop through waiting patients to update their wait times.
        snapshot.forEach(childSnapshot => {
            const patient = childSnapshot.val();
            const patientID = childSnapshot.key;
            if (
                patient.status &&
                patient.status.startsWith("Queueing for") &&
                patient.triageTime
            ) {
                // Inside monitorQueue, in the waiting patients loop:
                const baseline = (patient.initialWaitTime !== undefined)
                    ? patient.initialWaitTime
                    : patient.estimatedWaitTime || 0;
                const triageTime = new Date(patient.triageTime).getTime();
                const minutesPassed = Math.floor((now - triageTime) / 60000);
                let newWaitTime = baseline - minutesPassed; // natural decay

                // Check for an active doctor session for the same condition & severity.
                const groupKey = `${patient.condition}-${patient.severity}`;
                if (doctorSessions[groupKey]) {
                    const doctorStart = doctorSessions[groupKey];
                    const doctorElapsed = Math.floor((now - doctorStart) / 60000);
                    // Compute the adjustment:
                    // - If doctorElapsed is less than 10, subtract the full doctorElapsed (e.g., 6 minutes means -6).
                    // - If doctorElapsed is more than 10, add the extra minutes (e.g., 13 minutes means +(13-10)=+3).
                    const adjustment = doctorElapsed < 10 ? -doctorElapsed : (doctorElapsed - 10);
                    newWaitTime += adjustment;
                }

                // If the new wait time is 0 or less, update status.
                if (newWaitTime <= 0) {
                    newWaitTime = 0;
                    updates[`${patientID}/status`] = "Please See Doctor";
                }
                // Only update if there's a change.
                if (newWaitTime !== patient.estimatedWaitTime) {
                    updates[`${patientID}/estimatedWaitTime`] = newWaitTime;
                }
            }
        });

        if (Object.keys(updates).length > 0) {
            await patientsRef.update(updates);
            console.log("Real-time queue times updated:", updates);
        }
    } catch (error) {
        console.error("Error in monitorQueue:", error);
    }
}

// Schedule the monitor to run every minute.
async function monitorQueueLoop() {
    await monitorQueue();
    setTimeout(monitorQueueLoop, 60000); // 60 seconds interval
}
monitorQueueLoop();


async function checkFirebaseWaitTimes() {
    try {
        console.log("Checking estimated wait times...");

        const snapshot = await db.ref("patients").once("value");

        if (!snapshot.exists()) {
            console.log("No patients found in the database.");
            return;
        }

        snapshot.forEach(childSnapshot => {
            console.log(
                `🩺 Patient ${childSnapshot.val().patientID} => Estimated Wait Time: ${childSnapshot.val().estimatedWaitTime || "N/A"} min`
            );
        });

    } catch (error) {
        console.error("Error fetching wait times:", error);
    }
}

// Run this function once when the server starts
checkFirebaseWaitTimes();

function debounce(func, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

patientsRef.on("child_changed", debounce(snapshot => {
    console.log("Patient updated:", snapshot.val());
}, 1000)); // Ensure only 1 update per second


// Function to Adjust Queue Wait Times on Discharge
async function adjustWaitTimes(patientID) {
    try {
        const patientRef = db.ref(`patients/${patientID}`);
        const snapshot = await patientRef.once("value");

        if (!snapshot.exists()) return;

        const patient = snapshot.val();
        const acceptedTime = new Date(patient.acceptedTime).getTime();
        const now = Date.now();
        const elapsedDoctorTime = (now - acceptedTime) / 60000; // Convert to minutes

        const patientsRef = db.ref("patients");
        const patientsSnapshot = await patientsRef.once("value");

        if (!patientsSnapshot.exists()) return;

        const updates = {};

        patientsSnapshot.forEach(childSnapshot => {
            const nextPatient = childSnapshot.val();
            const nextPatientID = childSnapshot.key;

            // Adjust wait times for patients with the same condition & severity
            if (
                nextPatient.status.startsWith("Queueing for") &&
                nextPatient.condition === patient.condition &&
                nextPatient.severity === patient.severity
            ) {
                const newWaitTime = Math.max(nextPatient.estimatedWaitTime + elapsedDoctorTime, 0);
                updates[`${nextPatientID}/estimatedWaitTime`] = newWaitTime;
            }
        });

        await db.ref("patients").update(updates);
        console.log(`Wait times adjusted based on doctor delay: +${elapsedDoctorTime} mins.`);
    } catch (error) {
        console.error("Error adjusting wait times:", error);
    }
}

/* ===================================================
   API ENDPOINTS
=================================================== */

app.get('/patient-wait-time/:patientID', async (req, res) => {
    try {
        const { patientID } = req.params;
        console.log(`🔍 Fetching wait time for patient: ${patientID}`);

        const snapshot = await db.ref("patients").once("value");

        if (!snapshot.exists()) {
            console.log("No patients found in the database.");
            return res.status(404).json({ error: "Patient not found" });
        }

        let patientData = null;
        snapshot.forEach(child => {
            if (child.val().patientID === patientID) {
                patientData = child.val();
            }
        });

        if (!patientData) {
            console.log(`Patient ID ${patientID} not found.`);
            return res.status(404).json({ error: "Patient not found" });
        }

        console.log(`Patient found: ${JSON.stringify(patientData)}`);

        res.json({ 
            success: true, 
            estimatedWaitTime: patientData.estimatedWaitTime || "Not Available" 
        });
    } catch (error) {
        console.error("Error fetching wait time:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


app.get("/doctor-queue", async (req, res) => {
    try {
        const snapshot = await db.ref("patients")
            .orderByChild("status")
            .once("value");

        if (!snapshot.exists()) {
            console.log("⚠ No patients are currently being seen.");
            return res.json([]);
        }

        const doctorQueue = [];
        snapshot.forEach(childSnapshot => {
            const patient = childSnapshot.val();

            // Include both "Please See Doctor" and "With Doctor"
            if (patient.status === "Please See Doctor" || patient.status === "With Doctor") {
                doctorQueue.push({
                    id: childSnapshot.key,
                    ...patient
                });
            }
        });

        console.log("Doctor queue updated:", doctorQueue);
        res.json(doctorQueue);
    } catch (error) {
        console.error("Error fetching doctor queue:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/hospital-wait-time", async (req, res) => {
    try {
      const snapshot = await db.ref("patients").once("value");
      if (!snapshot.exists()) {
        return res.json({ totalWait: 0, patientCount: 0 });
      }
  
      let totalWaitTime = 0;
      let count = 0;
  
      snapshot.forEach(childSnapshot => {
        const patient = childSnapshot.val();
        // Consider patients with a status like "Queueing for Orange/Red/Green/etc."
        // If you have multiple conditions, ensure you only sum those who are actively in the queue.
        if (patient.status && patient.status.startsWith("Queueing for")) {
          totalWaitTime += patient.estimatedWaitTime || 0;
          count++;
        }
      });
  
      return res.json({
        totalWait: totalWaitTime,  // Sum of all queueing times
        patientCount: count
      });
    } catch (error) {
      console.error("Error fetching hospital wait time:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
});


app.get("/patients-awaiting-triage", async (req, res) => {
    try {
        const snapshot = await db.ref("patients")
            .orderByChild("status")
            .equalTo("Waiting for Triage")
            .once("value");

        if (!snapshot.exists()) {
            return res.json([]); // Return empty array if no patients
        }

        const patients = [];
        snapshot.forEach(childSnapshot => {
            patients.push({
                id: childSnapshot.key,
                ...childSnapshot.val()
            });
        });

        res.json(patients);
    } catch (error) {
        console.error("Error fetching patients awaiting triage:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/waitlist", async (req, res) => {
    try {
        const snapshot = await db.ref("patients").once("value");

        if (!snapshot.exists()) {
            return res.json([]); // Always return an array
        }

        const waitlist = [];
        snapshot.forEach(childSnapshot => {
            const patient = childSnapshot.val();
            
            if (!patient || !patient.status || !patient.patientID) {
                console.warn("⚠ Skipping invalid patient entry:", patient);
                return;
            }

            waitlist.push({
                patientID: patient.patientID,
                condition: patient.condition || "Unknown",
                severity: patient.severity || "Unknown",
                queueNumber: patient.queueNumber || 0,
                estimatedWaitTime: patient.estimatedWaitTime !== undefined 
                    ? patient.estimatedWaitTime 
                    : severityWaitTimes[patient.severity] || 60,
                status: patient.status
            });
        });

        res.json(waitlist);
    } catch (error) {
        console.error("Error fetching waitlist:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});



app.post("/check-in", async (req, res) => {
    try {
        const { fullName, dob, gender } = req.body;

        if (!fullName || !dob || !gender) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const patientID = "PAT-" + Math.floor(100000 + Math.random() * 900000);
        const checkInTime = new Date().toISOString();

        const newPatientRef = db.ref("patients").push();
        await newPatientRef.set({
            firebaseKey: newPatientRef.key,
            patientID,
            fullName,
            dob,
            gender,
            checkInTime,
            status: "Waiting for Triage"
        });

        res.json({ success: true, patientID });
    } catch (error) {
        console.error("Error checking in patient:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


// API: Accept Patient
app.post("/accept-patient", async (req, res) => {
    try {
        const { patientID } = req.body;

        if (!patientID) {
            return res.status(400).json({ error: "Missing patient ID" });
        }

        const patientRef = db.ref(`patients/${patientID}`);
        const snapshot = await patientRef.once("value");

        if (!snapshot.exists()) {
            return res.status(404).json({ error: "Patient not found" });
        }

        await patientRef.update({
            status: "With Doctor",
            acceptedTime: new Date().toISOString() // Store time when doctor accepts patient
        });

        res.json({ success: true, message: `Patient ${patientID} accepted.` });
    } catch (error) {
        console.error("Error accepting patient:", error);
        res.status(500).json({ success: false, message: "Error accepting patient." });
    }
});



// --- Updated Discharge Endpoint ---
// When a patient is discharged, update waiting patients in the same condition & severity
// by subtracting the doctor’s elapsed time from their baseline (initialWaitTime)
// before removing the discharged patient.
app.post("/discharge-patient", async (req, res) => {
    try {
        const { patientID } = req.body;
        if (!patientID) {
            return res.status(400).json({ error: "Missing patient ID" });
        }
        
        const patientRef = db.ref(`patients/${patientID}`);
        const snapshot = await patientRef.once("value");
        if (!snapshot.exists()) {
            return res.status(404).json({ error: "Patient not found" });
        }
        const dischargedPatient = snapshot.val();
        const acceptedTime = new Date(dischargedPatient.acceptedTime).getTime();
        const now = Date.now();
        const elapsedDoctorTime = Math.floor((now - acceptedTime) / 60000); // in minutes
        console.log(`Patient ${patientID} spent ${elapsedDoctorTime} minutes with the doctor.`);
        
        // Update waiting patients in the same condition & severity:
        const condition = dischargedPatient.condition;
        const severity = dischargedPatient.severity;
        const waitingSnapshot = await db.ref("patients").once("value");
        const updates = {};
        
        waitingSnapshot.forEach(childSnapshot => {
            const waitingPatient = childSnapshot.val();
            const waitingPatientID = childSnapshot.key;
            // Only update waiting patients in the same condition and severity whose status starts with "Queueing for"
            if (
                waitingPatient.status &&
                waitingPatient.status.startsWith("Queueing for") &&
                waitingPatient.condition === condition &&
                waitingPatient.severity === severity &&
                waitingPatient.triageTime // ensure triageTime exists
            ) {
                // Use the previously stored initialWaitTime if available, else use estimatedWaitTime as baseline.
                const currentInitial = (waitingPatient.initialWaitTime !== undefined)
                    ? waitingPatient.initialWaitTime
                    : (waitingPatient.estimatedWaitTime || 0);
                // Deduct the doctor's elapsed time permanently from the baseline.
                const newInitial = Math.max(currentInitial - elapsedDoctorTime, 0);
                // Recalculate estimated wait time based on the new baseline and the minutes passed since triage.
                const triageTime = new Date(waitingPatient.triageTime).getTime();
                const minutesPassed = Math.floor((Date.now() - triageTime) / 60000);
                const newEstimated = Math.max(newInitial - minutesPassed, 0);
                
                updates[`${waitingPatientID}/initialWaitTime`] = newInitial;
                updates[`${waitingPatientID}/estimatedWaitTime`] = newEstimated;
            }
        });
        
        if (Object.keys(updates).length > 0) {
            await db.ref("patients").update(updates);
            console.log("Updated waiting patients baseline:", updates);
        }
        
        // Now remove the discharged patient
        await patientRef.remove();
        res.json({ success: true, message: `Patient ${patientID} discharged.` });
    } catch (error) {
        console.error("Error discharging patient:", error);
        res.status(500).json({ success: false, message: "Error discharging patient." });
    }
});


// --- Updated /assign-severity endpoint ---
// When a patient's severity is assigned, we now store a "baseWaitTime" for real-time calculations.
app.post("/assign-severity", async (req, res) => {
    try {
        const { patientID, severity } = req.body;

        if (!patientID || !severity) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const severityWaitTimes = {
            "Red": 0,
            "Orange": 10,
            "Yellow": 60,
            "Green": 120,
            "Blue": 240
        };

        const baseWaitTime = severityWaitTimes[severity] || 60;
        const patientsRef = db.ref("patients");
        const snapshot = await patientsRef.once("value");

        let foundPatientKey = null;
        let condition = null;
        let lastWaitTime = 0;

        snapshot.forEach(childSnapshot => {
            const patient = childSnapshot.val();
            if (patient.patientID === patientID) {
                foundPatientKey = childSnapshot.key;
                condition = patient.condition;
            }
        });

        if (!foundPatientKey) {
            return res.status(404).json({ error: "Patient not found" });
        }

        snapshot.forEach(childSnapshot => {
            const patient = childSnapshot.val();
            if (
                patient.condition === condition &&
                patient.severity === severity &&
                patient.status.startsWith("Queueing for")
            ) {
                lastWaitTime = Math.max(lastWaitTime, patient.estimatedWaitTime || 0);
            }
        });

        const estimatedWaitTime = lastWaitTime + baseWaitTime;
        await db.ref(`patients/${foundPatientKey}`).update({
            severity,
            estimatedWaitTime,
            baseWaitTime, // still available if needed
            initialWaitTime: estimatedWaitTime,  // new field: full original wait time
            status: `Queueing for ${severity}`,
            triageTime: new Date().toISOString()
        });

        console.log(`Severity assigned for patient ${patientID} with base wait time ${baseWaitTime} min.`);
        res.json({ success: true, estimatedWaitTime });
    } catch (error) {
        console.error("Error assigning severity:", error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
});



app.post("/assign-condition", async (req, res) => {
    try {
        const { patientID, condition } = req.body;
        if (!patientID || !condition) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const patientsRef = db.ref("patients");
        const snapshot = await patientsRef.once("value");

        let foundPatientKey = null;
        snapshot.forEach(childSnapshot => {
            if (childSnapshot.val().patientID === patientID) { 
                foundPatientKey = childSnapshot.key;
            }
        });

        if (!foundPatientKey) {
            return res.status(404).json({ error: "Patient not found" });
        }

        // Find last queue number for this condition
        const queueRef = db.ref(`queueNumbers/${condition}`);
        const queueSnapshot = await queueRef.once("value");
        const queueNumber = queueSnapshot.exists() ? queueSnapshot.val() + 1 : 1;

        console.log(`Assigning queue number: ${queueNumber} for condition: ${condition}`);

        // Update patient record with condition and queue number
        await db.ref(`patients/${foundPatientKey}`).update({
            condition: condition,
            status: "Waiting for Triage",
            queueNumber: queueNumber
        });

        await queueRef.set(queueNumber); // Save updated queue number

        res.json({ success: true, queueNumber });
    } catch (error) {
        console.error("Error assigning condition:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

});
