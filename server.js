// ✅ Import Required Modules
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
require("dotenv").config();

// ✅ Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://hospitalkiosk-a92a4-default-rtdb.europe-west1.firebasedatabase.app"
});

const db = admin.database();
const app = express();
app.use(express.json());
app.use(cors()); // 🔹 Allow frontend requests

const PORT = process.env.PORT || 5000;

const corsOptions = {
    origin: "*", // Allow all origins (change this in production)
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: ["Content-Type"]
};

app.use(cors(corsOptions));

const patientsRef = db.ref("patients");

// ✅ Automatically monitor queue and push updates
patientsRef.on("child_changed", snapshot => {
    console.log("✅ Patient updated:", snapshot.val());
});

// ✅ Severity-based Wait Times (Minutes)
const severityWaitTimes = {
    "Red": 0,
    "Orange": 10,
    "Yellow": 60,
    "Green": 120,
    "Blue": 240
};

// ✅ Function to Monitor Queue and Update Status
async function monitorQueue() {
    try {
        const patientsRef = db.ref("patients");
        const snapshot = await patientsRef.once("value");

        if (!snapshot.exists()) return;

        const now = Date.now();
        const updates = {};

        snapshot.forEach(childSnapshot => {
            const patient = childSnapshot.val();
            const patientID = childSnapshot.key;

            if (patient.status.startsWith("Queueing for") && patient.triageTime) {
                const triageTime = new Date(patient.triageTime).getTime();
                const elapsedTime = (now - triageTime) / 60000; // Convert to minutes

                let baseWaitTime = severityWaitTimes[patient.severity] || 10;
                let remainingTime = Math.max(baseWaitTime - elapsedTime, 0);

                // ✅ Update estimated wait time
                updates[`${patientID}/estimatedWaitTime`] = Math.floor(remainingTime);

                // ✅ When wait time reaches 0, update status to "Please See Doctor"
                if (remainingTime <= 0 && patient.status.startsWith("Queueing for")) {
                    updates[`${patientID}/status`] = "Please See Doctor";
                }
                
            }
        });

        await db.ref("patients").update(updates);
        console.log("✅ Queue updated successfully.");
    } catch (error) {
        console.error("❌ Error monitoring queue:", error);
    }
}


// ✅ Function to Adjust Queue Wait Times on Discharge
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

            // ✅ Adjust wait times for patients with the same condition & severity
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
        console.log(`✅ Wait times adjusted based on doctor delay: +${elapsedDoctorTime} mins.`);
    } catch (error) {
        console.error("❌ Error adjusting wait times:", error);
    }
}




