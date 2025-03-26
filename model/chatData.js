
const mongoose = require("mongoose")
const chatDataSchema = mongoose.Schema({
  phoneNo: { type: String, required: true },
  chats :{type:Array},
  chatCreationTime: { type: Date, default: Date.now }
});
let Chat = mongoose.model("twilloChat", chatDataSchema);

module.exports = Chat; 
