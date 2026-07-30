import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketServer } from 'ws';
import http from 'http';
import ytdl from 'ytdl-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3001;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
await fs.mkdir(UPLOADS_DIR, { recursive: true });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// WebSocket connections store
const wsConnections = new Map();

wss.on('connection', (ws) => {
  const connectionId = uuidv4();
  wsConnections.set(connectionId, ws);
  
  ws.send(JSON.stringify({ type: 'connected', connectionId }));
  
  ws.on('close', () => {
    wsConnections.delete(connectionId);
  });
});

// Broadcast progress to all connected clients
function broadcastProgress(data) {
  const message = JSON.stringify({ type: 'progress', ...data });
  wsConnections.forEach((ws) => {
    if (ws.readyState === 1) {
      ws.send(message);
    }
  });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const jobId = req.body.jobId || uuidv4();
    const jobDir = path.join(UPLOADS_DIR, jobId);
    fs.mkdir(jobDir, { recursive: true }).then(() => {
      cb(null, jobDir);
    });
  },
  filename: (req, file, cb) => {
    cb(null, `input_${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  },
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Process transcription with WhisperMLX
async function transcribeWithWhisperMLX(inputPath, outputPath, jobId) {
  return new Promise((resolve, reject) => {
    broadcastProgress({
      jobId,
      status: 'transcribing',
      message: 'Starting transcription with WhisperMLX...'
    });

    const command = 'whispermlx';
    const args = [
      inputPath,
      '--output-dir', path.dirname(outputPath),
      '--output-format', 'json',
      '--model', 'large-v3'
    ];

    const process = spawn(command, args);

    process.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`WhisperMLX: ${output}`);
      
      // Parse progress from WhisperMLX output if available
      broadcastProgress({
        jobId,
        status: 'transcribing',
        message: output.trim()
      });
    });

    process.stderr.on('data', (data) => {
      console.error(`WhisperMLX Error: ${data}`);
    });

    process.on('close', async (code) => {
      if (code === 0) {
        // WhisperMLX outputs filename.json in the output directory
        const baseName = path.basename(inputPath, path.extname(inputPath));
        const whisperOutputPath = path.join(path.dirname(outputPath), `${baseName}.json`);
        
        try {
          const rawData = await fs.readFile(whisperOutputPath, 'utf-8');
          const whisperResult = JSON.parse(rawData);
          
          // Convert to our format with timestamps
          const transcription = {
            text: whisperResult.text,
            segments: whisperResult.segments.map(seg => ({
              start: seg.start,
              end: seg.end,
              text: seg.text.trim()
            })),
            language: whisperResult.language || 'en'
          };
          
          await fs.writeFile(outputPath, JSON.stringify(transcription, null, 2));
          
          broadcastProgress({
            jobId,
            status: 'completed',
            message: 'Transcription completed successfully',
            segments: transcription.segments
          });
          
          resolve(transcription);
        } catch (err) {
          reject(err);
        }
      } else {
        broadcastProgress({
          jobId,
          status: 'error',
          message: `WhisperMLX process exited with code ${code}`
        });
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

// Upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const jobId = req.body.jobId;
    const jobDir = path.join(UPLOADS_DIR, jobId);
    const inputPath = req.file.path;
    const outputPath = path.join(jobDir, 'transcription.json');

    res.json({
      jobId,
      filename: req.file.originalname,
      path: `/uploads/${jobId}/${path.basename(inputPath)}`,
      status: 'uploaded'
    });

    // Start transcription in background
    try {
      await transcribeWithWhisperMLX(inputPath, outputPath, jobId);
    } catch (error) {
      console.error('Transcription error:', error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// URL download endpoint
app.post('/api/download', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const jobId = uuidv4();
    const jobDir = path.join(UPLOADS_DIR, jobId);
    await fs.mkdir(jobDir, { recursive: true });
    
    const outputPath = path.join(jobDir, `downloaded_${Date.now()}.mp4`);

    broadcastProgress({
      jobId,
      status: 'downloading',
      message: 'Downloading video from URL...'
    });

    // Try yt-dlp first, fallback to direct download
    try {
      await new Promise((resolve, reject) => {
        const process = spawn('yt-dlp', [
          '-f', 'best',
          '-o', outputPath,
          url
        ]);

        process.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`yt-dlp exited with code ${code}`));
        });
      });
    } catch (ytError) {
      // Fallback to direct download if yt-dlp fails
      console.log('yt-dlp failed, trying direct download...');
      // Implement direct download logic here if needed
    }

    res.json({
      jobId,
      status: 'downloaded',
      path: `/uploads/${jobId}/${path.basename(outputPath)}`
    });

    // Start transcription
    const transcriptionPath = path.join(jobDir, 'transcription.json');
    try {
      await transcribeWithWhisperMLX(outputPath, transcriptionPath, jobId);
    } catch (error) {
      console.error('Transcription error:', error);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Convert video format endpoint
app.post('/api/convert', async (req, res) => {
  try {
    const { inputPath, outputFormat } = req.body;
    const outputPath = inputPath.replace(/\.[^.]+$/, `.${outputFormat}`);
    
    broadcastProgress({
      jobId: 'conversion',
      status: 'converting',
      message: `Converting to ${outputFormat}...`
    });

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-i', path.join(__dirname, inputPath),
        '-c:v', 'libx264',
        '-c:a', 'aac',
        outputPath
      ]);

      ffmpeg.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
    });

    res.json({ outputPath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get transcription status endpoint
app.get('/api/transcription/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const transcriptionPath = path.join(UPLOADS_DIR, jobId, 'transcription.json');
    
    try {
      const data = await fs.readFile(transcriptionPath, 'utf-8');
      const transcription = JSON.parse(data);
      res.json({ status: 'completed', ...transcription });
    } catch {
      res.json({ status: 'processing' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket endpoint for real-time updates
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
