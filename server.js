const express = require('express');
const cors = require('cors')
const multer = require('multer');
const progress = require('progress-stream');
const mongoose = require('mongoose');
require('dotenv').config();
const port=process.env.API_PORT

const fs = require('fs');
const { spawn } = require('child_process');

const redis = require('redis');

const MongoClient = require('mongodb').MongoClient;
const Conversion = require('./models/conversionModel'); 

// Connection URI
const uri=process.env.Mongo_URI + '/?retryWrites=true&w=majority&appName=Cluster0'
// const uri = 'mongodb+srv://sumitbadola573:deG6cwCI5HG39WdE@cluster0.rgz5hp1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
// Database Name
const dbName = 'video_conversions';
// Create a MongoDB client
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

// Connect to MongoDB using then()
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log("Connected to MongoDB mongoose");
        // Now you can start using the Conversion model and perform database operations
    })
    .catch(err => {
        console.error("Failed to connect to MongoDB:", err);
    });


const app = express();
app.use(express.json());
app.use(cors());

let progressPercent = 0;
let durationInSeconds = 0;
// create multer storage instance
let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, req.destination);
  },
  filename: function (req, file, cb) {
    cb(null, 'new'+ Date.now() + file.originalname);
  }
});

// create multer upload instance
let upload = multer({
  storage: storage
}).array('file1');



// app.get('/getConversions', async (req, res) => {
//   const conversions = await Conversion.find({where:{_id:"65e31f9c6ca4ee72d46ddb7d"}});

//   console.log(conversions);
//   return res.send({"data":conversions});
// });

// Upload Endpoint
app.post('/upload', (req, res) => {
  
  if (req.files === null) {
    return res.status(400).json({ msg: 'No file uploaded' });
  }

  // read file size from req.file and replace in length below
  const singleFileSize = req.headers["content-length"];
  
  // NOTE:- for multi file upload,read each file size from file object and iterate over files


  const progressObj = progress({length: singleFileSize});

  // path to store uploaded file
  progressObj.destination = './uploads';

  // pipe file upload request with progress stream to get upload progress
  req.pipe(progressObj);
  progressObj.headers = req.headers;
  progressObj.on('progress', (progress) => {
    // set upload progress global variable
    progressPercent = progress.percentage;
  })


  // multer upload
  upload(progressObj, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(500).json(err);
    } else if (err) {
      return res.status(500).json(err);
    }

    console.log('Files uploaded. Bye! Grab your response.');
    return res.status(200).send({msg:"Files uploaded. Bye! Grab your response." , file : req.file});
  });

});

// get request for SSE to get upload progress
app.get('/upload', (req, res) => {
  
  // customized response headers
  res.writeHead(200, {
    Connection: 'keep-alive',
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache'
  });

  // read file upload progress after each 100ms
  const intervalInstance = setInterval(() => {

    // close connection and clear interval if file has uploaded
    if (parseInt(progressPercent) == 100) {
      console.log('Final upload progress:', progressPercent);
      
      clearInterval(intervalInstance);
      // return res.end();
    }

    res.write(
      `event: uploadProgress\nid: ${new Date()}\ndata: ${parseInt(progressPercent)}`
    );
    
    res.write('\n\n');
    
    console.log(`Reading & Sending upload progress as: ${JSON.stringify(progressPercent)}%`);
  
  }, 100);
  
});


async function main() {
  try {
      await client.connect();
      console.log("Connected to MongoDB");

      const db = client.db(dbName);

      // Watch a directory for new files
      const watchDirectory = './uploads';
      fs.watch(watchDirectory, (eventType, filename) => {
        console.log("changed");
          if (eventType === 'rename') {
              // New file added to the directory
              const inputFile = `${watchDirectory}/${filename}`;
              console.log("detecte getting new>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
              const outputFile = `./output_videos/${filename.replace(/\.[^/.]+$/, '')}.mp4`; // Assuming output directory is 'output_videos'

              // Enqueue conversion job
              enqueueConversion(db, inputFile, outputFile);
          }
      });
  } catch (err) {
      console.error(err);
  }
}

// Function to get video duration using FFprobe
function getVideoDuration(inputFile) {
  return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          inputFile
      ]);

      let duration = 0;

      ffprobe.stdout.on('data', data => {
          duration = parseFloat(data.toString());
      });

      ffprobe.on('close', code => {
          if (code === 0) {
              resolve(duration);
          } else {
              reject(`FFprobe process exited with code ${code}`);
          }
      });
  });
}

// Function to convert video
async function convertVideo(inputFile, outputFile) {
   durationInSeconds = await getVideoDuration(inputFile);

  return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ['-i', inputFile, outputFile]);

      ffmpeg.stderr.on('data', data => {
          // Extract progress information from stderr
          const progress = extractProgress(data.toString());
          console.log(`Progress: ${progress}%`);
          // Update progress in the database
          updateProgress(outputFile, progress);
      });

      ffmpeg.on('close', code => {
          if (code === 0) {
              console.log('Conversion completed successfully');
              resolve();
          } else {
              reject(`Conversion failed with code ${code}`);
          }
      });
  });
}

// Function to extract progress from FFmpeg stderr
function extractProgress(stderr) {
  const matches = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/);
  if (matches && matches.length === 4) {
      const hours = parseInt(matches[1]);
      const minutes = parseInt(matches[2]);
      const seconds = parseFloat(matches[3]);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      const progress = (totalSeconds / durationInSeconds) * 100;
      return Math.min(progress, 100).toFixed(2);
  }
  return 0;
}


// Update progress in MongoDB
async function updateProgress(outputFile, progress) {
  try {
    

    // Update progress in MongoDB using Mongoose model
    await Conversion.updateOne({ output: outputFile }, { $set: { status: progress } });

    console.log("Progress updated successfully");
} catch (err) {
    console.error(err);
}
}

// Enqueue video conversion job
async function enqueueConversion(db, inputFile, outputFile) {
  try {
      // Insert conversion details into the database
      await db.collection('conversions').insertOne({
          input: inputFile,
          output: outputFile,
          status: 0
      });

      // Convert video
      await convertVideo(inputFile, outputFile);

      // Update status after conversion
      await updateProgress(outputFile, 100);
  } catch (err) {
      console.error(err);
  }
}
//function call
main();



// listing server
app.listen(port, () => console.log(`Server Started on port htttp://localhost:${port}`));
