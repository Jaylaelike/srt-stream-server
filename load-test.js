const io = require('socket.io-client');
const { performance } = require('perf_hooks');

// Configuration
const CONFIG = {
    SERVER_URL: 'http://localhost:3000',
    NUM_CLIENTS: 100,
    RAMP_UP_TIME: 5000,        // 5 seconds to connect all clients
    TEST_DURATION: 60000,       // 60 seconds test duration
    STATS_INTERVAL: 2000,       // Update stats every 2 seconds
    RECONNECT_ATTEMPTS: 3
};

// Global statistics
const stats = {
    clients: [],
    totalFramesReceived: 0,
    totalAudioChunks: 0,
    totalVideoBytes: 0,
    totalAudioBytes: 0,
    connectedClients: 0,
    failedConnections: 0,
    disconnections: 0,
    startTime: null,
    errors: []
};

// Client class
class TestClient {
    constructor(id) {
        this.id = id;
        this.socket = null;
        this.stats = {
            framesReceived: 0,
            audioChunksReceived: 0,
            videoBytes: 0,
            audioBytes: 0,
            lastFrameTime: 0,
            latencies: [],
            connected: false,
            errors: 0,
            fps: 0,
            lastFpsCheck: Date.now(),
            fpsCounter: 0
        };
        this.fpsInterval = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            const connectionTimeout = setTimeout(() => {
                reject(new Error(`Client ${this.id}: Connection timeout`));
            }, 10000);

            this.socket = io(CONFIG.SERVER_URL, {
                reconnection: true,
                reconnectionAttempts: CONFIG.RECONNECT_ATTEMPTS,
                reconnectionDelay: 1000,
                timeout: 10000,
                transports: ['websocket', 'polling']
            });

            this.socket.on('connect', () => {
                clearTimeout(connectionTimeout);
                this.stats.connected = true;
                stats.connectedClients++;
                
                // Start FPS calculation
                this.startFpsCounter();
                
                console.log(`✓ Client ${this.id}: Connected (Socket ID: ${this.socket.id})`);
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                clearTimeout(connectionTimeout);
                this.stats.errors++;
                console.error(`✗ Client ${this.id}: Connection error -`, error.message);
                reject(error);
            });

            this.socket.on('disconnect', (reason) => {
                this.stats.connected = false;
                stats.connectedClients--;
                stats.disconnections++;
                console.warn(`⚠ Client ${this.id}: Disconnected - ${reason}`);
            });

            this.socket.on('video-frame', (data) => {
                const now = Date.now();
                
                this.stats.framesReceived++;
                this.stats.fpsCounter++;
                this.stats.videoBytes += data.byteLength;
                stats.totalFramesReceived++;
                stats.totalVideoBytes += data.byteLength;

                // Calculate latency
                if (this.stats.lastFrameTime > 0) {
                    const latency = now - this.stats.lastFrameTime;
                    this.stats.latencies.push(latency);
                    
                    // Keep only last 100 latency samples
                    if (this.stats.latencies.length > 100) {
                        this.stats.latencies.shift();
                    }
                }
                
                this.stats.lastFrameTime = now;
            });

            this.socket.on('audio-data', (data) => {
                this.stats.audioChunksReceived++;
                this.stats.audioBytes += data.byteLength;
                stats.totalAudioChunks++;
                stats.totalAudioBytes += data.byteLength;
            });

            this.socket.on('error', (error) => {
                this.stats.errors++;
                stats.errors.push({
                    clientId: this.id,
                    error: error.message,
                    time: new Date().toISOString()
                });
            });
        });
    }

    startFpsCounter() {
        this.fpsInterval = setInterval(() => {
            this.stats.fps = this.stats.fpsCounter;
            this.stats.fpsCounter = 0;
        }, 1000);
    }

    disconnect() {
        if (this.fpsInterval) {
            clearInterval(this.fpsInterval);
        }
        
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.stats.connected = false;
    }

    getAverageLatency() {
        if (this.stats.latencies.length === 0) return 0;
        const sum = this.stats.latencies.reduce((a, b) => a + b, 0);
        return Math.round(sum / this.stats.latencies.length);
    }
}

// Initialize all clients
async function initializeClients() {
    console.log('\n========================================');
    console.log('🚀 LOAD TEST - INITIALIZING');
    console.log('========================================');
    console.log(`Target Clients: ${CONFIG.NUM_CLIENTS}`);
    console.log(`Ramp-up Time: ${CONFIG.RAMP_UP_TIME / 1000}s`);
    console.log(`Test Duration: ${CONFIG.TEST_DURATION / 1000}s`);
    console.log('========================================\n');

    stats.startTime = Date.now();

    // Calculate delay between each client connection
    const delayBetweenClients = CONFIG.RAMP_UP_TIME / CONFIG.NUM_CLIENTS;

    for (let i = 0; i < CONFIG.NUM_CLIENTS; i++) {
        const client = new TestClient(i + 1);
        stats.clients.push(client);

        // Connect with delay
        setTimeout(async () => {
            try {
                await client.connect();
            } catch (error) {
                stats.failedConnections++;
                console.error(`✗ Failed to connect client ${i + 1}:`, error.message);
            }
        }, i * delayBetweenClients);
    }

    // Wait for ramp-up to complete
    await new Promise(resolve => setTimeout(resolve, CONFIG.RAMP_UP_TIME + 2000));
    
    console.log('\n✓ Ramp-up completed\n');
}

