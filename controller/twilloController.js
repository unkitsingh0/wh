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

// this function checks by looking at the reponse if we need to crate calendar event or not
function isMeetingResponse(response) {
    return response.trim().toLowerCase().startsWith("meeting:");
}

async function sendConfirmationEmail(accessToken, patientEmail, patientName, appointmentDate, appointmentTime, doctorName, clinicAddress) {
    const subject = `Appointment Confirmation - ${appointmentDate}`;
    
    const message = `
        Dear ${patientEmail.split("@")[0]},

        Your appointment has been successfully scheduled.

        **Date:** ${appointmentDate}  
        **Time:** ${appointmentTime}  
        **Doctor:** Dr. ${doctorName}  
        **Location:** ${clinicAddress}

        If you have any questions or need to reschedule, please contact us.

        Looking forward to seeing you!

        Best regards`;

    const email = [
        `To: ${patientEmail}`,
        'From: admin@safal.info',  // Replace with your actual email
        `Subject: ${subject}`,
        '',
        message
    ].join('\n');

    const base64EncodedEmail = btoa(email).replace(/\+/g, '-').replace(/\//g, '_');

    const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            raw: base64EncodedEmail
        })
    });

    return response.json();
}

// checking env data 
// console.log(process.env.client_id)
// console.log(process.env.client_secret)
// console.log(process.env.refresh_token)

//generating google access token
async function getAccessToken() {
    const url = 'https://oauth2.googleapis.com/token';
    
    const params = new URLSearchParams();
    params.append('client_id', process.env.client_id);
    params.append('client_secret', process.env.client_secret);
    params.append('refresh_token', process.env.refresh_token);
    params.append('grant_type', 'refresh_token');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        console.log("Access Token:", data.access_token);
        return data.access_token; // You can return it or use it directly in API requests
    } catch (error) {
        console.error('Error fetching access token:', error);
        return null;
    }
}

// Call the function to get the token


async function createGoogleCalendarEvent(aiResponse) {
    try {
        const token = await getAccessToken(); // Fetch the access token dynamically

        if (!token) {
            console.error("Failed to retrieve access token.");
            return;
            
        }

        console.log("Successfully retrieved access token:", token);

        // Step 1: Extract details by splitting the response
        if (!aiResponse.startsWith("Meeting:")) {
            console.error("Invalid response. Not a meeting request.");
            return;
        }

        const parts = aiResponse.replace("Meeting:", "").split(" - ").map(p => p.trim());

        if (parts.length !== 5) {
            console.error("Invalid format. Cannot create event.");
            return;
        }

        const [doctorName, dateStr, timeStr, durationStr, userEmail] = parts;
        const durationMin = parseInt(durationStr.replace("min", "").trim(), 10);

        let thankYouMessage = `Thank you! Your appointment has been successfully booked.  

📅 **Doctor:** ${doctorName}  
📆 **Date:** ${dateStr}  
⏰ **Time:** ${timeStr}  
⏳ **Duration:** ${durationStr}  
📩 **Confirmation sent to:** ${userEmail}  

If you need to reschedule or cancel, please contact the clinic.  
`;

        // Step 2: Convert date and time to ISO 8601 (New York Time)
        const formattedDateTime = convertToISO(dateStr, timeStr);

        if (!formattedDateTime) {
            console.error("Error in date conversion.");
            return;
        }

        const startDateTime = formattedDateTime;
        const endDateTime = new Date(new Date(startDateTime).getTime() + durationMin * 60000).toISOString();

        // Step 3: Google Calendar API request
        const event = {
            summary: `Dental Appointment with ${doctorName}`,
            location: "123 Dental Street, New York, NY",
            description: "Scheduled dental appointment.",
            start: { dateTime: startDateTime, timeZone: "America/New_York" },
            end: { dateTime: endDateTime, timeZone: "America/New_York" },
            attendees: [{ email: userEmail }],
            conferenceData: {
                createRequest: { requestId: `meeting-${Date.now()}` }
            },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: "email", minutes: 30 },
                    { method: "popup", minutes: 10 }
                ]
            }
        };

        const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(event)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Failed to create Google Calendar event:", errorData);
            return;
        }

        const data = await response.json();
        console.log("Google Calendar Event Created:", data);

        sendConfirmationEmail(
            token,
            userEmail ,
            "patientName",
            dateStr,
            timeStr,
            doctorName,
            ''
        )
        return thankYouMessage;
    } catch (error) {
        console.error("Error in createGoogleCalendarEvent:", error);
    }
}


// Helper function to convert date & time to ISO 8601
function convertToISO(dateStr, timeStr) {
    try {
        const fullDateStr = `${dateStr}, ${new Date().getFullYear()}`;
        const dateObj = new Date(fullDateStr + " " + timeStr + " EDT"); // EDT for New York time

        if (isNaN(dateObj.getTime())) return null;

        return dateObj.toISOString();
    } catch (error) {
        console.error("Date conversion error:", error);
        return null;
    }
}

