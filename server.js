/**
 * server.js (Express)
 * -------------------
 * The main Node server providing your REST API.
 * On Discharge, we REMOVE the patient's node => triggers the Cloud Function
 */

const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
require("dotenv").config();

// Firebase Admin SDK Initialization
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://hospitalkiosk-a92a4-default-rtdb.europe-west1.firebasedatabase.app"
});

const db = admin.database();
const app = express();
app.use(express.json());
app.use(cors({ origin: "*", methods: "GET,HEAD,PUT,PATCH,POST,DELETE" }));

const PORT = process.env.PORT || 5000;
const patientsRef = db.ref("patients");

// Severity baseline times (used in triage).
const severityWaitTimes = {
  Red: 0,
  Orange: 10,
  Yellow: 60,
  Green: 120,
  Blue: 240,
};

// ========================================================
// Periodic Decrement of All "Queueing" Wait Times
// ========================================================
async function monitorQueue() {
  try {
    const snap = await patientsRef.once("value");
    if (!snap.exists()) return;

    const updates = {};
    snap.forEach(child => {
      const patient = child.val();
      const key = child.key;

      // Only decrement if "Queueing for X" and we have a triageTime
      if (patient.status?.startsWith("Queueing for") && patient.triageTime) {
        let newWaitTime = Math.max((patient.estimatedWaitTime || 0) - 1, 0);
        if (newWaitTime <= 0) {
          // Move them to "Please See Doctor"
          updates[`${key}/status`] = "Please See Doctor";
          newWaitTime = 0;
        }
        if (newWaitTime !== patient.estimatedWaitTime) {
          updates[`${key}/estimatedWaitTime`] = newWaitTime;
        }
      }
    });

    if (Object.keys(updates).length > 0) {
      await patientsRef.update(updates);
      console.log("⏱ Queue times updated by monitorQueue");
    }
  } catch (err) {
    console.error("monitorQueue Error:", err);
  }
}
// Run monitorQueue every 60s
setInterval(monitorQueue, 60000);

// ========================================================
// API ENDPOINT ROUTES
// ========================================================

