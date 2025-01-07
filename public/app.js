// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBTtPFubG_caZgZS_Zpnjs6-x0Y0QYLxIc",
    authDomain: "hospitalkiosk-a92a4.web.app",
    databaseURL: "https://hospitalkiosk-a92a4.web.app/",
    projectId: "hospitalkiosk-a92a4",
    storageBucket: "hospitalkiosk-a92a4.firebasestorage.app",
    messagingSenderId: "781602336535",
    appId: "1:781602336535:web:caac14621d8591341f5152"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Function to Submit Patient Number
function submitPatientNumber() {
    let patientNumber = document.getElementById("patient-number").value.trim();

    if (patientNumber === "") {
        alert("Please enter your patient number.");
        return;
    }

    let checkInTime = new Date().toISOString();

    // Save patient data in Firebase
    let patientRef = database.ref("patients").push();
    patientRef.set({
        patientNumber: patientNumber,
        checkInTime: checkInTime,
        status: "Waiting"
    });

    alert("Check-in successful!");
    document.getElementById("patient-number").value = "";
}

// Function for One-Time Visit
function oneTimeVisit() {
    let tempPatientId = "TEMP-" + Math.floor(Math.random() * 1000000);
    let checkInTime = new Date().toISOString();

    let patientRef = database.ref("patients").push();
    patientRef.set({
        patientNumber: tempPatientId,
        checkInTime: checkInTime,
        status: "Waiting"
    });

    alert("One-time check-in successful! Your temporary ID: " + tempPatientId);
}