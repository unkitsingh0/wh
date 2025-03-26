const express = require('express');
require('dotenv').config();
const cors = require('cors');  // Importing the CORS package
const app = express();
const twillioRouter = require("../routes/twilloMessages");
const connectionToDatabase = require('../connection/db');







// Middleware to parse incoming POST request data
app.use(express.urlencoded({ extended: false }));
app.use(express.json()); 
// Enable CORS for all origins (you can specify options here if needed)
app.use(cors());

//connecting db;
connectionToDatabase(process.env.DB_URI)

//routes 
app.use("/",twillioRouter)
// Start the Express server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});