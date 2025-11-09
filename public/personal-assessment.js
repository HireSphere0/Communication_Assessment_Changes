// Personal Questions Assessment Module - Azure Speech SDK Implementation

class PersonalAssessment {
    constructor() {
        this.currentQuestion = '';
        this.recognizer = null;
        this.isRecording = false;
        this.isInitialized = false;
        this.azureConfig = null;
        this.spokenResponse = '';
        this.pronunciationResults = [];
        this.recordingStartTime = null;
        this.timerInterval = null;
        
        // Random selection arrays
        this.difficulties = ['Easy', 'Medium', 'Hard'];
        this.categories = [
            'General',
            'Technical Communication',
            'Problem Solving',
            'Teamwork',
            'Leadership',
            'Failure/Learning',
            'Innovation'
        ];
        
        this.initializeElements();
        this.initializeEventListeners();
    }

    initializeElements() {
        this.elements = {
            loading: document.getElementById('personal-loading'),
            questionDisplay: document.getElementById('personal-question-display'),
            questionContainer: document.getElementById('personal-question-container'),
            difficultyBadge: document.getElementById('personal-difficulty-badge'),
            categoryBadge: document.getElementById('personal-category-badge'),
            questionText: document.getElementById('personal-question-text'),
            recordBtn: document.getElementById('personal-record-btn'),
            stopBtn: document.getElementById('personal-stop-btn'),
            status: document.getElementById('personal-status'),
            timer: document.getElementById('personal-timer'),
            results: document.getElementById('personal-results'),
            score: document.getElementById('personal-score'),
            feedback: document.getElementById('personal-feedback')
        };
    }

    initializeEventListeners() {
        if (this.elements.recordBtn) {
            this.elements.recordBtn.addEventListener('click', () => this.startRecording());
        }
        
        if (this.elements.stopBtn) {
            this.elements.stopBtn.addEventListener('click', () => this.stopRecording());
        }
    }

