import subprocess
import os

# Install ffmpeg if not already installed (common in Colab environments)
# This command is idempotent, so running it multiple times is fine.
print("Checking for ffmpeg installation...")
install_ffmpeg_command = "!apt-get update -qq && apt-get install -y ffmpeg"
try:
    # Use subprocess.run for better error handling and output capture
    # For commands starting with '!' in Colab, it's generally executed by the shell directly.
    # However, for robustness, we can try to run it via subprocess if '!' is not implicitly handled.
    print("Installing ffmpeg...")
    # In Colab, '!' executes shell commands directly.
    # If running outside Colab or needing more control, use subprocess.
    os.system('apt-get update -qq && apt-get install -y ffmpeg > /dev/null')
    print("ffmpeg installed successfully or already present.")
except Exception as e:
    print(f"Error installing ffmpeg: {e}")
    print("Attempting to proceed, assuming ffmpeg might be available.")


# Define input and output file names
input_mp4_file = '4k.mp4'  # Replace with your MP4 file name
output_mp4_file = '4k_output.mp4' # Desired output MP4 file name

# Create a dummy input file for demonstration if it doesn't exist
# In a real scenario, you would upload your '4k.mp4' file to Colab.
if not os.path.exists(input_mp4_file):
    print(f"Creating a dummy '{input_mp4_file}' for demonstration purposes.")
    # This creates a short silent video file using ffmpeg itself
    os.system(f'ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 5 -f lavfi -i color=c=blue:s=1280x720 -t 5 -c:v libx264 -c:a aac {input_mp4_file} > /dev/null 2>&1')
    if os.path.exists(input_mp4_file):
        print(f"Dummy '{input_mp4_file}' created.")
    else:
        print(f"Could not create dummy '{input_mp4_file}'. Please ensure ffmpeg is installed and working.")


# FFmpeg command to convert/re-encode MP4 to MP4
# -i: specifies the input file
# -c:v libx264: video codec (H.264)
# -preset medium: encoding speed/quality tradeoff (ultrafast, fast, medium, slow, veryslow)
# -crf 23: quality setting (lower = better quality, 18-28 typical range, 23 is default)
# -c:a aac: audio codec
# -b:a 192k: audio bitrate
ffmpeg_command = [
    'ffmpeg',
    '-i',
    input_mp4_file,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    output_mp4_file
]

print(f"Converting '{input_mp4_file}' to '{output_mp4_file}'...")
try:
    # Execute the FFmpeg command
    process = subprocess.run(ffmpeg_command, capture_output=True, text=True, check=True)
    print(f"Conversion successful! '{output_mp4_file}' created.")
    # print("STDOUT:", process.stdout)
    # print("STDERR:", process.stderr)
except subprocess.CalledProcessError as e:
    print(f"Error during conversion: {e}")
    print("FFmpeg STDOUT:", e.stdout)
    print("FFmpeg STDERR:", e.stderr)
except FileNotFoundError:
    print("Error: ffmpeg command not found. Please ensure ffmpeg is installed correctly.")
except Exception as e:
    print(f"An unexpected error occurred: {e}")

# Verify the output file
if os.path.exists(output_mp4_file):
    print(f"Output file '{output_mp4_file}' exists and has size: {os.path.getsize(output_mp4_file)} bytes")
else:
    print(f"Output file '{output_mp4_file}' was not created.")