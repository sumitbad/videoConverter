const mongoose = require('mongoose');

// Define schema for video conversions
const conversionSchema = new mongoose.Schema({
    input: String,
    output: String,
    progress:String,
    status: Number,
    checked:Boolean
});

// Create model for video conversions
const Conversion = mongoose.model('Conversion', conversionSchema);

// Export the model
module.exports = Conversion;