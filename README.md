# 🎵 Music Boost AI Agent

A professional web application for uploading audio stems, mixing and mastering with advanced audio effects, and exporting the final mix. Features authentication with Google OAuth and secure payment processing via Stripe.

## Features

### Core Audio Features
- 🎧 Upload multiple audio stems via drag-and-drop or file picker
- 🎚️ Per-stem gain (±12dB) and pan (±1.0) controls
- 🔇 Mute and solo buttons per stem with visual feedback
- 🎛️ Advanced per-stem effects:
  - **Tube Drive** (0-100%): Waveshaper-based harmonic distortion
  - **Reverb** (0-100%): Delay-based reverb with adjustable feedback
  - **Quick Presets** or **manual sliders** for fast flavor changes and detailed sculpting
  - **Parametric EQ** with 5 bands:
    - HPF (20-500Hz): Removes low-frequency rumble
    - Low Mid (±12dB @ 250Hz): Adds warmth and body
    - Mid (±12dB @ 1kHz): Controls presence and clarity
    - Presence (±12dB @ 4kHz): Adds sparkle and air
    - LPF (2-20kHz): Removes harsh high frequencies
- 🎙️ Key Detection: Analyzes audio to detect the musical key
- ⏱️ Tempo Detection: Estimates the BPM of the uploaded stems
- 📊 Master Compression: Control threshold, ratio, and gain
- 📈 Output level meter with real-time visualization
- 💾 Export the mixed/mastered result as a WAV file with all effects applied

### Authentication & Payment
- 🔐 Google OAuth authentication (Sign in with Google)
- 🎭 Demo account for testing
- 💳 Stripe payment integration for exporting mixes
- 🔒 JWT token-based session persistence

## Setup Instructions

### Prerequisites
- Node.js v14+ installed
- A modern web browser (Chrome, Firefox, Safari, Edge)
- Google OAuth credentials (optional, for production)
- Stripe API keys (optional, for production)

### Step 1: Install Backend Dependencies

```bash
cd server
npm install
```

### Step 2: Configure Environment Variables

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `server/.env` and add your credentials:

**For Google OAuth (optional):**
- Go to https://console.cloud.google.com/
- Create a new project
- Enable Google+ API
- Create OAuth 2.0 credentials (Web application)
- Add `http://localhost:5000/auth/google/callback` to authorized redirect URIs
- Copy your Client ID and Client Secret to `.env`

**For Stripe (optional):**
- Go to https://dashboard.stripe.com/
- Use test keys during development
- Copy your Secret and Publishable keys to `.env`
- Update the Stripe publishable key in `app.js` (line ~8)

**Generate secrets:**
```bash
# On Linux/Mac:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# On Windows PowerShell:
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Example `.env`:
```
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
STRIPE_SECRET_KEY=sk_test_your_key_here
JWT_SECRET=your_random_jwt_secret_here
SESSION_SECRET=your_random_session_secret_here
PORT=5000
NODE_ENV=development
```

### Step 3: Start the Backend Server

```bash
cd server
npm start
# Server will run on http://localhost:5000
```

In development mode (with auto-reload):
```bash
npm run dev
```

### Step 4: Open the Frontend

1. Navigate to the `index.html` file in your browser or serve it via a local HTTP server:

```bash
# Using Python 3
python -m http.server 3000

# Using Node.js http-server
npx http-server -p 3000
```

2. Open `http://localhost:3000` in your browser
3. The app is now ready to use!

## Usage Guide

### Uploading Stems
1. Drag and drop audio files into the "Drop stems here" area, or click to browse
2. Supported formats: MP3, WAV, OGG, FLAC, etc. (any format your browser supports)
3. Each stem will appear as a track card with individual controls

### Controlling Stems
- **Gain**: Adjust volume for each stem (-12dB to +12dB)
- **Pan**: Position the stem in the stereo field (-1.0 to +1.0)
- **Mute**: Silence a stem without removing it from the mix
- **Solo**: Listen to only the selected stem

### Applying Effects
Open the "Effects" panel on any track to choose between:
- **Quick Presets** for instant styles like Clean, Warm, Bright, Vintage, and Dense
- **Manual Sliders** for precise control over tube drive, reverb, denoiser, and EQ

### Key & Tempo Detection
- **Key**: Automatically detected when stems are loaded (shown in header)
- **Tempo**: Automatically detected when stems are loaded (shown in header)
- Used as reference information for mixing decisions

