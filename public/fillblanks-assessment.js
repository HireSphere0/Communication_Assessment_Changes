// Fill in the Blanks Assessment Module

class FillBlanksAssessment {
    constructor() {
        this.questions = [];
        this.userAnswers = [];
        this.currentQuestionIndex = 0;
        this.isInitialized = false;
        
        // Topic and difficulty selection properties
        this.topics = [
            'Grammar patterns',
            'Vocabulary building',
            'Idiomatic expressions',
            'Academic writing',
            'Business correspondence',
            'Conversational English',
            'Technical terminology',
            'Cultural contexts'
        ];
        this.difficulties = ['beginner', 'intermediate', 'advanced'];
        this.selectedTopic = null;
        this.selectedDifficulty = null;
        
        this.initializeElements();
        this.initializeEventListeners();
    }

    initializeElements() {
        this.elements = {
            loading: document.getElementById('fillblanks-loading'),
            instructions: document.getElementById('fillblanks-instructions'),
            startBtn: document.getElementById('fillblanks-start-btn'),
            quiz: document.getElementById('fillblanks-quiz'),
            questionContainer: document.getElementById('fillblanks-question-container'),
            current: document.getElementById('fillblanks-current'),
            total: document.getElementById('fillblanks-total'),
            totalQuestions: document.getElementById('fillblanks-total-questions'),
            prevBtn: document.getElementById('fillblanks-prev-btn'),
            nextBtn: document.getElementById('fillblanks-next-btn'),
            submitBtn: document.getElementById('fillblanks-submit-btn'),
            progress: document.getElementById('fillblanks-progress'),
            answered: document.getElementById('fillblanks-answered'),
            results: document.getElementById('fillblanks-results'),
            score: document.getElementById('fillblanks-score'),
            feedback: document.getElementById('fillblanks-feedback')
        };
    }

