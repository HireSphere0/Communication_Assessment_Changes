// Reading Assessment Module - Azure Speech SDK Implementation

class ReadingAssessment {
    constructor() {
        this.currentSentence = '';
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
            'Daily conversations',
            'Business communication',
            'Academic presentations',
            'News and current events',
            'Travel and culture',
            'Health and wellness',
            'Technology and innovation',
            'Environmental topics'
        ];
        this.difficulties = ['beginner', 'intermediate', 'advanced'];
        this.selectedTopic = null;
        this.selectedDifficulty = null;
        
        this.initializeElements();
        this.initializeEventListeners();
    }

    initializeElements() {
        this.elements = {
            loading: document.getElementById('reading-loading'),
            sentence: document.getElementById('reading-sentence'),
            controls: document.getElementById('reading-controls'),
            recordBtn: document.getElementById('reading-record-btn'),
            stopBtn: document.getElementById('reading-stop-btn'),
            status: document.getElementById('reading-status'),
            results: document.getElementById('reading-results'),
            score: document.getElementById('reading-score'),
            feedback: document.getElementById('reading-feedback'),
            // Add progress indicator element
            progress: document.getElementById('reading-progress') || this.createProgressElement()
        };
    }

    createProgressElement() {
        // Create progress element if it doesn't exist
        const progressDiv = document.createElement('div');
        progressDiv.id = 'reading-progress';
        progressDiv.className = 'assessment-progress';
        progressDiv.style.cssText = 'text-align: center; margin: 10px 0; font-weight: bold; color: #667eea;';
        
        // Insert it before the sentence element
        const sentenceElement = document.getElementById('reading-sentence');
        if (sentenceElement && sentenceElement.parentNode) {
            sentenceElement.parentNode.insertBefore(progressDiv, sentenceElement);
        }
        
        return progressDiv;
    }

    initializeEventListeners() {
        if (this.elements.recordBtn) {
            this.elements.recordBtn.addEventListener('click', () => this.startRecording());
        }
        
        if (this.elements.stopBtn) {
            this.elements.stopBtn.addEventListener('click', () => this.stopRecording());
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
        
        console.log(`Reading assessment selected topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
        
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
        if (window.assessmentController && window.assessmentController.preGeneratedQuestions.reading) {
            this.usePreGeneratedQuestions(window.assessmentController.preGeneratedQuestions.reading);
        } else {
            // Fallback to generating questions if pre-generation failed
            await this.generateSentence();
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
        this.elements.sentence.style.display = 'none';
        this.elements.controls.style.display = 'none';
        this.elements.results.style.display = 'none';
        
        // Reset recording state
        this.isRecording = false;
        this.elements.recordBtn.style.display = 'inline-block';
        this.elements.stopBtn.style.display = 'none';
        this.elements.status.textContent = '';
        this.elements.status.className = 'recording-status';
    }

    async generateSentence() {
        try {
            console.log('Generating sentences for reading assessment...');
            console.log(`Using topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
            
            const response = await fetch('/api/reading/generate-sentence', {
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
            
            if (data.sentence) {
                this.currentSentence = data.sentence;
                this.currentIndex = data.currentIndex || 1;
                this.totalSentences = data.totalSentences || 5;
                this.completedSentences = 0;
                this.displaySentence();
            } else {
                throw new Error('No sentence received from server');
            }
            
        } catch (error) {
            console.error('Error generating sentences:', error);
            this.showError('Failed to generate sentences. Please try refreshing the page.');
        }
    }

    usePreGeneratedQuestions(data) {
        console.log('Using pre-generated reading questions');
        
        if (data.sentence) {
            this.currentSentence = data.sentence;
            this.currentIndex = data.currentIndex || 1;
            this.totalSentences = data.totalSentences || 5;
            this.completedSentences = 0;
            
            // Use topic and difficulty from pre-generated data if available
            if (data.topic && data.difficulty) {
                this.selectedTopic = data.topic;
                this.selectedDifficulty = data.difficulty;
                console.log(`Using pre-generated topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
            }
            
            this.displaySentence();
        } else {
            console.error('No sentence found in pre-generated data');
            // Fallback to generating new questions
            this.generateSentence();
        }
    }

    displaySentence() {
        this.elements.loading.style.display = 'none';
        this.elements.sentence.style.display = 'block';
        this.elements.controls.style.display = 'block';
        
        this.elements.sentence.textContent = this.currentSentence;
        
        // Hide progress indicator (UI choice)
        this.elements.progress.style.display = 'none';
        
        console.log(`Sentence ${this.currentIndex}/${this.totalSentences} displayed:`, this.currentSentence);

        // Update global question indicator
        if (window.assessmentController && typeof window.assessmentController.updateNavigation === 'function') {
            window.assessmentController.updateNavigation();
        }
    }

    async startRecording() {
        if (this.isRecording || !this.currentSentence || !this.azureConfig) return;

        try {
            console.log('Starting recording with Azure Speech SDK...');
            
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
                this.currentSentence,
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
            this.elements.status.innerHTML = '<span class="audio-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>Recording... Please read the sentence above';
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
                    console.error('Speech recognition failed:', result);
                }
            });
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showError('Could not start recording. Please check your microphone permissions.');
            this.isRecording = false;
            this.elements.recordBtn.style.display = 'inline-block';
            this.elements.stopBtn.style.display = 'none';
            this.elements.stopBtn.classList.remove('recording');
        }
    }

    stopRecording() {
        if (this.recognizer && this.isRecording) {
            console.log('Stopping recording...');
            this.recognizer.stopContinuousRecognitionAsync();
            this.isRecording = false;
            this.elements.recordBtn.style.display = 'inline-block';
            this.elements.stopBtn.style.display = 'none';
            this.elements.stopBtn.classList.remove('recording');
            this.elements.status.textContent = '';
        }
    }

    async processResults(paResult, recognizedText) {
        console.log('Processing pronunciation results:', paResult);
        
        this.elements.status.textContent = '⏳ Processing results...';
        
        try {
            // Prepare result data
            const resultData = {
                pronunciationScore: paResult.pronunciationScore || 0,
                accuracyScore: paResult.accuracyScore || 0,
                fluencyScore: paResult.fluencyScore || 0,
                completenessScore: paResult.completenessScore || 0,
                recognizedText: recognizedText || '',
                detailResult: paResult.detailResult,
                referenceText: this.currentSentence
            };

            // Store result in local array for final score calculation
            this.allResults.push(resultData);
            console.log(`Stored reading result ${this.allResults.length}:`, resultData);

            // Store results on server for logging
            await fetch('/api/reading/store-result', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    result: resultData,
                    referenceText: this.currentSentence
                })
            });
            
            this.displayResults(resultData);
            
        } catch (error) {
            console.error('Error processing results:', error);
            this.showError('Failed to process results. Please try again.');
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
    }

    async getNextSentence() {
        try {
            const response = await fetch('/api/reading/get-next-sentence', {
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
                this.currentSentence = data.sentence;
                this.currentIndex = data.currentIndex;
                this.displaySentence();
                
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
            console.error('Error getting next sentence:', error);
            this.showError('Failed to get next sentence. Assessment will complete.');
            this.completeAssessment();
        }
    }

    completeAssessment() {
        this.elements.status.textContent = 'Reading assessment completed!';
        this.elements.status.style.color = '#28a745';
        this.elements.progress.textContent = `All ${this.totalSentences} sentences completed!`;
        
        // Calculate actual overall score from Azure Speech results
        const actualScore = this.calculateOverallScore();
        
        // Notify main controller that assessment is complete and auto-advance
        if (window.assessmentController) {
            window.assessmentController.onAssessmentComplete('reading', actualScore);
            // Auto-advance to next section after a brief delay
            setTimeout(() => {
                window.assessmentController.nextStep();
            }, 2000);
        }
    }

    calculateOverallScore() {
        // If no results recorded, return 0
        if (!this.allResults || this.allResults.length === 0) {
            console.warn('No reading assessment results available, returning 0');
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
        console.log(`Reading assessment overall score: ${averageScore} (averaged from ${validScores} results)`);
        
        return averageScore;
    }

    generateFeedback(result) {
        const pronunciationScore = result.pronunciationScore || 0;
        const accuracyScore = result.accuracyScore || 0;
        const fluencyScore = result.fluencyScore || 0;
        const completenessScore = result.completenessScore || 0;
        const recognizedText = result.recognizedText || '';
        
        let feedback = '<div class="detailed-feedback">';
        
        // Show what was recognized vs expected
        feedback += '<div class="recognition-comparison">';
        feedback += '<h4>Speech Recognition:</h4>';
        feedback += `<p><strong>Expected:</strong> "${this.currentSentence}"</p>`;
        feedback += `<p><strong>You said:</strong> "${recognizedText}"</p>`;
        feedback += '</div>';
        
        // Overall feedback
        if (pronunciationScore >= 80) {
            feedback += '<p><strong>Excellent pronunciation!</strong> Your speech is clear and accurate.</p>';
        } else if (pronunciationScore >= 60) {
            feedback += '<p><strong>Good pronunciation!</strong> You\'re doing well with some room for improvement.</p>';
        } else if (pronunciationScore >= 40) {
            feedback += '<p><strong>Fair pronunciation.</strong> Keep practicing to improve clarity.</p>';
        } else {
            feedback += '<p><strong>Needs improvement.</strong> Focus on pronunciation practice to enhance clarity.</p>';
        }
        
        // Detailed scores
        if (accuracyScore > 0 || fluencyScore > 0 || completenessScore > 0) {
            feedback += '<div class="score-breakdown">';
            feedback += '<h4>Detailed Breakdown:</h4>';
            feedback += '<ul>';
            if (accuracyScore > 0) feedback += `<li>Accuracy: ${Math.round(accuracyScore)}/100</li>`;
            if (fluencyScore > 0) feedback += `<li>Fluency: ${Math.round(fluencyScore)}/100</li>`;
            if (completenessScore > 0) feedback += `<li>Completeness: ${Math.round(completenessScore)}/100</li>`;
            feedback += '</ul>';
            feedback += '</div>';
        }
        
        // Word-level feedback
        if (result.detailResult && result.detailResult.Words) {
            const words = result.detailResult.Words;
            const problematicWords = words.filter(word => 
                word.PronunciationAssessment && word.PronunciationAssessment.AccuracyScore < 60
            );
            
            if (problematicWords.length > 0) {
                feedback += '<div class="word-feedback">';
                feedback += '<h4>Words to Practice:</h4>';
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
        if (!this.currentSentence) {
            // If no sentence was generated, try to generate again
            setTimeout(() => {
                this.generateSentence();
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
                console.log('Error closing reading recognizer:', e);
            }
            this.recognizer = null;
        }
        
        this.isRecording = false;
    }

    // Reset the assessment for retrying
    reset() {
        this.cleanup();
        this.isInitialized = false;
        this.currentSentence = '';
    }
    
    // Cleanup on page unload
    onPageUnload() {
        this.cleanup();
    }
}

// Initialize the reading assessment when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.ReadingAssessment = new ReadingAssessment();
}); 