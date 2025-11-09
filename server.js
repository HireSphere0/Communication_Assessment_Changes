const express = require('express');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const OpenAI = require('openai');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const crypto = require('crypto');
const winston = require('winston');
require('dotenv').config();

// Configure Winston Logger
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'communication-assessment' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// In production, also log to files
if (process.env.NODE_ENV === 'production') {
    logger.add(new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error' 
    }));
    logger.add(new winston.transports.File({ 
        filename: 'logs/combined.log' 
    }));
}

const app = express();

app.set('trust proxy', 1);

// GridFS setup for audio file storage
const Grid = require('gridfs-stream');
let gfs, gridfsBucket;

// Initialize GridFS after MongoDB connection
const initializeGridFS = () => {
    gridfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: 'audioFiles'
    });
    gfs = Grid(mongoose.connection.db, mongoose.mongo);
    gfs.collection('audioFiles');
    logger.info('GridFS initialized for audio storage');
};

// =================
// MONGODB CONNECTION & USER MODEL
// =================

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/communication-assessment';

// MongoDB connection options for Cloud Run compatibility
const mongoOptions = {
    // TLS/SSL options for Atlas compatibility
    tls: true,
    tlsInsecure: false,

    // Connection pool options
    maxPoolSize: 20,
    minPoolSize: 2,
    maxIdleTimeMS: 60000,

    // Timeout options
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,

    // Retry options
    retryWrites: true,
    retryReads: true,

    // Buffering options

};

mongoose.connect(MONGODB_URI, mongoOptions).then(() => {
    logger.info('Connected to MongoDB Atlas');
    logger.info('Connection state:', mongoose.connection.readyState);
    // Initialize GridFS after successful connection
    initializeGridFS();
    
    // Start cleanup jobs after GridFS is initialized
    setTimeout(() => {
        startCleanupJobs();
    }, 5000); // Wait 5 seconds for GridFS to be fully ready
}).catch(err => {
    logger.error('MongoDB connection error:', err);
    logger.error('Connection URI format check:', MONGODB_URI.substring(0, 20) + '...');
    process.exit(1); // Exit if can't connect to database
});

// User Schema
const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        validate: [validator.isEmail, 'Invalid email address']
    },
    username: {
        type: String,
        required: true,
        unique: true,
        minlength: 3,
        maxlength: 30,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 8
    },
    number_of_tests: {
        type: Number,
        default: 0,
        min: 0
    },
    testsTaken: {
        type: Number,
        default: 0,
        min: 0
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: {
        type: String,
        default: null
    },
    emailVerificationExpires: {
        type: Date,
        default: null
    },
    passwordResetToken: {
        type: String,
        default: null
    },
    passwordResetExpires: {
        type: Date,
        default: null
    },
    assessmentScores: {
        readingAbility: { type: Number, default: 0 },
        listeningAbility: { type: Number, default: 0 },
        jumbledSentences: { type: Number, default: 0 },
        storySummarization: { type: Number, default: 0 },
        personalQuestions: { type: Number, default: 0 },
        readingComprehension: { type: Number, default: 0 },
        fillInTheBlanks: { type: Number, default: 0 },
        overallScore: { type: Number, default: 0 }
    },
    tests_timestamps: [{
        timestamp: { type: Date, required: true },
        testNumber: { type: Number, required: true }
    }],
    payments_timestamps: [{
        timestamp: { type: Date, required: true },
        amount: { type: Number, required: true },
        testsCount: { type: Number, required: true },
        paymentId: { type: String, required: true }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLoginAt: {
        type: Date,
        default: null
    },
    lastAssessmentCompletedAt: {
        type: Date,
        default: null
    }
});

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function () {
    const token = crypto.randomBytes(32).toString('hex');
    this.emailVerificationToken = token;
    this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    return token;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function () {
    const token = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken = token;
    this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    return token;
};

const User = mongoose.model('User', userSchema);

// Admin Schema
const adminSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
adminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
adminSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

const Admin = mongoose.model('Admin', adminSchema);

// Audio File Schema for tracking temporary files
const audioFileSchema = new mongoose.Schema({
    fileId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assessmentType: {
        type: String,
        enum: ['listening', 'story'],
        required: true
    },
    filename: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 3600 * 1000), // 1 hour from now
        expires: 0 // MongoDB will delete the document when expiresAt is reached
    }
});

// Pre-remove middleware to cleanup GridFS files when tracking record is deleted
audioFileSchema.pre('deleteOne', { document: false, query: true }, async function() {
    try {
        const doc = await this.model.findOne(this.getQuery());
        if (doc && doc.fileId) {
            logger.info(`Cleaning up GridFS file ${doc.fileId} for tracking record deletion`);
            try {
                await gridfsBucket.delete(new mongoose.Types.ObjectId(doc.fileId));
                logger.info(`Successfully deleted GridFS file ${doc.fileId}`);
            } catch (gridfsError) {
                // Handle the case where file is already deleted - this is expected in some scenarios
                if (gridfsError.message && gridfsError.message.includes('File not found')) {
                    logger.info(`GridFS file ${doc.fileId} was already deleted - skipping cleanup`);
                } else {
                    logger.error(`Error deleting GridFS file ${doc.fileId}:`, gridfsError);
                }
            }
        }
    } catch (error) {
        logger.error('Error in pre-deleteOne middleware:', error);
    }
});

// Pre-deleteMany middleware for bulk deletions
audioFileSchema.pre('deleteMany', { document: false, query: true }, async function() {
    try {
        const docs = await this.model.find(this.getQuery());
        for (const doc of docs) {
            if (doc && doc.fileId) {
                logger.info(`Cleaning up GridFS file ${doc.fileId} for bulk deletion`);
                try {
                    await gridfsBucket.delete(new mongoose.Types.ObjectId(doc.fileId));
                    logger.info(`Successfully deleted GridFS file ${doc.fileId}`);
                } catch (gridfsError) {
                    // Handle the case where file is already deleted - this is expected in some scenarios
                    if (gridfsError.message && gridfsError.message.includes('File not found')) {
                        logger.info(`GridFS file ${doc.fileId} was already deleted - skipping cleanup`);
                    } else {
                        logger.error(`Error deleting GridFS file ${doc.fileId}:`, gridfsError);
                    }
                }
            }
        }
    } catch (error) {
        logger.error('Error in pre-deleteMany middleware:', error);
    }
});

const AudioFile = mongoose.model('AudioFile', audioFileSchema);

// Assessment Session Schema for persistent storage
const assessmentSessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sessionId: {
        type: String,
        required: true,
        unique: true
    },
    currentAssessment: {
        type: String,
        enum: ['reading', 'listening', 'jumbled', 'story', 'personal', 'comprehension', 'fillblanks'],
        default: null
    },
    assessmentProgress: {
        reading: { type: Boolean, default: false },
        listening: { type: Boolean, default: false },
        jumbled: { type: Boolean, default: false },
        story: { type: Boolean, default: false },
        personal: { type: Boolean, default: false },
        comprehension: { type: Boolean, default: false },
        fillblanks: { type: Boolean, default: false }
    },
    temporaryData: {
        jumbledQuestions: [mongoose.Schema.Types.Mixed],
        currentJumbledIndex: { type: Number, default: 0 },
        currentStory: { type: String, default: null },
        currentQuestion: { type: String, default: null },
        currentComprehension: { type: mongoose.Schema.Types.Mixed, default: null },
        currentFillBlanks: [mongoose.Schema.Types.Mixed],
        // New fields for multiple sentences
        readingSentences: [{ type: String }],
        currentReadingIndex: { type: Number, default: 0 },
        listeningSentences: [mongoose.Schema.Types.Mixed],
        currentListeningIndex: { type: Number, default: 0 },
        // Store individual sentence results temporarily
        readingResults: [mongoose.Schema.Types.Mixed],
        listeningResults: [mongoose.Schema.Types.Mixed],
        // Store individual jumbled sentence answers and results
        jumbledAnswers: [mongoose.Schema.Types.Mixed]
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 86400 // Auto-delete after 24 hours
    },
    lastActivity: {
        type: Date,
        default: Date.now
    }
});

// Update lastActivity on save
assessmentSessionSchema.pre('save', function (next) {
    this.lastActivity = new Date();
    next();
});

const AssessmentSession = mongoose.model('AssessmentSession', assessmentSessionSchema);

// Detailed Assessment Results Schema for individual section results
const detailedResultsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assessmentType: {
        type: String,
        enum: ['reading', 'listening', 'jumbled', 'story', 'personal', 'comprehension', 'fillblanks'],
        required: true
    },
    score: {
        type: Number,
        required: true
    },
    completedAt: {
        type: Date,
        default: Date.now
    },
    // Specific data for each assessment type
    pronunciationData: {
        pronunciationScore: Number,
        accuracyScore: Number,
        fluencyScore: Number,
        completenessScore: Number,
        prosodyScore: Number,
        recognizedText: String,
        referenceText: String,
        // For multiple sentences (reading/listening assessments)
        sentences: [{
            sentenceIndex: Number,
            pronunciationScore: Number,
            accuracyScore: Number,
            fluencyScore: Number,
            completenessScore: Number,
            prosodyScore: Number,
            recognizedText: String,
            referenceText: String
        }]
    },
    aiEvaluation: {
        feedback: String,
        originalContent: String, // Original story or question
        userResponse: String
    },
    answerComparison: {
        questions: [{
            questionIndex: Number,
            question: String,
            userAnswer: String,
            correctAnswer: String,
            isCorrect: Boolean,
            options: [String]
        }],
        passageText: String // For comprehension
    }
});

// Index for efficient queries
detailedResultsSchema.index({ userId: 1, assessmentType: 1 });

const DetailedResults = mongoose.model('DetailedResults', detailedResultsSchema);

// Helper functions for audio file management
const saveAudioToMongoDB = async (audioBuffer, filename, userId, assessmentType) => {
    try {
        const uploadStream = gridfsBucket.openUploadStream(filename);
        const fileId = uploadStream.id;

        // Save file to GridFS
        uploadStream.end(audioBuffer);

        // Create tracking record
        const audioFile = new AudioFile({
            fileId: fileId,
            userId: userId,
            assessmentType: assessmentType,
            filename: filename
        });

        await audioFile.save();

        return fileId;
    } catch (error) {
        logger.error('Error saving audio to MongoDB:', error);
        throw error;
    }
};

const deleteAudioFromMongoDB = async (fileId) => {
    try {
        // Simply delete the tracking record - let the middleware handle GridFS cleanup
        // This avoids the race condition where both this function and middleware try to delete the same GridFS file
        const result = await AudioFile.deleteOne({ fileId: fileId });
        if (result.deletedCount > 0) {
            logger.info(`Successfully deleted tracking record for file: ${fileId}`);
        } else {
            logger.warn(`Tracking record for file ${fileId} not found or already deleted`);
        }
        
    } catch (error) {
        logger.error('Error deleting audio from MongoDB:', error);
        throw error; // Re-throw to let caller handle
    }
};

const cleanupUserAudioFiles = async (userId, assessmentType = null) => {
    try {
        const query = { userId: userId };
        if (assessmentType) {
            query.assessmentType = assessmentType;
        }

        const audioFiles = await AudioFile.find(query);

        for (const audioFile of audioFiles) {
            await deleteAudioFromMongoDB(audioFile.fileId);
        }
    } catch (error) {
        logger.error('Error cleaning up audio files:', error);
    }
};

// Cleanup orphaned GridFS files that don't have tracking records
const cleanupOrphanedGridFSFiles = async () => {
    try {
        logger.info('Starting orphaned GridFS files cleanup...');
        
        // Get all GridFS files
        const gridfsFiles = await gridfsBucket.find({}).toArray();
        
        // Get all tracked file IDs
        const trackedFiles = await AudioFile.find({}, { fileId: 1 }).lean();
        const trackedFileIds = new Set(trackedFiles.map(f => f.fileId.toString()));
        
        let orphanedCount = 0;
        
        for (const gridfsFile of gridfsFiles) {
            const fileIdStr = gridfsFile._id.toString();
            
            // If GridFS file is not tracked, it's orphaned
            if (!trackedFileIds.has(fileIdStr)) {
                try {
                    await gridfsBucket.delete(gridfsFile._id);
                    orphanedCount++;
                } catch (deleteError) {
                    logger.error(`Failed to delete orphaned GridFS file ${fileIdStr}:`, deleteError);
                }
            }
        }
        
        logger.info(`Orphaned GridFS cleanup completed. Deleted ${orphanedCount} orphaned files.`);
        return orphanedCount;
    } catch (error) {
        logger.error('Error during orphaned GridFS cleanup:', error);
        return 0;
    }
};

// Cleanup expired audio files and their GridFS data
const cleanupExpiredAudioFiles = async () => {
    try {
        logger.info('Starting expired audio files cleanup...');
        
        // Find expired audio files (older than 1 hour)
        const oneHourAgo = new Date(Date.now() - 3600 * 1000);
        const expiredFiles = await AudioFile.find({
            createdAt: { $lt: oneHourAgo }
        });
        
        let cleanedCount = 0;
        
        for (const expiredFile of expiredFiles) {
            try {
                // Delete from GridFS first
                await gridfsBucket.delete(new mongoose.Types.ObjectId(expiredFile.fileId));
                
                // Delete tracking record
                await AudioFile.deleteOne({ _id: expiredFile._id });
                
                cleanedCount++;
                logger.info(`Cleaned up expired audio file: ${expiredFile.fileId}`);
            } catch (deleteError) {
                logger.error(`Failed to cleanup expired file ${expiredFile.fileId}:`, deleteError);
            }
        }
        
        logger.info(`Expired audio files cleanup completed. Cleaned ${cleanedCount} files.`);
        return cleanedCount;
    } catch (error) {
        logger.error('Error during expired audio files cleanup:', error);
        return 0;
    }
};

// Start scheduled cleanup jobs
const startCleanupJobs = () => {
    logger.info('Starting cleanup jobs...');
    
    // Start payment cleanup job
    startCleanupJob();
    
    // Run audio cleanup every 30 minutes
    const cleanupInterval = 30 * 60 * 1000; // 30 minutes
    
    // Initial cleanup run
    setTimeout(async () => {
        await cleanupExpiredAudioFiles();
        await cleanupOrphanedGridFSFiles();
    }, 10000); // Run first cleanup after 10 seconds
    
    // Schedule regular cleanup
    setInterval(async () => {
        try {
            await cleanupExpiredAudioFiles();
            await cleanupOrphanedGridFSFiles();
        } catch (error) {
            logger.error('Error in scheduled cleanup:', error);
        }
    }, cleanupInterval);
    
    logger.info(`Audio file cleanup jobs scheduled to run every ${cleanupInterval / 60000} minutes`);
};

// =================
// EMAIL CONFIGURATION
// =================

// Email transporter setup
const emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    requireTLS: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Test email configuration on startup
emailTransporter.verify(function (error, success) {
    if (error) {
        logger.error('Email configuration error:', error);
        logger.warn('Email verification will not work. Please check your email settings in .env file.');
    } else {
        logger.info('Email server is ready to send messages');
    }
});

