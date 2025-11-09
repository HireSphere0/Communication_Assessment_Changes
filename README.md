# Communication Assessment Suite

A comprehensive web application that evaluates communication skills across multiple dimensions using AI and speech recognition technology.

## 🌟 Production-Ready Deployment Features

This application has been completely rewritten to be production-ready with the following enterprise-grade improvements:

### 🔒 **Scalable Architecture**
- **Database-Backed Sessions**: MongoDB session storage replaces in-memory sessions
- **Stateless Server Design**: All assessment state persisted in database, supporting horizontal scaling
- **Session Management**: Persistent sessions with automatic cleanup and TTL
- **User Authentication**: Secure JWT-based authentication with email verification

### 💾 **Data Persistence & Recovery**
- **Assessment Progress Persistence**: All progress saved to MongoDB with session recovery
- **Client-Side Backup**: localStorage for offline progress and browser refresh recovery
- **Auto-Save Mechanisms**: Progress saved every 30 seconds and on page visibility changes
- **Graceful Error Handling**: Comprehensive error recovery and user feedback

### 🚀 **Performance & Reliability**
- **Resource Cleanup**: Automatic cleanup of timers, recognizers, and memory leaks
- **Audio File Management**: GridFS-based file storage with automatic cleanup
- **Rate Limiting**: API protection against abuse and DOS attacks
- **Connection Pooling**: Optimized database connections

### 🛡️ **Security & Robustness**
- **Input Validation**: Comprehensive server-side validation
- **SQL Injection Prevention**: MongoDB with parameterized queries
- **Session Security**: HTTP-only cookies, CSRF protection
- **Password Security**: bcrypt hashing with salt rounds

### 📊 **Monitoring & Maintenance**
- **Comprehensive Logging**: Detailed server and client-side logging
- **Health Checks**: Database connection monitoring
- **Automatic Cleanup**: Expired sessions and temporary data removal
- **Error Tracking**: Detailed error reporting and recovery

## 🚀 Features

### Current Assessments (Phase 1)

1. **📖 Reading Ability Assessment**
   - AI-generated sentences using OpenAI/DeepSeek
   - Real-time pronunciation evaluation using Azure Speech Services
   - Detailed feedback on accuracy, fluency, and completeness
   - Word-level pronunciation analysis

2. **👂 Listening Ability Assessment**
   - AI-generated content with Azure Text-to-Speech
   - Audio playback with repeat functionality
   - User repetition recording and analysis
   - Comprehensive listening comprehension scoring

3. **🔤 Jumbled Sentences Assessment**
   - AI-generated scrambled sentences
   - Interactive sentence reconstruction
   - Real-time feedback and scoring
   - Progress tracking through multiple questions

### Coming Soon (Phase 2)

- **📚 Story Summarization** - Listen to stories and provide summaries
- **🤔 Personal Questions** - Communication assessment interviews
- **📝 Reading Comprehension** - Text-based comprehension questions
- **⚫ Fill in the Blanks** - Contextual vocabulary assessment

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript with localStorage persistence
- **Backend**: Node.js, Express.js with stateless architecture
- **Database**: MongoDB with GridFS for file storage
- **Session Management**: connect-mongo for database-backed sessions
- **Authentication**: bcryptjs, JWT, email verification
- **AI Integration**: OpenAI GPT-3.5, DeepSeek API (with fallback)
- **Speech Services**: Azure Cognitive Services (Speech-to-Text, Text-to-Speech)
- **Audio Processing**: Web Audio API, MediaRecorder API, FFmpeg
- **Security**: express-rate-limit, validator, CSRF protection
- **File Management**: GridFS, Multer, automatic cleanup

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm or yarn package manager
- MongoDB (local installation or cloud service like MongoDB Atlas)
- API Keys for:
  - OpenAI or DeepSeek
  - Azure Cognitive Services (Speech)
- SMTP Email Service (for user verification)

## ⚙️ Installation

1. **Clone or Navigate to Project Directory**
   ```bash
   cd "All together-part-2"
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   
   The application uses a `.env` file for configuration. Make sure your `.env` file contains:
   
   ```env
   # Database Configuration
   MONGODB_URI=mongodb://localhost:27017/communication-assessment
   
   # OpenAI API Key (primary)
   OPENAI_API_KEY=your_openai_api_key_here
   
   # DeepSeek API Key (fallback)
   DEEPSEEK_API_KEY=your_deepseek_api_key_here
   
   # Azure Speech Services
   AZURE_SPEECH_KEY=your_azure_speech_key
   AZURE_SPEECH_REGION=your_azure_region
   
   # Session Security
   SESSION_SECRET=your_secure_random_session_secret_here
   
   # Email Configuration (for user verification)
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password
   
   # Server Configuration
   PORT=3000
   NODE_ENV=production
   ```

4. **Install FFmpeg** (Required for audio processing)
   - **Windows**: Download from [FFmpeg website](https://ffmpeg.org/download.html) or use `winget install ffmpeg`
   - **macOS**: `brew install ffmpeg`
   - **Linux**: `sudo apt-get install ffmpeg` or equivalent

## 🚀 Running the Application

1. **Start the Server**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

2. **Access the Application**
   
   Open your browser and navigate to: `http://localhost:3000`

