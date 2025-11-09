// Listening Assessment Module - Azure Speech SDK Implementation

class ListeningAssessment {
    constructor() {
        this.currentText = '';
        this.audioUrl = '';
        this.recognizer = null;
        this.isRecording = false;
        this.isInitialized = false;
        this.azureConfig = null;
        
        // New properties for multiple sentences
        this.currentIndex = 1;
        this.totalSentences = 5;
        this.completedSentences = 0;
        this.allResults = []; // Store all assessment results for final score calculation
        
        // Topic and difficulty selection properties
        this.topics = [
            'Interviews and dialogues',
            'News broadcasts',
            'Educational lectures',
            'Travel announcements',
            'Business meetings',
            'Cultural discussions',
            'Scientific explanations',
            'Entertainment content'
        ];
        this.difficulties = ['beginner', 'intermediate', 'advanced'];
        this.selectedTopic = null;
        this.selectedDifficulty = null;
        
        this.initializeElements();
        this.initializeEventListeners();
    }

    initializeElements() {
        this.elements = {
            loading: document.getElementById('listening-loading'),
            player: document.getElementById('listening-player'),
            audio: document.getElementById('listening-audio'),
            text: document.getElementById('listening-text'),
            controls: document.getElementById('listening-controls'),
            recordBtn: document.getElementById('listening-record-btn'),
            stopBtn: document.getElementById('listening-stop-btn'),
            status: document.getElementById('listening-status'),
            results: document.getElementById('listening-results'),
            score: document.getElementById('listening-score'),
            feedback: document.getElementById('listening-feedback'),
            // Add progress indicator element
            progress: document.getElementById('listening-progress') || this.createProgressElement()
        };
    }

    createProgressElement() {
        // Do not show textual progress in the UI anymore
        const div = document.createElement('div');
        div.id = 'listening-progress';
        div.style.display = 'none';
        return div;
    }

    initializeEventListeners() {
        if (this.elements.recordBtn) {
            this.elements.recordBtn.addEventListener('click', () => this.startRecording());
        }
        
        if (this.elements.stopBtn) {
            this.elements.stopBtn.addEventListener('click', () => this.stopRecording());
        }

        // Audio player event listeners
        if (this.elements.audio) {
            this.elements.audio.addEventListener('ended', () => {
                console.log('Audio playback ended');
            });
            
            this.elements.audio.addEventListener('error', (e) => {
                console.error('Audio playback error:', e);
                // Don't show error message automatically - let user try to play first
                // Error will be handled when user actually tries to interact with audio
            });
            
            // Handle play attempts and show error only if play fails
            this.elements.audio.addEventListener('play', () => {
                console.log('Audio started playing successfully');
            });
            
            // Handle when user tries to play but it fails
            this.elements.audio.addEventListener('pause', () => {
                // Check if this was an unexpected pause due to error
                if (this.elements.audio.currentTime === 0 && this.elements.audio.error) {
                    this.showError('Audio playback failed. Please try refreshing the page.');
                }
            });
            
            // Add canplaythrough event to ensure audio is ready
            this.elements.audio.addEventListener('canplaythrough', () => {
                console.log('Audio is ready to play');
            });
        }
    }

    // Random selection utility method
    getRandomSelection(array) {
        if (!array || array.length === 0) return null;
        return array[Math.floor(Math.random() * array.length)];
    }