### Mastering Controls
In the "Mastering" panel, adjust:
- **Master Gain**: Overall loudness (-24dB to +12dB)
- **Compression Threshold**: Level at which compression starts (-60dB to 0dB)
- **Compression Ratio**: Amount of compression applied (1:1 to 10:1)

### Exporting the Mix
1. Click the "Export Mix" button
2. Log in (use "Demo Account" for testing without Google account)
3. Complete the payment ($2.99 for export)
4. Use test card: `4242 4242 4242 4242`, any future expiry, any CVC
5. The WAV file will download with all applied effects

## Testing Without Payment

1. Use the **Demo Account** login option (no payment required)
2. Upload stems and adjust settings
3. Click Export Mix
4. The WAV file will be exported without the payment modal

## File Structure

```
Music_Wep_App/
├── index.html          # Main HTML structure
├── app.js              # Web Audio logic, effects, authentication
├── styles.css          # Modern glassmorphic styling
├── README.md           # This file
└── server/
    ├── server.js       # Express backend, OAuth, Stripe integration
    ├── package.json    # Backend dependencies
    └── .env.example    # Environment variable template
```

## Keyboard Shortcuts

- **Space**: Play/Stop
- **Ctrl+E** (Cmd+E on Mac): Export Mix

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Audio Processing Details

### Effects Chain (Per-Stem)
Each stem flows through: Gain → Pan → HPF → EQ Bands → LPF → Tube → Reverb → Master Compressor

### File Format
- **Output Format**: WAV (PCM, 16-bit, 44.1kHz or original sample rate)
- **Channels**: Stereo (2 channels)
- **All effects are baked into the export** — changes are permanent in the exported file

## Troubleshooting

### "Please login first" message
- Click the "Login" button and choose your authentication method
- Use "Demo Account" for testing without Google OAuth setup

### No sound during playback
- Check browser audio permissions
- Ensure stems are loaded and uploaded correctly
- Try refreshing the page if audio context was suspended

### Payment failing
- Ensure backend server is running on `http://localhost:5000`
- Check browser console for error messages
- For test payments, use card `4242 4242 4242 4242`
- Verify Stripe API keys are correct in `.env`

### Tempo/Key detection showing "—"
- Some audio formats may not support detection
- Detection runs on the first 30 seconds of audio
- Detection requires sufficient audio content for analysis

### Backend server won't start
- Verify Node.js is installed: `node --version`
- Install dependencies: `cd server && npm install`
- Check if port 5000 is already in use
- Ensure `.env` file exists in the server directory

## Security Notes

- **Never commit `.env` file** to version control — it contains sensitive credentials
- Test payment cards should only be used during development
- Use environment variables for all sensitive data
- In production, enable HTTPS and configure proper CORS origins
- Store JWT secrets securely and rotate regularly

## API Endpoints (Backend)

### Authentication
- `GET /auth/google` - Initiate Google OAuth login
- `GET /auth/google/callback` - OAuth callback (redirects to frontend with token)
- `GET /logout` - Logout current user
- `GET /user` - Get current user info (requires authentication)

### Payments
- `POST /create-payment-intent` - Create Stripe PaymentIntent
  - Body: `{ amount, email, userId }`
  - Returns: `{ clientSecret }`
- `POST /process-export` - Verify payment and authorize export
  - Body: `{ paymentIntentId, userId, filename }`
  - Returns: `{ success, message }`

## Future Enhancements

- [ ] Additional OAuth providers (Yahoo, GitHub, etc.)
- [ ] MongoDB database for user accounts and mix history
- [ ] Collaborative mixing with real-time sync
- [ ] A/B comparison between different master versions
- [ ] Batch processing multiple mixes
- [ ] VST/AU plugin integration
- [ ] Mobile app version

## Notes

- This app uses the browser **Web Audio API** — no external plugins required
- For best results, use stems with the same sample rate and length
- High-sample-rate files may impact performance; 44.1kHz or 48kHz recommended
- Effect parameters are per-stem and adjustable in real-time during playback

## License

This project is provided as-is for educational and commercial use.

## Support

For issues or feature requests, please review the console logs and troubleshooting section above.

#   M u s i c _ W e p _ A p p  
 #   M u s i c _ W e p _ A p p  
 