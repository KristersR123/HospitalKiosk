/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();

// Define the severity wait times within the function or as a global variable
const severityWaitTimes = {
    Red: 0,
    Orange: 10,
    Yellow: 60,
    Green: 120,
    Blue: 240
};

exports.adjustWaitTimesOnDischarge = functions.database.ref('/patients/{patientId}')
    .onUpdate(async (change, context) => {
        const patientBefore = change.before.val();
        const patientAfter = change.after.val();

        console.log("🔥 Triggered adjustWaitTimesOnDischarge");
        console.log("Status before:", patientBefore.status);
        console.log("Status after:", patientAfter.status);

        if (patientBefore.status === "With Doctor" && patientAfter.status !== "With Doctor") {
            const baseWaitTime = severityWaitTimes[patientBefore.severity] || 0;
            const acceptedTime = new Date(patientBefore.acceptedTime).getTime();
            const now = Date.now();
            const actualTime = Math.floor((now - acceptedTime) / 60000); // in minutes
            const extraTime = actualTime - baseWaitTime; // positive = doctor took longer

            if (extraTime === 0) return null;

            const patientsRef = admin.database().ref('/patients');
            const patientsSnapshot = await patientsRef.once('value');
            const updates = {};

            // Only adjust if doctor isn't still busy with someone else in the same queue group
            let doctorStillBusy = false;
            patientsSnapshot.forEach((snap) => {
                const p = snap.val();
                if (
                    p.status === "With Doctor" &&
                    p.condition === patientBefore.condition &&
                    p.severity === patientBefore.severity
                ) {
                    doctorStillBusy = true;
                }
            });

            if (doctorStillBusy) {
                console.log("Doctor still with patient in same queue group. Skipping update.");
                return null;
            }

            patientsSnapshot.forEach((snap) => {
                const patient = snap.val();
                const key = snap.key;

                if (
                    patient.patientID !== patientBefore.patientID && 
                    (patient.status?.startsWith("Queueing for") || patient.status === "Please See Doctor") &&
                    patient.condition === patientBefore.condition &&
                    patient.severity === patientBefore.severity
                ) {
                    let currentWaitTime = patient.estimatedWaitTime || 0;
                    let newTime = currentWaitTime + extraTime;
                    updates[`${key}/estimatedWaitTime`] = Math.max(0, newTime);
                }
            });

            await patientsRef.update(updates);
            console.log(`Wait times updated based on extra time spent (${extraTime} minutes).`);
        }

        return null;
    });