// Function to send assessment report email
const sendAssessmentReportEmail = async (userEmail, username, assessmentData) => {
    try {
        const { scores, feedback, completedCount, totalCount, overallScore } = assessmentData;
        
        // Create HTML email template
        const htmlTemplate = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Assessment Report - Communication Assessment Suite</title>
                <style>
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                        background-color: #f8f9fa;
                    }
                    .container {
                        background: #ffffff;
                        border-radius: 12px;
                        padding: 30px;
                        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                        border: 1px solid #e6eef2;
                    }
                    .header {
                        text-align: center;
                        border-bottom: 3px solid #1f4e5f;
                        padding-bottom: 20px;
                        margin-bottom: 30px;
                    }
                    .header h1 {
                        color: #1f4e5f;
                        margin: 0;
                        font-size: 28px;
                        font-weight: bold;
                    }
                    .header p {
                        color: #666;
                        margin: 10px 0 0 0;
                        font-size: 16px;
                    }
                    .summary {
                        background: linear-gradient(135deg, #1f4e5f, #163a46);
                        color: white;
                        padding: 20px;
                        border-radius: 8px;
                        text-align: center;
                        margin-bottom: 30px;
                    }
                    .summary h2 {
                        margin: 0 0 10px 0;
                        font-size: 24px;
                    }
                    .overall-score {
                        font-size: 48px;
                        font-weight: bold;
                        margin: 10px 0;
                        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                    }
                    .completion-status {
                        font-size: 14px;
                        opacity: 0.9;
                        margin-top: 10px;
                    }
                    .scores-section {
                        margin-bottom: 30px;
                    }
                    .scores-section h3 {
                        color: #1f4e5f;
                        border-bottom: 2px solid #e6eef2;
                        padding-bottom: 10px;
                        margin-bottom: 20px;
                        font-size: 20px;
                    }
                    .score-item {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 12px 0;
                        border-bottom: 1px dashed #e0e0e0;
                    }
                    .score-item:last-child {
                        border-bottom: none;
                    }
                    .score-name {
                        font-weight: 600;
                        color: #333;
                        flex: 1;
                    }
                    .score-value {
                        font-weight: bold;
                        font-size: 18px;
                        color: #1f4e5f;
                        min-width: 60px;
                        text-align: right;
                    }
                    .score-bar {
                        width: 100px;
                        height: 8px;
                        background: #e0e0e0;
                        border-radius: 4px;
                        margin: 0 15px;
                        overflow: hidden;
                    }
                    .score-fill {
                        height: 100%;
                        background: linear-gradient(90deg, #1f4e5f, #2a6478);
                        border-radius: 4px;
                        transition: width 0.3s ease;
                    }
                    .feedback-section {
                        background: #f8f9fa;
                        border-left: 4px solid #1f4e5f;
                        padding: 20px;
                        margin: 30px 0;
                        border-radius: 0 8px 8px 0;
                    }
                    .feedback-section h3 {
                        color: #1f4e5f;
                        margin-top: 0;
                        font-size: 20px;
                    }
                    .feedback-content {
                        white-space: pre-wrap;
                        line-height: 1.7;
                        color: #444;
                        font-size: 14px;
                    }
                    .footer {
                        text-align: center;
                        margin-top: 40px;
                        padding-top: 20px;
                        border-top: 1px solid #e6eef2;
                        color: #666;
                        font-size: 12px;
                    }
                    .footer a {
                        color: #1f4e5f;
                        text-decoration: none;
                    }
                    .not-attempted {
                        color: #dc3545;
                        font-style: italic;
                    }
                    .completed {
                        color: #28a745;
                    }
                    @media (max-width: 600px) {
                        body {
                            padding: 10px;
                        }
                        .container {
                            padding: 20px;
                        }
                        .overall-score {
                            font-size: 36px;
                        }
                        .score-item {
                            flex-direction: column;
                            align-items: flex-start;
                            gap: 8px;
                        }
                        .score-bar {
                            width: 100%;
                            margin: 8px 0;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>📊 Assessment Report</h1>
                        <p>Communication Assessment Suite</p>
                    </div>
                    
                    <div class="summary">
                        <h2>Hello ${username}!</h2>
                        <div class="overall-score">${overallScore}/100</div>
                        <div class="completion-status">
                            ${completedCount} out of ${totalCount} assessments completed
                        </div>
                    </div>
                    
                    <div class="scores-section">
                        <h3>📈 Individual Section Scores</h3>
                        
                        <div class="score-item">
                            <span class="score-name">Reading Ability (Pronunciation)</span>
                            <div class="score-bar">
                                <div class="score-fill" style="width: ${scores.readingAbility}%"></div>
                            </div>
                            <span class="score-value ${scores.readingAbility > 0 ? 'completed' : 'not-attempted'}">
                                ${scores.readingAbility > 0 ? scores.readingAbility + '/100' : 'Not Attempted'}
                            </span>
                        </div>
                        
                        <div class="score-item">
                            <span class="score-name">Listening Ability (Comprehension & Repetition)</span>
                            <div class="score-bar">
                                <div class="score-fill" style="width: ${scores.listeningAbility}%"></div>
                            </div>
                            <span class="score-value ${scores.listeningAbility > 0 ? 'completed' : 'not-attempted'}">
                                ${scores.listeningAbility > 0 ? scores.listeningAbility + '/100' : 'Not Attempted'}
                            </span>
                        </div>
                        
                        <div class="score-item">
                            <span class="score-name">Jumbled Sentences (Grammar & Construction)</span>
                            <div class="score-bar">
                                <div class="score-fill" style="width: ${scores.jumbledSentences}%"></div>
                            </div>
                            <span class="score-value ${scores.jumbledSentences > 0 ? 'completed' : 'not-attempted'}">
                                ${scores.jumbledSentences > 0 ? scores.jumbledSentences + '/100' : 'Not Attempted'}
                            </span>
                        </div>
                        
                        <div class="score-item">
                            <span class="score-name">Story Summarization (Comprehension & Storytelling)</span>
                            <div class="score-bar">
                                <div class="score-fill" style="width: ${scores.storySummarization}%"></div>
                            </div>
                            <span class="score-value ${scores.storySummarization > 0 ? 'completed' : 'not-attempted'}">
                                ${scores.storySummarization > 0 ? scores.storySummarization + '/100' : 'Not Attempted'}
                            </span>
                        </div>
                        
                        <div class="score-item">
                            <span class="score-name">Personal Questions (Interview Skills)</span>
                            <div class="score-bar">
                                <div class="score-fill" style="width: ${scores.personalQuestions}%"></div>
                            </div>
                            <span class="score-value ${scores.personalQuestions > 0 ? 'completed' : 'not-attempted'}">
                                ${scores.personalQuestions > 0 ? scores.personalQuestions + '/100' : 'Not Attempted'}
                            </span>
                        </div>
                        
                        <div class="score-item">
                            <span class="score-name">Reading Comprehension (Text Analysis)</span>
                            <div class="score-bar">
                                <div class="score-fill" style="width: ${scores.readingComprehension}%"></div>
                            </div>
                            <span class="score-value ${scores.readingComprehension > 0 ? 'completed' : 'not-attempted'}">
                                ${scores.readingComprehension > 0 ? scores.readingComprehension + '/100' : 'Not Attempted'}
                            </span>
                        </div>
                        
                        <div class="score-item">
                            <span class="score-name">Fill in the Blanks (Grammar Mastery)</span>
                            <div class="score-bar">
                                <div class="score-fill" style="width: ${scores.fillInTheBlanks}%"></div>
                            </div>
                            <span class="score-value ${scores.fillInTheBlanks > 0 ? 'completed' : 'not-attempted'}">
                                ${scores.fillInTheBlanks > 0 ? scores.fillInTheBlanks + '/100' : 'Not Attempted'}
                            </span>
                        </div>
                    </div>
                    
                    ${feedback ? `
                    <div class="feedback-section">
                        <h3>💬 Detailed Analysis & Feedback</h3>
                        <div class="feedback-content">${feedback}</div>
                    </div>
                    ` : ''}
                    
                    <div class="footer">
                        <p>
                            Generated on ${new Date().toLocaleDateString('en-US', { 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </p>
                        <p>
                            <a href="https://skilltesseract.com">Skill Tesseract</a> | 
                            <a href="mailto:mockinterview014@gmail.com">Support</a>
                        </p>
                        <p style="margin-top: 20px; color: #999; font-size: 11px;">
                            This is an automated assessment report. Please do not reply to this email.
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: userEmail,
            subject: `📊 Your Communication Assessment Report - Overall Score: ${overallScore}/100`,
            html: htmlTemplate
        };

        await emailTransporter.sendMail(mailOptions);
        logger.info(`Assessment report email sent successfully to ${userEmail}`);
        return true;
    } catch (error) {
        logger.error('Error sending assessment report email:', error);
        return false;
    }
};

// =================
// MIDDLEWARE SETUP
// =================

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: { error: 'Too many authentication attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // Increased from 100 to 300 requests per window
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting for Azure config requests
const azureConfigLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // 20 token requests per 5 minutes
    message: { error: 'Too many token requests. Please wait before trying again.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting with logout exception
app.use('/api/auth', (req, res, next) => {
    // Apply rate limiting ONLY to authentication-sensitive endpoints
    if (req.path === '/login' || req.path === '/signup' || req.path === '/resend-verification') {
        return authLimiter(req, res, next);
    }
    // All other /api/auth/* endpoints bypass auth rate limiting
    return next();
});

// Exclude certain routes from general rate limiting
app.use((req, res, next) => {
    // Skip rate limiting for:
    // - Admin login page and static assets
    // - User info endpoint (dashboard needs this frequently)
    // - Health check endpoint
    if (req.path.startsWith('/admin/login') ||
        req.path.endsWith('.css') ||
        req.path.endsWith('.js') ||
        req.path.endsWith('.png') ||
        req.path.endsWith('.jpg') ||
        req.path.endsWith('.ico') ||
        req.path === '/api/auth/me' ||
        req.path === '/api/health') {
        return next();
    }
    return generalLimiter(req, res, next);
});

// Session configuration with MongoDB store
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: MONGODB_URI,
        touchAfter: 24 * 3600, // lazy session update
        ttl: 24 * 60 * 60 // session TTL in seconds (24 hours)
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(bodyParser.json());
app.use(express.static('public'));

// =================
// AUTHENTICATION MIDDLEWARE
// =================

// Middleware to check if user is authenticated
const requireAuth = async (req, res, next) => {
    try {
        const token = req.session.userId;
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Add timeout to database query
        const user = await Promise.race([
            User.findById(token),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Database query timeout')), 5000)
            )
        ]);

        if (!user) {
            req.session.destroy();
            return res.status(401).json({ error: 'User not found' });
        }

        if (!user.isEmailVerified) {
            return res.status(401).json({
                error: 'Email verification required. Please check your email and verify your account.'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        logger.error('Auth middleware error:', error);

        // More specific error handling
        if (error.message === 'Database query timeout') {
            return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
        }

        if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
            return res.status(503).json({ error: 'Database connection issue. Please try again.' });
        }

        return res.status(500).json({ error: 'Authentication error' });
    }
};

// Middleware to redirect unauthenticated users
const redirectIfNotAuth = async (req, res, next) => {
    try {
        const token = req.session.userId;
        if (!token) {
            return res.redirect('/login?message=Please%20log%20in%20to%20access%20assessments&type=info');
        }

        const user = await User.findById(token);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login?message=Session%20expired.%20Please%20log%20in%20again&type=warning');
        }

        if (!user.isEmailVerified) {
            return res.redirect('/?message=Please%20verify%20your%20email%20before%20accessing%20assessments&type=warning');
        }

        req.user = user;
        next();
    } catch (error) {
        logger.error('Redirect auth middleware error:', error);
        return res.redirect('/login?message=Authentication%20error&type=error');
    }
};

// =================
// AUDIO FILE SERVING
// =================

// Serve audio files from MongoDB
app.get('/api/audio/:fileId', requireAuth, async (req, res) => {
    try {
        const { fileId } = req.params;

        // Verify the audio file belongs to the current user or is valid
        const audioFile = await AudioFile.findOne({
            fileId: new mongoose.Types.ObjectId(fileId),
            userId: req.user._id
        });

        if (!audioFile) {
            return res.status(404).json({ error: 'Audio file not found' });
        }

        // Stream the file from GridFS
        const downloadStream = gridfsBucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));

        // Set appropriate headers
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Disposition': `inline; filename="${audioFile.filename}"`
        });

        downloadStream.pipe(res);

        downloadStream.on('error', (error) => {
            logger.error('Error streaming audio file:', error);
            res.status(500).json({ error: 'Error streaming audio file' });
        });

    } catch (error) {
        logger.error('Error serving audio file:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =================
// AUTHENTICATION ROUTES
// =================

// Signup route
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, username, password } = req.body;

        // Validation
        if (!email || !username || !password) {
            return res.status(400).json({
                error: 'Email, username and password are required',
                field: !email ? 'email' : (!username ? 'username' : 'password')
            });
        }

        if (!validator.isEmail(email)) {
            return res.status(400).json({
                error: 'Please enter a valid email address',
                field: 'email'
            });
        }

        if (username.length < 3 || username.length > 30) {
            return res.status(400).json({
                error: 'Username must be between 3 and 30 characters',
                field: 'username'
            });
        }

        // Check if username contains only valid characters (alphanumeric and underscore)
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.status(400).json({
                error: 'Username can only contain letters, numbers, and underscores',
                field: 'username'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters long',
                field: 'password'
            });
        }

        // Check password strength
        const hasUppercase = /[A-Z]/.test(password);
        const hasLowercase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        if (!hasUppercase || !hasLowercase || !hasNumbers || !hasSpecialChar) {
            return res.status(400).json({
                error: 'Password must contain uppercase, lowercase, number, and special character',
                field: 'password'
            });
        }

        // Check if user already exists (email or username)
        const existingUser = await User.findOne({
            $or: [
                { email: email.toLowerCase() },
                { username: { $regex: new RegExp(`^${username}$`, 'i') } } // Case-insensitive username check
            ]
        });

        if (existingUser) {
            if (existingUser.email === email.toLowerCase()) {
                return res.status(400).json({
                    error: 'An account with this email already exists',
                    field: 'email'
                });
            } else {
                return res.status(400).json({
                    error: 'This username is already taken',
                    field: 'username'
                });
            }
        }

        // Create new user
        const user = new User({
            email: email.toLowerCase(),
            username: username, // Keep original case for username
            password,
            number_of_tests: 0,
            testsTaken: 0
        });

        // Generate verification token
        const verificationToken = user.generateEmailVerificationToken();
        await user.save();

        // Send verification email
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const verificationUrl = `${req.protocol}://${req.get('host')}/api/auth/verify-email?token=${verificationToken}`;

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Verify Your Email - Communication Assessment Suite',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e6eef2; border-radius: 12px; padding: 24px;">
                        <h2 style="color: #1f4e5f; margin-top: 0;">Welcome to Communication Assessment Suite! 🎯</h2>
                        <p>Thank you for signing up! Please verify your email address to activate your account.</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${verificationUrl}" 
                               style="background: linear-gradient(135deg, #1f4e5f, #163a46); color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
                                Verify Email Address
                            </a>
                        </div>
                        <p>Or copy and paste this link in your browser:</p>
                        <p style="word-break: break-all; color: #1f4e5f;">${verificationUrl}</p>
                        <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
                        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e6eef2;">
                        <p style="color: #666; font-size: 12px;">
                            If you didn't create an account, please ignore this email.
                        </p>
                    </div>
                `
            };

            try {
                await emailTransporter.sendMail(mailOptions);
            } catch (emailError) {
                logger.error('Failed to send verification email:', emailError);
                // Don't fail the signup if email fails
            }
        }

        res.status(201).json({
            success: true,
            message: 'Account created successfully. Please check your email to verify your account.'
        });

    } catch (error) {
        logger.error('Signup error:', error);

        if (error.code === 11000) { // Duplicate key error
            const field = error.keyPattern?.email ? 'email' : 'username';
            const message = field === 'email'
                ? 'An account with this email already exists'
                : 'This username is already taken';
            return res.status(400).json({
                error: message,
                field: field
            });
        }

        res.status(500).json({ error: 'Server error during signup. Please try again.' });
    }
});

// Login route
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({
                error: 'Email and password are required',
                field: !email ? 'email' : 'password'
            });
        }

        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({
                error: 'Invalid email or password',
                field: 'email'
            });
        }

        // Check password
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            return res.status(400).json({
                error: 'Invalid email or password',
                field: 'password'
            });
        }

        // Check if email is verified
        if (!user.isEmailVerified) {
            return res.status(400).json({
                error: 'Please verify your email before logging in. Check your inbox for the verification link.'
            });
        }

        // Update last login
        user.lastLoginAt = new Date();
        await user.save();

        // Set session
        req.session.userId = user._id;

        res.json({
            success: true,
            message: 'Login successful'
        });

    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login. Please try again.' });
    }
});

// Email verification route
app.get('/api/auth/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.redirect('/?message=Invalid%20verification%20link&type=error');
        }

        const user = await User.findOne({
            emailVerificationToken: token,
            emailVerificationExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.redirect('/?message=Invalid%20or%20expired%20verification%20link&type=error');
        }

        user.isEmailVerified = true;
        user.emailVerificationToken = null;
        user.emailVerificationExpires = null;
        await user.save();

        res.redirect('/login?message=Email%20verified%20successfully!%20You%20can%20now%20log%20in&type=success');

    } catch (error) {
        logger.error('Email verification error:', error);
        res.redirect('/?message=Email%20verification%20failed&type=error');
    }
});

// Resend verification email route
app.post('/api/auth/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ error: 'Email is already verified' });
        }

        // Generate new verification token
        const verificationToken = user.generateEmailVerificationToken();
        await user.save();

        // Send verification email
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const verificationUrl = `${req.protocol}://${req.get('host')}/api/auth/verify-email?token=${verificationToken}`;

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Verify Your Email - Communication Assessment Suite',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e6eef2; border-radius: 12px; padding: 24px;">
                        <h2 style="color: #1f4e5f; margin-top: 0;">Email Verification 🎯</h2>
                        <p>Please verify your email address to activate your account.</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${verificationUrl}" 
                               style="background: linear-gradient(135deg, #1f4e5f, #163a46); color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
                                Verify Email Address
                            </a>
                        </div>
                        <p>Or copy and paste this link in your browser:</p>
                        <p style="word-break: break-all; color: #1f4e5f;">${verificationUrl}</p>
                        <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
                    </div>
                `
            };

            await emailTransporter.sendMail(mailOptions);
        }

        res.json({
            success: true,
            message: 'Verification email sent successfully'
        });

    } catch (error) {
        logger.error('Resend verification error:', error);
        res.status(500).json({ error: 'Failed to resend verification email' });
    }
});

// Forgot password route
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        if (!validator.isEmail(email)) {
            return res.status(400).json({ error: 'Please enter a valid email address' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            // Don't reveal if user exists or not for security
            return res.json({
                success: true,
                message: 'If an account with this email exists, you will receive a password reset link.'
            });
        }

        // Generate password reset token
        const resetToken = user.generatePasswordResetToken();
        await user.save();

        // Send password reset email
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Password Reset - Communication Assessment Suite',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e6eef2; border-radius: 12px; padding: 24px;">
                        <h2 style="color: #1f4e5f; margin-top: 0;">Password Reset Request 🔐</h2>
                        <p>You requested a password reset for your Communication Assessment Suite account.</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resetUrl}" 
                               style="background: linear-gradient(135deg, #1f4e5f, #163a46); color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
                                Reset Password
                            </a>
                        </div>
                        <p><strong>If the button above doesn't work, copy and paste this link in your browser:</strong></p>
                        <p style="word-break: break-all; color: #1f4e5f; background: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace;">${resetUrl}</p>
                        <p style="color: #666; font-size: 14px;"><strong>Important:</strong> This link will expire in 1 hour.</p>
                        <p style="color: #666; font-size: 14px;">If you didn't request this password reset, please ignore this email.</p>
                    </div>
                `
            };

            await emailTransporter.sendMail(mailOptions);
        }

        res.json({
            success: true,
            message: 'If an account with this email exists, you will receive a password reset link.'
        });

    } catch (error) {
        logger.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process password reset request' });
    }
});

