const { spawn } = require("child_process");
const express = require("express");
const fs = require("fs");
const path = require("path");

// Configuration
const CONFIG = {
  srtPort: 9000,
  httpPort: 3000,
  outputDir: "./streams",
  hlsDir: "./hls",
  latency: 200,
};

// Create directories
[CONFIG.outputDir, CONFIG.hlsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

class SRTServer {
  constructor() {
    this.ffmpegProcess = null;
    this.stats = {
      startTime: null,
      isLive: false,
      currentFile: null,
    };
  }

  // Clear all HLS files (segments and playlist)
  clearHLSBuffer() {
    console.log("🧹 Clearing HLS buffer...");
    try {
      const files = fs.readdirSync(CONFIG.hlsDir);
      files.forEach((file) => {
        const filePath = path.join(CONFIG.hlsDir, file);
        if (file.endsWith(".ts") || file.endsWith(".m3u8")) {
          fs.unlinkSync(filePath);
          console.log(`   Deleted: ${file}`);
        }
      });
      console.log("✅ HLS buffer cleared");
    } catch (err) {
      console.error("❌ Error clearing HLS buffer:", err.message);
    }
  }

  start() {
    // Clear old HLS files before starting new stream
    this.clearHLSBuffer();
    
    console.log(`\n🚀 Starting SRT server on port ${CONFIG.srtPort}...`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputFile = path.join(CONFIG.outputDir, `stream-${timestamp}.mp4`);
    const hlsPlaylist = path.join(CONFIG.hlsDir, "stream.m3u8");

    // FFmpeg: SRT input → MP4 recording + HLS for live playback
    const ffmpegArgs = [
      '-hide_banner',
      '-loglevel', 'info',
      '-i', `srt://0.0.0.0:${CONFIG.srtPort}?mode=listener&latency=${CONFIG.latency}`,

      // Output 1: MP4 recording (keep original codec)
      '-map', '0:v:0',
      '-map', '0:a:0',
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-f', 'mp4',
      '-movflags', '+faststart',
      outputFile,

      // Output 2: HLS for live playback (MUST transcode to H.264)
      '-map', '0:v:0',
      '-map', '0:a:0',
      // Video: Transcode everything to H.264 (universal browser support)
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-profile:v', 'high',
      '-level', '4.2',
      '-pix_fmt', 'yuv420p',
      '-crf', '23',
      '-maxrate', '8000k',
      '-bufsize', '16000k',
      '-g', '120',
      '-sc_threshold', '0',
      '-keyint_min', '120',
      '-vf', 'scale=1920:1080:flags=bicubic',
      '-r', '30',
      // Audio: Transcode to AAC
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-ac', '2',
      // HLS settings
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '10',
      '-hls_flags', 'delete_segments+independent_segments',
      '-hls_segment_type', 'mpegts',
      '-hls_segment_filename', path.join(CONFIG.hlsDir, 'segment%03d.ts'),
      '-start_number', '0',
      hlsPlaylist
    ];

    this.ffmpegProcess = spawn("ffmpeg", ffmpegArgs);

    this.ffmpegProcess.stderr.on("data", (data) => {
      const output = data.toString();

      if (output.includes("frame=") || output.includes("time=")) {
        process.stdout.write(`\r${output.trim().substring(0, 100)}`);

        if (!this.stats.isLive) {
          this.stats.isLive = true;
          this.stats.startTime = Date.now();
          this.stats.currentFile = outputFile;
          console.log(`\n✅ Stream started!`);
          console.log(`📁 Recording: ${outputFile}`);
          console.log(
            `📺 Watch live: http://localhost:${CONFIG.httpPort}/watch`
          );
        }
      } else if (output.includes("error") || output.includes("Error")) {
        console.log(`\n[Error] ${output}`);
      }
    });

    this.ffmpegProcess.on("close", (code) => {
      console.log(`\n\n⏹️  Stream ended. FFmpeg exited with code ${code}`);
      if (this.stats.currentFile) {
        console.log(`📁 Recording saved: ${this.stats.currentFile}`);
      }
      this.stats.isLive = false;

      // Clear HLS buffer when stream stops
      this.clearHLSBuffer();

      setTimeout(() => {
        console.log("\n🔄 Restarting SRT listener...");
        this.start();
      }, 2000);
    });

    this.ffmpegProcess.on("error", (err) => {
      console.error("\n❌ Failed to start FFmpeg:", err.message);
    });

    console.log("✅ SRT server is listening");
    console.log(`📺 Stream to: srt://localhost:${CONFIG.srtPort}`);
    console.log(`🌐 Dashboard: http://localhost:${CONFIG.httpPort}\n`);
  }

  stop() {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill("SIGTERM");
      this.ffmpegProcess = null;
    }
    // Clear HLS buffer when manually stopping
    this.clearHLSBuffer();
  }

  getStats() {
    return {
      ...this.stats,
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
    };
  }
}

const srtServer = new SRTServer();
srtServer.start();

// Web Server
const app = express();

// Serve HLS files with proper CORS and caching
app.use(
  "/hls",
  (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Range");
    if (req.path.endsWith(".m3u8")) {
      res.header("Content-Type", "application/vnd.apple.mpegurl");
      res.header("Cache-Control", "no-cache, no-store, must-revalidate");
    } else if (req.path.endsWith(".ts")) {
      res.header("Content-Type", "video/mp2t");
      res.header("Cache-Control", "public, max-age=31536000");
    }
    next();
  },
  express.static(CONFIG.hlsDir)
);

// Live player page
app.get("/watch", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Live Stream Player</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #1a1a1a;
          color: white;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .header {
          background: #2a2a2a;
          padding: 20px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        }
        .header h1 {
          font-size: 24px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .live-badge {
          background: #e74c3c;
          padding: 4px 12px;
          border-radius: 5px;
          font-size: 12px;
          font-weight: bold;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .container {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .player-wrapper {
          width: 100%;
          max-width: 1400px;
          background: #000;
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        }
        video {
          width: 100%;
          height: auto;
          display: block;
          background: #000;
        }
        .controls {
          background: #2a2a2a;
          padding: 20px;
          text-align: center;
        }
        .status {
          margin-top: 10px;
          padding: 10px;
          border-radius: 5px;
          background: #3a3a3a;
          font-size: 14px;
        }
        .offline-message {
          text-align: center;
          padding: 60px 20px;
        }
        .offline-message h2 {
          font-size: 32px;
          margin-bottom: 15px;
          color: #7f8c8d;
        }
        .offline-message p {
          color: #95a5a6;
          font-size: 16px;
        }
        .btn {
          background: #3498db;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 5px;
          font-size: 14px;
          cursor: pointer;
          margin: 5px;
          transition: background 0.3s;
        }
        .btn:hover {
          background: #2980b9;
        }
        .back-link {
          color: #3498db;
          text-decoration: none;
          margin-top: 20px;
          display: inline-block;
        }
        .back-link:hover {
          text-decoration: underline;
        }
        .quality-info {
          font-size: 12px;
          color: #95a5a6;
          margin-top: 5px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>
          🎥 Live Stream
          <span class="live-badge" id="liveBadge" style="display: none;">● LIVE</span>
        </h1>
      </div>

      <div class="container">
        <div class="player-wrapper" id="playerWrapper" style="display: none;">
          <video id="video" controls autoplay muted playsinline></video>
          <div class="controls">
            <button class="btn" onclick="toggleMute()">🔊 Toggle Mute</button>
            <button class="btn" onclick="toggleFullscreen()">⛶ Fullscreen</button>
            <div class="status" id="status">Loading stream...</div>
            <div class="quality-info">1080p30 H.264 (transcoded from source)</div>
          </div>
        </div>

        <div class="offline-message" id="offlineMessage">
          <h2>📡 Waiting for Stream</h2>
          <p>The stream will appear here automatically when it starts</p>
          <p style="margin-top: 20px; font-size: 14px; color: #7f8c8d;">
            Stream to: <code style="background: #3a3a3a; padding: 5px 10px; border-radius: 3px;">srt://localhost:${CONFIG.srtPort}</code>
          </p>
          <p style="margin-top: 10px; font-size: 12px; color: #7f8c8d;">
            Note: 4K AV1 sources will be transcoded to 1080p H.264 for playback
          </p>
          <a href="/" class="back-link">← Back to Dashboard</a>
        </div>
      </div>

      <script>
        const video = document.getElementById('video');
        const playerWrapper = document.getElementById('playerWrapper');
        const offlineMessage = document.getElementById('offlineMessage');
        const liveBadge = document.getElementById('liveBadge');
        const status = document.getElementById('status');
        let hls;
        let wasLive = false;

        function toggleMute() {
          video.muted = !video.muted;
          event.target.textContent = video.muted ? '🔇 Unmute' : '🔊 Mute';
        }

        function toggleFullscreen() {
          if (!document.fullscreenElement) {
            playerWrapper.requestFullscreen();
          } else {
            document.exitFullscreen();
          }
        }

        function destroyPlayer() {
          if (hls) {
            hls.destroy();
            hls = null;
          }
          video.src = '';
          video.load();
        }

        function checkStreamStatus() {
          fetch('/api/stats')
            .then(res => res.json())
            .then(data => {
              if (data.isLive) {
                liveBadge.style.display = 'inline-block';
                offlineMessage.style.display = 'none';
                playerWrapper.style.display = 'block';
                
                // If stream just started or was previously offline, reinitialize player
                if (!wasLive || !hls) {
                  destroyPlayer();
                  setTimeout(() => initPlayer(), 500);
                }
                wasLive = true;
              } else {
                liveBadge.style.display = 'none';
                offlineMessage.style.display = 'block';
                playerWrapper.style.display = 'none';
                
                // Stream went offline, destroy player and clear buffer
                if (wasLive) {
                  destroyPlayer();
                  status.textContent = '⏹️ Stream ended - buffer cleared';
                }
                wasLive = false;
              }
            })
            .catch(err => console.error('Stats fetch error:', err));
        }

        function initPlayer() {
          if (Hls.isSupported()) {
            hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
              backBufferLength: 90,
              maxBufferLength: 30,
              maxMaxBufferLength: 600,
              liveSyncDurationCount: 3,
              liveMaxLatencyDurationCount: 10
            });
            
            hls.loadSource('/hls/stream.m3u8');
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              status.textContent = '✅ Stream connected - H.264 playback';
              video.play().catch(e => {
                status.textContent = '⚠️ Click play to start (autoplay blocked)';
                console.log('Autoplay blocked:', e);
              });
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
              console.error('HLS Error:', data);
              if (data.fatal) {
                switch(data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    status.textContent = '❌ Network error - reconnecting...';
                    setTimeout(() => {
                      if (hls) {
                        hls.loadSource('/hls/stream.m3u8');
                      }
                    }, 2000);
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    status.textContent = '❌ Media error - recovering...';
                    hls.recoverMediaError();
                    break;
                  default:
                    status.textContent = '❌ Fatal error - refresh page';
                    destroyPlayer();
                    break;
                }
              }
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari native HLS support
            video.src = '/hls/stream.m3u8';
            video.addEventListener('loadedmetadata', () => {
              status.textContent = '✅ Stream connected (native HLS)';
              video.play();
            });
            video.addEventListener('error', (e) => {
              status.textContent = '❌ Playback error';
              console.error('Video error:', e);
            });
          } else {
            status.textContent = '❌ HLS not supported in this browser';
          }
        }

        checkStreamStatus();
        setInterval(checkStreamStatus, 3000);
      </script>
    </body>
    </html>
  `);
});

// Main dashboard
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SRT Streaming Server</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          padding: 20px;
        }
        .container {
          max-width: 900px;
          margin: 0 auto;
        }
        .card {
          background: white;
          border-radius: 20px;
          padding: 30px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          margin-bottom: 20px;
        }
        h1 {
          font-size: 32px;
          color: #333;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .subtitle {
          color: #666;
          margin-bottom: 25px;
          font-size: 14px;
        }
        .status-banner {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 20px;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          border-radius: 15px;
          margin-bottom: 25px;
        }
        .status-indicator {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #95a5a6;
          position: relative;
          flex-shrink: 0;
        }
        .status-indicator.live {
          background: #27ae60;
          box-shadow: 0 0 20px rgba(39, 174, 96, 0.6);
        }
        .status-indicator.live::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: #27ae60;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(2);
          }
        }
        .status-text h2 {
          font-size: 18px;
          color: #2c3e50;
          margin-bottom: 5px;
        }
        .status-text p {
          color: #7f8c8d;
          font-size: 14px;
        }
        .watch-btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 15px 30px;
          border-radius: 10px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
          margin-top: 15px;
          transition: transform 0.2s;
        }
        .watch-btn:hover {
          transform: translateY(-2px);
        }
        .watch-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 25px;
        }
        .stat-card {
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 15px;
          color: white;
        }
        .stat-label {
          font-size: 12px;
          opacity: 0.9;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 8px;
        }
        .stat-value {
          font-size: 32px;
          font-weight: bold;
        }
        .instructions {
          background: #fff3cd;
          padding: 20px;
          border-radius: 15px;
          border-left: 5px solid #ffc107;
          margin-bottom: 20px;
        }
        .instructions h3 {
          color: #856404;
          margin-bottom: 15px;
        }
        code {
          background: rgba(0,0,0,0.1);
          padding: 3px 8px;
          border-radius: 5px;
          font-family: 'Monaco', monospace;
          font-size: 13px;
        }
        .command-box {
          background: #2d3436;
          color: #00ff00;
          padding: 15px;
          border-radius: 10px;
          font-family: 'Monaco', monospace;
          font-size: 13px;
          overflow-x: auto;
          margin: 15px 0;
        }
        .info-box {
          background: #d1ecf1;
          border-left: 5px solid #17a2b8;
          padding: 15px;
          border-radius: 10px;
          margin-bottom: 15px;
          color: #0c5460;
        }
        .info-box h4 {
          margin-bottom: 8px;
        }
        .warning-box {
          background: #f8d7da;
          border-left: 5px solid #dc3545;
          padding: 15px;
          border-radius: 10px;
          margin-bottom: 15px;
          color: #721c24;
        }
        .warning-box h4 {
          margin-bottom: 8px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="card">
          <h1>🎥 SRT Streaming Server</h1>
          <div class="subtitle">Secure Reliable Transport with AV1/H.264 transcoding + Auto Buffer Cleanup</div>
          
          <div class="status-banner">
            <div class="status-indicator" id="statusIndicator"></div>
            <div class="status-text">
              <h2 id="statusTitle">Server Status</h2>
              <p id="statusMessage">Checking...</p>
              <a href="/watch" class="watch-btn" id="watchBtn">📺 Watch Live Stream</a>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Uptime</div>
              <div class="stat-value" id="uptime">0s</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Status</div>
              <div class="stat-value" id="streamStatus">Offline</div>
            </div>
          </div>

          <div class="info-box">
            <h4>📹 Video Processing</h4>
            <p><strong>Recording:</strong> Original quality preserved (AV1/H.264/etc)</p>
            <p><strong>Live Playback:</strong> Auto-transcoded to 1080p30 H.264 for compatibility</p>
          </div>

          <div class="warning-box">
            <h4>🧹 Auto Buffer Cleanup</h4>
            <p><strong>HLS buffer is automatically cleared when:</strong></p>
            <ul style="margin-left: 20px; margin-top: 8px;">
              <li>Stream stops or disconnects</li>
              <li>New stream starts (prevents showing stale content)</li>
              <li>Source is changed</li>
            </ul>
            <p style="margin-top: 8px;"><em>This ensures viewers always see fresh content from the current stream.</em></p>
          </div>

          <div class="instructions">
            <h3>🎬 How to Stream</h3>
            <p><strong>FFmpeg (AV1/4K example):</strong></p>
            <div class="command-box">ffmpeg -re -i news_android.mp4 -c copy -f mpegts srt://localhost:${CONFIG.srtPort}</div>
            
            <p><strong>OBS Studio:</strong></p>
            <ol style="margin-left: 20px; color: #856404;">
              <li>Settings → Stream → Custom</li>
              <li>Server: <code>srt://localhost:${CONFIG.srtPort}</code></li>
              <li>Stream Key: (leave blank)</li>
              <li>Start Streaming</li>
            </ol>
          </div>
        </div>
      </div>

      <script>
        function formatUptime(ms) {
          const seconds = Math.floor(ms / 1000);
          const minutes = Math.floor(seconds / 60);
          const hours = Math.floor(minutes / 60);
          
          if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm';
          if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's';
          return seconds + 's';
        }

        function updateStats() {
          fetch('/api/stats')
            .then(res => res.json())
            .then(data => {
              const indicator = document.getElementById('statusIndicator');
              const statusTitle = document.getElementById('statusTitle');
              const statusMessage = document.getElementById('statusMessage');
              const watchBtn = document.getElementById('watchBtn');
              const uptime = document.getElementById('uptime');
              const streamStatus = document.getElementById('streamStatus');

              if (data.isLive) {
                indicator.classList.add('live');
                statusTitle.textContent = '🔴 LIVE';
                statusMessage.textContent = 'Stream active - Transcoding to H.264';
                streamStatus.textContent = '🔴 Live';
                uptime.textContent = formatUptime(data.uptime);
                watchBtn.style.display = 'inline-block';
              } else {
                indicator.classList.remove('live');
                statusTitle.textContent = 'Waiting for Stream';
                statusMessage.textContent = 'Ready to accept SRT connections (Buffer cleared)';
                streamStatus.textContent = 'Offline';
                uptime.textContent = '0s';
                watchBtn.style.display = 'none';
              }
            });
        }

        updateStats();
        setInterval(updateStats, 1000);
      </script>
    </body>
    </html>
  `);
});

app.get("/api/stats", (req, res) => {
  res.json(srtServer.getStats());
});

app.listen(CONFIG.httpPort, () => {
  console.log(`\n🌐 Dashboard: http://localhost:${CONFIG.httpPort}`);
  console.log(`📺 Live Player: http://localhost:${CONFIG.httpPort}/watch`);
  console.log("━".repeat(60));
});

process.on("SIGINT", () => {
  console.log("\n\n🛑 Shutting down...");
  srtServer.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  srtServer.stop();
  process.exit(0);
});