// 1) Check-In
app.post("/check-in", async (req, res) => {
  try {
    const { fullName, dob, gender } = req.body;
    if (!fullName || !dob || !gender) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const patientID = "PAT-" + Math.floor(100000 + Math.random() * 900000);
    const newRef = db.ref("patients").push();
    await newRef.set({
      firebaseKey: newRef.key,
      patientID,
      fullName,
      dob,
      gender,
      checkInTime: new Date().toISOString(),
      status: "Waiting for Triage"
    });

    res.json({ success: true, patientID });
  } catch (err) {
    console.error("Error checking in:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 2) Assign Condition
app.post("/assign-condition", async (req, res) => {
  try {
    const { patientID, condition } = req.body;
    if (!patientID || !condition) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find patient record
    const snap = await patientsRef.once("value");
    let foundKey = null;
    snap.forEach(child => {
      if (child.val().patientID === patientID) {
        foundKey = child.key;
      }
    });
    if (!foundKey) return res.status(404).json({ error: "Patient not found" });

    // Increment condition's queueNumber
    const qRef = db.ref(`queueNumbers/${condition}`);
    const qSnap = await qRef.once("value");
    const newQueueNumber = (qSnap.val() || 0) + 1;
    await qRef.set(newQueueNumber);

    // Update patient with condition + queueNumber
    await db.ref(`patients/${foundKey}`).update({
      condition,
      status: "Waiting for Triage",
      queueNumber: newQueueNumber
    });

    res.json({ success: true, queueNumber: newQueueNumber });
  } catch (err) {
    console.error("assign-condition error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 3) Assign Severity
app.post("/assign-severity", async (req, res) => {
  try {
    const { patientID, severity } = req.body;
    if (!patientID || !severity) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find that patient
    const snap = await patientsRef.once("value");
    let foundKey = null;
    let condition = null;
    let lastWaitTime = 0;

    snap.forEach(child => {
      const p = child.val();
      if (p.patientID === patientID) {
        foundKey = child.key;
        condition = p.condition;
      }
    });
    if (!foundKey) return res.status(404).json({ error: "Patient not found" });

    // If others in the same condition+severity are in queue,
    // pick the highest estimatedWaitTime as a baseline
    snap.forEach(child => {
      const p = child.val();
      if (
        p.condition === condition &&
        p.severity === severity &&
        p.status?.startsWith("Queueing for")
      ) {
        lastWaitTime = Math.max(lastWaitTime, p.estimatedWaitTime || 0);
      }
    });

    const baseTime = severityWaitTimes[severity] || 60;
    const estimatedWaitTime = lastWaitTime + baseTime;

    // Update DB
    await db.ref(`patients/${foundKey}`).update({
      severity,
      estimatedWaitTime,
      status: `Queueing for ${severity}`,
      triageTime: new Date().toISOString()
    });

    res.json({ success: true, estimatedWaitTime });
  } catch (err) {
    console.error("assign-severity error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 4) Accept Patient (Doctor picks from queue)
// API: Accept Patient
app.post("/accept-patient", async (req, res) => {
  try {
      const { patientID } = req.body;
      if (!patientID) {
          return res.status(400).json({ error: "Missing patient ID" });
      }

      const patientsRef = db.ref("patients");
      const snapshot = await patientsRef.once("value");

      let foundPatientKey = null;
      snapshot.forEach(child => {
          if (child.val().patientID === patientID) {
              foundPatientKey = child.key;
          }
      });

      if (!foundPatientKey) {
          return res.status(404).json({ error: "Patient not found" });
      }

      const patientRef = db.ref(`patients/${foundPatientKey}`);

      await patientRef.update({
          status: "With Doctor",
          acceptedTime: new Date().toISOString()
      });

      res.json({ success: true, message: `Patient ${patientID} accepted.` });
  } catch (error) {
      console.error("Error accepting patient:", error);
      res.status(500).json({ success: false, message: "Error accepting patient." });
  }
});

// 5) Discharge (Removes from DB => triggers Cloud Function)
app.post("/discharge-patient", async (req, res) => {
  try {
    const { patientID } = req.body;
    if (!patientID) return res.status(400).json({ error: "Missing patient ID" });

    // Find record & remove
    const snap = await patientsRef.once("value");
    let foundKey = null;
    snap.forEach(child => {
      if (child.val().patientID === patientID) {
        foundKey = child.key;
      }
    });
    if (!foundKey) return res.status(404).json({ error: "Patient not found" });

    await db.ref(`patients/${foundKey}`).remove();
    // The onDelete Cloud Function does the waitTime adjustments
    res.json({ success: true });
  } catch (err) {
    console.error("discharge-patient error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 6) GET Waitlist
app.get("/waitlist", async (req, res) => {
  try {
    const snap = await patientsRef.once("value");
    if (!snap.exists()) return res.json([]);

    const patients = [];
    snap.forEach(child => {
      const p = child.val();
      // We can return all or filter
      if (p.status && p.patientID) {
        patients.push({ ...p });
      }
    });
    res.json(patients);
  } catch (err) {
    console.error("waitlist error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 7) GET Doctor Queue
app.get("/doctor-queue", async (req, res) => {
  try {
    const snap = await patientsRef.once("value");
    if (!snap.exists()) return res.json([]);

    const doctorQueue = [];
    snap.forEach(child => {
      const p = child.val();
      if (["Please See Doctor", "With Doctor"].includes(p.status)) {
        doctorQueue.push({ id: child.key, ...p });
      }
    });
    res.json(doctorQueue);
  } catch (err) {
    console.error("doctor-queue error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /patients-awaiting-triage
app.get("/patients-awaiting-triage", async (req, res) => {
  try {
    const snapshot = await db
      .ref("patients")
      .orderByChild("status")
      .equalTo("Waiting for Triage")
      .once("value");

    if (!snapshot.exists()) {
      return res.json([]);
    }

    const patients = [];
    snapshot.forEach((childSnapshot) => {
      patients.push({ id: childSnapshot.key, ...childSnapshot.val() });
    });

    res.json(patients);
  } catch (error) {
    console.error("Error fetching triage patients:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start
app.listen(PORT, () => console.log(`Express server running on port ${PORT}`));