// Reset password route
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ error: 'Token and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: 'Password must be at least 8 characters long',
                field: 'password'
            });
        }

        // Check password strength
        const hasUppercase = /[A-Z]/.test(password);
        const hasLowercase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        if (!hasUppercase || !hasLowercase || !hasNumbers || !hasSpecialChar) {
            return res.status(400).json({
                error: 'Password must contain uppercase, lowercase, number, and special character',
                field: 'password'
            });
        }

        const user = await User.findOne({
            passwordResetToken: token,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired password reset token' });
        }

        // Update password and clear reset token
        user.password = password;
        user.passwordResetToken = null;
        user.passwordResetExpires = null;
        await user.save();

        res.json({
            success: true,
            message: 'Password reset successfully. You can now log in with your new password.'
        });

    } catch (error) {
        logger.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Logout route
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            logger.error('Logout error:', err);
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Get current user info
app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({
        id: req.user._id,
        email: req.user.email,
        username: req.user.username,
        number_of_tests: req.user.number_of_tests,
        testsTaken: req.user.testsTaken || 0,
        isEmailVerified: req.user.isEmailVerified,
        assessmentScores: req.user.assessmentScores,
        tests_timestamps: req.user.tests_timestamps || [],
        payments_timestamps: req.user.payments_timestamps || [],
        createdAt: req.user.createdAt,
        lastLoginAt: req.user.lastLoginAt
    });
});

// =================
// HEALTH CHECK ENDPOINT
// =================

// Health check endpoint for Docker
app.get('/api/health', (req, res) => {
    // Check MongoDB connection
    if (mongoose.connection.readyState === 1) {
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected'
        });
    } else {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            database: 'disconnected'
        });
    }
});

// =================
// ADMIN AUTHENTICATION MIDDLEWARE
// =================

// Middleware to check if admin is authenticated
const requireAdminAuth = async (req, res, next) => {
    try {
        const adminId = req.session.adminId;
        if (!adminId) {
            return res.status(401).json({ error: 'Admin authentication required' });
        }

        const admin = await Admin.findById(adminId);
        if (!admin) {
            req.session.adminId = null;
            return res.status(401).json({ error: 'Admin not found' });
        }

        req.admin = admin;
        next();
    } catch (error) {
        logger.error('Admin auth middleware error:', error);
        return res.status(500).json({ error: 'Admin authentication error' });
    }
};

// =================
// ADMIN AUTHENTICATION ROUTES
// =================

// Admin login route
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validation
        if (!username || !password) {
            return res.status(400).json({
                error: 'Username and password are required'
            });
        }

        // Find admin
        const admin = await Admin.findOne({ username: username.trim() });
        if (!admin) {
            return res.status(400).json({
                error: 'Invalid username or password'
            });
        }

        // Check password
        const isValidPassword = await admin.comparePassword(password);
        if (!isValidPassword) {
            return res.status(400).json({
                error: 'Invalid username or password'
            });
        }

        // Set admin session
        req.session.adminId = admin._id;

        res.json({
            success: true,
            message: 'Admin login successful'
        });

    } catch (error) {
        logger.error('Admin login error:', error);
        res.status(500).json({ error: 'Server error during admin login' });
    }
});

// Admin logout route
app.post('/api/admin/logout', (req, res) => {
    req.session.adminId = null;
    res.json({ success: true, message: 'Admin logged out successfully' });
});

// Check admin authentication status
app.get('/api/admin/me', requireAdminAuth, (req, res) => {
    res.json({
        id: req.admin._id,
        username: req.admin.username,
        createdAt: req.admin.createdAt
    });
});



// =================
// ADMIN ENDPOINTS
// =================

// Add tests to a user (requires admin authentication)
app.post('/api/admin/add-tests', requireAdminAuth, async (req, res) => {
    try {
        const { email, username, tests } = req.body;

        if (!tests || tests <= 0) {
            return res.status(400).json({ error: 'Number of tests must be greater than 0' });
        }

        if (!email && !username) {
            return res.status(400).json({ error: 'Either email or username is required' });
        }

        // Find user by email or username
        const query = email ? { email: email.toLowerCase() } : { username: { $regex: new RegExp(`^${username}$`, 'i') } };
        const user = await User.findOne(query);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Add tests to user
        user.number_of_tests += parseInt(tests);
        await user.save();

        res.json({
            success: true,
            message: `Added ${tests} tests to user ${user.email}`,
            user: {
                email: user.email,
                username: user.username,
                number_of_tests: user.number_of_tests,
                testsTaken: user.testsTaken || 0
            }
        });

    } catch (error) {
        logger.error('Error adding tests to user:', error);
        res.status(500).json({ error: 'Failed to add tests to user' });
    }
});

// Get all users with their test counts (requires admin authentication)
app.get('/api/admin/users', requireAdminAuth, async (req, res) => {
    try {
        const users = await User.find({}, {
            email: 1,
            username: 1,
            number_of_tests: 1,
            testsTaken: 1,
            isEmailVerified: 1,
            createdAt: 1,
            lastLoginAt: 1,
            lastAssessmentCompletedAt: 1,
            assessmentScores: 1
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            users: users
        });

    } catch (error) {
        logger.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get current user profile
app.get('/api/user/profile', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('email username');
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            success: true,
            user: {
                email: user.email,
                username: user.username
            }
        });
        
    } catch (error) {
        logger.error('❌ Error fetching user profile:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

// =================
// RAZORPAY PAYMENT ENDPOINTS
// =================

// Cleanup job for all payment records older than 24 hours
const cleanupOldPayments = async () => {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
        
        const result = await Payment.deleteMany({
            createdAt: { $lt: twentyFourHoursAgo }
        });
        
        if (result.deletedCount > 0) {
            logger.info(`🧹 Cleaned up ${result.deletedCount} payment records older than 24 hours`);
        }
    } catch (error) {
        logger.error('❌ Error cleaning up old payment records:', error);
    }
};

// Start cleanup job - runs every hour
const startCleanupJob = () => {
    // Run cleanup immediately on startup
    setTimeout(cleanupOldPayments, 5000); // Wait 5 seconds after server start
    
    // Then run every hour
    setInterval(cleanupOldPayments, 12 * 60 * 60 * 1000);
    logger.info('🔄 Payment cleanup job started - runs every 12 hours to clean records older than 24 hours');
};

// Initialize Razorpay (optional - only if credentials are provided)
const Razorpay = require('razorpay');
let razorpay = null;

if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    logger.info('✅ Razorpay payment gateway initialized');
} else {
    logger.warn('⚠️  Razorpay credentials not found - payment features will be disabled');
}

// Payment Schema for tracking transactions
const paymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    razorpayOrderId: {
        type: String,
        required: true,
        unique: true
    },
    razorpayPaymentId: {
        type: String,
        default: null
    },
    razorpaySignature: {
        type: String,
        default: null
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },
    planName: {
        type: String,
        required: true
    },
    testsCount: {
        type: Number,
        required: true
    },
    customerName: {
        type: String,
        required: true
    },
    customerEmail: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['created', 'paid', 'failed'],
        default: 'created'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    paidAt: {
        type: Date,
        default: null
    }
});

const Payment = mongoose.model('Payment', paymentSchema);

// Create Razorpay order
app.post('/api/payment/create-order', requireAuth, async (req, res) => {
    try {
        const { amount, planName, testsCount, customerName, customerEmail, customerPhone } = req.body;

        logger.info('🔄 Creating payment order:', {
            userId: req.user._id,
            amount,
            planName,
            testsCount,
            customerName,
            customerEmail,
            customerPhone
        });

        // Validate input
        if (!amount || !planName || !testsCount || !customerName || !customerEmail || !customerPhone) {
            logger.warn('❌ Payment order creation failed: Missing required fields');
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['amount', 'planName', 'testsCount', 'customerName', 'customerEmail', 'customerPhone']
            });
        }

        // Validate email format
        if (!validator.isEmail(customerEmail)) {
            logger.warn('❌ Payment order creation failed: Invalid email format');
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Validate phone format (basic validation)
        const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,15}$/;
        if (!phoneRegex.test(customerPhone)) {
            logger.warn('❌ Payment order creation failed: Invalid phone format');
            return res.status(400).json({ error: 'Invalid phone number format' });
        }

        // Create Razorpay order
        const options = {
            amount: amount * 100, // Razorpay expects amount in paise
            currency: 'INR',
            receipt: `ord_${Date.now().toString().slice(-8)}_${req.user._id.toString().slice(-6)}`, // Keep under 40 chars
            notes: {
                userId: req.user._id.toString(),
                planName,
                testsCount: testsCount.toString(),
                customerName,
                customerEmail,
                customerPhone
            }
        };

        const razorpayOrder = await razorpay.orders.create(options);
        logger.info('✅ Razorpay order created:', razorpayOrder.id);

        // Save payment record in database
        const payment = new Payment({
            userId: req.user._id,
            razorpayOrderId: razorpayOrder.id,
            amount,
            planName,
            testsCount,
            customerName,
            customerEmail,
            status: 'created'
        });

        await payment.save();
        logger.info('✅ Payment record saved to database:', payment._id);

        res.json({
            success: true,
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key: process.env.RAZORPAY_KEY_ID,
            customerName,
            customerEmail,
            planName,
            testsCount
        });

    } catch (error) {
        logger.error('❌ Error creating payment order:', error);
        res.status(500).json({ 
            error: 'Failed to create payment order',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Verify payment and allocate tests
app.post('/api/payment/verify', requireAuth, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        logger.info('🔄 Verifying payment:', {
            userId: req.user._id,
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id
        });

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            logger.warn('❌ Payment verification failed: Missing payment details');
            return res.status(400).json({ error: 'Missing payment details' });
        }

        // Find payment record
        const payment = await Payment.findOne({ 
            razorpayOrderId: razorpay_order_id,
            userId: req.user._id
        });

        if (!payment) {
            logger.warn('❌ Payment verification failed: Payment record not found');
            return res.status(404).json({ error: 'Payment record not found' });
        }

        if (payment.status === 'paid') {
            logger.warn('⚠️ Payment already verified:', razorpay_order_id);
            return res.json({ 
                success: true, 
                message: 'Payment already verified',
                testsAdded: payment.testsCount
            });
        }

        // Verify signature
        const crypto = require('crypto');
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            logger.warn('❌ Payment verification failed: Invalid signature');
            payment.status = 'failed';
            await payment.save();
            return res.status(400).json({ error: 'Invalid payment signature' });
        }

        logger.info('✅ Payment signature verified successfully');

        // Update payment record
        payment.razorpayPaymentId = razorpay_payment_id;
        payment.razorpaySignature = razorpay_signature;
        payment.status = 'paid';
        payment.paidAt = new Date();
        await payment.save();

        // Add tests to user account and record payment timestamp
        const user = await User.findById(req.user._id);
        user.number_of_tests += payment.testsCount;
        
        // Add payment timestamp
        user.payments_timestamps.push({
            timestamp: new Date(),
            amount: payment.amount,
            testsCount: payment.testsCount,
            paymentId: razorpay_payment_id
        });
        
        await user.save();

        logger.info('✅ Tests allocated successfully:', {
            userId: req.user._id,
            testsAdded: payment.testsCount,
            totalTests: user.number_of_tests
        });

        res.json({
            success: true,
            message: `Payment successful! ${payment.testsCount} tests added to your account.`,
            testsAdded: payment.testsCount,
            totalTests: user.number_of_tests,
            paymentId: razorpay_payment_id
        });

    } catch (error) {
        logger.error('❌ Error verifying payment:', error);
        res.status(500).json({ 
            error: 'Failed to verify payment',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get payment history for user
app.get('/api/payment/history', requireAuth, async (req, res) => {
    try {
        const payments = await Payment.find({ 
            userId: req.user._id,
            status: 'paid'
        }).sort({ paidAt: -1 }).limit(10);

        logger.info('✅ Payment history retrieved for user:', req.user._id);

        res.json({
            success: true,
            payments: payments.map(payment => ({
                id: payment._id,
                planName: payment.planName,
                testsCount: payment.testsCount,
                amount: payment.amount,
                paidAt: payment.paidAt,
                paymentId: payment.razorpayPaymentId
            }))
        });

    } catch (error) {
        logger.error('❌ Error fetching payment history:', error);
        res.status(500).json({ error: 'Failed to fetch payment history' });
    }
});

// =================
// PROTECTED ROUTE HANDLERS
// =================

// Serve assessment page (protected)
app.get('/assessment', redirectIfNotAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'assessment.html'));
});

// Serve dashboard page (protected)
app.get('/dashboard', redirectIfNotAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Serve purchase tests page (protected)
app.get('/purchase', redirectIfNotAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'purchase.html'));
});