    // Helper method to randomly select from array
    getRandomSelection(array) {
        return array[Math.floor(Math.random() * array.length)];
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
        this.showQuestionSettings();
        
        // Use pre-generated questions instead of generating new ones
        if (window.assessmentController && window.assessmentController.preGeneratedQuestions.personal) {
            setTimeout(() => this.usePreGeneratedQuestions(window.assessmentController.preGeneratedQuestions.personal), 500);
        } else {
            // Fallback to generating questions if pre-generation failed
            setTimeout(() => this.generateQuestion(), 500);
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
        // Show loading initially
        this.elements.loading.style.display = 'block';
        this.elements.questionDisplay.style.display = 'none';
        this.elements.results.style.display = 'none';
        
        // Reset state
        this.spokenResponse = '';
        this.pronunciationResults = [];
        this.isRecording = false;
        this.elements.recordBtn.style.display = 'inline-block';
        this.elements.stopBtn.style.display = 'none';
        this.elements.status.textContent = '';
        this.elements.status.className = 'recording-status';
        this.elements.timer.textContent = '';
        this.elements.questionContainer.style.display = 'none';
        
        // Reset timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    showQuestionSettings() {
        this.elements.loading.style.display = 'none';
        this.elements.questionDisplay.style.display = 'block';
    }

    async generateQuestion() {
        try {
            // Randomly select difficulty and category
            const difficulty = this.getRandomSelection(this.difficulties);
            const category = this.getRandomSelection(this.categories);
            
            console.log('Generating personal question with random selection...', { difficulty, category });

            const response = await fetch('/api/personal/generate-question', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    difficulty,
                    category
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success && data.question) {
                this.currentQuestion = data.question;
                this.displayQuestion(data);
            } else {
                throw new Error('Failed to generate question');
            }
            
        } catch (error) {
            console.error('Error generating question:', error);
            this.showError('Failed to generate interview question. Please try again.');
        }
    }

    usePreGeneratedQuestions(data) {
        console.log('Using pre-generated personal question:', data);
        
        if (data.success && data.question) {
            this.currentQuestion = data.question;
            // Use the actual difficulty and category from the pre-generated data
            this.displayQuestion({
                difficulty: data.difficulty || 'Medium',
                category: data.category || 'General',
                question: data.question
            });
            console.log(`Personal question displayed: ${data.difficulty || 'Medium'} difficulty, ${data.category || 'General'} category`);
        } else {
            console.error('No question found in pre-generated data:', data);
            // Fallback to generating new questions
            this.generateQuestion();
        }
    }

    displayQuestion(data) {
        // Update question display
        this.elements.difficultyBadge.textContent = data.difficulty;
        this.elements.categoryBadge.textContent = data.category;
        this.elements.questionText.textContent = data.question;
        
        // Show question container
        this.elements.questionContainer.style.display = 'block';
        
        // Reset recording state
        this.spokenResponse = '';
        this.pronunciationResults = [];
        this.elements.recordBtn.disabled = false;
        this.elements.status.textContent = '';
        this.elements.timer.textContent = '';
        
        console.log('Question displayed:', data.question);
    }

    async startRecording() {
        if (this.isRecording || !this.azureConfig) return;

        try {
            console.log('Starting personal question recording with Azure Speech SDK...');
            
            const SpeechSDK = window.SpeechSDK;
            
            // Create speech configuration
            const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
                this.azureConfig.token, 
                this.azureConfig.region
            );
            speechConfig.speechRecognitionLanguage = 'en-US';
            
            // Enable detailed recognition results for better prosody assessment
            speechConfig.setProperty(SpeechSDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, "5000");
            speechConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceConnection_LanguageIdMode, "Continuous");

            // Create audio configuration
            const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

            // Create pronunciation assessment configuration for unscripted speech
            const pronunciationAssessmentConfig = new SpeechSDK.PronunciationAssessmentConfig(
                "", // Empty reference text for unscripted speech
                SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
                SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
                true // Enable miscue assessment
            );
            
            // Enable prosody assessment if available
            try {
                pronunciationAssessmentConfig.enableProsodyAssessment = true;
            } catch (e) {
                console.log('Prosody assessment configuration not available:', e);
            }

            // Create speech recognizer for continuous recognition with pronunciation assessment
            this.recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
            
            // Apply pronunciation assessment to the recognizer
            pronunciationAssessmentConfig.applyTo(this.recognizer);

            this.spokenResponse = '';
            this.pronunciationResults = [];
            this.isRecording = true;
            this.recordingStartTime = Date.now();
            
            // Update UI
            this.elements.recordBtn.style.display = 'none';
            this.elements.stopBtn.style.display = 'inline-block';
            this.elements.stopBtn.classList.add('recording');
            this.elements.status.innerHTML = '<span class="audio-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>Recording... Speak your answer clearly and confidently';
            this.elements.status.className = 'recording-status recording';
            
            // Start recording timer
            this.startTimer();
            
            // Handle recognition events
            this.recognizer.recognizing = (s, e) => {
                // Show intermediate results
                const interim = this.spokenResponse + e.result.text;
                if (interim.length > 100) {
                    this.elements.status.innerHTML = `<span class=\"audio-wave\"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>Recording... \"${interim.substring(0, 100)}...\"`;
                } else {
                    this.elements.status.innerHTML = `<span class=\"audio-wave\"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>Recording... \"${interim}\"`;
                }
            };

            this.recognizer.recognized = (s, e) => {
                if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech && e.result.text.trim()) {
                    this.spokenResponse += e.result.text + ' ';
                    
                    // Get pronunciation assessment results for this segment
                    try {
                        const pronunciationResult = SpeechSDK.PronunciationAssessmentResult.fromResult(e.result);
                        if (pronunciationResult) {
                            const segmentResult = {
                                text: e.result.text,
                                pronunciationScore: pronunciationResult.pronunciationScore || 0,
                                accuracyScore: pronunciationResult.accuracyScore || 0,
                                fluencyScore: pronunciationResult.fluencyScore || 0,
                                completenessScore: pronunciationResult.completenessScore || 0,
                                prosodyScore: pronunciationResult.prosodyScore || 0
                            };
                            
                            // Debug logging for prosody
                            console.log('Azure pronunciation result for segment:', {
                                text: e.result.text,
                                prosodyScore: pronunciationResult.prosodyScore,
                                rawResult: pronunciationResult
                            });
                            
                            this.pronunciationResults.push(segmentResult);
                        }
                    } catch (err) {
                        console.error('Could not extract pronunciation assessment for segment:', err);
                        console.log('Speech result object:', e.result);
                    }
                    
                    console.log('Recognized text:', e.result.text);
                }
            };

