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

            if (patient.status === "Waiting for Doctor") {
                const triageTime = new Date(patient.triageTime).getTime();
                const elapsedTime = (now - triageTime) / 60000; // Convert to minutes
                const baseWaitTime = severityWaitTimes[patient.severity] || 10;

                const remainingTime = Math.max(baseWaitTime - elapsedTime, 0);

                // ✅ If remaining time reaches 0, mark as "Please See Doctor"
                if (remainingTime <= 0 && patient.status === "Waiting for Doctor") {
                    updates[`${patientID}/status`] = "Please See Doctor";
                }
                updates[`${patientID}/estimatedWaitTime`] = Math.floor(remainingTime);
            }
        });

        // ✅ Apply batch updates
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
        const elapsedDoctorTime = (now - acceptedTime) / 60000; // Convert ms to minutes

        const patientsRef = db.ref("patients");
        const patientsSnapshot = await patientsRef.once("value");

        if (!patientsSnapshot.exists()) return;

        const updates = {};

        patientsSnapshot.forEach(childSnapshot => {
            const nextPatient = childSnapshot.val();
            const nextPatientID = childSnapshot.key;

            // ✅ Adjust wait times for patients with the same condition & severity
            if (
                nextPatient.status === "Waiting for Doctor" &&
                nextPatient.condition === patient.condition &&
                nextPatient.severity === patient.severity
            ) {
                const newWaitTime = Math.max(nextPatient.estimatedWaitTime + elapsedDoctorTime, 0);
                updates[`${nextPatientID}/estimatedWaitTime`] = newWaitTime;
            }
        });

        // ✅ Apply batch updates
        await db.ref("patients").update(updates);
        console.log(`✅ Wait times adjusted based on doctor time: +${elapsedDoctorTime} mins.`);
    } catch (error) {
        console.error("❌ Error adjusting wait times:", error);
    }
}


app.get("/patient-wait-time/:patientID", async (req, res) => {
    const { patientID } = req.params;

    try {
        const patientRef = db.ref(`patients/${patientID}`);
        const snapshot = await patientRef.once("value");

        if (!snapshot.exists()) {
            return res.status(404).json({ error: "Patient not found" });
        }

        const patient = snapshot.val();
        res.json({ success: true, estimatedWaitTime: patient.estimatedWaitTime || "Unknown" });
    } catch (error) {
        console.error("❌ Error fetching wait time:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});




app.get("/patients-awaiting-triage", async (req, res) => {
    try {
        const snapshot = await db.ref("patients").orderByChild("status").equalTo("Awaiting Condition Selection").once("value");

        if (!snapshot.exists()) {
            return res.json([]); // ✅ Return an empty array instead of an error
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
        const snapshot = await db.ref("patients").orderByChild("status").equalTo("Waiting for Doctor").once("value");

        if (!snapshot.exists()) {
            return res.status(404).json({ error: "No patients in waitlist" });
        }

        const waitlist = snapshot.val();
        res.json(waitlist);
    } catch (error) {
        console.error("❌ Error fetching waitlist:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ API: Get Doctor Queue (Patients Waiting for Doctor)
app.get("/doctor-queue", async (req, res) => {
    try {
        const snapshot = await db.ref("patients").orderByChild("status").equalTo("Waiting for Doctor").once("value");

        if (!snapshot.exists()) {
            return res.status(404).json({ error: "No patients waiting for doctor" });
        }

        const doctorQueue = snapshot.val();
        res.json(doctorQueue);
    } catch (error) {
        console.error("❌ Error fetching doctor queue:", error);
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
            dob: dob,
            gender,
            checkInTime,
            status: "Awaiting Condition Selection"
        });

        res.json({ success: true, patientID });
    } catch (error) {
        console.error("❌ Error storing patient:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


// ✅ API: Accept Patient
app.post("/accept-patient", async (req, res) => {
    const { patientID } = req.body;

    try {
        await db.ref(`patients/${patientID}`).update({
            status: "With Doctor",
            acceptedTime: new Date().toISOString()
        });
        res.json({ success: true, message: `✅ Patient ${patientID} accepted.` });
    } catch (error) {
        console.error("❌ Error accepting patient:", error);
        res.status(500).json({ success: false, message: "Error accepting patient." });
    }
});

// ✅ API: Discharge Patient
app.post("/discharge-patient", async (req, res) => {
    const { patientID } = req.body;

    try {
        await adjustWaitTimes(patientID);
        await db.ref(`patients/${patientID}`).remove();
        res.json({ success: true, message: `✅ Patient ${patientID} discharged.` });
    } catch (error) {
        console.error("❌ Error discharging patient:", error);
        res.status(500).json({ success: false, message: "Error discharging patient." });
    }
});

// ✅ Function to Assign a Condition and Queue Number
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

        const queueRef = db.ref(`queueNumbers/${condition}`);
        const queueSnapshot = await queueRef.once("value");
        const queueNumber = queueSnapshot.exists() ? queueSnapshot.val() + 1 : 1;

        await db.ref(`patients/${foundPatientKey}`).update({
            condition: condition,
            status: "Waiting for Triage",
            queueNumber: queueNumber
        });

        await queueRef.set(queueNumber);

        res.json({ success: true, queueNumber: queueNumber });
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