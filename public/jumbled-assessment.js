// Jumbled Assessment Module

class JumbledAssessment {
    constructor() {
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.totalQuestions = 5;
        this.currentScore = 0;
        this.isInitialized = false;
        
        // Topic and difficulty selection properties
        this.topics = [
            'Everyday activities',
            'Work and career',
            'Education and learning',
            'Family and relationships',
            'Hobbies and interests',
            'Food and cooking',
            'Transportation',
            'Social situations'
        ];
        this.difficulties = ['beginner', 'intermediate', 'advanced'];
        this.selectedTopic = null;
        this.selectedDifficulty = null;
        
        this.initializeElements();
        this.initializeEventListeners();
    }

    initializeElements() {
        this.elements = {
            loading: document.getElementById('jumbled-loading'),
            game: document.getElementById('jumbled-game'),
            current: document.getElementById('jumbled-current'),
            total: document.getElementById('jumbled-total'),
            sentence: document.getElementById('jumbled-sentence'),
            answer: document.getElementById('jumbled-answer'),
            submit: document.getElementById('jumbled-submit'),
            feedback: document.getElementById('jumbled-feedback'),
            results: document.getElementById('jumbled-results'),
            score: document.getElementById('jumbled-score')
        };
    }

    initializeEventListeners() {
        if (this.elements.submit) {
            this.elements.submit.addEventListener('click', () => this.submitAnswer());
        }
        
        if (this.elements.answer) {
            this.elements.answer.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.submitAnswer();
                }
            });
            
            // Clear feedback when user starts typing
            this.elements.answer.addEventListener('input', () => {
                this.elements.feedback.textContent = '';
                this.elements.feedback.className = 'jumbled-feedback';
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
        
        console.log(`Jumbled assessment selected topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
        
        return {
            topic: this.selectedTopic,
            difficulty: this.selectedDifficulty
        };
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        this.resetUI();
        
        // Select random topic and difficulty for this assessment session
        this.selectRandomTopicAndDifficulty();
        
        // Use pre-generated questions instead of generating new ones
        if (window.assessmentController && window.assessmentController.preGeneratedQuestions.jumbled) {
            this.usePreGeneratedQuestions(window.assessmentController.preGeneratedQuestions.jumbled);
        } else {
            // Fallback to generating questions if pre-generation failed
            await this.startJumbledGame();
        }
        
        this.isInitialized = true;
    }

    resetUI() {
        // Show loading, hide everything else
        this.elements.loading.style.display = 'block';
        this.elements.game.style.display = 'none';
        this.elements.results.style.display = 'none';
        
        // Reset game state
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.currentScore = 0;
        
        // Clear input and feedback
        if (this.elements.answer) {
            this.elements.answer.value = '';
        }
        this.elements.feedback.textContent = '';
        this.elements.feedback.className = 'jumbled-feedback';
    }

    async startJumbledGame() {
        try {
            console.log('Starting jumbled sentences game...');
            console.log(`Using topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
            
            const response = await fetch('/api/jumbled/start', {
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
            
            if (data.error) {
                throw new Error(data.error);
            }

            if (data.jumbled) {
                this.displayQuestion(data);
            } else {
                throw new Error('No jumbled sentence received from server');
            }
            
        } catch (error) {
            console.error('Error starting jumbled game:', error);
            this.showError('Failed to start jumbled sentences game. Please try refreshing the page.');
        }
    }

    usePreGeneratedQuestions(data) {
        console.log('Using pre-generated jumbled questions');
        
        if (data.jumbled) {
            // Use topic and difficulty from pre-generated data if available
            if (data.topic && data.difficulty) {
                this.selectedTopic = data.topic;
                this.selectedDifficulty = data.difficulty;
                console.log(`Using pre-generated topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
            }
            
            this.displayQuestion(data);
        } else {
            console.error('No jumbled question found in pre-generated data');
            // Fallback to generating new questions
            this.startJumbledGame();
        }
    }

    displayQuestion(data) {
        // Hide loading, show game
        this.elements.loading.style.display = 'none';
        this.elements.game.style.display = 'block';
        
        // Update question display
        this.elements.sentence.textContent = data.jumbled || data.nextJumbled;
        
        // Clear input and focus
        this.elements.answer.value = '';
        this.elements.answer.focus();
        
        // Clear previous feedback
        this.elements.feedback.textContent = '';
        this.elements.feedback.className = 'jumbled-feedback';
        
        console.log('Question displayed:', data.jumbled || data.nextJumbled);

        // Update global question indicator
        if (window.assessmentController && typeof window.assessmentController.updateNavigation === 'function') {
            window.assessmentController.updateNavigation();
        }
    }

    async submitAnswer() {
        const userAnswer = this.elements.answer.value.trim();
        
        if (!userAnswer) {
            this.showFeedback('Please enter an answer before submitting.', 'warning');
            return;
        }
        
        console.log('Submitting answer:', userAnswer);
        
        try {
            // Disable submit button during processing
            this.elements.submit.disabled = true;
            this.elements.submit.textContent = 'Submitting...';
            
            const response = await fetch('/api/jumbled/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    answer: userAnswer
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Submit result:', result);
            
            this.handleSubmitResult(result);
            
        } catch (error) {
            console.error('Error submitting answer:', error);
            this.showFeedback('Failed to submit answer. Please try again.', 'error');
        } finally {
            // Re-enable submit button
            this.elements.submit.disabled = false;
            this.elements.submit.textContent = 'Submit Answer';
        }
    }

    handleSubmitResult(result) {
        const isCorrect = result.correct;
        
        // Update score if correct
        if (isCorrect) {
            this.currentScore += 20; // 20 points per question
        }
        
        // Immediately proceed to next question or complete assessment
        if (result.complete) {
            // Assessment complete - use backend calculated score
            this.showFinalResults(result.finalScore);
        } else {
            // Move to next question
            this.currentQuestionIndex++;
            this.displayQuestion({
                jumbled: result.nextJumbled,
                totalQuestions: result.totalQuestions,
                currentQuestion: result.currentQuestion
            });
        }
    }

    showFeedback(message, type) {
        this.elements.feedback.textContent = message;
        this.elements.feedback.className = `jumbled-feedback ${type}`;
        
        // Add warning class styling if not correct/incorrect
        if (type === 'warning') {
            this.elements.feedback.style.backgroundColor = '#fff3cd';
            this.elements.feedback.style.color = '#856404';
            this.elements.feedback.style.border = '1px solid #ffeaa7';
        } else if (type === 'error') {
            this.elements.feedback.style.backgroundColor = '#f8d7da';
            this.elements.feedback.style.color = '#721c24';
            this.elements.feedback.style.border = '1px solid #f5c6cb';
        }
    }

    showFinalResults(finalScore) {
        // Hide game and clear any content to avoid stops
        this.elements.game.style.display = 'none';
        
        // Store results for final display but don't show individual results
        // Results section remains hidden
        
        // Notify main controller that assessment is complete and auto-advance
        if (window.assessmentController) {
            window.assessmentController.onAssessmentComplete('jumbled', finalScore);
            // Auto-advance to next section after a brief delay
            setTimeout(() => {
                window.assessmentController.nextStep();
            }, 500);
        }

        console.log('Jumbled sentences assessment completed - results stored for final analysis');
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
        this.elements.game.style.display = 'none';
        
        // Create or update error display
        let errorDiv = document.getElementById('jumbled-error');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'jumbled-error';
            errorDiv.style.cssText = `
                text-align: center;
                padding: 40px;
                color: #721c24;
                background-color: #f8d7da;
                border: 1px solid #f5c6cb;
                border-radius: 10px;
                margin: 20px;
            `;
            this.elements.loading.parentNode.appendChild(errorDiv);
        }
        
        errorDiv.innerHTML = `
            <h3>❌ Error</h3>
            <p>${message}</p>
            <button onclick="location.reload()" style="
                margin-top: 20px;
                padding: 10px 20px;
                background: #dc3545;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
            ">Refresh Page</button>
        `;
        errorDiv.style.display = 'block';
    }

    // Reset the assessment for retrying
    reset() {
        this.isInitialized = false;
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.currentScore = 0;
        
        if (this.elements.answer) {
            this.elements.answer.value = '';
        }
        this.elements.feedback.textContent = '';
        this.elements.feedback.className = 'jumbled-feedback';
    }

    // Utility method to get progress percentage
    getProgressPercentage() {
        return ((this.currentQuestionIndex + 1) / this.totalQuestions) * 100;
    }

    // Utility method to get current question number
    getCurrentQuestionNumber() {
        return this.currentQuestionIndex + 1;
    }

    // Method to check if assessment is complete
    isComplete() {
        return this.currentQuestionIndex >= this.totalQuestions;
    }

    // Method to get current score
    getCurrentScore() {
        return this.currentScore;
    }
}

// Initialize the jumbled assessment when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.JumbledAssessment = new JumbledAssessment();
}); 