3. **Grant Microphone Permissions**
   
   When prompted by your browser, allow microphone access for speech recording functionality.

## 📖 Usage Guide

### Starting an Assessment

1. **Welcome Screen**: Review the assessment overview and available modules
2. **Click "Start Assessment"**: Begin the comprehensive evaluation
3. **Navigate**: Use the progress bar and navigation buttons to move between assessments

### Assessment Flow

**Reading Ability:**
1. Wait for AI-generated sentence
2. Click "Start Recording" and read the sentence aloud
3. Click "Stop Recording" when finished
4. Review pronunciation analysis and feedback

**Listening Ability:**
1. Wait for AI-generated audio content
2. Play the audio and listen carefully
3. Click "Start Recording" and repeat what you heard
4. Review listening comprehension results

**Jumbled Sentences:**
1. Read the scrambled words displayed
2. Type the correct sentence order in the input field
3. Submit your answer for immediate feedback
4. Complete all 5 questions

### Final Results

- View your overall communication score
- See detailed breakdown by assessment type
- Print or save your assessment report
- Restart for a new evaluation

## 🏗️ Project Structure

```
All together-part-2/
├── server.js                 # Main Express server
├── package.json             # Dependencies and scripts
├── README.md               # This file
├── .env                    # Environment variables (not in repo)
├── uploads/                # Temporary audio files
└── public/                # Frontend assets
    ├── index.html          # Main HTML page
    ├── styles.css          # Application styles
    ├── main.js             # Main application controller
    ├── reading-assessment.js   # Reading ability module
    ├── listening-assessment.js # Listening ability module
    └── jumbled-assessment.js   # Jumbled sentences module
```

## 🔧 API Endpoints

### Reading Assessment
- `POST /api/reading/generate-sentence` - Generate practice sentence
- `POST /api/reading/analyze` - Analyze pronunciation recording

### Listening Assessment
- `POST /api/listening/generate` - Generate TTS content
- `POST /api/listening/analyze` - Analyze repetition recording

### Jumbled Sentences
- `POST /api/jumbled/start` - Start jumbled sentence game
- `POST /api/jumbled/submit` - Submit sentence answer

### Assessment Management
- `GET /api/assessment/scores` - Get current scores
- `POST /api/assessment/reset` - Reset assessment state

## 🎯 Scoring System

- **Reading Ability**: 0-100 (Azure Speech pronunciation score)
- **Listening Ability**: 0-100 (Azure Speech comprehension score)
- **Jumbled Sentences**: 0-100 (20 points per correct answer × 5 questions)
- **Overall Score**: Average of completed assessments

### Score Interpretation
- **80-100**: Excellent - Clear, accurate communication
- **60-79**: Good - Solid skills with minor improvements needed
- **40-59**: Fair - Moderate ability, practice recommended
- **0-39**: Needs Improvement - Significant practice required

## 🔍 Troubleshooting

### Common Issues

1. **Microphone Not Working**
   - Ensure browser has microphone permissions
   - Check system microphone settings
   - Try refreshing the page

2. **Audio Playback Issues**
   - Verify internet connection for TTS
   - Check browser audio settings
   - Try a different browser

3. **API Errors**
   - Verify API keys in `.env` file
   - Check API rate limits
   - Monitor server console for error messages

4. **Assessment Not Loading**
   - Check browser console for JavaScript errors
   - Verify all JavaScript files are loaded
   - Clear browser cache and reload

### Browser Compatibility

- **Recommended**: Chrome 80+, Firefox 75+, Safari 13+, Edge 80+
- **Required Features**: MediaRecorder API, Web Audio API, ES6 support

## 📝 Development Notes

### Adding New Assessments

1. Create HTML structure in `index.html`
2. Add corresponding CSS styles in `styles.css`
3. Create JavaScript module file in `public/`
4. Add server endpoints in `server.js`
5. Update main controller navigation

### API Integration

- Primary LLM: OpenAI GPT-3.5 Turbo
- Fallback LLM: DeepSeek Chat
- Speech Services: Azure Cognitive Services
- Audio Format: WebM/Opus → WAV conversion via FFmpeg

## 📊 Future Enhancements

- **Advanced Analytics**: Detailed progress tracking over time
- **Custom Assessments**: Tailored evaluations for specific needs
- **Multi-language Support**: Assessments in multiple languages
- **Voice Biometrics**: Speaker identification and vocal analysis
- **Integration APIs**: Export results to external systems

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For technical support or questions:
- Check the troubleshooting section above
- Review browser console for error messages
- Ensure all prerequisites are properly installed

---

**Communication Assessment Suite v1.0** - Built with ❤️ for comprehensive communication evaluation 