app.get('/patient-wait-time/:patientID', async (req, res) => {
    try {
        const { patientID } = req.params;
        console.log(`🔍 Fetching wait time for patient: ${patientID}`);

        const snapshot = await db.ref("patients").once("value");

        if (!snapshot.exists()) {
            console.log("❌ No patients found in the database.");
            return res.status(404).json({ error: "Patient not found" });
        }

        let patientData = null;
        snapshot.forEach(child => {
            if (child.val().patientID === patientID) {
                patientData = child.val();
            }
        });

        if (!patientData) {
            console.log(`❌ Patient ID ${patientID} not found.`);
            return res.status(404).json({ error: "Patient not found" });
        }

        console.log(`✅ Patient found: ${JSON.stringify(patientData)}`);

        res.json({ 
            success: true, 
            estimatedWaitTime: patientData.estimatedWaitTime || "Not Available" 
        });
    } catch (error) {
        console.error("❌ Error fetching wait time:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


app.get("/doctor-queue", async (req, res) => {
    try {
        const snapshot = await db.ref("patients")
            .orderByChild("status")
            .equalTo("Please See Doctor")
            .once("value");

        if (!snapshot.exists()) {
            return res.json([]); // ✅ Return empty array if no patients
        }

        const doctorQueue = [];
        snapshot.forEach(childSnapshot => {
            doctorQueue.push({
                id: childSnapshot.key,
                ...childSnapshot.val()
            });
        });

        // ✅ Only return the first patient who is ready
        const firstPatient = doctorQueue.sort((a, b) => a.queueNumber - b.queueNumber)[0];

        res.json(firstPatient ? [firstPatient] : []);
    } catch (error) {
        console.error("❌ Error fetching doctor queue:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});


app.get("/patients-awaiting-triage", async (req, res) => {
    try {
        const snapshot = await db.ref("patients")
            .orderByChild("status")
            .equalTo("Waiting for Triage") // ✅ Ensure this matches Firebase
            .once("value");

        if (!snapshot.exists()) {
            return res.json([]); // ✅ Return empty array if no patients
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
        console.error("❌ Error fetching patients awaiting triage:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/waitlist", async (req, res) => {
    try {
        const snapshot = await db.ref("patients").once("value");

        if (!snapshot.exists()) {
            return res.json([]);
        }

        const waitlist = [];
        snapshot.forEach(childSnapshot => {
            const patient = childSnapshot.val();
            if (patient.status.startsWith("Queueing for")) { // ✅ Ensures they are in the right queue
                waitlist.push({
                    patientID: patient.patientID,
                    condition: patient.condition,
                    severity: patient.severity,
                    queueNumber: patient.queueNumber,
                    estimatedWaitTime: patient.estimatedWaitTime
                });
            }
        });

        res.json(waitlist);
    } catch (error) {
        console.error("❌ Error fetching waitlist:", error);
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
        console.error("❌ Error checking in patient:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


// ✅ API: Accept Patient
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
            acceptedTime: new Date().toISOString() // ✅ Store time when doctor accepts patient
        });

        res.json({ success: true, message: `✅ Patient ${patientID} accepted.` });
    } catch (error) {
        console.error("❌ Error accepting patient:", error);
        res.status(500).json({ success: false, message: "Error accepting patient." });
    }
});



// ✅ API: Discharge Patient (Now Calls adjustWaitTimes)
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

        const patient = snapshot.val();
        const acceptedTime = new Date(patient.acceptedTime).getTime();
        const now = Date.now();
        const doctorTimeSpent = (now - acceptedTime) / 60000; // ✅ Time spent in minutes

        // ✅ Adjust wait times of remaining patients in this condition & severity queue
        const condition = patient.condition;
        const severity = patient.severity;

        const patientsRef = db.ref("patients");
        const patientsSnapshot = await patientsRef.once("value");

        if (patientsSnapshot.exists()) {
            const updates = {};
            patientsSnapshot.forEach(childSnapshot => {
                const nextPatient = childSnapshot.val();
                const nextPatientID = childSnapshot.key;

                if (
                    nextPatient.status.startsWith("Queueing for") &&
                    nextPatient.condition === condition &&
                    nextPatient.severity === severity
                ) {
                    // ✅ Adjust wait time for remaining patients
                    const newWaitTime = Math.max(nextPatient.estimatedWaitTime - doctorTimeSpent, 0);
                    updates[`${nextPatientID}/estimatedWaitTime`] = newWaitTime;
                }
            });

            await db.ref("patients").update(updates);
            console.log(`✅ Wait times updated based on doctor time: -${doctorTimeSpent} mins.`);
        }

        // ✅ Remove patient from database after discharge
        await patientRef.remove();

        res.json({ success: true, message: `✅ Patient ${patientID} discharged & queue updated.` });
    } catch (error) {
        console.error("❌ Error discharging patient:", error);
        res.status(500).json({ success: false, message: "Error discharging patient." });
    }
});



// ✅ Function to Assign a Condition and Queue Number
app.post("/assign-severity", async (req, res) => {
    try {
        const { patientID, severity } = req.body;

        if (!patientID || !severity) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // 🔹 Ensure severity has a proper wait time
        const severityWaitTimes = {
            "Red": 0,
            "Orange": 10,  // 🔥 Should be at least 10, NOT 6!
            "Yellow": 60,
            "Green": 120,
            "Blue": 240
        };

        const baseWaitTime = severityWaitTimes[severity] || 60; // ✅ Default 60 mins

        // ✅ Find the correct Firebase key for the patient
        const patientsRef = db.ref("patients");
        const snapshot = await patientsRef.once("value");

        let foundPatientKey = null;
        snapshot.forEach(childSnapshot => {
            if (childSnapshot.val().patientID === patientID) {
                foundPatientKey = childSnapshot.key;
            }
        });

        if (!foundPatientKey) {
            console.log(`❌ Patient ${patientID} not found in Firebase.`);
            return res.status(404).json({ error: "Patient not found" });
        }

        // ✅ Correctly Assign Wait Time
        await db.ref(`patients/${foundPatientKey}`).update({
            severity,
            estimatedWaitTime: baseWaitTime, // ✅ Should be 10 minutes for Orange
            status: `Queueing for ${severity}`,
            triageTime: new Date().toISOString()
        });

        console.log(`✅ Severity assigned for patient ${patientID}.`);
        res.json({ success: true, message: `Severity assigned for patient ${patientID}.` });

    } catch (error) {
        console.error("❌ Error assigning severity:", error);
        res.status(500).json({ error: "Internal server error" });
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
            const patient = childSnapshot.val();
            if (patient.patientID === patientID) { 
                foundPatientKey = childSnapshot.key;
            }
        });

        if (!foundPatientKey) {
            return res.status(404).json({ error: "Patient not found" });
        }

        // ✅ Ensure queue number is generated correctly
        const queueRef = db.ref(`queueNumbers/${condition}`);
        const queueSnapshot = await queueRef.once("value");
        const queueNumber = queueSnapshot.exists() ? queueSnapshot.val() + 1 : 1;

        console.log(`🔹 Assigning queue number: ${queueNumber} for condition: ${condition}`);

        // ✅ Update patient record with condition and queue number
        await db.ref(`patients/${foundPatientKey}`).update({
            condition: condition,
            status: "Waiting for Triage",
            queueNumber: queueNumber
        });

        await queueRef.set(queueNumber); // ✅ Save updated queue number

        res.json({ success: true, queueNumber });
    } catch (error) {
        console.error("❌ Error assigning condition:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    setInterval(monitorQueue, 60000); // ✅ Auto-update queue every 60s
});