// Serve admin login page
app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// Serve admin page (requires authentication)
app.get('/admin', async (req, res) => {
    try {
        const adminId = req.session.adminId;
        if (!adminId) {
            return res.redirect('/admin/login?message=Please%20log%20in%20to%20access%20admin%20panel&type=info');
        }

        const admin = await Admin.findById(adminId);
        if (!admin) {
            req.session.adminId = null;
            return res.redirect('/admin/login?message=Session%20expired.%20Please%20log%20in%20again&type=warning');
        }

        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    } catch (error) {
        logger.error('Admin page access error:', error);
        return res.redirect('/admin/login?message=Authentication%20error&type=error');
    }
});

// Serve auth pages
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

// Serve contact page
app.get('/contact', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

// Contact form endpoint - sends email to support inbox
app.post('/api/contact', async (req, res) => {
    try {
        const { fullName, email, company, phone, message } = req.body || {};

        if (!fullName || !email || !message) {
            return res.status(400).json({ error: 'Full name, email and message are required' });
        }
        if (!validator.isEmail(email)) {
            return res.status(400).json({ error: 'Please provide a valid email address' });
        }

        const toAddress = 'mockinterview014@gmail.com';
        const safeName = String(fullName).slice(0, 200);
        const safeCompany = company ? String(company).slice(0, 200) : '';
        const safePhone = phone ? String(phone).slice(0, 60) : '';
        const safeMessage = String(message).slice(0, 5000);

        const htmlBody = `
            <div style="font-family: Arial, Helvetica, sans-serif; color:#0b1320;">
                <h2 style="margin:0 0 10px;color:#1f4e5f;">New Contact Form Submission</h2>
                <p style="margin:0 0 12px;">You have received a new message from the website contact form.</p>
                <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;">
                    <tr><td style="background:#f8fafc;font-weight:600;">Full name</td><td>${safeName}</td></tr>
                    <tr><td style="background:#f8fafc;font-weight:600;">Email</td><td>${email}</td></tr>
                    ${safeCompany ? `<tr><td style=\"background:#f8fafc;font-weight:600;\">Company</td><td>${safeCompany}</td></tr>` : ''}
                    ${safePhone ? `<tr><td style=\"background:#f8fafc;font-weight:600;\">Phone</td><td>${safePhone}</td></tr>` : ''}
                </table>
                <h3 style="margin:16px 0 6px;color:#1f4e5f;">Message</h3>
                <div style="white-space:pre-wrap; border:1px solid #e2e8f0; padding:12px; border-radius:8px;">${safeMessage}</div>
            </div>
        `;

        const mailOptions = {
            from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
            to: toAddress,
            replyTo: email,
            subject: `Website Contact: ${safeName}`,
            text: `New contact form submission\n\nName: ${safeName}\nEmail: ${email}\nCompany: ${safeCompany}\nPhone: ${safePhone}\n\nMessage:\n${safeMessage}`,
            html: htmlBody
        };

        await emailTransporter.sendMail(mailOptions);
        return res.json({ message: 'Message sent successfully' });
    } catch (error) {
        logger.error('Contact form email send error:', error);
        return res.status(500).json({ error: 'Failed to send message. Please try again later.' });
    }
});

// =================
// AZURE SPEECH & AI CONFIGURATION (EXISTING)
// =================

const AZURE_KEY = process.env.AZURE_SPEECH_KEY;
const REGION = process.env.AZURE_SPEECH_REGION;
const SPEECH_ENDPOINT = `https://${REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`;
const TTS_ENDPOINT = `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

// OpenAI Configuration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Helper function for OpenAI with retry logic
const callOpenAIWithRetry = async (messages, maxTokens = 300, temperature = 0.7, maxRetries = 2) => {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            logger.info(`OpenAI attempt ${attempt}/${maxRetries}`);
            const completion = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: messages,
                max_tokens: maxTokens,
                temperature: temperature
            });

            logger.info(`OpenAI attempt ${attempt} succeeded`);
            return completion;
        } catch (error) {
            logger.warn(`OpenAI attempt ${attempt} failed:`, error.message);
            lastError = error;

            if (attempt < maxRetries) {
                // Wait before retry (exponential backoff)
                const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
                logger.info(`Waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    logger.error(`All OpenAI attempts failed. Last error:`, lastError.message);
    throw lastError;
};

// Helper functions for assessment session management
const getOrCreateAssessmentSession = async (userId, sessionId) => {
    try {
        let session = await AssessmentSession.findOne({
            userId: userId,
            sessionId: sessionId
        });

        if (!session) {
            session = new AssessmentSession({
                userId: userId,
                sessionId: sessionId,
                temporaryData: {
                    jumbledQuestions: [],
                    currentJumbledIndex: 0,
                    currentStory: null,
                    currentQuestion: null,
                    currentComprehension: null,
                    currentFillBlanks: []
                }
            });
            await session.save();
        }

        return session;
    } catch (error) {
        logger.error('Error getting/creating assessment session:', error);
        throw error;
    }
};

const updateAssessmentSession = async (userId, sessionId, updates) => {
    try {
        let session = await AssessmentSession.findOneAndUpdate(
            { userId: userId, sessionId: sessionId },
            { $set: updates },
            { new: true, upsert: false }
        );

        // If session doesn't exist, create it first then apply updates
        if (!session) {
            session = await getOrCreateAssessmentSession(userId, sessionId);
            session = await AssessmentSession.findOneAndUpdate(
                { userId: userId, sessionId: sessionId },
                { $set: updates },
                { new: true, upsert: false }
            );
        }

        return session;
    } catch (error) {
        logger.error('Error updating assessment session:', error);
        throw error;
    }
};

const clearAssessmentSession = async (userId, sessionId) => {
    try {
        await AssessmentSession.findOneAndDelete({
            userId: userId,
            sessionId: sessionId
        });
    } catch (error) {
        logger.error('Error clearing assessment session:', error);
    }
};

// Clear detailed assessment results for a user
const clearDetailedResults = async (userId) => {
    try {
        const result = await DetailedResults.deleteMany({ userId: userId });
        logger.info(`Cleared ${result.deletedCount} detailed results for user ${userId}`);
    } catch (error) {
        logger.error('Error clearing detailed results:', error);
        throw error;
    }
};

// Save assessment scores to user
const saveAssessmentScores = async (userId, scores, incrementTestsTaken = false) => {
    try {
        const updateQuery = {
            $set: { assessmentScores: scores }
        };

        // Increment testsTaken if this is a completed test
        if (incrementTestsTaken) {
            updateQuery.$inc = { testsTaken: 1 };
        }

        await User.findByIdAndUpdate(userId, updateQuery);
    } catch (error) {
        logger.error('Error saving assessment scores:', error);
        throw error;
    }
};

// Save detailed assessment results
const saveDetailedResults = async (userId, assessmentType, score, detailedData) => {
    try {
        // Remove any existing detailed results for this assessment type
        await DetailedResults.deleteMany({ userId, assessmentType });

        // Save new detailed results
        const detailedResult = new DetailedResults({
            userId,
            assessmentType,
            score,
            ...detailedData
        });

        await detailedResult.save();
        logger.info(`Detailed results saved for ${assessmentType} assessment`);
    } catch (error) {
        logger.error('Error saving detailed assessment results:', error);
        throw error;
    }
};

// =================
// EXISTING ASSESSMENT ROUTES (NOW PROTECTED)
// =================

// Generate 5 sentences for reading assessment and store them in session
app.post('/api/reading/generate-sentence', requireAuth, async (req, res) => {
    try {
        // Get or create assessment session
        const sessionId = req.session.id;
        await getOrCreateAssessmentSession(req.user._id, sessionId);

        // Extract topic and difficulty from request body
        const { topic, difficulty } = req.body;
        const selectedTopic = topic || 'general topics';
        const selectedDifficulty = difficulty || 'intermediate';

        logger.info(`Generating reading sentences with topic: ${selectedTopic}, difficulty: ${selectedDifficulty}`);

        let completion;
        try {
            // Create enhanced prompt with topic and difficulty context
            const systemPrompt = `You are a helpful assistant that generates simple, clear English sentences for pronunciation practice. Generate sentences that are 8-20 words long, appropriate for English learners, and focus on common vocabulary and clear pronunciation patterns. 

Topic focus: ${selectedTopic}
Difficulty level: ${selectedDifficulty}

For ${selectedDifficulty} level:
- Beginner: Use simple vocabulary, basic sentence structures, present tense focus
- Intermediate: Use moderate vocabulary, varied sentence structures, multiple tenses
- Advanced: Use sophisticated vocabulary, complex sentence structures, advanced grammar`;

            const userPrompt = `Generate 5 different English sentences for pronunciation practice focused on "${selectedTopic}" at ${selectedDifficulty} difficulty level. Each sentence should be meaningful, appropriate for the topic, and match the difficulty level. Return them as a JSON array of strings, with each sentence as a separate string in the array. Example: ["sentence 1", "sentence 2", "sentence 3", "sentence 4", "sentence 5"]`;

            // Try OpenAI with retry logic
            completion = await callOpenAIWithRetry([
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ], 300, 0.7);
        } catch (error) {
            logger.warn('All OpenAI attempts failed, using fallback sentences...');
            // Skip to fallback sentences - no DeepSeek
        }

        let sentences;
        try {
            const content = completion.choices[0].message.content.trim();
            sentences = JSON.parse(content);
            if (!Array.isArray(sentences) || sentences.length !== 5) {
                throw new Error('Invalid sentences format');
            }
        } catch (parseError) {
            logger.info('Failed to parse AI response, using fallback sentences');
            // Fallback sentences if parsing fails
            const fallbackSentences = [
                "The quick brown fox jumps over the lazy dog every morning.",
                "Learning English pronunciation takes practice and patience every day.",
                "She sells beautiful seashells by the peaceful seashore.",
                "The weather is absolutely beautiful and sunny today.",
                "I love reading interesting books in my free time.",
                "Please speak clearly and slowly for better understanding.",
                "The cat is sleeping peacefully on the warm windowsill.",
                "We are going to the park tomorrow morning.",
                "Technology has changed the way we communicate with each other.",
                "Fresh vegetables and fruits are important for good health."
            ];
            // Shuffle and take 5 random sentences
            const shuffled = fallbackSentences.sort(() => 0.5 - Math.random());
            sentences = shuffled.slice(0, 5);
        }

        // Store sentences in session and reset index and accumulated results, including topic and difficulty
        await updateAssessmentSession(req.user._id, sessionId, {
            'temporaryData.readingSentences': sentences,
            'temporaryData.currentReadingIndex': 0,
            'temporaryData.readingResults': [],
            'temporaryData.selectedTopics.reading': selectedTopic,
            'temporaryData.selectedDifficulties.reading': selectedDifficulty
        });

        // Return the first sentence with topic and difficulty info
        res.json({
            sentence: sentences[0],
            currentIndex: 1,
            totalSentences: 5,
            topic: selectedTopic,
            difficulty: selectedDifficulty
        });
    } catch (error) {
        logger.error('LLM API error:', error.message);
        // Ultimate fallback
        const fallbackSentences = [
            "The quick brown fox jumps over the lazy dog every morning.",
            "Learning English pronunciation takes practice and patience every day.",
            "She sells beautiful seashells by the peaceful seashore.",
            "The weather is absolutely beautiful and sunny today.",
            "I love reading interesting books in my free time."
        ];

        const sessionId = req.session.id;
        const selectedTopic = req.body.topic || 'general topics';
        const selectedDifficulty = req.body.difficulty || 'intermediate';

        await updateAssessmentSession(req.user._id, sessionId, {
            'temporaryData.readingSentences': fallbackSentences,
            'temporaryData.currentReadingIndex': 0,
            'temporaryData.readingResults': [],
            'temporaryData.selectedTopics.reading': selectedTopic,
            'temporaryData.selectedDifficulties.reading': selectedDifficulty
        });

        res.json({
            sentence: fallbackSentences[0],
            currentIndex: 1,
            totalSentences: 5,
            topic: selectedTopic,
            difficulty: selectedDifficulty
        });
    }
});

// Get next reading sentence from stored session
app.post('/api/reading/get-next-sentence', requireAuth, async (req, res) => {
    try {
        const sessionId = req.session.id;
        const session = await getOrCreateAssessmentSession(req.user._id, sessionId);

        const sentences = session.temporaryData.readingSentences || [];
        const currentIndex = session.temporaryData.currentReadingIndex || 0;
        const nextIndex = currentIndex + 1;

        if (nextIndex >= sentences.length) {
            return res.json({
                complete: true,
                message: 'All reading sentences completed'
            });
        }

        // Update index in session
        await updateAssessmentSession(req.user._id, sessionId, {
            'temporaryData.currentReadingIndex': nextIndex
        });

        res.json({
            sentence: sentences[nextIndex],
            currentIndex: nextIndex + 1,
            totalSentences: sentences.length,
            complete: false
        });

    } catch (error) {
        logger.error('Error getting next reading sentence:', error);
        res.status(500).json({ error: 'Failed to get next sentence' });
    }
});

// Store pronunciation results (called from frontend)
app.post('/api/reading/store-result', requireAuth, async (req, res) => {
    const { result, referenceText } = req.body;

    if (!result || !referenceText) {
        return res.status(400).json({ error: 'Result and reference text are required' });
    }

    try {
        const sessionId = req.session.id;
        const session = await getOrCreateAssessmentSession(req.user._id, sessionId);

        const pronunciationScore = result.pronunciationScore || 0;
        const currentReadingIndex = session.temporaryData.currentReadingIndex || 0;
        const totalSentences = session.temporaryData.readingSentences?.length || 5;

        // Store individual sentence result
        const sentenceResult = {
            sentenceIndex: currentReadingIndex + 1,
            pronunciationScore: result.pronunciationScore || 0,
            accuracyScore: result.accuracyScore || 0,
            fluencyScore: result.fluencyScore || 0,
            completenessScore: result.completenessScore || 0,
            prosodyScore: result.prosodyScore || 0,
            recognizedText: result.recognizedText || '',
            referenceText: referenceText
        };

        // Add to accumulated results
        const currentResults = session.temporaryData.readingResults || [];
        currentResults.push(sentenceResult);

        // Update session with new result
        await updateAssessmentSession(req.user._id, sessionId, {
            'temporaryData.readingResults': currentResults
        });

        // Check if this is the last sentence
        if (currentReadingIndex >= totalSentences - 1) {
            // Calculate average scores from all sentences
            const avgPronunciation = Math.round(currentResults.reduce((sum, r) => sum + r.pronunciationScore, 0) / currentResults.length);
            const avgAccuracy = Math.round(currentResults.reduce((sum, r) => sum + r.accuracyScore, 0) / currentResults.length);
            const avgFluency = Math.round(currentResults.reduce((sum, r) => sum + r.fluencyScore, 0) / currentResults.length);
            const avgCompleteness = Math.round(currentResults.reduce((sum, r) => sum + r.completenessScore, 0) / currentResults.length);
            const avgProsody = Math.round(currentResults.reduce((sum, r) => sum + r.prosodyScore, 0) / currentResults.length);

            // Update user's assessment scores with average
            const currentScores = { ...req.user.assessmentScores };
            currentScores.readingAbility = avgPronunciation;
            await saveAssessmentScores(req.user._id, currentScores);

            // Save detailed results with all sentences
            await saveDetailedResults(req.user._id, 'reading', avgPronunciation, {
                pronunciationData: {
                    pronunciationScore: avgPronunciation,
                    accuracyScore: avgAccuracy,
                    fluencyScore: avgFluency,
                    completenessScore: avgCompleteness,
                    prosodyScore: avgProsody,
                    recognizedText: currentResults.map(r => r.recognizedText).join(' | '),
                    referenceText: currentResults.map(r => r.referenceText).join(' | '),
                    sentences: currentResults
                }
            });

            // Mark assessment as complete
            await updateAssessmentSession(req.user._id, sessionId, {
                'assessmentProgress.reading': true
            });

            logger.info('Reading assessment completed with all sentences:', currentResults.length);
        }

        res.json({
            success: true,
            score: pronunciationScore
        });
    } catch (error) {
        logger.error('Error storing reading result:', error);
        res.status(500).json({ error: 'Failed to store result' });
    }
});

// =================
// LISTENING ABILITY ASSESSMENT
// =================

// Generate 5 sentences and TTS for listening assessment and store them in session
app.post('/api/listening/generate', requireAuth, async (req, res) => {
    try {
        // Get topic and difficulty from request body
        const { topic, difficulty } = req.body;

        // Default values if not provided
        const selectedTopic = topic || 'general conversation';
        const selectedDifficulty = difficulty || 'intermediate';

        logger.info(`Generating listening content with topic: ${selectedTopic}, difficulty: ${selectedDifficulty}`);

        // Get or create assessment session
        const sessionId = req.session.id;
        await getOrCreateAssessmentSession(req.user._id, sessionId);

        // Create enhanced prompts with topic and difficulty context
        const systemPrompt = `You are a helpful assistant that generates English sentences for listening and pronunciation practice. Generate sentences that are 8-20 words long, appropriate for English learners at ${selectedDifficulty} level. Focus on the topic: ${selectedTopic}. Make sentences clear, natural, and contextually relevant to the topic.`;

        const userPrompt = `Generate 5 different English sentences for listening practice about "${selectedTopic}" at ${selectedDifficulty} difficulty level. Each sentence should be meaningful, clear, and related to the topic. Return them as a JSON array of strings, with each sentence as a separate string in the array. Example: ["sentence 1", "sentence 2", "sentence 3", "sentence 4", "sentence 5"]`;

        let completion;
        try {
            // Try OpenAI with retry logic
            completion = await callOpenAIWithRetry([
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ], 300, 0.7);
        } catch (error) {
            logger.warn('All OpenAI attempts failed for listening, using fallback sentences...');
            // Skip to fallback sentences - no DeepSeek
        }

        let sentences;
        try {
            const content = completion.choices[0].message.content.trim();
            sentences = JSON.parse(content);
            if (!Array.isArray(sentences) || sentences.length !== 5) {
                throw new Error('Invalid sentences format');
            }
        } catch (parseError) {
            logger.info('Failed to parse AI response, using fallback sentences');
            // Fallback sentences if parsing fails
            const fallbackSentences = [
                "The sun is shining brightly in the clear blue sky.",
                "Children are playing happily in the neighborhood park.",
                "My grandmother makes the best chocolate chip cookies.",
                "The library is open from nine to five on weekdays.",
                "Students study hard to prepare for their final exams.",
                "Technology has changed how we communicate with others.",
                "Fresh vegetables and fruits are essential for good health.",
                "The meeting will start at ten o'clock sharp.",
                "She enjoys reading mystery novels in her free time.",
                "The weather forecast predicts rain for tomorrow."
            ];
            // Shuffle and take 5 random sentences
            const shuffled = fallbackSentences.sort(() => 0.5 - Math.random());
            sentences = shuffled.slice(0, 5);
        }

        // Generate TTS audio for all sentences
        const sentencesWithAudio = [];

        for (let i = 0; i < sentences.length; i++) {
            const text = sentences[i];

            // Generate TTS audio
            const ssml = `
            <speak version='1.0' xml:lang='en-US'>
                <voice xml:lang='en-US' xml:gender='Female' name='en-US-JennyNeural'>
                    <prosody rate="medium" pitch="+0Hz">
                        ${text}
                    </prosody>
                </voice>
            </speak>
        `;

            const ttsResponse = await axios.post(TTS_ENDPOINT, ssml, {
                headers: {
                    'Ocp-Apim-Subscription-Key': AZURE_KEY,
                    'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
                },
                responseType: 'arraybuffer'
            });

            // Save the audio file to MongoDB
            const audioFileName = `listening_${Date.now()}_${i + 1}.mp3`;
            const fileId = await saveAudioToMongoDB(
                ttsResponse.data,
                audioFileName,
                req.user._id,
                'listening'
            );

            sentencesWithAudio.push({
                text: text,
                audioUrl: `/api/audio/${fileId}`
            });
        }

        // Store sentences in session and reset index and accumulated results, including topic and difficulty
        await updateAssessmentSession(req.user._id, sessionId, {
            'temporaryData.listeningSentences': sentencesWithAudio,
            'temporaryData.currentListeningIndex': 0,
            'temporaryData.listeningResults': [],
            'temporaryData.selectedTopics.listening': selectedTopic,
            'temporaryData.selectedDifficulties.listening': selectedDifficulty
        });

        // Return the first sentence with topic and difficulty
        res.json({
            text: sentencesWithAudio[0].text,
            audioUrl: sentencesWithAudio[0].audioUrl,
            currentIndex: 1,
            totalSentences: 5,
            topic: selectedTopic,
            difficulty: selectedDifficulty
        });

    } catch (error) {
        logger.error('Listening generation error:', error.message);
        res.status(500).json({ error: 'Failed to generate listening content' });
    }
});

// Get next listening sentence from stored session
app.post('/api/listening/get-next', requireAuth, async (req, res) => {
    try {
        const sessionId = req.session.id;
        const session = await getOrCreateAssessmentSession(req.user._id, sessionId);

        const sentences = session.temporaryData.listeningSentences || [];
        const currentIndex = session.temporaryData.currentListeningIndex || 0;
        const nextIndex = currentIndex + 1;

        if (nextIndex >= sentences.length) {
            return res.json({
                complete: true,
                message: 'All listening sentences completed'
            });
        }

        // Update index in session
        await updateAssessmentSession(req.user._id, sessionId, {
            'temporaryData.currentListeningIndex': nextIndex
        });

        res.json({
            text: sentences[nextIndex].text,
            audioUrl: sentences[nextIndex].audioUrl,
            currentIndex: nextIndex + 1,
            totalSentences: sentences.length,
            complete: false
        });

    } catch (error) {
        logger.error('Error getting next listening sentence:', error);
        res.status(500).json({ error: 'Failed to get next listening content' });
    }
});

// Store listening results (called from frontend)
app.post('/api/listening/store-result', requireAuth, async (req, res) => {
    const { result, referenceText } = req.body;

    if (!result || !referenceText) {
        return res.status(400).json({ error: 'Result and reference text are required' });
    }

    try {
        const sessionId = req.session.id;
        const session = await getOrCreateAssessmentSession(req.user._id, sessionId);

        const pronunciationScore = result.pronunciationScore || 0;
        const currentListeningIndex = session.temporaryData.currentListeningIndex || 0;
        const totalSentences = session.temporaryData.listeningSentences?.length || 5;

        // Store individual sentence result
        const sentenceResult = {
            sentenceIndex: currentListeningIndex + 1,
            pronunciationScore: result.pronunciationScore || 0,
            accuracyScore: result.accuracyScore || 0,
            fluencyScore: result.fluencyScore || 0,
            completenessScore: result.completenessScore || 0,
            prosodyScore: result.prosodyScore || 0,
            recognizedText: result.recognizedText || '',
            referenceText: referenceText
        };

        // Add to accumulated results
        const currentResults = session.temporaryData.listeningResults || [];
        currentResults.push(sentenceResult);

        // Update session with new result
        await updateAssessmentSession(req.user._id, sessionId, {
            'temporaryData.listeningResults': currentResults
        });

        // Check if this is the last sentence
        if (currentListeningIndex >= totalSentences - 1) {
            // Calculate average scores from all sentences
            const avgPronunciation = Math.round(currentResults.reduce((sum, r) => sum + r.pronunciationScore, 0) / currentResults.length);
            const avgAccuracy = Math.round(currentResults.reduce((sum, r) => sum + r.accuracyScore, 0) / currentResults.length);
            const avgFluency = Math.round(currentResults.reduce((sum, r) => sum + r.fluencyScore, 0) / currentResults.length);
            const avgCompleteness = Math.round(currentResults.reduce((sum, r) => sum + r.completenessScore, 0) / currentResults.length);
            const avgProsody = Math.round(currentResults.reduce((sum, r) => sum + r.prosodyScore, 0) / currentResults.length);

            // Update user's assessment scores with average
            const currentScores = { ...req.user.assessmentScores };
            currentScores.listeningAbility = avgPronunciation;
            await saveAssessmentScores(req.user._id, currentScores);

            // Save detailed results with all sentences
            await saveDetailedResults(req.user._id, 'listening', avgPronunciation, {
                pronunciationData: {
                    pronunciationScore: avgPronunciation,
                    accuracyScore: avgAccuracy,
                    fluencyScore: avgFluency,
                    completenessScore: avgCompleteness,
                    prosodyScore: avgProsody,
                    recognizedText: currentResults.map(r => r.recognizedText).join(' | '),
                    referenceText: currentResults.map(r => r.referenceText).join(' | '),
                    sentences: currentResults
                }
            });

            // This is the last sentence, mark assessment as complete and cleanup
            await updateAssessmentSession(req.user._id, sessionId, {
                'assessmentProgress.listening': true
            });

            // Cleanup audio files only after all sentences are completed
            await cleanupUserAudioFiles(req.user._id, 'listening');
            logger.info('All listening sentences completed - audio files cleaned up');
        } else {
            logger.info(`Listening sentence ${currentListeningIndex + 1}/${totalSentences} completed - keeping audio files`);
        }

        res.json({
            success: true,
            score: pronunciationScore
        });
    } catch (error) {
        logger.error('Error storing listening result:', error);
        res.status(500).json({ error: 'Failed to store result' });
    }
});

// Get Azure Speech token for frontend (secure approach)
app.get('/api/azure-config', azureConfigLimiter, requireAuth, async (req, res) => {
    try {
        // Generate a temporary token instead of exposing the API key
        const tokenResponse = await axios.post(
            `https://${REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
            null,
            {
                headers: {
                    'Ocp-Apim-Subscription-Key': AZURE_KEY,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        res.json({
            token: tokenResponse.data,
            region: REGION
        });
    } catch (error) {
        logger.error('Error generating Azure token:', error);
        res.status(500).json({ error: 'Failed to generate Azure token' });
    }
});

// =================
// STORY SUMMARIZATION ASSESSMENT
// =================

// Generate story and convert to audio
app.post('/api/story/generate', requireAuth, async (req, res) => {
    try {
        // Extract topic and difficulty from request body
        const { topic, difficulty } = req.body;

        // Default values if not provided
        const selectedTopic = topic || 'general stories';
        const selectedDifficulty = difficulty || 'intermediate';

        logger.info(`Generating story with topic: ${selectedTopic}, difficulty: ${selectedDifficulty}`);

        // Get or create assessment session
        const sessionId = req.session.id;
        const session = await getOrCreateAssessmentSession(req.user._id, sessionId);

        // Create difficulty-appropriate prompts
        const difficultyPrompts = {
            beginner: "Tell me a very simple short story suitable for a 3rd grader. Use basic vocabulary and simple sentences. Around 50-60 words.",
            intermediate: "Tell me a short story suitable for a 5th grader. Make it interesting but simple to understand and summarize. Around 60-80 words.",
            advanced: "Tell me a moderately complex short story suitable for a 7th grader. Use varied vocabulary and sentence structures. Around 80-100 words."
        };

        const userPrompt = `${difficultyPrompts[selectedDifficulty]} The story should be about: ${selectedTopic}`;

        let completion;
        let storyText;
        try {
            // Try OpenAI with retry logic
            completion = await callOpenAIWithRetry([
                {
                    role: "system",
                    content: `You are a storyteller that creates engaging short stories suitable for comprehension assessment. Create stories based on the specified topic and difficulty level. Stories should have a clear beginning, middle, and end, and be appropriate for the target difficulty level.`
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ], 150, 0.7);

            storyText = completion.choices[0].message.content.trim();
        } catch (error) {
            logger.warn('All OpenAI attempts failed for story, using fallback story...');
            // Fallback story
            const fallbackStories = [
                "Once upon a time, there was a young girl named Emma who loved to explore. One sunny morning, she discovered a hidden path in the forest behind her house. Following the path, she found a beautiful garden filled with colorful flowers and singing birds. In the center of the garden stood an old oak tree with a small door at its base. Emma knocked gently, and a friendly fairy appeared. The fairy thanked Emma for finding the secret garden and granted her one wish. Emma wished for all children to have access to books and education. The fairy smiled and promised to make it happen. From that day forward, Emma became known as the girl who brought knowledge to her community.",
                "Tom was a hardworking baker who owned a small shop in the village. Every morning, he would wake up before sunrise to prepare fresh bread and pastries for his customers. One day, a mysterious old woman entered his shop and asked for help. She had no money but was very hungry. Without hesitation, Tom gave her a warm loaf of bread and a cup of tea. The old woman smiled and revealed that she was actually a magical being testing people's kindness. As a reward for his generosity, she blessed his bakery. From that day on, Tom's bread became the most delicious in the entire region, and people traveled from far and wide to taste it.",
                "Sarah was a marine biologist who dedicated her life to protecting ocean creatures. During one of her research expeditions, she discovered that a group of dolphins was trapped in a polluted bay. The water was contaminated with plastic waste, making it dangerous for the dolphins to survive. Sarah immediately contacted environmental organizations and local authorities. Together, they organized a massive cleanup effort. Volunteers from around the world came to help remove the pollution and rescue the dolphins. After weeks of hard work, the bay was clean again, and the dolphins were safely relocated to cleaner waters. Sarah's dedication inspired many others to protect marine life."
            ];
            storyText = fallbackStories[Math.floor(Math.random() * fallbackStories.length)];
        }



        // Convert story to speech using Azure TTS
        const ssml = `
            <speak version='1.0' xml:lang='en-US'>
                <voice xml:lang='en-US' xml:gender='Female' name='en-US-JennyNeural'>
                    <prosody rate="medium" pitch="+0Hz">
                        ${storyText}
                    </prosody>
                </voice>
            </speak>
        `;

        const ttsResponse = await axios.post(TTS_ENDPOINT, ssml, {
            headers: {
                'Ocp-Apim-Subscription-Key': AZURE_KEY,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
            },
            responseType: 'arraybuffer'
        });

        // Save the audio file to MongoDB
        const audioFileName = `story_${Date.now()}.mp3`;
        const fileId = await saveAudioToMongoDB(
            ttsResponse.data,
            audioFileName,
            req.user._id,
            'story'
        );

        // Store story for evaluation in session
        await updateAssessmentSession(req.user._id, sessionId, {
            'temporaryData.currentStory': storyText
        });

        res.json({
            story: storyText,
            audioUrl: `/api/audio/${fileId}`,
            topic: selectedTopic,
            difficulty: selectedDifficulty
        });

    } catch (error) {
        logger.error('Story generation error:', error.message);
        res.status(500).json({ error: 'Failed to generate story and audio' });
    }
});

// Evaluate user's story summary
app.post('/api/story/evaluate', requireAuth, async (req, res) => {
    const { userSummary } = req.body;

    if (!userSummary) {
        return res.status(400).json({ error: 'Summary is missing' });
    }

    try {
        // Get the current story from session
        const sessionId = req.session.id;
        const session = await getOrCreateAssessmentSession(req.user._id, sessionId);
        const originalStory = session.temporaryData.currentStory;

        if (!originalStory) {
            return res.status(400).json({ error: 'No story found in session. Please generate a story first.' });
        }
        let completion;
        try {
            // Try OpenAI with retry logic
            completion = await callOpenAIWithRetry([
                {
                    role: "system",
                    content: "You are an assistant that evaluates a user's summary of a story. Provide a score out of 100 and detailed feedback focusing on completeness, accuracy, clarity, and understanding."
                },
                {
                    role: "user",
                    content: `Original Story:\n${originalStory}\n\nUser's Summary:\n${userSummary}\n\nEvaluate this summary and provide:\n1. A score out of 100\n2. Detailed feedback on what was good and what could be improved\n3. Assessment of key story elements captured\n\nFormat: Start with "SCORE: [number]/100" then provide detailed feedback.`
                }
            ], 300, 0.3);
        } catch (error) {
            logger.warn('All OpenAI attempts failed for story evaluation, using fallback scoring...');
            // Fallback scoring based on basic text analysis
            const summaryWords = userSummary.toLowerCase().split(/\s+/).filter(word => word.length > 2);
            const storyWords = originalStory.toLowerCase().split(/\s+/).filter(word => word.length > 2);

            // Simple keyword matching for basic scoring
            let matchCount = 0;
            summaryWords.forEach(word => {
                if (storyWords.includes(word)) matchCount++;
            });

            const score = Math.min(Math.max(Math.round((matchCount / Math.max(storyWords.length * 0.3, 1)) * 100), 30), 85);
            const feedback = `SCORE: ${score}/100\n\nYour summary captured some key elements of the story. ${score >= 70 ? 'Good job identifying the main points!' : 'Try to include more specific details from the story.'} Focus on the main characters, setting, and key events when summarizing.`;

            completion = { choices: [{ message: { content: feedback } }] };
        }

        const feedback = completion.choices[0].message.content;

        // Extract score from feedback
        const scoreMatch = feedback.match(/SCORE:\s*(\d+)/i);
        const score = scoreMatch ? parseInt(scoreMatch[1]) : 50;

        // Update user's assessment scores
        const currentScores = { ...req.user.assessmentScores };
        currentScores.storySummarization = score;

        // Save to user's database record
        await saveAssessmentScores(req.user._id, currentScores);

        // Save detailed results
        await saveDetailedResults(req.user._id, 'story', score, {
            aiEvaluation: {
                feedback: feedback,
                originalContent: originalStory,
                userResponse: userSummary
            }
        });

        // Update session progress
        await updateAssessmentSession(req.user._id, sessionId, {
            'assessmentProgress.story': true
        });

        // Cleanup audio files for completed story assessment
        await cleanupUserAudioFiles(req.user._id, 'story');

        res.json({
            score,
            feedback,
            originalStory
        });

    } catch (error) {
        logger.error('Story evaluation error:', error.message);
        res.status(500).json({ error: 'Failed to evaluate story summary' });
    }
});