    initializeEventListeners() {
        if (this.elements.startBtn) {
            this.elements.startBtn.addEventListener('click', () => this.startAssessment());
        }

        if (this.elements.prevBtn) {
            this.elements.prevBtn.addEventListener('click', () => this.previousQuestion());
        }
        
        if (this.elements.nextBtn) {
            this.elements.nextBtn.addEventListener('click', () => this.nextQuestion());
        }

        if (this.elements.submitBtn) {
            this.elements.submitBtn.addEventListener('click', () => this.submitQuiz());
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
        
        console.log(`Fill-in-the-blanks assessment selected topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
        
        return {
            topic: this.selectedTopic,
            difficulty: this.selectedDifficulty
        };
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        // Select random topic and difficulty for this session
        this.selectRandomTopicAndDifficulty();

        this.resetUI();
        // Skip instructions and start assessment automatically for continuous flow
        setTimeout(() => this.startAssessment(), 500);
        this.isInitialized = true;
    }

    resetUI() {
        // Show loading initially
        this.elements.loading.style.display = 'block';
        this.elements.instructions.style.display = 'none';
        this.elements.quiz.style.display = 'none';
        this.elements.results.style.display = 'none';
        
        // Reset state
        this.questions = [];
        this.userAnswers = [];
        this.currentQuestionIndex = 0;
    }

    showInstructions() {
        this.elements.loading.style.display = 'none';
        this.elements.instructions.style.display = 'block';
    }

    async startAssessment() {
        try {
            this.elements.startBtn.disabled = true;
            this.elements.startBtn.textContent = 'Loading Questions...';
            
            console.log('Starting fill-in-the-blanks assessment...');
            
            this.elements.instructions.style.display = 'none';
            this.elements.loading.style.display = 'block';

            // Use pre-generated questions instead of generating new ones
            if (window.assessmentController && window.assessmentController.preGeneratedQuestions.fillblanks) {
                const data = window.assessmentController.preGeneratedQuestions.fillblanks;
                if (data.success && data.questions) {
                    // Use topic and difficulty from pre-generated data if available
                    if (data.topic && data.difficulty) {
                        this.selectedTopic = data.topic;
                        this.selectedDifficulty = data.difficulty;
                        console.log(`🎯 Fill-in-the-blanks assessment: Using pre-generated topic "${this.selectedTopic}" with difficulty "${this.selectedDifficulty}"`);
                        console.log(`📊 Loaded ${data.questions.length} pre-generated questions`);
                    }
                    
                    this.questions = data.questions;
                    this.userAnswers = new Array(data.questions.length).fill(null);
                    this.displayQuiz();
                } else {
                    throw new Error('Failed to load pre-generated fill-in-the-blanks questions');
                }
            } else {
                // Fallback to generating questions if pre-generation failed
                console.log('Generating fill-in-the-blanks questions...');
                console.log(`Using topic: ${this.selectedTopic}, difficulty: ${this.selectedDifficulty}`);
                
                const response = await fetch('/api/fillblanks/generate', {
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
                
                if (data.success && data.questions) {
                    this.questions = data.questions;
                    this.userAnswers = new Array(data.questions.length).fill(null);
                    this.displayQuiz();
                } else {
                    throw new Error('Failed to generate fill-in-the-blanks questions');
                }
            }
            
        } catch (error) {
            console.error('Error loading fill-in-the-blanks questions:', error);
            this.showError('Failed to load questions. Please try again.');
        } finally {
            this.elements.startBtn.disabled = false;
            this.elements.startBtn.textContent = 'Start Assessment';
        }
    }

    displayQuiz() {
        this.elements.loading.style.display = 'none';
        this.elements.quiz.style.display = 'block';
        
        // Setup totals
        this.elements.total.textContent = this.questions.length;
        this.elements.totalQuestions.textContent = this.questions.length;
        this.currentQuestionIndex = 0;
        
        this.displayQuestion();
        this.updateProgress();
        
        console.log('Fill-in-the-blanks quiz displayed');
        console.log('Number of questions:', this.questions.length);
    }

    displayQuestion() {
        if (!this.questions || this.questions.length === 0) return;

        const question = this.questions[this.currentQuestionIndex];
        this.elements.current.textContent = this.currentQuestionIndex + 1;
        
        let questionHtml = `
            <div class="fillblanks-question-content">
                <h4>Question ${this.currentQuestionIndex + 1} of ${this.questions.length}</h4>
                <div class="question-sentence">
                    <p>${question.question}</p>
                </div>
                <div class="options-container">
                    <h5>Choose the best option:</h5>
        `;

        // Display options as radio buttons
        question.options.forEach((option, index) => {
            const isSelected = this.userAnswers[this.currentQuestionIndex] === option;
            questionHtml += `
                <label class="option-label ${isSelected ? 'selected' : ''}">
                    <input type="radio" name="fillblanks-q${this.currentQuestionIndex}" 
                           value="${option}" ${isSelected ? 'checked' : ''}
                           onchange="window.FillBlanksAssessment.saveAnswer('${option.replace(/'/g, "\\'")}')">
                    <span class="option-text">${option}</span>
                </label>
            `;
        });

        questionHtml += `
                </div>
            </div>
        `;

        this.elements.questionContainer.innerHTML = questionHtml;
        this.updateNavigation();
        // Update global question indicator
        if (window.assessmentController && typeof window.assessmentController.updateNavigation === 'function') {
            window.assessmentController.updateNavigation();
        }
    }

    saveAnswer(answer) {
        this.userAnswers[this.currentQuestionIndex] = answer;
        
        // Update visual selection
        const labels = this.elements.questionContainer.querySelectorAll('.option-label');
        labels.forEach(label => {
            label.classList.remove('selected');
            const input = label.querySelector('input[type="radio"]');
            if (input.value === answer) {
                label.classList.add('selected');
            }
        });
        
        this.updateProgress();
        
        console.log(`Question ${this.currentQuestionIndex + 1} answered:`, answer);
    }

    updateNavigation() {
        // Update navigation buttons
        this.elements.prevBtn.disabled = this.currentQuestionIndex === 0;
        this.elements.nextBtn.style.display = this.currentQuestionIndex < this.questions.length - 1 ? 'inline-block' : 'none';
        this.elements.submitBtn.style.display = this.currentQuestionIndex === this.questions.length - 1 ? 'inline-block' : 'none';
    }

    updateProgress() {
        // Update answered count and progress bar
        const answeredCount = this.userAnswers.filter(answer => answer !== null).length;
        this.elements.answered.textContent = answeredCount;
        
        const progressPercent = (answeredCount / this.questions.length) * 100;
        this.elements.progress.style.width = `${progressPercent}%`;
    }

    previousQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            this.displayQuestion();
        }
    }

    nextQuestion() {
        if (this.currentQuestionIndex < this.questions.length - 1) {
            this.currentQuestionIndex++;
            this.displayQuestion();
            if (window.assessmentController && typeof window.assessmentController.updateNavigation === 'function') {
                window.assessmentController.updateNavigation();
            }
        }
    }

    async submitQuiz() {
        try {
            console.log('Submitting fill-in-the-blanks quiz...', this.userAnswers);
            
            // Check if all questions are answered
            const unanswered = this.userAnswers.filter(answer => answer === null).length;
            if (unanswered > 0) {
                const confirm = window.confirm(`You have ${unanswered} unanswered questions. Submit anyway?`);
                if (!confirm) return;
            }

            this.elements.submitBtn.disabled = true;
            this.elements.submitBtn.textContent = 'Evaluating...';

            const response = await fetch('/api/fillblanks/evaluate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userAnswers: this.userAnswers
                })
            });

            if (!response.ok) {
                throw new Error(`Evaluation failed: ${response.status}`);
            }

            const result = await response.json();
            console.log('Fill-in-the-blanks result:', result);
            
            this.displayResults(result);
            
        } catch (error) {
            console.error('Error submitting quiz:', error);
            this.showError('Failed to evaluate quiz. Please try again.');
        } finally {
            this.elements.submitBtn.disabled = false;
            this.elements.submitBtn.textContent = 'Submit Quiz';
        }
    }

    displayResults(result) {
        // Hide quiz but don't show detailed results
        this.elements.quiz.style.display = 'none';
        
        // Show completion message instead of detailed results
        const completionMsg = document.createElement('div');
        completionMsg.style.cssText = 'text-align: center; padding: 20px; color: #28a745; font-size: 18px;';
        completionMsg.innerHTML = 'Grammar assessment completed!<br>Your language proficiency will be evaluated at the end.';
        
        // Insert completion message where quiz was
        this.elements.quiz.parentNode.insertBefore(completionMsg, this.elements.quiz.nextSibling);
        
        // Store the completion message element for cleanup
        this.completionMessage = completionMsg;
        
        // Store results for final display but don't show individual results
        // Results section remains hidden
        
        // Notify main controller that assessment is complete (last assessment)
        if (window.assessmentController) {
            window.assessmentController.onAssessmentComplete('fillblanks', result.score);
            // Show end of assessment section instead of auto-advancing
            setTimeout(() => {
                window.assessmentController.showEndOfAssessment();
            }, 500);
        }

        console.log('Fill-in-the-blanks assessment completed - showing end of assessment section');
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
        this.elements.instructions.style.display = 'block';
        alert(`❌ ${message}`);
    }

    // Reset the assessment for retrying
    reset() {
        this.isInitialized = false;
        this.questions = [];
        this.userAnswers = [];
        this.currentQuestionIndex = 0;
    }
}

// Initialize the fill-in-the-blanks assessment when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.FillBlanksAssessment = new FillBlanksAssessment();
}); 