// Example AI Response
// const aiResponse = "Meeting: Dr. Anil Sharma - Mar 28 - 9:00 AM - 45 min - ankit@rapiddata.io";
// createGoogleCalendarEvent(aiResponse);




// console.log(process.env.ragToken)
// async function askSafal(question) {
//     const url = 'https://dev.safal.io/api/v1/safal/external/chat/ai';
//     const token = process.env.ragToken; 
// let bodyData = question
//     try {
//         const response = await fetch(url, {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json',
//                 'Authorization': `Bearer ${token}`
//             },
//             body: JSON.stringify({ question })
//         });

//         if (!response.ok) {
//             throw new Error(`HTTP error! Status: ${response.status}`);
//         }

//         const data = await response.json();
//         // console.log('Response:', data);
//         return data;
//     } catch (error) {
//         console.error('Error:', error.message);
//     }
// }

async function askSafal(question, retry = true) {
    const url = 'https://dev.safal.io/api/v1/safal/external/chat/ai';
    const token = process.env.ragToken;

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

        const data = await response.json(); // Parse JSON response

        // Extract answer string
        const answer = data?.data?.answer?.trim();

        // If answer is empty and we haven't retried yet, retry once
        if (!answer && retry) {
            console.warn('Empty response received. Retrying...');
            return askSafal(question, false); // Retry once
        }

        return data;
    } catch (error) {
        console.error('Error:', error.message);
    }
}


// Endpoint for receiving SMS
let smswebhook= async(req, res) => {
    //    console.log(req);
       

   
    

try {
    const incomingMsg = req.body?.Body.trim();  // Get the content of the incoming message
    const sender = req.body.From;  // Get the sender's phone number
    // console.log(answer,'answer')
 let findPhoneNo = await Chat.find({phoneNo:sender})

 if(findPhoneNo){
   
    let combinedMessageHistory = ''
    findPhoneNo[0]?.chats.map((msg,index)=>{
        // console.log(msg.userMessage,'msgs')
        let indexNo= index+1
        combinedMessageHistory=combinedMessageHistory+indexNo+") UserMessage:-"+ msg.userMessage+", systemReply:-"+msg.systemReply +","
        // combinedMessageHistory = msg.userMessage
        
    })
    let msgWithHistory=`todaysDate:${new Date()},chatHistory:${combinedMessageHistory},currentMessage:${incomingMsg}`
    let answer =  await askSafal(msgWithHistory).catch((error)=>{
        res.send(error.message)
         })
         let updateChats = await Chat.findOneAndUpdate(  { phoneNo: sender },
            { $push: { chats: {CreationTime:new Date(),userMessage:incomingMsg,systemReply:answer.data.answer} } },
           { new: true, upsert: true })
        //  console.log(answer.data.answer)
  let checkCreateMeetOrNot=isMeetingResponse(answer.data.answer)
//   console.log(checkCreateMeetOrNot,'checking to do we need to create meet or not')
  if(checkCreateMeetOrNot){
    // console.log("need to create meeting")
    // console.log('creating event')
   let getThankYouMessage=await  createGoogleCalendarEvent(answer.data.answer);
    // console.log(await getThankYouMessage)
    sendTwilioMessage(sender,"Your appointment is confirmed. You will receive a confirmation email soon. Thank you for choosing us!").then(()=>{
        // res.status(200).json(answer.data.answer)
        res.status(200).send("Event Created,"+getThankYouMessage)
    }).catch(error=>{
        res.status(500).send(error.message,'error message')
    })
    
    return;
  }
    // console.log(combinedMessageHistory,'history')
    // console.log(findPhoneNo[0].chats,'all details')
  

        
    sendTwilioMessage(sender,answer.data.answer).then(()=>{
        res.status(200).json(answer.data.answer)
    }).catch(error=>{
        res.status(500).send(error.message,'error message')
    })
    
    return;
 }
 
 let answer =  await askSafal(incomingMsg).catch((error)=>{
res.send(error.message)
 })
 let adduser = await Chat.create({
    phoneNo: sender,
    chats :[{
        CreationTime:new Date(),
        userMessage:incomingMsg,
        systemReply:answer.data.answer
    }]
 })

//  console.log(adduser)
sendTwilioMessage(sender,answer.data.answer).then(()=>{
    res.status(201).json(answer.data.answer)
    }).catch(error=>{
        res.send(error.message,'error message')
    })

    return;
} catch (error) {
    console.log(error.message)
    res.status(500).send(error.message)
}
  
}


module.exports = {smswebhook}