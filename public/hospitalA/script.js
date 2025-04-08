// RENDER_API_URL holds the backend endpoint for all fetch operations
const RENDER_API_URL = "https://hospitalkiosk.onrender.com/hospitalA";

// generatePatientID returns a formatted string representing a patient ID
function generatePatientID() {
    // Produces a random integer between 100000 and 999999, prefixed with "PAT-"
    return "PAT-" + Math.floor(100000 + Math.random() * 900000);
}

// submitPatientInfo collects input data, validates it, and sends a POST request to the backend
function submitPatientInfo() {
    // Retrieves values from DOM elements
    let fullName = document.getElementById("full-name").value.trim();
    let dob = document.getElementById("dob").value;
    let gender = document.getElementById("gender").value;

    // Validates that fullName consists of at least two words with letters only
    if (!/^[a-zA-Z]+ [a-zA-Z]+$/.test(fullName)) {
        alert("Enter a valid full name (First and Last name).");
        return;
    }

    // Validates that date of birth is not a future date
    let dobDate = new Date(dob);
    if (dobDate >= new Date()) {
        alert("Date of birth cannot be in the future.");
        return;
    }

    // Validates that a gender option has been selected
    if (gender === "") {
        alert("Please select a gender.");
        return;
    }

    // Constructs an object of patient data to be sent
    let patientData = {
        fullName: fullName,
        dob: dob,
        gender: gender
    };

    // Sends a POST request to the check-in endpoint
    fetch(`${RENDER_API_URL}/check-in`, {
        method: "POST",                // HTTP method
        headers: { "Content-Type": "application/json" }, // JSON header
        body: JSON.stringify(patientData)                // Converts data to JSON
    })
    .then(response => response.json())     // Converts response to JSON
    .then(data => {
        // Checks if the API call succeeded
        if (data.success) {
            console.log("Patient stored successfully:", data);
            // Stores IDs in session storage
            sessionStorage.setItem("patientID", data.patientID);
            sessionStorage.setItem("customPatientID", data.customPatientID);
            // Redirects to a page for selecting condition
            window.location.href = "patientData.html";
        } else {
            alert("Check-in failed. Try again.");
        }
    })
    .catch(error => {
        // Logs and alerts in case of network or server error
        console.error("Error storing patient:", error);
        alert("Check-in failed. Try again.");
    });
}

// selectedCategory holds the chosen condition from the condition selection page
let selectedCategory = null;

// selectCategory sets the selected condition and updates an element with the choice
function selectCategory(category) {
    selectedCategory = category;
    document.getElementById("selected-category").textContent = `You've Selected: ${category}`;
}

// confirmSelection is triggered once a condition is chosen. It assigns a queue number to the patient
function confirmSelection() {
    // Validates that a category was actually selected
    if (!selectedCategory) {
        alert("Please select a category!");
        return;
    }

    // Fetches the patient ID from session storage
    let patientID = sessionStorage.getItem("patientID");
    // Checks if the session is still valid
    if (!patientID) {
        alert("Session expired. Please start again.");
        window.location.href = "index.html";
        return;
    }

    // Constructs data object for the API
    let patientData = { patientID, condition: selectedCategory };

    // Sends a POST request to assign the condition and retrieve the queue number
    fetch(`${RENDER_API_URL}/assign-condition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientData)
    })
    .then(response => response.json()) // Converts response to JSON
    .then(data => {
        console.log("Server response:", data); // Prints debug info

        // Checks if the backend assigned a valid queue number
        if (data.success && data.queueNumber !== undefined) {
            // Save the queue number and patientID to session storage
            sessionStorage.setItem("queueNumber", data.queueNumber);

            const customID = sessionStorage.getItem("customPatientID") || "Unknown";
        
            // Redirect to patient alert page with patientID and queue number as query parameters
            window.location.href = `patientAlert.html?patientID=${encodeURIComponent(customID)}`;
        } else {
            alert("Error: Queue number not assigned. Please try again.");
        }
    })
    .catch(error => {
        console.error("Error submitting condition:", error);
        alert("Submission failed. Try again.");
    });
}

// loadWaitTime requests the estimated wait time for the current patient from the backend
function loadWaitTime() {
    let patientID = sessionStorage.getItem("patientID");
    // Exits if patient ID is not present in session
    if (!patientID) return;

    // Sends a GET request to fetch the wait time
    fetch(`${RENDER_API_URL}/patient-wait-time/${patientID}`)
    .then(response => response.json()) // Converts response to JSON
    .then(data => {
        // Attempts to find the DOM element for displaying wait time
        const waitTimeElement = document.getElementById("estimated-wait-time");
        if (!waitTimeElement) {
            console.error("Error: 'estimated-wait-time' element not found in DOM.");
            return;
        }

        // Checks if the request was successful and updates the text content
        if (data.success) {
            waitTimeElement.textContent = `Estimated Wait Time: ${data.estimatedWaitTime} minutes`;
        } else {
            waitTimeElement.textContent = "Estimated Wait Time: Not Available";
        }
    })
    .catch(error => console.error("Error fetching wait time:", error));
}