// Display statistics
function displayStats() {
    const now = Date.now();
    const elapsed = ((now - stats.startTime) / 1000).toFixed(1);

    // Calculate aggregate statistics
    const connectedClients = stats.clients.filter(c => c.stats.connected);
    const avgFps = connectedClients.length > 0
        ? (connectedClients.reduce((sum, c) => sum + c.stats.fps, 0) / connectedClients.length).toFixed(1)
        : 0;

    const avgLatency = connectedClients.length > 0
        ? Math.round(connectedClients.reduce((sum, c) => sum + c.getAverageLatency(), 0) / connectedClients.length)
        : 0;

    const totalVideoMB = (stats.totalVideoBytes / (1024 * 1024)).toFixed(2);
    const totalAudioMB = (stats.totalAudioBytes / (1024 * 1024)).toFixed(2);
    
    const videoRateMbps = elapsed > 0 
        ? ((stats.totalVideoBytes * 8) / (elapsed * 1000000)).toFixed(2)
        : 0;
    
    const audioRateMbps = elapsed > 0
        ? ((stats.totalAudioBytes * 8) / (elapsed * 1000000)).toFixed(2)
        : 0;

    // Memory usage
    const memUsage = process.memoryUsage();
    const memUsedMB = (memUsage.heapUsed / (1024 * 1024)).toFixed(1);
    const memTotalMB = (memUsage.heapTotal / (1024 * 1024)).toFixed(1);

    // Clear console and display
    console.clear();
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           LOAD TEST - REAL-TIME STATISTICS                     ║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log(`║ Elapsed Time: ${elapsed}s`.padEnd(65) + '║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║ CLIENT STATISTICS                                              ║');
    console.log('╟────────────────────────────────────────────────────────────────╢');
    console.log(`║ Total Clients:        ${CONFIG.NUM_CLIENTS}`.padEnd(65) + '║');
    console.log(`║ Connected:            ${stats.connectedClients} (${((stats.connectedClients/CONFIG.NUM_CLIENTS)*100).toFixed(1)}%)`.padEnd(65) + '║');
    console.log(`║ Failed Connections:   ${stats.failedConnections}`.padEnd(65) + '║');
    console.log(`║ Disconnections:       ${stats.disconnections}`.padEnd(65) + '║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║ VIDEO STATISTICS                                               ║');
    console.log('╟────────────────────────────────────────────────────────────────╢');
    console.log(`║ Total Frames:         ${stats.totalFramesReceived.toLocaleString()}`.padEnd(65) + '║');
    console.log(`║ Average FPS:          ${avgFps}`.padEnd(65) + '║');
    console.log(`║ Average Latency:      ${avgLatency}ms`.padEnd(65) + '║');
    console.log(`║ Total Video Data:     ${totalVideoMB} MB`.padEnd(65) + '║');
    console.log(`║ Video Bitrate:        ${videoRateMbps} Mbps`.padEnd(65) + '║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║ AUDIO STATISTICS                                               ║');
    console.log('╟────────────────────────────────────────────────────────────────╢');
    console.log(`║ Total Audio Chunks:   ${stats.totalAudioChunks.toLocaleString()}`.padEnd(65) + '║');
    console.log(`║ Total Audio Data:     ${totalAudioMB} MB`.padEnd(65) + '║');
    console.log(`║ Audio Bitrate:        ${audioRateMbps} Mbps`.padEnd(65) + '║');
    console.log('╠════════════════════════════════════════════════════════════════╣');
    console.log('║ SYSTEM RESOURCES                                               ║');
    console.log('╟────────────────────────────────────────────────────────────────╢');
    console.log(`║ Memory Used:          ${memUsedMB} MB / ${memTotalMB} MB`.padEnd(65) + '║');
    console.log(`║ Total Errors:         ${stats.errors.length}`.padEnd(65) + '║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    // Show sample of clients (first 5)
    if (connectedClients.length > 0) {
        console.log('\n┌─────────────────────────────────────────────────────────────┐');
        console.log('│ SAMPLE CLIENT DETAILS (First 5)                             │');
        console.log('├─────┬────────┬─────────┬─────────┬──────────┬──────────────┤');
        console.log('│  ID │    FPS │  Frames │  Latency│ VideoKB  │ AudioKB      │');
        console.log('├─────┼────────┼─────────┼─────────┼──────────┼──────────────┤');
        
        connectedClients.slice(0, 5).forEach(client => {
            const videoKB = (client.stats.videoBytes / 1024).toFixed(0);
            const audioKB = (client.stats.audioBytes / 1024).toFixed(0);
            console.log(
                `│ ${String(client.id).padStart(3)} │ ` +
                `${String(client.stats.fps).padStart(6)} │ ` +
                `${String(client.stats.framesReceived).padStart(7)} │ ` +
                `${String(client.getAverageLatency()).padStart(7)}ms│ ` +
                `${String(videoKB).padStart(8)} │ ` +
                `${String(audioKB).padStart(12)} │`
            );
        });
        
        console.log('└─────┴────────┴─────────┴─────────┴──────────┴──────────────┘');
    }

    // Show recent errors
    if (stats.errors.length > 0) {
        console.log('\n⚠ RECENT ERRORS (Last 5):');
        stats.errors.slice(-5).forEach(err => {
            console.log(`  Client ${err.clientId}: ${err.error} (${err.time})`);
        });
    }
}

// Generate final report
function generateFinalReport() {
    const duration = (Date.now() - stats.startTime) / 1000;
    
    console.log('\n\n');
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    FINAL TEST REPORT                           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log(`\nTest Duration: ${duration.toFixed(1)}s\n`);
    
    console.log('CONNECTION SUMMARY:');
    console.log(`  • Total Clients: ${CONFIG.NUM_CLIENTS}`);
    console.log(`  • Successful: ${CONFIG.NUM_CLIENTS - stats.failedConnections}`);
    console.log(`  • Failed: ${stats.failedConnections}`);
    console.log(`  • Disconnections: ${stats.disconnections}`);
    console.log(`  • Success Rate: ${(((CONFIG.NUM_CLIENTS - stats.failedConnections) / CONFIG.NUM_CLIENTS) * 100).toFixed(2)}%`);
    
    console.log('\nDATA TRANSFER:');
    console.log(`  • Total Video Frames: ${stats.totalFramesReceived.toLocaleString()}`);
    console.log(`  • Total Audio Chunks: ${stats.totalAudioChunks.toLocaleString()}`);
    console.log(`  • Total Video Data: ${(stats.totalVideoBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  • Total Audio Data: ${(stats.totalAudioBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  • Average Video Bitrate: ${((stats.totalVideoBytes * 8) / (duration * 1000000)).toFixed(2)} Mbps`);
    console.log(`  • Average Audio Bitrate: ${((stats.totalAudioBytes * 8) / (duration * 1000000)).toFixed(2)} Mbps`);
    
    const connectedClients = stats.clients.filter(c => c.stats.framesReceived > 0);
    if (connectedClients.length > 0) {
        const avgFps = connectedClients.reduce((sum, c) => 
            sum + (c.stats.framesReceived / duration), 0) / connectedClients.length;
        
        const allLatencies = connectedClients.flatMap(c => c.stats.latencies);
        const avgLatency = allLatencies.length > 0
            ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
            : 0;
        
        const minLatency = allLatencies.length > 0 ? Math.min(...allLatencies) : 0;
        const maxLatency = allLatencies.length > 0 ? Math.max(...allLatencies) : 0;
        
        console.log('\nPERFORMANCE:');
        console.log(`  • Average FPS per client: ${avgFps.toFixed(2)}`);
        console.log(`  • Average Latency: ${avgLatency.toFixed(2)}ms`);
        console.log(`  • Min Latency: ${minLatency}ms`);
        console.log(`  • Max Latency: ${maxLatency}ms`);
    }
    
    console.log('\nERRORS:');
    console.log(`  • Total Errors: ${stats.errors.length}`);
    
    const memUsage = process.memoryUsage();
    console.log('\nMEMORY USAGE:');
    console.log(`  • Heap Used: ${(memUsage.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  • Heap Total: ${(memUsage.heapTotal / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  • External: ${(memUsage.external / (1024 * 1024)).toFixed(2)} MB`);
    
    console.log('\n════════════════════════════════════════════════════════════════\n');
}

// Cleanup function
function cleanup() {
    console.log('\n🛑 Stopping test and cleaning up...\n');
    
    stats.clients.forEach((client, index) => {
        client.disconnect();
        if ((index + 1) % 20 === 0) {
            console.log(`  Disconnected ${index + 1}/${stats.clients.length} clients`);
        }
    });
    
    console.log(`  Disconnected ${stats.clients.length}/${stats.clients.length} clients\n`);
    
    generateFinalReport();
    
    process.exit(0);
}

// Main execution
async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║        STREAMING SERVER LOAD TEST                              ║');
    console.log('║        100 Concurrent Clients Simulation                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    
    // Initialize clients
    await initializeClients();
    
    // Start statistics display
    const statsInterval = setInterval(displayStats, CONFIG.STATS_INTERVAL);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        clearInterval(statsInterval);
        cleanup();
    });
    
    // Auto-stop after test duration
    setTimeout(() => {
        clearInterval(statsInterval);
        cleanup();
    }, CONFIG.TEST_DURATION);
    
    console.log('✓ Test running... Press Ctrl+C to stop early\n');
}

// Start the load test
main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});