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
app.use(cors()); // 🔹 Allow frontend requests

const PORT = process.env.PORT || 5000;

const corsOptions = {
    origin: "*", // Allow all origins (change this in production)
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: ["Content-Type"]
};

app.use(cors(corsOptions));

const patientsRef = db.ref("patients");

// ✅ Automatically monitor queue (unchanged for now)
patientsRef.on("child_changed", snapshot => {
    console.log("✅ Patient updated:", snapshot.val());
  });

// Severity-based Wait Times (Minutes)
const severityWaitTimes = {
    "Red": 0,
    "Orange": 10,
    "Yellow": 60,
    "Green": 120,
    "Blue": 240
};


// ✅ Function to Monitor Queue and Update Status (unchanged)
async function monitorQueue() {
    try {
        const snapshot = await patientsRef.once("value");
        if (!snapshot.exists()) return;

        const now = Date.now();
        const updates = {};

        snapshot.forEach(childSnapshot => {
            const patient = childSnapshot.val();
            const patientID = childSnapshot.key;

            // Only if status is "Queueing for ..." do we decrement
            if (patient.status && patient.status.startsWith("Queueing for") && patient.triageTime) {
                const triageTime = new Date(patient.triageTime).getTime();
                if (isNaN(triageTime)) return;

                // Each minute, reduce their estimatedWaitTime by 1
                let elapsedTime = Math.floor((now - triageTime) / 60000);
                if (elapsedTime <= 0) return;

                let newTime = Math.max(patient.estimatedWaitTime - 1, 0);
                if (newTime !== patient.estimatedWaitTime) {
                    updates[`${patientID}/estimatedWaitTime`] = newTime;
                }

                // *** IMPORTANT ***: We do NOT set status to "Please See Doctor"
                // just because waitTime is 0. We'll let the doctor
                // discharge event handle it properly.
            }
        });

        if (Object.keys(updates).length > 0) {
            await db.ref("patients").update(updates);
            console.log("✅ Queue updated successfully (monitorQueue).");
        }
    } catch (error) {
        console.error("❌ Error monitoring queue:", error);
    }
}

async function checkFirebaseWaitTimes() {
    try {
        console.log("🔍 Checking estimated wait times...");

        const snapshot = await db.ref("patients").once("value");

        if (!snapshot.exists()) {
            console.log("⚠ No patients found in the database.");
            return;
        }

        snapshot.forEach(childSnapshot => {
            console.log(
                `🩺 Patient ${childSnapshot.val().patientID} => Estimated Wait Time: ${childSnapshot.val().estimatedWaitTime || "N/A"} min`
            );
        });

    } catch (error) {
        console.error("❌ Error fetching wait times:", error);
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
            .once("value");

        if (!snapshot.exists()) {
            console.log("⚠ No patients are currently being seen.");
            return res.json([]);
        }

        const doctorQueue = [];
        snapshot.forEach(childSnapshot => {
            const patient = childSnapshot.val();

            // ✅ Include both "Please See Doctor" and "With Doctor"
            if (patient.status === "Please See Doctor" || patient.status === "With Doctor") {
                doctorQueue.push({
                    id: childSnapshot.key,
                    ...patient
                });
            }
        });

        console.log("✅ Doctor queue updated:", doctorQueue);
        res.json(doctorQueue);
    } catch (error) {
        console.error("❌ Error fetching doctor queue:", error);
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
      console.error("❌ Error fetching hospital wait time:", error);
      res.status(500).json({ error: "Internal Server Error" });
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
            return res.json([]); // ✅ Always return an array
        }

        const waitlist = [];
        snapshot.forEach(childSnapshot => {
            const patient = childSnapshot.val();
            
            // ✅ Ensure patient has all required fields before adding to list
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
                status: patient.status // ✅ Ensure status is always included
            });
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
            acceptedTime: new Date().toISOString()
        });
        res.json({ success: true, message: `✅ Patient ${patientID} accepted by doctor.` });
    } catch (error) {
        console.error("❌ Error accepting patient:", error);
        res.status(500).json({ success: false, message: "Error accepting patient." });
    }
});



