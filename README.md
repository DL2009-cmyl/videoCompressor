# VideoComp Discord Plugin

A simple plugin that adds a button to compress and upload videos under 10MB directly in Discord.

## Features

- One-click video compression and upload
- Automatic resizing to 1080p resolution
- Fixed 500kbps bitrate for optimal compression
- Visual upload progress indicators
- Error handling with user feedback

## Installation

1. Install a Discord client mod that supports plugins (BetterDiscord/Vencord/Replugged)
2. Add this plugin to your plugins folder
3. Restart Discord

## Usage

1. Click the 🎥 button in the message input area
2. Select a video file (any size)
3. The plugin will automatically:
   - Compress videos over 10MB
   - Resize to 1080p while maintaining aspect ratio
   - Upload the compressed video

## Technical Details

- Compression uses browser's built-in MediaRecorder API
- Default settings:
  - Resolution: 1080p (height)
  - Bitrate: 500kbps
  - Target format: WebM (falls back to MP4 if unavailable)
- Uploads use Discord's native API

## Troubleshooting

- If uploads fail, check your connection and try smaller videos
- For compression issues, try different video formats
- The plugin logs to console (accessible via Ctrl+Shift+I)

## Disclaimer

This plugin is not affiliated with Discord. Use at your own risk.