    // Select random topic and difficulty for this assessment session
    selectRandomTopicAndDifficulty() {
        this.selectedTopic = this.getRandomSelection(this.topics);
        this.selectedDifficulty = this.getRandomSelection(this.difficulties);
        
        console.log(`Listening assessment selected topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
        
        return {
            topic: this.selectedTopic,
            difficulty: this.selectedDifficulty
        };
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        // Check if Speech SDK is available
        if (!window.SpeechSDK) {
            this.showError('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
            return;
        }

        this.resetUI();
        await this.loadAzureConfig();
        
        // Select random topic and difficulty for this assessment session
        this.selectRandomTopicAndDifficulty();
        
        // Use pre-generated questions instead of generating new ones
        if (window.assessmentController && window.assessmentController.preGeneratedQuestions.listening) {
            this.usePreGeneratedContent(window.assessmentController.preGeneratedQuestions.listening);
        } else {
            // Fallback to generating content if pre-generation failed
            await this.generateListeningContent();
        }
        
        this.isInitialized = true;
    }

    async loadAzureConfig() {
        try {
            const response = await fetch('/api/azure-config');
            this.azureConfig = await response.json();

        } catch (error) {
            console.error('Failed to load Azure configuration:', error);
            this.showError('Failed to load speech configuration. Please refresh the page.');
        }
    }

    resetUI() {
        // Show loading, hide everything else
        this.elements.loading.style.display = 'block';
        this.elements.player.style.display = 'none';
        this.elements.controls.style.display = 'none';
        this.elements.results.style.display = 'none';
        
        // Reset recording state
        this.isRecording = false;
        this.elements.recordBtn.style.display = 'inline-block';
        this.elements.stopBtn.style.display = 'none';
        this.elements.status.textContent = '';
        this.elements.status.className = 'recording-status';
        
        // Reset audio
        if (this.elements.audio) {
            this.elements.audio.src = '';
        }
    }

    async generateListeningContent() {
        try {
            console.log('Generating listening content...');
            console.log(`Using topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
            
            const response = await fetch('/api/listening/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    topic: this.selectedTopic,
                    difficulty: this.selectedDifficulty
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.text && data.audioUrl) {
                this.currentText = data.text;
                this.audioUrl = data.audioUrl;
                this.currentIndex = data.currentIndex || 1;
                this.totalSentences = data.totalSentences || 5;
                this.completedSentences = 0;
                this.displayListeningContent();
            } else {
                throw new Error('Incomplete listening content received from server');
            }
            
        } catch (error) {
            console.error('Error generating listening content:', error);
            this.showError('Failed to generate listening content. Please try refreshing the page.');
        }
    }

