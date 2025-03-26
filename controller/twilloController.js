const { MessagingResponse } = require('twilio').twiml;
const twilio = require('twilio');
const { reservationsUrl } = require('twilio/lib/jwt/taskrouter/util');
require('dotenv').config();
const Chat = require("../model/chatData")

// Twilio Account SID and Auth Token from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;  // Get from .env file
// console.log(accountSid);
const authToken = process.env.TWILIO_AUTH_TOKEN;    // Get from .env file
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
// Create a Twilio client instance
const client = new twilio(accountSid, authToken);


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

// console.log(process.env.ragToken)
async function askSafal(question) {
    const url = 'https://dev.safal.io/api/v1/safal/external/chat/ai';
    const token = process.env.ragToken; 
let bodyData = question
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ question })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        // console.log('Response:', data);
        return data;
    } catch (error) {
        console.error('Error:', error.message);
    }
}


// Endpoint for receiving SMS
let smswebhook= async(req, res) => {
    //    console.log(req);
       
       
    const incomingMsg = req.body?.Body.trim();  // Get the content of the incoming message
    const sender = req.body.From;  // Get the sender's phone number
 let answer =  await askSafal(incomingMsg)
console.log(answer,'answer')
 let findPhoneNo = await Chat.find({phoneNo:sender})

 if(findPhoneNo){
    console.log(findPhoneNo)
    
    let updateChats = await Chat.findOneAndUpdate(  { phoneNo: sender },
         { $push: { chats: {CreationTime:new Date(),userMessage:incomingMsg,systemReply:answer.data.answer} } },
        { new: true, upsert: true })
        console.log(updateChats)
    sendTwilioMessage(sender,answer.data.answer).then(()=>{
        res.send("message sent")
    }).catch(error=>{
        res.send(error.message,'error message')
    })

  
    return;
 }

 let adduser = await Chat.create({
    phoneNo: sender,
    chats :[{
        CreationTime:new Date(),
        userMessage:incomingMsg,
        systemReply:answer.data.answer
    }]
 })

 console.log(adduser)
sendTwilioMessage(sender,answer.data.answer).then(()=>{
        res.send("message sent")
    }).catch(error=>{
        res.send(error.message,'error message')
    })
    
    return;
    // console.log(`Received message from ${sender}: ${incomingMsg}`);

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
}


module.exports = {smswebhook}