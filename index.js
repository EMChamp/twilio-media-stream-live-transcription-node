const WebSocket = require("ws");
const express = require("express");
const app = express();
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });

const path = require("path");

require("dotenv").config();

// Imports the Cloud Media Translation client library
const {
  SpeechTranslationServiceClient,
} = require('@google-cloud/media-translation');
// Creates a client
const client = new SpeechTranslationServiceClient();

wss.on("connection", function connection(ws) {
  console.log("New Connection Initiated");

  let recognizeStream = null;
  let isFirst = true;
  let currentTranslation = '';
  let currentRecognition = '';

  ws.on("message", function incoming(message) {

    // Setup GCP Config
    const encoding = 'mulaw';
    const sourceLanguage = 'hi-IN';
    const targetLanguage = 'en-US';
    const config = {
      audioConfig: {
        audioEncoding: encoding,
        sampleRateHertz: 8000,
        sourceLanguageCode: sourceLanguage,
        targetLanguageCode: targetLanguage,
      },
      singleUtterance: false,
    };
    // First request needs to have only a streaming config, no data.
    const initialRequest = {
      streamingConfig: config,
      audioContent: null,
    };

    // Parse websocket message
    const msg = JSON.parse(message);
    switch (msg.event) {
      case "connected":
        console.log(`A new call has connected.`);
        break;
      case "start":
        console.log(`Starting Media Stream ${msg.streamSid}`);
        // Create Stream to the Google Speech to Text API
        recognizeStream = client
            .streamingTranslateSpeech()
            .on('error', e => {
              if (e.code && e.code === 4) {
                console.log('Streaming translation reached its deadline.');
              } else {
                console.log(e);
              }
            })
            .on('data', response => {
              console.log("Data received");
              const {result, speechEventType} = response;
           
              currentTranslation = result.textTranslationResult.translation;
              currentRecognition = result.recognitionResult;
              console.log(`\nPartial translation: ${currentTranslation}`);
              console.log(`Partial recognition result: ${currentRecognition}`);

              wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(
                    JSON.stringify({
                      event: "interim-transcription",
                      text: currentTranslation,
                    })
                  );
                }
              }); 
            });
        break;
      case "media":
        if (isFirst) {
          recognizeStream.write(initialRequest);
          isFirst = false;
        }
        const request = {
          streamingConfig: config,
          audioContent: msg.media.payload.toString('base64'),
        };
        recognizeStream.write(request);
        break;
      case "stop":
        console.log(`Call Has Ended`);
        recognizeStream.destroy();
        break;
    }
  });
});

// app.use(express.static("public"));

console.log("Listening on Port 8080");
server.listen(8080);