    usePreGeneratedContent(data) {
        console.log('Using pre-generated listening content');
        
        if (data.text && data.audioUrl) {
            this.currentText = data.text;
            this.audioUrl = data.audioUrl;
            this.currentIndex = data.currentIndex || 1;
            this.totalSentences = data.totalSentences || 5;
            this.completedSentences = 0;
            
            // Use topic and difficulty from pre-generated data if available
            if (data.topic && data.difficulty) {
                this.selectedTopic = data.topic;
                this.selectedDifficulty = data.difficulty;
                console.log(`Using pre-generated topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
            }
            
            this.displayListeningContent();
        } else {
            console.error('No listening content found in pre-generated data');
            // Fallback to generating new content
            this.generateListeningContent();
        }
    }

    displayListeningContent() {
        this.elements.loading.style.display = 'none';
        this.elements.player.style.display = 'block';
        this.elements.controls.style.display = 'block';
        
        // Set audio source
        this.elements.audio.src = this.audioUrl;
        this.elements.audio.load();
        
        // Show the current sentence text below the heading like Reading
        if (this.elements.text) {
            this.elements.text.textContent = this.currentText;
        }
        
        console.log(`Listening content ${this.currentIndex}/${this.totalSentences} displayed. Text:`, this.currentText);
        console.log('Audio URL:', this.audioUrl);

        // Update global question indicator
        if (window.assessmentController && typeof window.assessmentController.updateNavigation === 'function') {
            window.assessmentController.updateNavigation();
        }
    }

    async startRecording() {
        if (this.isRecording || !this.currentText || !this.azureConfig) return;

        try {
            console.log('Starting recording for listening assessment with Azure Speech SDK...');
            
            const SpeechSDK = window.SpeechSDK;
            
            // Create speech configuration
            const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
                this.azureConfig.token, 
                this.azureConfig.region
            );
            speechConfig.speechRecognitionLanguage = 'en-US';

            // Create audio configuration
            const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

            // Create pronunciation assessment configuration
            const pronunciationAssessmentConfig = new SpeechSDK.PronunciationAssessmentConfig(
                this.currentText,
                SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
                SpeechSDK.PronunciationAssessmentGranularity.Word,
                true
            );

            // Create speech recognizer
            this.recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
            pronunciationAssessmentConfig.applyTo(this.recognizer);

            this.isRecording = true;
            
            // Update UI
            this.elements.recordBtn.style.display = 'none';
            this.elements.stopBtn.style.display = 'inline-block';
            this.elements.stopBtn.classList.add('recording');
            this.elements.status.innerHTML = '<span class="audio-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>Recording... Please repeat what you heard';
            this.elements.status.className = 'recording-status recording';
            
            // Start recognition
            this.recognizer.recognizeOnceAsync(result => {
                this.isRecording = false;
                this.elements.recordBtn.style.display = 'inline-block';
                this.elements.stopBtn.style.display = 'none';
                this.elements.stopBtn.classList.remove('recording');
                this.elements.status.className = 'recording-status';

                if (result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
                    const paResult = SpeechSDK.PronunciationAssessmentResult.fromResult(result);
                    this.processResults(paResult, result.text);
                } else {
                    this.elements.status.textContent = 'No speech detected. Please try again.';
                    console.error('Listening speech recognition failed:', result);
                }
            });
            
        } catch (error) {
            console.error('Error starting listening recording:', error);
            this.showError('Could not start recording. Please check your microphone permissions.');
            this.isRecording = false;
            this.elements.recordBtn.style.display = 'inline-block';
            this.elements.stopBtn.style.display = 'none';
            this.elements.stopBtn.classList.remove('recording');
        }
    }

    stopRecording() {
        if (this.recognizer && this.isRecording) {
            console.log('Stopping listening recording...');
            this.recognizer.stopContinuousRecognitionAsync();
            this.isRecording = false;
            this.elements.recordBtn.style.display = 'inline-block';
            this.elements.stopBtn.style.display = 'none';
            this.elements.status.textContent = '';
        }
    }

    async processResults(paResult, recognizedText) {
        console.log('Processing listening results:', paResult);
        
        this.elements.status.textContent = '⏳ Analyzing listening performance...';
        
        try {
            // Prepare result data
            const resultData = {
                pronunciationScore: paResult.pronunciationScore || 0,
                accuracyScore: paResult.accuracyScore || 0,
                fluencyScore: paResult.fluencyScore || 0,
                completenessScore: paResult.completenessScore || 0,
                recognizedText: recognizedText || '',
                detailResult: paResult.detailResult,
                referenceText: this.currentText
            };

            // Store result in local array for final score calculation
            this.allResults.push(resultData);
            console.log(`Stored listening result ${this.allResults.length}:`, resultData);

            // Store results on server for logging
            await fetch('/api/listening/store-result', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    result: resultData,
                    referenceText: this.currentText
                })
            });
            
            this.displayResults(resultData);
            
        } catch (error) {
            console.error('Error processing listening results:', error);
            this.showError('Failed to process listening results. Please try again.');
        }
    }

    displayResults(result) {
        // Clear status immediately to avoid any stops
        this.elements.status.textContent = '';
        this.elements.status.style.color = '';
        
        // Extract pronunciation score
        const pronunciationScore = Math.round(result.pronunciationScore || 0);
        
        // Increment completed sentences
        this.completedSentences++;
        
        // Show brief success message
        this.elements.status.textContent = `Sentence ${this.currentIndex} completed!`;
        this.elements.status.style.color = '#28a745';
        
        // Get next sentence or complete assessment
        setTimeout(() => {
            this.getNextSentence();
        }, 1500);
        
        console.log(`Listening sentence ${this.currentIndex} completed with score:`, pronunciationScore);
    }

    async getNextSentence() {
        try {
            const response = await fetch('/api/listening/get-next', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.complete) {
                // All sentences completed
                this.completeAssessment();
            } else {
                // Load next sentence
                this.currentText = data.text;
                this.audioUrl = data.audioUrl;
                this.currentIndex = data.currentIndex;
                this.displayListeningContent();
                
                // Reset UI for next recording
                this.elements.recordBtn.style.display = 'inline-block';
                this.elements.stopBtn.style.display = 'none';
                this.elements.status.textContent = '';
                this.elements.status.style.color = '';

                // Update global question indicator after advancing
                if (window.assessmentController && typeof window.assessmentController.updateNavigation === 'function') {
                    window.assessmentController.updateNavigation();
                }
            }
            
        } catch (error) {
            console.error('Error getting next listening sentence:', error);
            this.showError('Failed to get next sentence. Assessment will complete.');
            this.completeAssessment();
        }
    }

    completeAssessment() {
        this.elements.status.textContent = 'Listening assessment completed!';
        this.elements.status.style.color = '#28a745';
        this.elements.progress.textContent = `All ${this.totalSentences} sentences completed!`;
        
        // Calculate actual overall score from Azure Speech results
        const actualScore = this.calculateOverallScore();
        
        // Notify main controller that assessment is complete and auto-advance
        if (window.assessmentController) {
            window.assessmentController.onAssessmentComplete('listening', actualScore);
            // Auto-advance to next section after a brief delay
            setTimeout(() => {
                window.assessmentController.nextStep();
            }, 2000);
        }
        
        console.log('Listening assessment completed - all sentences processed');
    }

    calculateOverallScore() {
        // If no results recorded, return 0
        if (!this.allResults || this.allResults.length === 0) {
            console.warn('No listening assessment results available, returning 0');
            return 0;
        }

        // Calculate average of all pronunciation scores
        let totalScore = 0;
        let validScores = 0;

        this.allResults.forEach(result => {
            if (result && result.pronunciationScore !== undefined && result.pronunciationScore > 0) {
                totalScore += result.pronunciationScore;
                validScores++;
            }
        });

        // If no valid scores, try to get from server or use fallback
        if (validScores === 0) {
            console.warn('No valid pronunciation scores found, using fallback score of 60');
            return 60;
        }

        const averageScore = Math.round(totalScore / validScores);
        console.log(`Listening assessment overall score: ${averageScore} (averaged from ${validScores} results)`);
        
        return averageScore;
    }

    generateListeningFeedback(result) {
        const pronunciationScore = result.pronunciationScore || 0;
        const accuracyScore = result.accuracyScore || 0;
        const fluencyScore = result.fluencyScore || 0;
        const completenessScore = result.completenessScore || 0;
        const recognizedText = result.recognizedText || '';
        
        let feedback = '<div class="detailed-feedback">';
        
        // Show what the user was supposed to repeat
        feedback += `<div class="reference-text">`;
        feedback += `<h4>Original Text:</h4>`;
        feedback += `<p><em>"${this.currentText}"</em></p>`;
        feedback += `</div>`;
        
        // What the user actually said
        feedback += `<div class="recognized-text">`;
        feedback += `<h4>What we heard you say:</h4>`;
        feedback += `<p>"${recognizedText}"</p>`;
        feedback += `</div>`;
        
        // Overall listening feedback
        if (pronunciationScore >= 80) {
            feedback += '<p><strong>Excellent listening and repetition!</strong> You understood and repeated the text very clearly.</p>';
        } else if (pronunciationScore >= 60) {
            feedback += '<p><strong>Good listening skills!</strong> You understood most of the text with clear repetition.</p>';
        } else if (pronunciationScore >= 40) {
            feedback += '<p><strong>Fair listening ability.</strong> Keep practicing to improve comprehension and pronunciation.</p>';
        } else {
            feedback += '<p><strong>Needs improvement.</strong> Focus on listening carefully and practicing pronunciation.</p>';
        }
        
        // Detailed scores
        if (accuracyScore > 0 || fluencyScore > 0 || completenessScore > 0) {
            feedback += '<div class="score-breakdown">';
            feedback += '<h4>Detailed Analysis:</h4>';
            feedback += '<ul>';
            if (accuracyScore > 0) feedback += `<li>Pronunciation Accuracy: ${Math.round(accuracyScore)}/100</li>`;
            if (fluencyScore > 0) feedback += `<li>Speaking Fluency: ${Math.round(fluencyScore)}/100</li>`;
            if (completenessScore > 0) feedback += `<li>Content Completeness: ${Math.round(completenessScore)}/100</li>`;
            feedback += '</ul>';
            feedback += '</div>';
        }

        // Word-level comparison if available
        if (result.detailResult && result.detailResult.Words) {
            const words = result.detailResult.Words;
            const problematicWords = words.filter(word => 
                word.PronunciationAssessment && word.PronunciationAssessment.AccuracyScore < 60
            );
            
            if (problematicWords.length > 0) {
                feedback += '<div class="word-feedback">';
                feedback += '<h4>Words That Need Practice:</h4>';
                feedback += '<div class="word-list">';
                problematicWords.forEach(word => {
                    const score = Math.round(word.PronunciationAssessment.AccuracyScore);
                    const color = score >= 80 ? '#28a745' : score >= 60 ? '#ffc107' : '#dc3545';
                    feedback += `<span class="word-item" style="color: ${color}"><strong>${word.Word}</strong> (${score}%)</span> `;
                });
                feedback += '</div>';
                feedback += '</div>';
            }
        }
        
        // Listening-specific tips
        feedback += '<div class="listening-tips">';
        feedback += '<h4>Tips for Improvement:</h4>';
        feedback += '<ul>';
        feedback += '<li>Listen to the audio multiple times before recording</li>';
        feedback += '<li>Focus on the rhythm and intonation patterns</li>';
        feedback += '<li>Try to repeat immediately after hearing each phrase</li>';
        feedback += '<li>Practice with English audio content daily</li>';
        feedback += '</ul>';
        feedback += '</div>';
        
        feedback += '</div>';
        return feedback;
    }

    colorCodeScore(score) {
        const scoreElement = this.elements.score;
        
        // Remove existing color classes
        scoreElement.classList.remove('score-excellent', 'score-good', 'score-fair', 'score-poor');
        
        // Add appropriate color class
        if (score >= 80) {
            scoreElement.classList.add('score-excellent');
            scoreElement.style.color = '#28a745';
        } else if (score >= 60) {
            scoreElement.classList.add('score-good');
            scoreElement.style.color = '#ffc107';
        } else if (score >= 40) {
            scoreElement.classList.add('score-fair');
            scoreElement.style.color = '#fd7e14';
        } else {
            scoreElement.classList.add('score-poor');
            scoreElement.style.color = '#dc3545';
        }
    }

    showError(message) {
        this.elements.loading.style.display = 'none';
        this.elements.status.textContent = `❌ ${message}`;
        this.elements.status.style.color = '#dc3545';
        
        // Show retry option
        if (!this.currentText) {
            // If no content was generated, try to generate again
            setTimeout(() => {
                this.generateListeningContent();
            }, 2000);
        }
    }

    // Enhanced cleanup method
    cleanup() {
        if (this.recognizer) {
            try {
                if (this.isRecording) {
                    this.recognizer.stopContinuousRecognitionAsync();
                }
                this.recognizer.close();
            } catch (e) {
                console.log('Error closing listening recognizer:', e);
            }
            this.recognizer = null;
        }
        
        if (this.elements.audio) {
            this.elements.audio.pause();
            this.elements.audio.src = '';
            // Remove event listeners
            this.elements.audio.removeEventListener('ended', this.audioEndedHandler);
            this.elements.audio.removeEventListener('error', this.audioErrorHandler);
        }
        
        this.isRecording = false;
        this.currentText = '';
        this.audioUrl = '';
    }

    // Reset the assessment for retrying
    reset() {
        this.cleanup();
        this.isInitialized = false;
    }
    
    // Cleanup on page unload
    onPageUnload() {
        this.cleanup();
    }
}

// Initialize the listening assessment when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.ListeningAssessment = new ListeningAssessment();
}); 