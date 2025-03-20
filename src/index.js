const express = require('express');
const { MessagingResponse } = require('twilio').twiml;
const twilio = require('twilio');
const cors = require('cors');  // Importing the CORS package
const app = express();





require('dotenv').config();

// Twilio Account SID and Auth Token from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;  // Get from .env file
// console.log(accountSid);
const authToken = process.env.TWILIO_AUTH_TOKEN;    // Get from .env file
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
// Create a Twilio client instance
const client = new twilio(accountSid, authToken);

// Middleware to parse incoming POST request data
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
// Enable CORS for all origins (you can specify options here if needed)
app.use(cors());
const userStates = {};
// console.log(userStates)
// Endpoint for receiving SMS


function sendTwilioMessage(to, body) {
    return client.messages.create({
        body: body,
        from: twilioNumber,  // Your Twilio phone number
        to: to  // The user's phone number (sender)
    });
}

// this is to check the server and keep backend online using cron
app.get("/",(req,res)=>{
    res.send("working")
})
// Endpoint for receiving SMS
app.post('/sms-webhook', (req, res) => {
       console.log(req);
    const incomingMsg = req.body?.Body.trim();  // Get the content of the incoming message
    const sender = req.body.From;  // Get the sender's phone number

    console.log(`Received message from ${sender}: ${incomingMsg}`);

    // Create a Twilio response
    const response = new MessagingResponse();

    // Check the state of the user
    if (userStates[sender] === 'waiting_for_appointment_datetime') {
        // If the user has replied with a date and time
        const confirmationMessage = `Your appointment has been booked. Thank you!`;

        // Send the confirmation message via Twilio
        sendTwilioMessage(sender, confirmationMessage)
            .then((message) => {
                console.log('Appointment confirmation sent:', message.sid);
            })
            .catch((error) => {
                console.error('Error sending appointment confirmation:', error);
            });

        // Reset the state after confirming the appointment
        delete userStates[sender];
    } else if (userStates[sender] === 'waiting_for_appointment_response') {
        // If the user has responded with "Yes" for appointment booking
        const followUpMessage = "Great! Please reply with the date and time you'd like to book your appointment.";

        // Send the message via Twilio
        sendTwilioMessage(sender, followUpMessage)
            .then((message) => {
                console.log('Date and time request sent:', message.sid);
            })
            .catch((error) => {
                console.error('Error sending date/time request:', error);
            });

        // Update the state to ask for date/time
        userStates[sender] = 'waiting_for_appointment_datetime';
    } else if (incomingMsg.toLowerCase() === 'hi') {
        // If the first message is "Yes", set the state and ask for date/time
        userStates[sender] = 'waiting_for_appointment_response';  // Set state to ask for appointment

        // Send the response message via Twilio
        sendTwilioMessage(sender, "Hello! Do you like to make an appointment? Reply 'Yes' to proceed.")
            .then((message) => {
                console.log('Appointment inquiry sent:', message.sid);
            })
            .catch((error) => {
                console.error('Error sending appointment inquiry:', error);
            });

        // Also respond with the MessagingResponse
        response.message("Hello! Do you like to make an appointment? Reply 'Yes' to proceed.");
    } else if (incomingMsg.toLowerCase() === 'no') {
        // If the user says "No", respond accordingly
        response.message("No problem! Let us know if you'd like to book an appointment later.");

        // Reset the state if the user says "No"
        delete userStates[sender];

        // Send the response message via Twilio
        sendTwilioMessage(sender, "No problem! Let us know if you'd like to book an appointment later.")
            .then((message) => {
                console.log('Appointment cancellation sent:', message.sid);
            })
            .catch((error) => {
                console.error('Error sending appointment cancellation:', error);
            });
    } else {
        // Handle any other response (non-appointment-related)
        const defaultMessage = `Thanks for your message. Would you like to book an appointment? Reply 'Yes' to proceed.`;

        response.message(defaultMessage);

        // Send the default message via Twilio
        sendTwilioMessage(sender, defaultMessage)
            .then((message) => {
                console.log('Default message sent:', message.sid);
            })
            .catch((error) => {
                console.error('Error sending default message:', error);
            });
    }

    // Send the response to Twilio (via the MessagingResponse object)
    res.type('text/xml');
    res.send(response.toString());
});

// app.post('/sms-webhook', (req, res) => {
//     const incomingMsg = req.body?.Body.trim();  // Get the content of the incoming message
//     const sender = req.body.From;  // Get the sender's phone number

//     console.log(`Received message from ${sender}: ${incomingMsg}`);

//     // Create a Twilio response
//     const response = new MessagingResponse();

//     // Check the state of the user
//     if (userStates[sender] === 'waiting_for_appointment_datetime') {
//         // If the user has replied with a date and time
//         response.message(`Your appointment has been booked for: ${incomingMsg}. Thank you!`);
//         delete userStates[sender];  // Reset the state after confirming the appointment
//     } else if (userStates[sender] === 'waiting_for_appointment_response') {
//         // If the user has responded with "Yes" for appointment booking
//         response.message("Great! Please reply with the date and time you'd like to book your appointment.");
//         userStates[sender] = 'waiting_for_appointment_datetime';  // Update state to ask for date/time
//     } else if (incomingMsg.toLowerCase() === 'yes') {
//         // If it's the first message asking if they want to book an appointment
//         userStates[sender] = 'waiting_for_appointment_response';  // Set state to ask for appointment
//         response.message("Hello! Do you like to make an appointment? Reply 'Yes' to proceed.");
//     } else {
//         // Default message if the user's input is not recognized
//         response.message("Please send a message to start the process.");
//     }

//     // Send the response to Twilio
//     res.type('text/xml');
//     res.send(response.toString());
// });

// Optional: Send a message to a phone number using Twilio (for testing)
app.post('/send-message', (req, res) => {
    console.log(req.body)
    const { to, body } = req.body; // Extract 'to' and 'body' from the request body

    // Check if both 'to' and 'body' are provided
    if (!to || !body) {
        return res.status(400).json({ error: 'Both "to" and "body" fields are required' });
    }

    // Send message using Twilio
    client.messages
        .create({
            body: body,
            from: twilioNumber,  // Your Twilio phone number
            to: to  // The recipient's phone number
        })
        .then((message) => {
            res.status(200).json({
                message: 'SMS sent successfully',
                messageSid: message.sid,
                status: message.status
            });
        })
        .catch((error) => {
            console.error('Error sending message:', error);
            res.status(500).json({ error: 'Failed to send SMS', details: error });
        });
});

// Start the Express server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});