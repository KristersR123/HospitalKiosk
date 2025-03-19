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


// ------------------------------------------------------------
// 2) MONITOR QUEUE: A function that runs every minute or so
//    to decrement each "Queueing for X" patient's estimatedWaitTime by 1
//    until it hits 0 => then set "Please See Doctor"
async function monitorQueue() {
    try {
      const snapshot = await patientsRef.once("value");
      if (!snapshot.exists()) return;
  
      const now = Date.now();
      const updates = {};
  
      snapshot.forEach(childSnap => {
        const patient = childSnap.val();
        const patientID = childSnap.key;
  
        // Only if status starts with "Queueing for"
        if (patient.status && patient.status.startsWith("Queueing for") && patient.triageTime) {
          let triageTimeMs = Date.parse(patient.triageTime);
          if (isNaN(triageTimeMs)) return; // skip invalid triageTime
  
          // Decrement by 1 minute, if not already 0
          let currWait = patient.estimatedWaitTime || 0;
          if (currWait > 0) {
            // Decrement by 1
            let newWait = Math.max(currWait - 1, 0);
            if (newWait !== currWait) {
              updates[`${patientID}/estimatedWaitTime`] = newWait;
            }
            // If newWait is 0 => promote them
            if (newWait === 0) {
              updates[`${patientID}/status`] = "Please See Doctor";
            }
          }
        }
      });
  
      if (Object.keys(updates).length > 0) {
        await patientsRef.update(updates);
        console.log("✅ Queue monitor updated wait times:", updates);
      }
    } catch (err) {
      console.error("❌ Error in monitorQueue:", err);
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

// ✅ Run this function once when the server starts
checkFirebaseWaitTimes();

function debounce(func, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), delay);
    };
}

patientsRef.on("child_changed", debounce(snapshot => {
    console.log("✅ Patient updated:", snapshot.val());
}, 1000)); // Ensure only 1 update per second


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
        acceptedTime: new Date().toISOString()
      });
      res.json({ success: true, message: `✅ Patient ${patientID} accepted.` });
    } catch (error) {
      console.error("❌ Error accepting patient:", error);
      res.status(500).json({ success: false, message: "Error accepting patient." });
    }
});

// NEW: Promote a patient (set status to "Please See Doctor")
app.post("/promote-patient", async (req, res) => {
    try {
      const { patientID } = req.body;
      if (!patientID) {
        return res.status(400).json({ error: "Missing patient ID" });
      }
      const patientRef = db.ref(`patients/${patientID}`);
      await patientRef.update({ status: "Please See Doctor" });
      res.json({ success: true, message: `Patient ${patientID} promoted to 'Please See Doctor'.` });
    } catch (error) {
      console.error("❌ Error promoting patient:", error);
      res.status(500).json({ success: false, message: "Error promoting patient." });
    }
});



// ------------------------------------------------------------
// 3) DISCHARGE LOGIC: After the doc is done with the first patient, we
//    check how long they actually spent. Then we adjust the next patients
//    in line for the same condition+severity. If doc time < base => we reduce
//    next patients. If doc time > base => we add the difference. 
app.post("/discharge-patient", async (req, res) => {
    try {
      const { patientID } = req.body;
      if (!patientID) {
        return res.status(400).json({ error: "Missing patient ID" });
      }
  
      const patientRef = db.ref(`patients/${patientID}`);
      const snap = await patientRef.once("value");
      if (!snap.exists()) {
        return res.status(404).json({ error: "Patient not found" });
      }
  
      const patient = snap.val();
      if (!patient.acceptedTime) {
        // If there's no 'acceptedTime', we can't measure doctor time
        console.warn("⚠ Discharging a patient who never had acceptedTime:", patient);
      }
  
      let acceptedTimeMs = patient.acceptedTime ? Date.parse(patient.acceptedTime) : Date.now();
      let now = Date.now();
      let elapsedDoctorTime = Math.floor((now - acceptedTimeMs) / 60000); // in minutes
  
      console.log(`⏱ Discharging patient ${patientID} after ${elapsedDoctorTime} min with doctor.`);
  
      // Condition/Severity for this queue
      const condition = patient.condition;
      const severity = patient.severity;
      const baseWait = severityWaitTimes[severity] || 10; // fallback if severity missing
  
      // We'll gather the updates
      let updates = {};
  
      // Grab all "Queueing for <severity>" patients with same condition
      let allSnap = await patientsRef.once("value");
      if (allSnap.exists()) {
        let queueingPatients = [];
  
        allSnap.forEach(cs => {
          let pData = cs.val();
          if (
            pData.status &&
            pData.status.startsWith("Queueing for") &&
            pData.condition === condition &&
            pData.severity === severity
          ) {
            queueingPatients.push({ key: cs.key, data: pData });
          }
        });
  
        // Sort them by queueNumber ascending
        queueingPatients.sort((a, b) => a.data.queueNumber - b.data.queueNumber);
  
        // If we have queueing patients, we adjust the first patient's wait time
        // based on how short/long the doc was
        if (queueingPatients.length > 0) {
          let first = queueingPatients[0];
          let firstNewWait = 0;
  
          if (elapsedDoctorTime < baseWait) {
            // The doc was faster than the base time => reduce next patient's wait
            let difference = baseWait - elapsedDoctorTime;
            firstNewWait = Math.max(first.data.estimatedWaitTime - difference, 0);
          } else if (elapsedDoctorTime > baseWait) {
            // The doc took longer => the next patient has to wait more
            let difference = elapsedDoctorTime - baseWait;
            firstNewWait = first.data.estimatedWaitTime + difference;
          } else {
            // doc took exactly baseWait => keep the same time
            firstNewWait = first.data.estimatedWaitTime;
          }
  
          updates[`${first.key}/estimatedWaitTime`] = firstNewWait;
  
          // If that newWaitTime is 0 => we promote them to 'Please See Doctor'
          if (firstNewWait === 0) {
            updates[`${first.key}/status`] = "Please See Doctor";
          }
  
          // For subsequent patients => add baseWait for each position
          for (let i = 1; i < queueingPatients.length; i++) {
            // For i-th patient, we do firstNewWait + (baseWait * i)
            // or you can do some other chaining logic
            let newTime = firstNewWait + (baseWait * i);
            updates[`${queueingPatients[i].key}/estimatedWaitTime`] = newTime;
          }
        }
      }
  
      // Remove the discharged patient
      await patientRef.remove();
  
      // Apply the queued updates
      if (Object.keys(updates).length > 0) {
        await patientsRef.update(updates);
        console.log(`✅ Updated wait times for queue:`, updates);
      }
  
      res.json({ success: true, message: `✅ Patient ${patientID} discharged & queue updated.` });
    } catch (err) {
      console.error("❌ Error discharging patient:", err);
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