// =================
// PERSONAL QUESTIONS ASSESSMENT  
// =================

// Generate interview question
app.post('/api/personal/generate-question', requireAuth, async (req, res) => {
    try {
        const { difficulty, category } = req.body;

        const prompt = `Generate a realistic tech company communication assessment question for a job interview.

PARAMETERS:
- Difficulty: ${difficulty || 'Medium'}
- Category: ${category || 'General'}

REQUIREMENTS:
1. The question must be realistic and commonly asked in tech interviews
2. It should test communication skills, not just technical knowledge
3. The candidate should be able to answer in 30-90 seconds
4. Include behavioral, situational, or explanation-based questions
5. Make it challenging but fair

CATEGORIES include:
- Technical Communication: Explain complex concepts simply
- Problem Solving: Describe how you approach problems
- Teamwork: Collaboration and conflict resolution
- Leadership: Leading projects or teams
- Failure/Learning: Learning from mistakes
- Innovation: Creative thinking and solutions

Return ONLY the question, nothing else. Make it sound natural and conversational like a real interviewer would ask.`;

        let completion;
        let question;
        try {
            // Try OpenAI with retry logic
            completion = await callOpenAIWithRetry([
                {
                    role: "system",
                    content: "You are a senior tech recruiter conducting communication assessments. Generate realistic, challenging interview questions that test a candidate's ability to communicate effectively."
                },
                {
                    role: "user",
                    content: prompt
                }
            ], 200, 0.8);

            question = completion.choices[0].message.content.trim();
        } catch (error) {
            logger.warn('All OpenAI attempts failed for personal question, using fallback question...');
            // Fallback questions
            const fallbackQuestions = [
                "Tell me about a time when you had to explain a complex technical concept to someone without a technical background. How did you approach it?",
                "Describe a challenging project you worked on. What obstacles did you face and how did you overcome them?",
                "Can you walk me through your problem-solving process when you encounter a difficult technical issue?",
                "Tell me about a time when you disagreed with a team member or colleague. How did you handle the situation?",
                "Describe a situation where you had to learn a new technology or skill quickly. How did you approach the learning process?",
                "Tell me about a time when you made a mistake in your work. How did you handle it and what did you learn?",
                "How do you stay updated with the latest trends and technologies in your field?",
                "Describe a time when you had to work under pressure or tight deadlines. How did you manage your time and priorities?",
                "Tell me about a project where you had to collaborate with people from different departments or backgrounds.",
                "What motivates you in your work, and how do you maintain that motivation during challenging times?"
            ];
            question = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
        }



        // Store current question for evaluation in session
        const sessionId = req.session.id;
        await updateAssessmentSession(req.user._id, sessionId, {
            'temporaryData.currentQuestion': question
        });

        res.json({
            success: true,
            question: question,
            difficulty: difficulty || 'Medium',
            category: category || 'General',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Personal question generation error:', error.message);
        res.status(500).json({
            error: 'Failed to generate question',
            details: error.message
        });
    }
});

// Store personal assessment results and get AI feedback  
app.post('/api/personal/evaluate', requireAuth, async (req, res) => {
    try {
        const { spokenResponse, azureResults } = req.body;

        if (!spokenResponse) {
            return res.status(400).json({
                error: 'Response is missing'
            });
        }

        // Get the current question from session
        const sessionId = req.session.id;
        const session = await getOrCreateAssessmentSession(req.user._id, sessionId);
        const question = session.temporaryData.currentQuestion;

        if (!question) {
            return res.status(400).json({
                error: 'No question found in session. Please generate a question first.'
            });
        }

        // Create assessment prompt
        const prompt = `You are a senior tech interviewer conducting a communication assessment. Be HONEST and CONSTRUCTIVE in your evaluation.

INTERVIEW QUESTION: "${question}"

CANDIDATE'S SPOKEN RESPONSE: "${spokenResponse}"

AZURE PRONUNCIATION ASSESSMENT DATA:
${JSON.stringify(azureResults, null, 2)}

EVALUATION CRITERIA:
1. Content Quality (40%): Did they answer the question completely? Was the response logical and well-structured?
2. Communication Clarity (30%): Was the message clear and easy to follow? Good use of examples?
3. Pronunciation & Speech (20%): Based on Azure data - pronunciation accuracy, fluency, prosody
4. Professional Delivery (10%): Confidence, pace, filler words, professionalism

PROVIDE FEEDBACK IN THIS FORMAT:

**OVERALL SCORE: [X/100]**

**CONTENT ANALYSIS:**
- [Assessment of their answer quality]
- [What they covered well, what was missing]

**COMMUNICATION EFFECTIVENESS:**
- [Feedback on clarity, structure, examples]
- [Points about organization and flow]

**SPEECH & PRONUNCIATION (Based on Azure Data):**
- [Specific feedback based on pronunciation scores]
- [Speech quality and clarity observations]

**AREAS FOR IMPROVEMENT:**
1. [Specific area] - [Improvement suggestion]
2. [Specific area] - [Improvement suggestion]
3. [Specific area] - [Improvement suggestion]

**STRENGTHS:**
- [What they did well]
- [Positive aspects to continue]

**FINAL ASSESSMENT:**
[One paragraph summary of overall performance and potential]

Be constructive but honest to help them improve.`;

        let completion;
        let feedback;
        try {
            // Try OpenAI with retry logic
            completion = await callOpenAIWithRetry([
                {
                    role: "system",
                    content: "You are a senior tech company interviewer providing constructive feedback on communication assessments. Your feedback helps candidates improve through honest, detailed assessment."
                },
                {
                    role: "user",
                    content: prompt
                }
            ], 1500, 0.3);

            feedback = completion.choices[0].message.content;
        } catch (error) {
            logger.warn('All OpenAI attempts failed for personal evaluation, using fallback feedback...');
            // Fallback feedback based on basic analysis
            const responseLength = spokenResponse.split(' ').length;
            const speechScore = azureResults.pronunciationScore || 60;

            let lengthFeedback = responseLength < 20 ? "Your response was quite brief. Try to provide more detailed examples and explanations." :
                responseLength > 100 ? "Your response was comprehensive. Good job providing detailed information." :
                    "Your response length was appropriate for the question.";

            let speechFeedback = speechScore >= 80 ? "Your pronunciation and speech clarity were excellent." :
                speechScore >= 60 ? "Your pronunciation was generally clear with room for minor improvements." :
                    "Focus on speaking more clearly and at a steady pace.";

            feedback = `OVERALL SCORE: ${Math.min(Math.max(Math.round((responseLength * 2) + (speechScore * 0.5)), 40), 85)}/100

**CONTENT ANALYSIS:**
${lengthFeedback} Your response addressed the question and showed good communication effort.

**COMMUNICATION EFFECTIVENESS:**
You demonstrated the ability to structure your thoughts and communicate your ideas. Continue practicing to improve fluency and confidence.

**SPEECH & PRONUNCIATION:**
${speechFeedback}

**AREAS FOR IMPROVEMENT:**
1. Practice speaking with more confidence and clarity
2. Use specific examples to support your points
3. Work on maintaining steady pace and tone

**STRENGTHS:**
- Attempted to answer the question thoroughly
- Showed willingness to communicate

**FINAL ASSESSMENT:**
You demonstrated basic communication skills with room for improvement in clarity and confidence. Keep practicing to enhance your interview performance.`;
        }

        // Extract score from feedback
        const scoreMatch = feedback.match(/OVERALL SCORE:\s*(\d+)/i);
        let score = scoreMatch ? parseInt(scoreMatch[1]) : 50;

        // Also factor in Azure speech score
        const speechScore = azureResults.pronunciationScore || 0;
        score = Math.round((score * 0.8) + (speechScore * 0.2)); // Weight content 80%, speech 20%

        // Update user's assessment scores
        const currentScores = { ...req.user.assessmentScores };
        currentScores.personalQuestions = score;

        // Save to user's database record
        await saveAssessmentScores(req.user._id, currentScores);

        // Save detailed results
        await saveDetailedResults(req.user._id, 'personal', score, {
            pronunciationData: {
                pronunciationScore: azureResults.pronunciationScore || 0,
                accuracyScore: azureResults.accuracyScore || 0,
                fluencyScore: azureResults.fluencyScore || 0,
                completenessScore: azureResults.completenessScore || 0,
                prosodyScore: azureResults.prosodyScore || 0,
                recognizedText: azureResults.recognizedText || '',
                referenceText: ''
            },
            aiEvaluation: {
                feedback: feedback,
                originalContent: question,
                userResponse: spokenResponse
            }
        });

        // Update session progress
        await updateAssessmentSession(req.user._id, sessionId, {
            'assessmentProgress.personal': true
        });

        res.json({
            success: true,
            score,
            feedback,
            model: "gpt-4",
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Personal assessment error:', error.message);
        res.status(500).json({
            error: 'Failed to get assessment feedback',
            details: error.message
        });
    }
});

// =================
// READING COMPREHENSION ASSESSMENT  
// =================

// Generate reading comprehension content
app.post('/api/comprehension/generate', requireAuth, async (req, res) => {
    try {
        const { topic, difficulty } = req.body;

        const prompt = `Generate a reading comprehension exercise with the following specifications:
    
Topic: ${topic || 'technology'}
Difficulty: ${difficulty || 'intermediate'}

Please provide:
1. A reading passage (200-350 words)
2. 5 multiple choice questions based on the passage
3. Each question should have 4 options (A, B, C, D)
4. Include the correct answer for each question

Format your response as a JSON object with this exact structure:
{
  "passage": "The reading passage text here...",
  "questions": [
    {
      "question": "Question text here?",
      "options": {
        "A": "Option A text",
        "B": "Option B text", 
        "C": "Option C text",
        "D": "Option D text"
      },
      "correct_answer": "A"
    }
  ]
}

Make sure the passage is engaging and the questions test different comprehension skills like main idea, details, inference, and vocabulary.`;

        let completion;
        let content;
        try {
            // Try OpenAI with retry logic
            completion = await callOpenAIWithRetry([
                {
                    role: "system",
                    content: "You are an expert educational content creator specializing in reading comprehension materials. Always respond with valid JSON format."
                },
                {
                    role: "user",
                    content: prompt
                }
            ], 1500, 0.7);

            content = completion.choices[0].message.content;
        } catch (error) {
            logger.warn('All OpenAI attempts failed for reading comprehension, using fallback content...');
            // Fallback comprehension content
            const fallbackContent = {
                passage: "Technology has revolutionized the way we communicate and work in the modern world. From smartphones to cloud computing, digital innovations have transformed nearly every aspect of our daily lives. Social media platforms connect people across continents, while video conferencing tools enable remote collaboration. However, this rapid technological advancement also brings challenges such as privacy concerns, digital addiction, and the need for continuous learning to keep up with new developments. As we move forward, it's important to balance the benefits of technology with mindful usage and consideration of its impact on society.",
                questions: [
                    {
                        question: "What is the main topic of this passage?",
                        options: {
                            A: "The history of smartphones",
                            B: "Technology's impact on modern life",
                            C: "Social media platforms",
                            D: "Privacy concerns online"
                        },
                        correct: "B"
                    },
                    {
                        question: "According to the passage, what enables remote collaboration?",
                        options: {
                            A: "Social media platforms",
                            B: "Smartphones",
                            C: "Video conferencing tools",
                            D: "Cloud computing"
                        },
                        correct: "C"
                    },
                    {
                        question: "What challenge is mentioned regarding technological advancement?",
                        options: {
                            A: "High costs",
                            B: "Limited availability",
                            C: "Privacy concerns",
                            D: "Slow internet speeds"
                        },
                        correct: "C"
                    },
                    {
                        question: "What does the passage suggest about using technology?",
                        options: {
                            A: "It should be avoided completely",
                            B: "It requires mindful and balanced usage",
                            C: "It's only useful for work",
                            D: "It's too complicated for most people"
                        },
                        correct: "B"
                    }
                ]
            };
            content = JSON.stringify(fallbackContent);
        }

        // Parse the JSON response
        let comprehensionData;
        try {
            comprehensionData = JSON.parse(content);
        } catch (parseError) {
            logger.error('Error parsing AI response:', parseError);
            throw new Error('Failed to parse AI response as JSON');
        }

        // Store comprehension data for evaluation in session
        const sessionId = req.session.id;
        await updateAssessmentSession(req.user._id, sessionId, {
            'temporaryData.currentComprehension': comprehensionData
        });

        res.json({
            success: true,
            topic: topic || 'technology',
            difficulty: difficulty || 'intermediate',
            passage: comprehensionData.passage,
            questions: comprehensionData.questions,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Reading comprehension generation error:', error.message);
        res.status(500).json({ error: 'Failed to generate reading comprehension content' });
    }
});

// Evaluate comprehension quiz answers
app.post('/api/comprehension/evaluate', requireAuth, async (req, res) => {
    try {
        const { userAnswers } = req.body;

        if (!userAnswers) {
            return res.status(400).json({
                error: 'Answers are missing'
            });
        }

        // Get comprehension data from session
        const sessionId = req.session.id;
        const session = await getOrCreateAssessmentSession(req.user._id, sessionId);
        const comprehensionData = session.temporaryData.currentComprehension;

        if (!comprehensionData) {
            return res.status(400).json({
                error: 'No comprehension data found in session. Please generate content first.'
            });
        }

        // Calculate score
        let correctAnswers = 0;
        const totalQuestions = comprehensionData.questions.length;
        const results = [];

        comprehensionData.questions.forEach((question, index) => {
            const userAnswer = userAnswers[index];
            const correctAnswer = question.correct_answer;
            const isCorrect = userAnswer === correctAnswer;

            if (isCorrect) {
                correctAnswers++;
            }

            results.push({
                questionIndex: index + 1,
                question: question.question,
                userAnswer,
                correctAnswer,
                isCorrect,
                options: question.options
            });
        });

        const score = Math.round((correctAnswers / totalQuestions) * 100);

        // Update user's assessment scores
        const currentScores = { ...req.user.assessmentScores };
        currentScores.readingComprehension = score;

        // Save to user's database record
        await saveAssessmentScores(req.user._id, currentScores);

        // Process results for detailed storage - fix options format
        const processedResults = results.map(result => ({
            ...result,
            options: Array.isArray(result.options) ? result.options :
                (result.options ? Object.values(result.options) : [])
        }));

        // Save detailed results
        await saveDetailedResults(req.user._id, 'comprehension', score, {
            answerComparison: {
                questions: processedResults,
                passageText: comprehensionData.passage
            }
        });

        // Update session progress
        await updateAssessmentSession(req.user._id, sessionId, {
            'assessmentProgress.comprehension': true
        });

        res.json({
            success: true,
            score,
            correctAnswers,
            totalQuestions,
            percentage: score,
            results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Reading comprehension evaluation error:', error.message);
        res.status(500).json({ error: 'Failed to evaluate reading comprehension quiz' });
    }
});

// =================
// FILL IN THE BLANKS ASSESSMENT  
// =================

// Generate fill-in-the-blanks questions
app.post('/api/fillblanks/generate', requireAuth, async (req, res) => {
    try {
        const { topic, difficulty } = req.body;

        // Default values if not provided
        const selectedTopic = topic || 'Grammar patterns';
        const selectedDifficulty = difficulty || 'intermediate';

        logger.info(`🎯 Fill-in-the-blanks API: Generating questions with topic "${selectedTopic}" and difficulty "${selectedDifficulty}"`);
        logger.info(`📝 Received parameters - topic: ${topic ? `"${topic}"` : 'undefined (using default)'}, difficulty: ${difficulty ? `"${difficulty}"` : 'undefined (using default)'}`);

        const prompt = `Generate 10 grammar-based fill-in-the-blanks questions suitable for a communication assessment. Focus on the topic "${selectedTopic}" with ${selectedDifficulty} difficulty level. The questions should cover topics like verb forms, tenses, articles, and prepositions. For each question, provide 3 options and the correct answer.

Format your response as a JSON object with this exact structure:
{
  "questions": [
    {
      "question": "The sentence with a _____ that needs to be filled.",
      "options": ["Option1", "Option2", "Option3"],
      "correctAnswer": "Option1"
    }
  ]
}

Make sure to include a variety of grammar concepts appropriate for the topic "${selectedTopic}" and ${selectedDifficulty} difficulty:
- Verb tenses (past, present, future)
- Articles (a, an, the)
- Prepositions (in, on, at, for, with, etc.)
- Subject-verb agreement
- Modal verbs (can, could, should, would, etc.)
- Comparative and superlative forms
- Pronouns and possessives

For ${selectedDifficulty} difficulty:
- Beginner: Use simple vocabulary and basic grammar structures
- Intermediate: Use moderate vocabulary and mixed grammar concepts
- Advanced: Use complex vocabulary and sophisticated grammar patterns

Each question should test a clear grammar rule and have one obviously correct answer. Tailor the content and vocabulary to match the "${selectedTopic}" theme.`;

        let completion;
        let content;
        try {
            // Try OpenAI with retry logic
            completion = await callOpenAIWithRetry([
                {
                    role: "system",
                    content: "You are an expert grammar instructor creating fill-in-the-blanks exercises. Always respond with valid JSON format."
                },
                {
                    role: "user",
                    content: prompt
                }
            ], 1500, 0.7);

            content = completion.choices[0].message.content;
        } catch (error) {
            logger.warn('All OpenAI attempts failed for fill in blanks, using fallback questions...');
            // Fallback fill-in-the-blanks questions
            const fallbackQuestions = {
                questions: [
                    {
                        question: "She _____ to the store every morning.",
                        options: ["go", "goes", "going"],
                        correctAnswer: "goes"
                    },
                    {
                        question: "The book is _____ the table.",
                        options: ["in", "on", "at"],
                        correctAnswer: "on"
                    },
                    {
                        question: "I have _____ apple in my bag.",
                        options: ["a", "an", "the"],
                        correctAnswer: "an"
                    },
                    {
                        question: "They _____ finished their homework yesterday.",
                        options: ["have", "has", "had"],
                        correctAnswer: "had"
                    },
                    {
                        question: "This is _____ interesting movie I've ever seen.",
                        options: ["more", "most", "the most"],
                        correctAnswer: "the most"
                    },
                    {
                        question: "Can you help me _____ this problem?",
                        options: ["with", "for", "about"],
                        correctAnswer: "with"
                    },
                    {
                        question: "She speaks English _____ than her brother.",
                        options: ["good", "better", "best"],
                        correctAnswer: "better"
                    },
                    {
                        question: "We _____ going to the park tomorrow.",
                        options: ["is", "are", "am"],
                        correctAnswer: "are"
                    },
                    {
                        question: "The children _____ playing in the garden.",
                        options: ["is", "are", "was"],
                        correctAnswer: "are"
                    },
                    {
                        question: "I _____ like to have some coffee, please.",
                        options: ["will", "would", "should"],
                        correctAnswer: "would"
                    }
                ]
            };
            content = JSON.stringify(fallbackQuestions);
        }

        // Parse the JSON response
        let questionsData;
        try {
            questionsData = JSON.parse(content);
        } catch (parseError) {
            logger.error('Error parsing AI response:', parseError);
            throw new Error('Failed to parse AI response as JSON');
        }

        // Store questions for evaluation in session
        const sessionId = req.session.id;
        await updateAssessmentSession(req.user._id, sessionId, {
            'temporaryData.currentFillBlanks': questionsData.questions
        });

        logger.info(`✅ Fill-in-the-blanks: Successfully generated ${questionsData.questions.length} questions for topic "${selectedTopic}" with difficulty "${selectedDifficulty}"`);

        res.json({
            success: true,
            questions: questionsData.questions,
            topic: selectedTopic,
            difficulty: selectedDifficulty,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Fill in the blanks generation error:', error.message);
        res.status(500).json({ error: 'Failed to generate fill-in-the-blanks questions' });
    }
});

// Evaluate fill-in-the-blanks answers
app.post('/api/fillblanks/evaluate', requireAuth, async (req, res) => {
    try {
        const { userAnswers } = req.body;

        if (!userAnswers) {
            return res.status(400).json({
                error: 'Answers are missing'
            });
        }

        // Get questions from session
        const sessionId = req.session.id;
        const session = await getOrCreateAssessmentSession(req.user._id, sessionId);
        const questions = session.temporaryData.currentFillBlanks;

        if (!questions || questions.length === 0) {
            return res.status(400).json({
                error: 'No questions found in session. Please generate questions first.'
            });
        }

        // Calculate score
        let correctAnswers = 0;
        const totalQuestions = questions.length;
        const results = [];

        questions.forEach((question, index) => {
            const userAnswer = userAnswers[index];
            const correctAnswer = question.correctAnswer;
            const isCorrect = userAnswer === correctAnswer;

            if (isCorrect) {
                correctAnswers++;
            }

            results.push({
                questionIndex: index + 1,
                question: question.question,
                userAnswer,
                correctAnswer,
                isCorrect,
                options: question.options
            });
        });

        const score = Math.round((correctAnswers / totalQuestions) * 100);

        // Update user's assessment scores
        const currentScores = { ...req.user.assessmentScores };
        currentScores.fillInTheBlanks = score;

        // Save to user's database record
        await saveAssessmentScores(req.user._id, currentScores);

        // Process results for detailed storage - fix options format
        const processedResults = results.map(result => ({
            ...result,
            options: Array.isArray(result.options) ? result.options :
                (result.options ? Object.values(result.options) : [])
        }));

        // Save detailed results
        await saveDetailedResults(req.user._id, 'fillblanks', score, {
            answerComparison: {
                questions: processedResults
            }
        });

        // Update session progress
        await updateAssessmentSession(req.user._id, sessionId, {
            'assessmentProgress.fillblanks': true
        });

        res.json({
            success: true,
            score,
            correctAnswers,
            totalQuestions,
            percentage: score,
            results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Fill in the blanks evaluation error:', error.message);
        res.status(500).json({ error: 'Failed to evaluate fill-in-the-blanks quiz' });
    }
});

// =================
// JUMBLED SENTENCES ASSESSMENT
// =================

// Generate jumbled sentences
app.post('/api/jumbled/start', requireAuth, async (req, res) => {
    try {
        // Extract topic and difficulty from request body
        const { topic = 'general', difficulty = 'intermediate' } = req.body;

        logger.info(`Generating jumbled sentences with topic: ${topic}, difficulty: ${difficulty}`);

        // Create prompts to generate ORIGINAL sentences only (no jumbled output from the model)
        const systemPrompt = `You are an assistant for a communication assessment. Generate clear, natural English sentences about the topic at the requested difficulty.

Topic: ${topic}
Difficulty: ${difficulty}

Word/length guidance by difficulty:
- Beginner: 5-8 words; simple vocabulary
- Intermediate: 8-12 words; common vocabulary
- Advanced: 12-15 words; varied vocabulary

Strict formatting and punctuation rules:
- Do NOT use commas or semicolons in any sentence.
- Avoid other internal punctuation (e.g., colons, quotes, parentheses). If needed, you may only end a sentence with a period (.) or a question mark (?).

Return ONLY a valid JSON array of 5 sentences (strings). No explanations, no extra keys, no markdown.`;

        const userPrompt = `Generate 5 different English sentences about "${topic}" at ${difficulty} difficulty. Return a JSON array of 5 strings.`;

        let completion;
        let sentences;
        try {
            // Try OpenAI with retry logic
            completion = await callOpenAIWithRetry([
                {
                    role: "system",
                    content: systemPrompt
                },
                {
                    role: "user",
                    content: userPrompt
                }
            ], 500, 0.7);

            const content = completion.choices[0].message.content.trim();
            sentences = JSON.parse(content);
        } catch (error) {
            logger.warn('All OpenAI attempts failed for jumbled sentences, using fallback sentences...');
            // Fallback sentences
            const fallbackSentences = [
                "The sun shines brightly in the morning sky.",
                "Students study hard for their important exams.",
                "Children play happily in the school playground.",
                "The library opens at nine o'clock every day.",
                "Fresh vegetables are good for your health."
            ];
            sentences = fallbackSentences;
        }

        // Ensure exactly 5 sentences
        if (sentences.length > 5) {
            sentences = sentences.slice(0, 5);
        }

        // Build jumbled questions on the server, including punctuation tokens ('.' or '?') when present
        const questions = buildJumbledQuestionsFromSentences(sentences);

        // Reset jumbled sentences score at the start of assessment
        const currentScores = { ...req.user.assessmentScores };
        currentScores.jumbledSentences = 0;
        await saveAssessmentScores(req.user._id, currentScores);

        // Store questions and reset state in session, including topic and difficulty
        const sessionId = req.session.id;
        await updateAssessmentSession(req.user._id, sessionId, {
            'temporaryData.jumbledQuestions': questions,
            'temporaryData.currentJumbledIndex': 0,
            'temporaryData.jumbledAnswers': [], // Clear any previous answers
            'temporaryData.selectedTopics.jumbled': topic,
            'temporaryData.selectedDifficulties.jumbled': difficulty
        });

        if (questions.length > 0) {
            res.json({
                jumbled: questions[0].jumbled,
                totalQuestions: questions.length,
                currentQuestion: 1,
                topic: topic,
                difficulty: difficulty
            });
        } else {
            res.status(500).json({ error: "Failed to generate questions." });
        }

    } catch (error) {
        logger.error('Jumbled sentences generation error:', error.message);
        res.status(500).json({ error: 'Failed to generate jumbled sentences' });
    }
});

// Submit jumbled sentence answer
app.post('/api/jumbled/submit', requireAuth, async (req, res) => {
    try {
        const { answer } = req.body;

        // Get current session data
        const sessionId = req.session.id;
        const session = await getOrCreateAssessmentSession(req.user._id, sessionId);
        const questions = session.temporaryData.jumbledQuestions;
        const currentIndex = session.temporaryData.currentJumbledIndex || 0;

        if (!questions || questions.length === 0) {
            return res.status(400).json({ error: 'No questions found in session' });
        }

        const currentQuestion = questions[currentIndex];
        if (!currentQuestion) {
            return res.status(400).json({ error: 'No current question' });
        }

        // Simple scoring: check if answer matches original (case insensitive, trimmed)
        const isCorrect = answer.toLowerCase().trim() === currentQuestion.original.toLowerCase().trim();

        // Store this answer and result in session
        const currentAnswers = session.temporaryData.jumbledAnswers || [];
        currentAnswers.push({
            questionIndex: currentIndex + 1,
            question: currentQuestion.jumbled,
            userAnswer: answer.trim(),
            correctAnswer: currentQuestion.original,
            isCorrect: isCorrect
        });

        // Update session with new answer
        await updateAssessmentSession(req.user._id, sessionId, {
            'temporaryData.jumbledAnswers': currentAnswers
        });

        // Get current scores - don't update yet for individual questions
        const currentScores = { ...req.user.assessmentScores };

        const newIndex = currentIndex + 1;

        if (newIndex < questions.length) {
            // Next question
            const nextQuestion = questions[newIndex];

            // Update session with new index
            await updateAssessmentSession(req.user._id, sessionId, {
                'temporaryData.currentJumbledIndex': newIndex
            });

            // Save current score progress
            await saveAssessmentScores(req.user._id, currentScores);

            res.json({
                correct: isCorrect,
                correctAnswer: currentQuestion.original,
                nextJumbled: nextQuestion.jumbled,
                currentQuestion: newIndex + 1,
                totalQuestions: questions.length
            });
        } else {
            // Assessment complete - get stored answers from session
            const storedAnswers = session.temporaryData.jumbledAnswers || [];

            // Calculate final score based on all correct answers
            const correctCount = storedAnswers.filter(answer => answer.isCorrect).length;
            const finalScore = correctCount * 20; // 20 points per correct answer

            // Update final score
            currentScores.jumbledSentences = finalScore;

            // If we have stored answers, use them; otherwise create empty placeholders (shouldn't happen)
            let allResults;
            if (storedAnswers.length > 0) {
                allResults = storedAnswers.map(answer => ({
                    questionIndex: answer.questionIndex,
                    question: answer.question,
                    userAnswer: answer.userAnswer,
                    correctAnswer: answer.correctAnswer,
                    isCorrect: answer.isCorrect,
                    options: [] // Jumbled sentences don't have options, but keep consistent structure
                }));
            } else {
                // Fallback (shouldn't happen with new implementation)
                logger.warn('No stored jumbled answers found, creating empty placeholders');
                allResults = questions.map((question, index) => ({
                    questionIndex: index + 1,
                    question: question.jumbled,
                    userAnswer: 'Not recorded',
                    correctAnswer: question.original,
                    isCorrect: false,
                    options: []
                }));
            }

            await saveAssessmentScores(req.user._id, currentScores);

            // Save detailed results with actual user answers
            await saveDetailedResults(req.user._id, 'jumbled', finalScore, {
                answerComparison: {
                    questions: allResults
                }
            });

            // Update session progress
            await updateAssessmentSession(req.user._id, sessionId, {
                'assessmentProgress.jumbled': true
            });

            res.json({
                correct: isCorrect,
                correctAnswer: currentQuestion.original,
                complete: true,
                finalScore: finalScore
            });
        }
    } catch (error) {
        logger.error('Error in jumbled submit:', error);
        res.status(500).json({ error: 'Failed to process answer' });
    }
});

// =================
// OVERALL ASSESSMENT MANAGEMENT
// =================

// Get current assessment scores
app.get('/api/assessment/scores', requireAuth, async (req, res) => {
    try {
        // Get fresh user data with latest scores
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Calculate overall score (average of all assessments, treating unattempted as 0)
        const scores = user.assessmentScores;
        let totalScore = 0;
        let completedAssessments = 0;
        const totalAssessments = 7; // Total number of assessment types

        // Add all assessment scores, treating missing/0 scores as 0
        totalScore += (scores.readingAbility || 0);
        totalScore += (scores.listeningAbility || 0);
        totalScore += (scores.jumbledSentences || 0);
        totalScore += (scores.storySummarization || 0);
        totalScore += (scores.personalQuestions || 0);
        totalScore += (scores.readingComprehension || 0);
        totalScore += (scores.fillInTheBlanks || 0);

        // Count completed assessments for reporting
        if (scores.readingAbility > 0) completedAssessments++;
        if (scores.listeningAbility > 0) completedAssessments++;
        if (scores.jumbledSentences > 0) completedAssessments++;
        if (scores.storySummarization > 0) completedAssessments++;
        if (scores.personalQuestions > 0) completedAssessments++;
        if (scores.readingComprehension > 0) completedAssessments++;
        if (scores.fillInTheBlanks > 0) completedAssessments++;

        // Calculate overall score including unattempted sections as 0
        const overallScore = totalScore / totalAssessments;

        // Update overall score in database
        if (overallScore !== scores.overallScore) {
            await User.findByIdAndUpdate(req.user._id, {
                'assessmentScores.overallScore': overallScore
            });
        }

        res.json({
            ...scores,
            completedAssessments,
            overallScore
        });
    } catch (error) {
        logger.error('Error getting assessment scores:', error);
        res.status(500).json({ error: 'Failed to get assessment scores' });
    }
});

// Get detailed assessment results for individual sections
app.get('/api/assessment/detailed-results', requireAuth, async (req, res) => {
    try {
        // Get all detailed results for the user
        const detailedResults = await DetailedResults.find({ userId: req.user._id })
            .sort({ completedAt: 1 }); // Sort by completion time

        // Transform results into organized format
        const organizedResults = {};

        detailedResults.forEach(result => {
            organizedResults[result.assessmentType] = {
                assessmentType: result.assessmentType,
                score: result.score,
                completedAt: result.completedAt,
                pronunciationData: result.pronunciationData,
                aiEvaluation: result.aiEvaluation,
                answerComparison: result.answerComparison
            };
        });

        res.json(organizedResults);
    } catch (error) {
        logger.error('Error getting detailed assessment results:', error);
        res.status(500).json({ error: 'Failed to get detailed assessment results' });
    }
});

// Create new assessment session
app.post('/api/assessment/create-session', requireAuth, async (req, res) => {
    try {
        // Check if user has available tests
        if (req.user.number_of_tests <= 0) {
            return res.status(403).json({
                error: 'No tests available. Please contact administrator to get more tests.',
                code: 'NO_TESTS_AVAILABLE'
            });
        }

        const sessionId = req.session.id;

        // Clear any previous detailed results when starting a new assessment
        await clearDetailedResults(req.user._id);

        // Create or get existing assessment session
        const session = await getOrCreateAssessmentSession(req.user._id, sessionId);

        // Decrement the number of tests available and increment tests taken
        // Also record the assessment completion timestamp
        const currentUser = await User.findById(req.user._id);
        const newTestNumber = (currentUser.testsTaken || 0) + 1;
        
        await User.findByIdAndUpdate(req.user._id, {
            $inc: {
                number_of_tests: -1,
                testsTaken: 1
            },
            $set: {
                lastAssessmentCompletedAt: new Date()
            },
            $push: {
                tests_timestamps: {
                    timestamp: new Date(),
                    testNumber: newTestNumber
                }
            }
        });

        logger.info(`Assessment session created/retrieved for user ${req.user._id} (testsTaken incremented, tests remaining: ${req.user.number_of_tests - 1})`);

        res.json({
            success: true,
            message: 'Assessment session created successfully',
            sessionId: session.sessionId,
            testsRemaining: req.user.number_of_tests - 1
        });
    } catch (error) {
        logger.error('Error creating assessment session:', error);
        res.status(500).json({ error: 'Failed to create assessment session' });
    }
});

// Clear assessment session and detailed results (keep overall scores in user profile)
app.post('/api/assessment/clear-session', requireAuth, async (req, res) => {
    try {
        const sessionId = req.session.id;

        // Clear assessment session
        await clearAssessmentSession(req.user._id, sessionId);

        // Clear detailed results from previous assessments
        await clearDetailedResults(req.user._id);

        // Cleanup user's audio files
        await cleanupUserAudioFiles(req.user._id);

        logger.info(`Assessment session and detailed results cleared for user ${req.user._id}`);

        res.json({
            success: true,
            message: 'Assessment session and detailed results cleared successfully'
        });
    } catch (error) {
        logger.error('Error clearing assessment session:', error);
        res.status(500).json({ error: 'Failed to clear assessment session' });
    }
});

// Get consolidated critical feedback based on all assessment scores
app.get('/api/assessment/consolidated-feedback', requireAuth, async (req, res) => {
    try {
        // Get user with all scores
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get assessment session to check which assessments were actually completed
        const session = await AssessmentSession.findOne({ userId: req.user._id }).sort({ lastActivity: -1 });

        const scores = user.assessmentScores;

        // Determine which assessments were actually completed
        const completedAssessments = [];
        let assessmentScoresList = '';
        let completedCount = 0;

        // Check each assessment and only include if completed (either from session progress or DetailedResults)
        const assessmentChecks = [
            { key: 'reading', name: 'Reading Ability (Pronunciation)', score: scores.readingAbility },
            { key: 'listening', name: 'Listening Ability (Comprehension & Repetition)', score: scores.listeningAbility },
            { key: 'jumbled', name: 'Jumbled Sentences (Grammar & Construction)', score: scores.jumbledSentences },
            { key: 'story', name: 'Story Summarization (Comprehension & Storytelling)', score: scores.storySummarization },
            { key: 'personal', name: 'Personal Questions (Interview Skills)', score: scores.personalQuestions },
            { key: 'comprehension', name: 'Reading Comprehension (Text Analysis)', score: scores.readingComprehension },
            { key: 'fillblanks', name: 'Fill in the Blanks (Grammar Mastery)', score: scores.fillInTheBlanks }
        ];

        for (const assessment of assessmentChecks) {
            // Check if assessment was completed (either in session progress or has detailed results)
            const isCompleted = (session && session.assessmentProgress && session.assessmentProgress[assessment.key]) ||
                await DetailedResults.exists({ userId: req.user._id, assessmentType: assessment.key });

            if (isCompleted && assessment.score > 0) {
                assessmentScoresList += `- ${assessment.name}: ${assessment.score}/100\n`;
                completedAssessments.push(assessment.key);
                completedCount++;
            } else {
                assessmentScoresList += `- ${assessment.name}: Not Attempted\n`;
            }
        }

        // Calculate overall score including unattempted sections as 0
        let actualOverallScore = 0;
        let totalAllAssessments = 0;
        const totalAssessments = 7; // Total number of assessment types
        
        for (const assessment of assessmentChecks) {
            if (completedAssessments.includes(assessment.key)) {
                totalAllAssessments += assessment.score;
            }
            // Unattempted assessments contribute 0 to the total
        }
        actualOverallScore = Math.round(totalAllAssessments / totalAssessments);

        // Prepare the comprehensive analysis prompt
        const analysisPrompt = `You are a brutally honest communication skills evaluator. Analyze these assessment scores and provide critical, no-nonsense feedback. Do not sugar-coat anything.

ASSESSMENT SCORES (${completedCount} out of 7 assessments completed):
${assessmentScoresList}- Overall Score: ${actualOverallScore}/100

IMPORTANT CONTEXT:
- Only ${completedCount} out of 7 assessments were completed
- "Not Attempted" assessments should be mentioned as incomplete/missed opportunities
- Base your analysis only on completed assessments but note the incomplete ones as a significant issue

INSTRUCTIONS:
1. Be brutally honest and critical - no sugar-coating or false encouragement
2. Identify specific weaknesses and failure points across completed sections
3. Point out patterns of poor performance and skill gaps
4. Be direct about what needs immediate improvement
5. Mention which skills are below professional standards
6. Compare performance to what employers/professionals expect
7. Provide harsh but constructive criticism
8. Use a professional but unforgiving tone
9. Don't provide generic advice - be specific to their actual scores
10. Address the incomplete assessments as a serious concern about commitment/time management
11. End with a reality check about their current communication level

Format your response with clear sections and be thorough in your critique. This person needs to understand exactly where they stand and what they must fix.`;

        logger.info('Generating consolidated critical feedback for user:', req.user._id);

        // Generate critical feedback using OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: analysisPrompt }],
            max_tokens: 1500,
            temperature: 0.3
        });

        const feedback = completion.choices[0]?.message?.content || 'Unable to generate feedback at this time.';

        // Send email report to user
        let emailSent = false;
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            try {
                const assessmentData = {
                    scores: scores,
                    feedback: feedback,
                    completedCount: completedCount,
                    totalCount: 7,
                    overallScore: actualOverallScore
                };
                
                emailSent = await sendAssessmentReportEmail(user.email, user.username, assessmentData);
            } catch (emailError) {
                logger.error('Error sending assessment report email:', emailError);
            }
        }

        res.json({
            success: true,
            feedback: feedback,
            scores: scores,
            emailSent: emailSent,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error generating consolidated feedback:', error);
        res.status(500).json({ error: 'Failed to generate consolidated feedback' });
    }
});

// Reset assessment
app.post('/api/assessment/reset', requireAuth, async (req, res) => {
    try {
        // Reset user's scores in the database
        const resetScores = {
            readingAbility: 0,
            listeningAbility: 0,
            jumbledSentences: 0,
            storySummarization: 0,
            personalQuestions: 0,
            readingComprehension: 0,
            fillInTheBlanks: 0,
            overallScore: 0
        };

        await User.findByIdAndUpdate(req.user._id, {
            $set: { assessmentScores: resetScores }
        });

        // Clear detailed results from previous assessments
        await clearDetailedResults(req.user._id);

        // Cleanup all user's audio files
        await cleanupUserAudioFiles(req.user._id);

        // Clear assessment session
        const sessionId = req.session.id;
        await clearAssessmentSession(req.user._id, sessionId);

        logger.info(`Assessment completely reset for user ${req.user._id} (scores, detailed results, and session cleared)`);

        res.json({ message: 'Assessment reset successfully' });
    } catch (error) {
        logger.error('Error resetting assessment:', error);
        res.status(500).json({ error: 'Failed to reset assessment' });
    }
});

// Reset unattempted sections to 0 in user's assessment scores
const resetUnattemptedSectionsToZero = async (userId, session) => {
    try {
        // Get current user data
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Define all assessment types
        const allAssessmentTypes = ['reading', 'listening', 'jumbled', 'story', 'personal', 'comprehension', 'fillblanks'];
        
        // Get current scores
        const currentScores = { ...user.assessmentScores };
        
        // Check which sections were completed based on session progress and detailed results
        const completedSections = [];
        
        if (session && session.assessmentProgress) {
            for (const assessmentType of allAssessmentTypes) {
                const isCompletedInSession = session.assessmentProgress[assessmentType];
                const hasDetailedResults = await DetailedResults.exists({ userId: userId, assessmentType: assessmentType });
                
                if (isCompletedInSession || hasDetailedResults) {
                    completedSections.push(assessmentType);
                }
            }
        }

        // Reset unattempted sections to 0
        let hasChanges = false;
        for (const assessmentType of allAssessmentTypes) {
            if (!completedSections.includes(assessmentType)) {
                const scoreField = getScoreFieldName(assessmentType);
                if (currentScores[scoreField] !== 0) {
                    currentScores[scoreField] = 0;
                    hasChanges = true;
                    logger.info(`Reset ${assessmentType} score to 0 (was unattempted)`);
                }
            }
        }

        // Update database if there were changes
        if (hasChanges) {
            await saveAssessmentScores(userId, currentScores);
            logger.info(`Updated assessment scores for user ${userId} - reset ${allAssessmentTypes.length - completedSections.length} unattempted sections to 0`);
        }

        return { completedSections, resetSections: allAssessmentTypes.length - completedSections.length };
    } catch (error) {
        logger.error('Error resetting unattempted sections:', error);
        throw error;
    }
};

// Helper function to get the correct score field name for each assessment type
const getScoreFieldName = (assessmentType) => {
    const fieldMap = {
        'reading': 'readingAbility',
        'listening': 'listeningAbility',
        'jumbled': 'jumbledSentences',
        'story': 'storySummarization',
        'personal': 'personalQuestions',
        'comprehension': 'readingComprehension',
        'fillblanks': 'fillInTheBlanks'
    };
    return fieldMap[assessmentType] || assessmentType;
};

// Force submit assessment (for page reload/navigation)
app.post('/api/assessment/force-submit', requireAuth, async (req, res) => {
    try {
        const { reason, timestamp } = req.body;

        logger.info(`Force submit triggered for user ${req.user._id}, reason: ${reason}, timestamp: ${timestamp}`);

        // Get assessment session to check which sections were completed
        const sessionId = req.session.id;
        const session = await AssessmentSession.findOne({ userId: req.user._id }).sort({ lastActivity: -1 });

        // Get current user scores
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Reset unattempted sections to 0 in database
        await resetUnattemptedSectionsToZero(req.user._id, session);

        res.json({
            message: 'Force submit acknowledged and unattempted sections reset to 0',
            reason: reason,
            timestamp: timestamp
        });

    } catch (error) {
        logger.error('Error handling force submit:', error);
        res.status(500).json({ error: 'Failed to handle force submit' });
    }
});

// =================
// UTILITY FUNCTIONS
// =================

// Extract a JSON array from free-form model text
function extractJsonArrayFromText(text) {
    if (!text || typeof text !== 'string') return [];
    // Try direct JSON parse first
    try {
        const direct = JSON.parse(text);
        if (Array.isArray(direct)) return direct;
    } catch (_) { }

    // Fallback: find first [...] block and parse
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
        const slice = text.slice(start, end + 1);
        try {
            const arr = JSON.parse(slice);
            if (Array.isArray(arr)) return arr;
        } catch (_) { }
    }
    return [];
}

// Build jumbled questions on the server. Punctuation rule:
// - If the sentence ends with '.' or '?', include that punctuation as a separate token in the jumbled list.
function buildJumbledQuestionsFromSentences(sentences) {
    const tokenizeWithPunctuation = (sentence) => {
        if (!sentence || typeof sentence !== 'string') return { tokens: [], trailing: '' };
        const trimmed = sentence.trim();
        let trailing = '';
        if (/[.?]$/.test(trimmed)) {
            trailing = trimmed.slice(-1); // '.' or '?'
        }
        // Remove trailing punctuation from the body for tokenization
        const body = trailing ? trimmed.slice(0, -1) : trimmed;
        // Split on whitespace; strip internal punctuation including commas
        const tokens = body
            .replace(/[!,;:'"()\[\]{}<>]/g, ' ')
            .replace(/-/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map((t) => t.toLowerCase());
        return { tokens, trailing };
    };

    const arraysEqual = (a, b) => {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
    };

    const shuffleDifferent = (arr) => {
        if (arr.length < 2) return arr.slice();
        const maxAttempts = 10;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const copy = arr.slice();
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            if (!arraysEqual(copy, arr)) return copy;
        }
        // rotation fallback
        return arr.slice(1).concat(arr[0]);
    };

    return sentences.map((s) => {
        const original = typeof s === 'string' ? s.trim() : String(s || '').trim();
        const { tokens, trailing } = tokenizeWithPunctuation(original);

        // Include trailing punctuation as its own token if present; ensure lowercase for tokens
        const withPunct = trailing ? tokens.concat([trailing]) : tokens.slice();
        const jumbledTokens = shuffleDifferent(withPunct);
        const jumbled = jumbledTokens.join(' / ');
        return { original, jumbled };
    });
}

// (Removed legacy AI jumbled-output handlers; jumbled construction is now done locally.)

// Serve main HTML file (homepage)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
    logger.info(`Communication Assessment Server running on http://localhost:${PORT}`);
}); 
