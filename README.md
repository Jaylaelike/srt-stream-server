# SRT Stream Server

A lightweight SRT (Secure Reliable Transport) streaming server for ultra-low latency live video streaming.

## Overview

This SRT Stream Server provides a simple and efficient solution for streaming video content with sub-second latency over unreliable networks. Built on the SRT protocol, it ensures reliable, secure, and low-latency video transmission.

## Features

- **Ultra-low latency streaming** - Sub-second latency for live video
- **Network resilience** - Automatic packet loss recovery and jitter compensation
- **Secure transmission** - Built-in AES encryption support
- **MPEG-TS format support** - Compatible with standard transport streams
- **Simple deployment** - Easy setup and configuration

## Prerequisites

Before running the server, ensure you have the following installed:

- **FFmpeg** with SRT support (`--enable-libsrt`)
- **libsrt** library (v1.3.0 or higher)
- A Unix-based operating system (Linux, macOS, etc.)

### Installing FFmpeg with SRT Support

If you don't have FFmpeg compiled with SRT support:

```bash
# Install SRT library first
git clone https://github.com/Haivision/srt.git
cd srt
./configure
make
sudo make install

# Then compile FFmpeg with SRT
git clone https://github.com/FFmpeg/FFmpeg.git
cd FFmpeg
./configure --enable-libsrt
make
sudo make install
```

## Installation

```bash
# Clone the repository
git clone https://github.com/Jaylaelike/srt-stream-server.git
cd srt-stream-server

# Build the server (if applicable)
# Add build instructions specific to your implementation
```

## Usage

### Starting the SRT Server

### Streaming with FFmpeg

Once the server is running, you can push a video stream using FFmpeg:

```bash
# Stream a video file to the SRT server
ffmpeg -re -i example.mp4 -c copy -f mpegts srt://localhost:9000
```

**Command breakdown:**
- `-re` - Read input at native frame rate (real-time mode)
- `-i news_android.mp4` - Input video file
- `-c copy` - Copy streams without re-encoding (faster)
- `-f mpegts` - Force MPEG-TS format
- `srt://localhost:9000` - SRT output URL (server address and port)

### Streaming from Camera/Live Source

Stream from a camera or other live source:

```bash
# macOS (using AVFoundation)
ffmpeg -f avfoundation -framerate 30 -i "0:0" \
  -vcodec libx264 -preset ultrafast -tune zerolatency \
  -acodec aac -g 30 -f mpegts \
  srt://localhost:9000?streamid=live/stream1

# Linux (using V4L2)
ffmpeg -f v4l2 -framerate 30 -video_size 1280x720 -i /dev/video0 \
  -vcodec libx264 -preset ultrafast -tune zerolatency \
  -acodec aac -g 30 -f mpegts \
  srt://localhost:9000?streamid=live/stream1
```

### Playing the SRT Stream

To play the stream from the server:

```bash
# Using FFplay
ffplay -fflags nobuffer srt://localhost:9000?streamid=live/stream1

# Using VLC
vlc srt://localhost:9000?streamid=live/stream1
```


### SRT Parameters

You can specify SRT parameters in the URL:

```bash
srt://localhost:9000?streamid=live/stream1&latency=200&passphrase=mypassword
```

Common parameters:
- `latency` - Latency in milliseconds (default: 120ms)
- `passphrase` - Encryption passphrase (10-79 characters)
- `pbkeylen` - Encryption key length (0, 16, 24, 32)
- `maxbw` - Maximum bandwidth in bytes/second

## OBS Studio Integration

For OBS Studio (v25.0 or later):

1. Go to **Settings → Stream**
2. Select **Custom** service
3. Enter Server URL: `srt://your-server-ip:9000?streamid=live/mystream`
4. Leave Stream Key blank
5. Click **OK** and start streaming

## Testing

Test the server performance using the included test tools or external tools:

```bash
# Test with a TS file
ffmpeg -i test.mp4 -c copy -f mpegts srt://localhost:9000

# Monitor stream
ffprobe srt://localhost:9000
```

## Troubleshooting

### Connection Issues

- Ensure firewall allows UDP traffic on the configured port
- Verify SRT library is properly installed
- Check if the port is already in use

### High Latency

- Reduce the `latency` parameter (minimum recommended: 120ms)
- Check network conditions and bandwidth
- Use `-tune zerolatency` flag in FFmpeg for encoding

### Stream Stuttering or "Confetti"

- Increase the `latency` parameter (try 200-500ms)
- Check network stability
- Reduce encoding bitrate

### Packet Loss

The SRT protocol automatically handles packet loss, but you can adjust:
- Increase latency buffer
- Enable Forward Error Correction (FEC) if supported
- Check network path for issues

## Performance Tips

1. **Use hardware encoding when available** - Reduces CPU usage
2. **Adjust latency based on network conditions** - Balance between latency and reliability
3. **Use appropriate bitrate** - Match your network capacity
4. **Enable encryption only when needed** - Adds overhead

## API and Integration

The server can be integrated into applications via:

- **WebSocket API** - For control and monitoring
- **REST API** - For stream management
- **Command line interface** - For scripting

See the [API documentation](docs/API.md) for details.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Resources

- [SRT Protocol Official Site](https://www.srtalliance.org/)
- [SRT GitHub Repository](https://github.com/Haivision/srt)
- [FFmpeg SRT Documentation](https://ffmpeg.org/ffmpeg-protocols.html#srt)
- [OBS Studio SRT Guide](https://obsproject.com/)

## Support

For issues, questions, or contributions:

- **Issues**: [GitHub Issues](https://github.com/Jaylaelike/srt-stream-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Jaylaelike/srt-stream-server/discussions)

## Acknowledgments

- Built on the [Haivision SRT](https://github.com/Haivision/srt) protocol
- Inspired by various open-source SRT server implementations
- Thanks to all contributors and the SRT Alliance community

---

**Note:** Replace configuration examples and commands with specifics from your actual implementation.