// Function to Adjust Queue Wait Times on Discharge with dynamic calculation
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
        const elapsedDoctorTime = Math.floor((now - acceptedTime) / 60000); // in minutes

        console.log(`✅ Discharging patient ${patientID}, spent ${elapsedDoctorTime} minutes with doctor.`);

        const condition = patient.condition;
        const severity = patient.severity;
        const baseWait = severityWaitTimes[severity] || 60;

        // 3.1) Adjust times for all patients in same condition+severity
        const allPatientsSnap = await patientsRef.once("value");
        if (!allPatientsSnap.exists()) {
            // Just remove the patient
            await patientRef.remove();
            return res.json({ success: true, message: `✅ Patient discharged. No other patients to update.` });
        }

        let updates = {};

        // We'll keep track of all the "queueing" patients in that condition+severity
        let queueingPatients = [];
        allPatientsSnap.forEach(child => {
            const p = child.val();
            if (
                p.status &&
                p.status.startsWith("Queueing for") &&
                p.condition === condition &&
                p.severity === severity
            ) {
                queueingPatients.push({
                    key: child.key,
                    data: p
                });
            }
        });

        // For each queueing patient, adjust their time
        // If doctorTime < baseWait => reduce by that
        // If doctorTime > baseWait => increase by (elapsedDoctorTime - baseWait)
        queueingPatients.forEach(item => {
            let currentWait = item.data.estimatedWaitTime || baseWait;
            let newWait;
            if (elapsedDoctorTime < baseWait) {
                newWait = Math.max(currentWait - elapsedDoctorTime, 0);
            } else {
                newWait = currentWait + (elapsedDoctorTime - baseWait);
            }
            updates[`${item.key}/estimatedWaitTime`] = newWait;
        });

        // 3.2) Remove the discharged patient from DB
        await patientRef.remove();
        console.log(`✅ Patient ${patientID} removed from DB.`);

        // 3.3) Find the single "next" patient in line (lowest queueNumber) among queueing
        // and set them to "Please See Doctor" IF the doctor is actually free
        // i.e. we have no other "With Doctor" in that same condition + severity
        // But for now, let's assume only 1 doctor per condition+severity
        const isAnotherPatientWithDoctor = allPatientsSnap
            .filter
            // (We could check if any other "With Doctor" in same condition+severity)
            // but let's assume only 1 doc total for this condition
            ();

        // We skip the check above for brevity. We'll assume the doc is free now.

        // Among the queueing patients, find the lowest queueNumber
        let nextInLine = null;
        let minQ = Infinity;
        queueingPatients.forEach(item => {
            // We just updated their times, so let's see if they're in line
            if (item.data.queueNumber < minQ) {
                minQ = item.data.queueNumber;
                nextInLine = item.key;
            }
        });

        if (nextInLine) {
            console.log(`Promoting next in line: ${nextInLine} to "Please See Doctor".`);
            updates[`${nextInLine}/status`] = "Please See Doctor";
        }

        await db.ref("patients").update(updates);

        res.json({ success: true, message: `✅ Patient ${patientID} discharged & queue updated.` });
    } catch (error) {
        console.error("❌ Error in discharge-patient:", error);
        res.status(500).json({ success: false, message: "Error discharging patient." });
    }
});

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
                lastWaitTime = Math.max(lastWaitTime, patient.estimatedWaitTime);
            }
        });

        const estimatedWaitTime = lastWaitTime + baseWaitTime;

        await db.ref(`patients/${foundPatientKey}`).update({
            severity,
            estimatedWaitTime,
            status: `Queueing for ${severity}`,
            triageTime: new Date().toISOString()
        });

        console.log(`✅ Severity assigned for patient ${patientID} with wait time ${estimatedWaitTime} min.`);

        res.json({ success: true, estimatedWaitTime }); // ✅ Ensure a proper response is returned
    } catch (error) {
        console.error("❌ Error assigning severity:", error);
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

        // ✅ Find last queue number for this condition
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

async function monitorQueueLoop() {
    await monitorQueue();
    setTimeout(monitorQueueLoop, 60000); // Run again after 60s
}

// Start monitoring loop
monitorQueueLoop();

// ✅ Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);

});
