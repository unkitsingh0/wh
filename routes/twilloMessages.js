const express = require("express");
const { smswebhook } = require("../controller/twilloController");
const router = express.Router()

router.get("/",(req,res)=>{
    res.send("test port")
})
router.post("/sms-webhook",smswebhook)

module.exports=router