            this.recognizer.canceled = (s, e) => {
                console.log('Recognition canceled:', e.reason);
                this.stopRecording();
            };

            // Start continuous recognition
            this.recognizer.startContinuousRecognitionAsync(
                () => {
                    console.log('Continuous recognition with pronunciation assessment started');
                },
                (err) => {
                    console.error('Failed to start recognition:', err);
                    this.showError('Failed to start recording. Please check microphone permissions.');
                    this.isRecording = false;
                    this.elements.recordBtn.style.display = 'inline-block';
                    this.elements.stopBtn.style.display = 'none';
                    this.elements.stopBtn.classList.remove('recording');
                }
            );
            
        } catch (error) {
            console.error('Error starting personal recording:', error);
            this.showError('Could not start recording. Please check your microphone permissions.');
            this.isRecording = false;
            this.elements.recordBtn.style.display = 'inline-block';
            this.elements.stopBtn.style.display = 'none';
            this.elements.stopBtn.classList.remove('recording');
        }
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            this.elements.timer.textContent = `⏱️ ${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // Auto-stop after 2 minutes
            if (elapsed >= 120) {
                this.stopRecording();
            }
        }, 1000);
    }

    stopRecording() {
        if (this.recognizer && this.isRecording) {
            console.log('Stopping personal recording...');
            
            this.recognizer.stopContinuousRecognitionAsync(
                () => {
                    this.isRecording = false;
                    this.elements.recordBtn.style.display = 'inline-block';
                    this.elements.stopBtn.style.display = 'none';
                    this.elements.status.textContent = '⏳ Processing your response...';
                    this.elements.status.className = 'recording-status';
                    
                    // Clear timer
                    if (this.timerInterval) {
                        clearInterval(this.timerInterval);
                        this.timerInterval = null;
                    }
                    
                    // Process the response
                    this.processResponse();
                },
                (err) => {
                    console.error('Error stopping recognition:', err);
                    this.isRecording = false;
                }
            );
        }
    }

    async processResponse() {
        if (!this.spokenResponse.trim()) {
            this.showError('No response was recorded. Please try again.');
            this.elements.status.textContent = '';
            return;
        }

        try {
            console.log('Processing personal response:', this.spokenResponse);
            console.log('Pronunciation results from Azure:', this.pronunciationResults);
            
            this.elements.status.textContent = '🔄 Getting AI feedback...';
            
            // Calculate average pronunciation scores from Azure results
            let azureResults = {
                pronunciationScore: 0,
                accuracyScore: 0,
                fluencyScore: 0,
                completenessScore: 0,
                prosodyScore: 0,
                recognizedText: this.spokenResponse.trim()
            };

            if (this.pronunciationResults && this.pronunciationResults.length > 0) {
                // Calculate weighted averages based on text length
                let totalWords = 0;
                let weightedPronunciation = 0;
                let weightedAccuracy = 0;
                let weightedFluency = 0;
                let weightedCompleteness = 0;
                let weightedProsody = 0;
                let segmentsWithProsody = 0;

                this.pronunciationResults.forEach(result => {
                    const wordCount = result.text.split(' ').length;
                    totalWords += wordCount;
                    
                    weightedPronunciation += (result.pronunciationScore || 0) * wordCount;
                    weightedAccuracy += (result.accuracyScore || 0) * wordCount;
                    weightedFluency += (result.fluencyScore || 0) * wordCount;
                    weightedCompleteness += (result.completenessScore || 0) * wordCount;
                    
                    // Handle prosody separately to track availability
                    if (result.prosodyScore !== undefined && result.prosodyScore !== null) {
                        weightedProsody += result.prosodyScore * wordCount;
                        segmentsWithProsody += wordCount;
                    }
                });

                if (totalWords > 0) {
                    azureResults.pronunciationScore = Math.round(weightedPronunciation / totalWords);
                    azureResults.accuracyScore = Math.round(weightedAccuracy / totalWords);
                    azureResults.fluencyScore = Math.round(weightedFluency / totalWords);
                    azureResults.completenessScore = Math.round(weightedCompleteness / totalWords);
                    
                    // Calculate prosody score if available from any segments
                    if (segmentsWithProsody > 0) {
                        azureResults.prosodyScore = Math.round(weightedProsody / segmentsWithProsody);
                    } else {
                        // Set to 0 if no prosody data available, but still show it
                        azureResults.prosodyScore = 0;
                        console.warn('No prosody scores available from Azure Speech API');
                    }
                }

                console.log('Calculated Azure pronunciation scores:', azureResults);
                console.log('Prosody calculation details:', {
                    totalSegments: this.pronunciationResults.length,
                    segmentsWithProsody: segmentsWithProsody,
                    totalWords: totalWords,
                    finalProsodyScore: azureResults.prosodyScore
                });
            } else {
                // Fallback to basic scores if no pronunciation results were captured
                console.warn('No pronunciation assessment results available, using fallback scores');
                azureResults.pronunciationScore = 60;
                azureResults.accuracyScore = 60;
                azureResults.fluencyScore = 65;
                azureResults.completenessScore = 70;
                azureResults.prosodyScore = 60; // Include prosody in fallback
            }
            
            const response = await fetch('/api/personal/evaluate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    spokenResponse: this.spokenResponse.trim(),
                    azureResults: azureResults
                })
            });

            if (!response.ok) {
                throw new Error(`Evaluation failed: ${response.status}`);
            }

            const result = await response.json();
            console.log('Personal evaluation result:', result);
            
            this.displayResults(result, azureResults);
            
        } catch (error) {
            console.error('Error processing personal response:', error);
            this.showError('Failed to evaluate response. Please try again.');
        }
    }

    displayResults(result, azureResults) {
        // Hide question display and clear status to avoid stops
        this.elements.questionDisplay.style.display = 'none';
        this.elements.status.textContent = '';
        this.elements.status.style.color = '';
        
        // Store results for final display but don't show individual results
        // Results section remains hidden
        
        // Notify main controller that assessment is complete and auto-advance
        if (window.assessmentController) {
            window.assessmentController.onAssessmentComplete('personal', result.score);
            // Auto-advance to next section after a brief delay
            setTimeout(() => {
                window.assessmentController.nextStep();
            }, 500);
        }

        console.log('Personal assessment completed - results stored for final analysis');
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
        this.elements.status.className = 'recording-status error';
    }

    // Enhanced cleanup method
    cleanup() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        if (this.recognizer) {
            try {
                if (this.isRecording) {
                    this.recognizer.stopContinuousRecognitionAsync();
                }
                this.recognizer.close();
            } catch (e) {
                console.log('Error closing personal recognizer:', e);
            }
            this.recognizer = null;
        }
        
        this.isRecording = false;
        this.recordingStartTime = null;
        this.pronunciationResults = [];
    }

    // Reset the assessment for retrying
    reset() {
        this.cleanup();
        this.isInitialized = false;
        this.currentQuestion = '';
        this.spokenResponse = '';
    }
    
    // Cleanup on page unload
    onPageUnload() {
        this.cleanup();
    }
}

// Initialize the personal assessment when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.PersonalAssessment = new PersonalAssessment();
}); 