// Story Summarization Assessment Module - Azure Speech SDK Implementation

class StoryAssessment {
    constructor() {
        this.currentStory = '';
        this.audioUrl = '';
        this.recognizer = null;
        this.isRecording = false;
        this.isInitialized = false;
        this.azureConfig = null;
        this.playCount = 2;
        this.userSummary = '';
        
        // Topic and difficulty selection properties
        this.topics = [
            'Adventure stories',
            'Historical tales',
            'Science fiction',
            'Mystery and detective',
            'Biographical stories',
            'Folklore and legends',
            'Contemporary fiction',
            'Educational narratives'
        ];
        this.difficulties = ['beginner', 'intermediate', 'advanced'];
        this.selectedTopic = null;
        this.selectedDifficulty = null;
        
        this.initializeElements();
        this.initializeEventListeners();
    }

    initializeElements() {
        this.elements = {
            loading: document.getElementById('story-loading'),
            player: document.getElementById('story-player'),
            audio: document.getElementById('story-audio'),
            playCount: document.getElementById('story-play-count'),
            summarySection: document.getElementById('story-summary-section'),
            recordBtn: document.getElementById('story-record-btn'),
            stopBtn: document.getElementById('story-stop-btn'),
            status: document.getElementById('story-status'),
            results: document.getElementById('story-results'),
            score: document.getElementById('story-score'),
            feedback: document.getElementById('story-feedback')
        };
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
            this.elements.audio.addEventListener('play', () => {
                if (this.playCount > 0) {
                    this.playCount--;
                    this.elements.playCount.textContent = this.playCount;
                    
                    // Disable controls and prevent pausing during playback
                    this.elements.audio.controls = false;
                    
                    // Show summary section but disable recording while audio is playing
                    this.elements.summarySection.style.display = 'block';
                    this.disableRecording();
                    
                    if (this.playCount === 0) {
                        // After second play, disable the custom play button when ended
                        this.elements.audio.addEventListener('ended', () => {
                            this.createCustomPlayButton(true); // Disable the button
                            this.enableRecording(); // Enable recording after audio ends
                        }, { once: true });
                    } else {
                        // For first play, enable recording when audio ends
                        this.elements.audio.addEventListener('ended', () => {
                            this.enableRecording();
                        }, { once: true });
                    }
                } else {
                    // Prevent playing if no plays remaining
                    this.elements.audio.pause();
                    this.elements.audio.currentTime = 0;
                }
            });
            
            this.elements.audio.addEventListener('error', (e) => {
                console.error('Audio playback error:', e);
                // Don't show error message automatically - let user try to play first
                // Error will be handled when user actually tries to interact with audio
            });
            
            // Add canplaythrough event to ensure audio is ready
            this.elements.audio.addEventListener('canplaythrough', () => {
                console.log('Audio is ready to play');
            });
            
            // Prevent seeking/scrubbing during playback
            this.elements.audio.addEventListener('seeking', (e) => {
                if (!this.elements.audio.paused) {
                    // Prevent seeking during playback by stopping the seek action
                    e.preventDefault();
                    return false;
                }
            });
            
            // Additional prevention for seeking
            this.elements.audio.addEventListener('timeupdate', () => {
                // Store the current playback time to prevent manual seeking
                if (!this.elements.audio.paused) {
                    this.lastPlaybackTime = this.elements.audio.currentTime;
                }
            });
            
            // Re-enable controls when audio ends for next play (if plays remaining)
            this.elements.audio.addEventListener('ended', () => {
                if (this.playCount > 0) {
                    this.createCustomPlayButton(false);
                }
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
        
        console.log(`Story assessment selected topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
        
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
        if (window.assessmentController && window.assessmentController.preGeneratedQuestions.story) {
            this.usePreGeneratedStory(window.assessmentController.preGeneratedQuestions.story);
        } else {
            // Fallback to generating story if pre-generation failed
            await this.generateStoryAndAudio();
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
        this.elements.results.style.display = 'none';
        
        // Reset state
        this.playCount = 2;
        this.userSummary = '';
        this.isRecording = false;
        this.elements.recordBtn.style.display = 'inline-block';
        this.elements.recordBtn.disabled = true;
        this.elements.recordBtn.innerHTML = 'Start Recording Summary';
        this.elements.recordBtn.classList.add('disabled');
        this.elements.stopBtn.style.display = 'none';
        this.elements.status.textContent = 'Please listen to the audio before recording';
        this.elements.status.className = 'recording-status';
        // Always show the summary section on the right
        this.elements.summarySection.style.display = 'block';
        
        // Reset play count display
        if (this.elements.playCount) {
            this.elements.playCount.textContent = this.playCount;
        }
        
        // Reset audio
        if (this.elements.audio) {
            this.elements.audio.src = '';
            this.elements.audio.controls = false;
        }
        
        // Remove any existing custom controls
        const existingControls = document.querySelector('.custom-audio-controls');
        if (existingControls) {
            existingControls.remove();
        }
    }

    async generateStoryAndAudio() {
        try {
            console.log('Generating story and audio...');
            console.log(`Using topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
            
            const response = await fetch('/api/story/generate', {
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
            
            if (data.story && data.audioUrl) {
                this.currentStory = data.story;
                this.audioUrl = data.audioUrl;
                this.displayStoryContent();
            } else {
                throw new Error('Incomplete story content received from server');
            }
            
        } catch (error) {
            console.error('Error generating story content:', error);
            this.showError('Failed to generate story content. Please try refreshing the page.');
        }
    }

    usePreGeneratedStory(data) {
        console.log('Using pre-generated story content');
        
        if (data.story && data.audioUrl) {
            this.currentStory = data.story;
            this.audioUrl = data.audioUrl;
            
            // Use topic and difficulty from pre-generated data if available
            if (data.topic && data.difficulty) {
                this.selectedTopic = data.topic;
                this.selectedDifficulty = data.difficulty;
                console.log(`Using pre-generated topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
            }
            
            this.displayStoryContent();
        } else {
            console.error('No story content found in pre-generated data');
            // Fallback to generating new story
            this.generateStoryAndAudio();
        }
    }

    displayStoryContent() {
        this.elements.loading.style.display = 'none';
        this.elements.player.style.display = 'block';
        
        // Set audio source and remove standard controls
        this.elements.audio.src = this.audioUrl;
        this.elements.audio.controls = false;
        this.elements.audio.load();
        
        // Reset play count display
        this.elements.playCount.textContent = this.playCount;
        
        // Create custom play button
        this.createCustomPlayButton(false);
        
        // Initially disable recording until user plays audio
        this.disableRecording();
        
        console.log('Story content displayed');
        console.log('Story:', this.currentStory);
        console.log('Audio URL:', this.audioUrl);
    }

    createCustomPlayButton(disabled = false) {
        // Find or create custom controls container
        let customControls = document.querySelector('.custom-audio-controls');
        if (!customControls) {
            customControls = document.createElement('div');
            customControls.className = 'custom-audio-controls';
            this.elements.audio.parentNode.insertBefore(customControls, this.elements.audio.nextSibling);
        }
        
        // Clear existing controls
        customControls.innerHTML = '';
        
        if (!disabled && this.playCount > 0) {
            // Create play button
            const playButton = document.createElement('button');
            playButton.className = 'custom-play-btn';
            playButton.innerHTML = 'Play Story';
            playButton.disabled = false;
            
            playButton.addEventListener('click', () => {
                if (this.playCount > 0) {
                    const playPromise = this.elements.audio.play();
                    playButton.disabled = true;
                    playButton.innerHTML = 'Playing...';
                    
                    // Handle play failure
                    if (playPromise && typeof playPromise.then === 'function') {
                        playPromise.catch((error) => {
                            console.error('Failed to play audio:', error);
                            this.showError('Audio playback failed. Please try refreshing the page.');
                            // Re-enable button on failure
                            playButton.disabled = false;
                            playButton.innerHTML = 'Play Story';
                        });
                    }
                }
            });
            
            customControls.appendChild(playButton);
        } else {
            // Create disabled button or message
            const disabledButton = document.createElement('button');
            disabledButton.className = 'custom-play-btn disabled';
            disabledButton.innerHTML = 'No more plays remaining';
            disabledButton.disabled = true;
            customControls.appendChild(disabledButton);
        }
    }

    disableRecording() {
        if (this.elements.recordBtn) {
            this.elements.recordBtn.disabled = true;
            this.elements.recordBtn.innerHTML = 'Recording Disabled (Audio Playing)';
            this.elements.recordBtn.classList.add('disabled');
        }
    }

    enableRecording() {
        if (this.elements.recordBtn && !this.isRecording) {
            this.elements.recordBtn.disabled = false;
            this.elements.recordBtn.innerHTML = 'Start Recording Summary';
            this.elements.recordBtn.classList.remove('disabled');
        }
    }

    async startRecording() {
        if (this.isRecording || !this.azureConfig) return;
        
        // Prevent recording if audio is currently playing
        if (this.elements.audio && !this.elements.audio.paused) {
            return;
        }

        try {
            console.log('Starting story summary recording with Azure Speech SDK...');
            
            const SpeechSDK = window.SpeechSDK;
            
            // Create speech configuration for continuous recognition
            const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
                this.azureConfig.token, 
                this.azureConfig.region
            );
            speechConfig.speechRecognitionLanguage = 'en-US';

            // Create audio configuration
            const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

            // Create speech recognizer for continuous recognition
            this.recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

            this.userSummary = '';
            this.isRecording = true;
            
            // Update UI
            this.elements.recordBtn.style.display = 'none';
            this.elements.stopBtn.style.display = 'inline-block';
            this.elements.status.innerHTML = '<span class="audio-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>Recording... Summarize the story you just heard';
            this.elements.status.className = 'recording-status recording';
            
            // Handle recognition events
            this.recognizer.recognizing = (s, e) => {
                // Show intermediate results
                const interim = this.userSummary + e.result.text;
                this.elements.status.innerHTML = `<span class="audio-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>Recording... "${interim}"`;
            };

            this.recognizer.recognized = (s, e) => {
                if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech && e.result.text.trim()) {
                    this.userSummary += e.result.text + ' ';
                    this.elements.status.innerHTML = `<span class="audio-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></span>Recording... "${this.userSummary.trim()}"`;
                }
            };

            this.recognizer.canceled = (s, e) => {
                console.log('Recognition canceled:', e.reason);
                this.stopRecording();
            };

            // Start continuous recognition
            this.recognizer.startContinuousRecognitionAsync(
                () => {
                    console.log('Continuous recognition started');
                },
                (err) => {
                    console.error('Failed to start recognition:', err);
                    this.showError('Failed to start recording. Please check microphone permissions.');
                    this.isRecording = false;
                    this.elements.recordBtn.style.display = 'inline-block';
                    this.elements.stopBtn.style.display = 'none';
                }
            );
            
        } catch (error) {
            console.error('Error starting story recording:', error);
            this.showError('Could not start recording. Please check your microphone permissions.');
            this.isRecording = false;
            this.elements.recordBtn.style.display = 'inline-block';
            this.elements.stopBtn.style.display = 'none';
        }
    }

    stopRecording() {
        if (this.recognizer && this.isRecording) {
            console.log('Stopping story recording...');
            
            this.recognizer.stopContinuousRecognitionAsync(
                () => {
                    this.isRecording = false;
                    this.elements.recordBtn.style.display = 'inline-block';
                    this.elements.stopBtn.style.display = 'none';
                    this.elements.status.textContent = 'Processing your summary...';
                    this.elements.status.className = 'recording-status';
                    
                    // Process the recorded summary
                    this.processSummary();
                },
                (err) => {
                    console.error('Error stopping recognition:', err);
                    this.isRecording = false;
                }
            );
        }
    }

    async processSummary() {
        if (!this.userSummary.trim()) {
            this.showError('No summary was recorded. Please try again.');
            this.elements.status.textContent = '';
            return;
        }

        try {
            console.log('Processing story summary:', this.userSummary);
            
            this.elements.status.textContent = 'Evaluating your summary...';
            
            const response = await fetch('/api/story/evaluate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userSummary: this.userSummary.trim()
                })
            });

            if (!response.ok) {
                throw new Error(`Evaluation failed: ${response.status}`);
            }

            const result = await response.json();
            console.log('Story evaluation result:', result);
            
            this.displayResults(result);
            
        } catch (error) {
            console.error('Error processing story summary:', error);
            this.showError('Failed to evaluate summary. Please try again.');
        }
    }

    displayResults(result) {
        // Hide player and clear status to avoid stops
        this.elements.player.style.display = 'none';
        this.elements.status.textContent = '';
        this.elements.status.style.color = '';
        
        // Store results for final display but don't show individual results
        // Results section remains hidden
        
        // Notify main controller that assessment is complete and auto-advance
        if (window.assessmentController) {
            window.assessmentController.onAssessmentComplete('story', result.score);
            // Auto-advance to next section after a brief delay
            setTimeout(() => {
                window.assessmentController.nextStep();
            }, 500);
        }
        
        console.log('Story summarization assessment completed - results stored for final analysis');
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
        this.elements.status.textContent = `${message}`;
        this.elements.status.style.color = '#dc3545';
        this.elements.status.className = 'recording-status error';
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
                 console.log('Error closing story recognizer:', e);
             }
             this.recognizer = null;
         }
         
         if (this.elements.audio) {
             this.elements.audio.pause();
             this.elements.audio.src = '';
             // Remove event listeners
             this.elements.audio.removeEventListener('play', this.audioPlayHandler);
             this.elements.audio.removeEventListener('error', this.audioErrorHandler);
         }
         
         this.isRecording = false;
         this.userSummary = '';
     }

    // Reset the assessment for retrying
    reset() {
        this.cleanup();
        this.isInitialized = false;
        this.currentStory = '';
        this.audioUrl = '';
        this.playCount = 2;
    }
    
    // Cleanup on page unload
    onPageUnload() {
        this.cleanup();
    }
}

// Initialize the story assessment when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.StoryAssessment = new StoryAssessment();
}); 