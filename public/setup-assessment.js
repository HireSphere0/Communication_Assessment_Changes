// Pre-Assessment Setup Controller

class SetupAssessment {
    constructor() {
        this.checks = {
            browser: false,
            microphone: false,
            audio: false,
            connection: false
        };
        this.mediaStream = null;
        this.testAudio = null;
        this.isStartingAssessment = false; // Flag to prevent double starts
    }

    initialize() {
        this.setupEventListeners();
        this.runAllChecks();
    }

    setupEventListeners() {
        // Back to overview button
        document.getElementById('back-to-overview').addEventListener('click', () => {
            this.goBackToOverview();
        });

        // Final start assessment button
        document.getElementById('start-assessment-final').addEventListener('click', () => {
            this.startFinalAssessment();
        });

        // Test microphone button
        document.getElementById('test-mic-btn').addEventListener('click', () => {
            this.testMicrophone();
        });

        // Test audio button
        document.getElementById('test-audio-btn').addEventListener('click', () => {
            this.testAudioPlayback();
        });

        // Try again microphone button
        document.getElementById('try-again-mic-btn').addEventListener('click', () => {
            this.recheckMicrophone();
        });
    }

    async runAllChecks() {
        // Run checks sequentially with delays for better UX
        await this.checkBrowser();
        await this.delay(500);
        await this.checkConnection();
        await this.delay(500);
        await this.checkAudio();
        await this.delay(500);
        await this.checkMicrophone();

        // Update final button state
        this.updateFinalButton();
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async checkBrowser() {
        const checkItem = document.getElementById('browser-check');
        const icon = document.getElementById('browser-icon');
        const status = document.getElementById('browser-status');

        this.setCheckState(checkItem, icon, status, 'checking', '⏳', 'Checking browser compatibility...');

        await this.delay(1000);

        const userAgent = navigator.userAgent;
        const vendor = navigator.vendor || '';

        let browserName = 'Unknown';
        let isSupported = false;

        // Only support Chrome, Safari, and Edge
        if (/Edg\//.test(userAgent)) {
            browserName = 'Microsoft Edge';
            isSupported = true;
        } else if (/Safari\//.test(userAgent) && !/Chrome/.test(userAgent)) {
            browserName = 'Safari';
            isSupported = true;
        } else if (/Chrome\//.test(userAgent) && vendor.includes('Google')) {
            browserName = 'Google Chrome';
            isSupported = true;
        } else {
            // Detect other browsers but mark as unsupported
            if (/Firefox\//.test(userAgent)) {
                browserName = 'Firefox';
            } else if (/OPR\/|Opera\//.test(userAgent)) {
                browserName = 'Opera';
            } else if (vendor.includes('Brave') || /Brave\//.test(userAgent)) {
                browserName = 'Brave';
            } else if (/Chrome\//.test(userAgent)) {
                browserName = 'Chromium-based browser';
            } else if (/MSIE|Trident/.test(userAgent)) {
                browserName = 'Internet Explorer';
            } else {
                browserName = 'Unsupported browser';
            }
            isSupported = false;
        }

        if (isSupported) {
            this.checks.browser = true;
            this.setCheckState(checkItem, icon, status, 'success', '✅', `${browserName} detected - Compatible`);
        } else {
            this.setCheckState(checkItem, icon, status, 'error', '❌', `${browserName} detected - Incompatible. Please use Chrome, Safari, or Edge.`);
        }
    }

    async checkConnection() {
        const checkItem = document.getElementById('connection-check');
        const icon = document.getElementById('connection-icon');
        const status = document.getElementById('connection-status');

        this.setCheckState(checkItem, icon, status, 'checking', '⏳', 'Testing connection speed...');

        try {
            const startTime = Date.now();
            const response = await fetch('/api/auth/me', {
                method: 'GET',
                cache: 'no-cache'
            });
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            if (response.ok && responseTime < 5000) {
                this.checks.connection = true;
                this.setCheckState(checkItem, icon, status, 'success', '✅', `Connection stable (${responseTime}ms response time)`);
            } else {
                this.setCheckState(checkItem, icon, status, 'error', '⚠️', `Slow connection detected (${responseTime}ms). Assessment may be affected.`);
            }
        } catch (error) {
            this.setCheckState(checkItem, icon, status, 'error', '❌', 'Connection test failed. Please check your internet connection.');
        }
    }

    async checkAudio() {
        const checkItem = document.getElementById('audio-check');
        const icon = document.getElementById('audio-icon');
        const status = document.getElementById('audio-status');
        const testBtn = document.getElementById('test-audio-btn');

        this.setCheckState(checkItem, icon, status, 'checking', '⏳', 'Checking audio playback capability...');

        await this.delay(1000);

        try {
            // Test if audio context is available
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.checks.audio = true;
                this.setCheckState(checkItem, icon, status, 'success', '✅', 'Audio playback ready');
                testBtn.style.display = 'inline-block';
            } else {
                this.setCheckState(checkItem, icon, status, 'error', '❌', 'Audio playback not supported');
            }
        } catch (error) {
            this.setCheckState(checkItem, icon, status, 'error', '❌', 'Audio check failed');
        }
    }

    async checkMicrophone() {
        const checkItem = document.getElementById('microphone-check');
        const icon = document.getElementById('mic-icon');
        const status = document.getElementById('mic-status');
        const testBtn = document.getElementById('test-mic-btn');

        this.setCheckState(checkItem, icon, status, 'checking', '⏳', 'Requesting microphone access...');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaStream = stream;

            // Check if microphone is muted
            this.setCheckState(checkItem, icon, status, 'checking', '⏳', 'Checking microphone mute status...');
            
            const isMuted = await this.checkMicrophoneMuteStatus(stream);
            
            if (isMuted) {
                this.checks.microphone = false;
                this.setCheckState(checkItem, icon, status, 'error', '🔇', 'Microphone is muted. Please unmute your microphone and try again.');
                // Show the try again button
                const tryAgainBtn = document.getElementById('try-again-mic-btn');
                tryAgainBtn.style.display = 'inline-block';
                tryAgainBtn.disabled = false;
                // Stop the stream
                stream.getTracks().forEach(track => track.stop());
            } else {
                this.checks.microphone = true;
                this.setCheckState(checkItem, icon, status, 'success', '✅', 'Microphone access granted and unmuted');
                testBtn.style.display = 'inline-block';
                // Hide the try again button since microphone is working
                const tryAgainBtn = document.getElementById('try-again-mic-btn');
                tryAgainBtn.style.display = 'none';
                // Stop the stream for now
                stream.getTracks().forEach(track => track.stop());
            }
        } catch (error) {
            let errorMessage = 'Microphone access denied or unavailable';

            if (error.name === 'NotAllowedError') {
                errorMessage = 'Microphone access denied. Please allow microphone access and refresh the page.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'No microphone found. Please connect a microphone.';
            } else if (error.name === 'NotReadableError') {
                errorMessage = 'Microphone is being used by another application.';
            }

            this.setCheckState(checkItem, icon, status, 'error', '❌', errorMessage);
            
            // Show try again button for permission errors (user can grant permission and try again)
            if (error.name === 'NotAllowedError') {
                const tryAgainBtn = document.getElementById('try-again-mic-btn');
                tryAgainBtn.style.display = 'inline-block';
                tryAgainBtn.disabled = false;
            }
        }
    }

    async recheckMicrophone() {
        const tryAgainBtn = document.getElementById('try-again-mic-btn');
        const testBtn = document.getElementById('test-mic-btn');
        
        // Hide the try again button and disable it during recheck
        tryAgainBtn.style.display = 'none';
        tryAgainBtn.disabled = true;
        testBtn.style.display = 'none';
        
        // Run the microphone check again
        await this.checkMicrophone();
    }

    async checkMicrophoneMuteStatus(stream) {
        return new Promise((resolve) => {
            try {
                // Create audio context to analyze audio levels
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const analyser = audioContext.createAnalyser();
                const microphone = audioContext.createMediaStreamSource(stream);
                microphone.connect(analyser);

                analyser.fftSize = 256;
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                let maxVolume = 0;
                let checkCount = 0;
                const maxChecks = 30; // Check for 3 seconds (100ms intervals)
                const volumeThreshold = 5; // Minimum volume to consider unmuted

                const checkVolume = () => {
                    analyser.getByteFrequencyData(dataArray);
                    const volume = Math.max(...dataArray);
                    maxVolume = Math.max(maxVolume, volume);
                    checkCount++;

                    if (checkCount >= maxChecks) {
                        // Test complete
                        audioContext.close();
                        
                        // If we detected any volume above threshold, mic is not muted
                        const isMuted = maxVolume <= volumeThreshold;
                        resolve(isMuted);
                    } else {
                        setTimeout(checkVolume, 100);
                    }
                };

                // Start checking volume
                checkVolume();

            } catch (error) {
                console.error('Error checking microphone mute status:', error);
                // If we can't check, assume it's not muted to avoid blocking
                resolve(false);
            }
        });
    }

    async testMicrophone() {
        const testBtn = document.getElementById('test-mic-btn');
        const status = document.getElementById('mic-status');

        try {
            testBtn.disabled = true;
            testBtn.textContent = 'Testing...';

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Create audio context to analyze audio levels
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(stream);
            microphone.connect(analyser);

            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            let maxVolume = 0;
            let testDuration = 3000; // 3 seconds
            let startTime = Date.now();
            const volumeThreshold = 5; // Minimum volume to consider unmuted

            const checkVolume = () => {
                analyser.getByteFrequencyData(dataArray);
                const volume = Math.max(...dataArray);
                maxVolume = Math.max(maxVolume, volume);

                if (Date.now() - startTime < testDuration) {
                    requestAnimationFrame(checkVolume);
                } else {
                    // Test complete
                    stream.getTracks().forEach(track => track.stop());
                    audioContext.close();

                    if (maxVolume <= volumeThreshold) {
                        status.textContent = 'Microphone appears to be muted or no audio detected. Please unmute your microphone and try again.';
                        status.style.color = '#721c24';
                        // Update the main check status as well
                        const checkItem = document.getElementById('microphone-check');
                        const icon = document.getElementById('mic-icon');
                        this.checks.microphone = false;
                        this.setCheckState(checkItem, icon, status, 'error', '🔇', 'Microphone is muted. Please unmute your microphone and try again.');
                        // Show the try again button
                        const tryAgainBtn = document.getElementById('try-again-mic-btn');
                        tryAgainBtn.style.display = 'inline-block';
                        tryAgainBtn.disabled = false;
                        this.updateFinalButton();
                    } else if (maxVolume > 10) {
                        status.textContent = `Microphone working perfectly! Max volume detected: ${maxVolume}`;
                        status.style.color = '#155724';
                        // Update the main check status as well
                        const checkItem = document.getElementById('microphone-check');
                        const icon = document.getElementById('mic-icon');
                        this.checks.microphone = true;
                        this.setCheckState(checkItem, icon, status, 'success', '✅', 'Microphone access granted and unmuted');
                        // Hide the try again button since microphone is working
                        const tryAgainBtn = document.getElementById('try-again-mic-btn');
                        tryAgainBtn.style.display = 'none';
                        this.updateFinalButton();
                    } else {
                        status.textContent = `Microphone detected with low volume (${maxVolume}). Consider speaking louder or adjusting microphone settings.`;
                        status.style.color = '#856404';
                        // Still consider it working but with warning
                        const checkItem = document.getElementById('microphone-check');
                        const icon = document.getElementById('mic-icon');
                        this.checks.microphone = true;
                        this.setCheckState(checkItem, icon, status, 'success', '✅', 'Microphone access granted and unmuted');
                        // Hide the try again button since microphone is working
                        const tryAgainBtn = document.getElementById('try-again-mic-btn');
                        tryAgainBtn.style.display = 'none';
                        this.updateFinalButton();
                    }

                    testBtn.disabled = false;
                    testBtn.textContent = 'Test Again';
                }
            };

            status.textContent = 'Speak into your microphone for 3 seconds...';
            status.style.color = '#856404';
            checkVolume();

        } catch (error) {
            testBtn.disabled = false;
            testBtn.textContent = 'Test Microphone';
            status.textContent = 'Microphone test failed: ' + error.message;
            status.style.color = '#721c24';
        }
    }

    async testAudioPlayback() {
        const testBtn = document.getElementById('test-audio-btn');
        const status = document.getElementById('audio-status');

        try {
            testBtn.disabled = true;
            testBtn.textContent = 'Playing...';

            // Create a simple test tone
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);

            oscillator.start();

            setTimeout(() => {
                oscillator.stop();
                audioContext.close();

                status.textContent = 'Audio test completed. If you did not hear the tone, please increase your volume and run the test again.';
                status.style.color = '#155724';
                testBtn.disabled = false;
                testBtn.textContent = 'Test Again';
            }, 1000);

        } catch (error) {
            testBtn.disabled = false;
            testBtn.textContent = 'Test Audio';
            status.textContent = 'Audio test failed: ' + error.message;
            status.style.color = '#721c24';
        }
    }

    setCheckState(checkItem, icon, status, state, iconText, statusText) {
        // Remove all state classes
        checkItem.classList.remove('checking', 'success', 'error');

        // Add new state class
        checkItem.classList.add(state);

        // Update icon and status
        icon.textContent = iconText;
        status.textContent = statusText;
    }

    updateFinalButton() {
        const finalButton = document.getElementById('start-assessment-final');
        const requiredChecks = ['browser', 'connection', 'microphone'];

        const allRequiredPassed = requiredChecks.every(check => this.checks[check]);

        finalButton.disabled = !allRequiredPassed;

        if (allRequiredPassed) {
            finalButton.textContent = 'Start Assessment';
        } else {
            finalButton.textContent = 'Complete Setup First';
        }
    }

    goBackToOverview() {
        // Clean up any media streams
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }

        document.getElementById('setup-section').style.display = 'none';
        document.getElementById('welcome-section').style.display = 'block';

        // Hide submit button when going back to overview
        if (window.hideSubmitButton) {
            window.hideSubmitButton();
        }
    }

    async startFinalAssessment() {
        // Prevent double starts
        if (this.isStartingAssessment) {
            console.log('Assessment start already in progress, ignoring duplicate call');
            return;
        }

        this.isStartingAssessment = true;

        // Disable the start button to prevent multiple clicks
        const startButton = document.getElementById('start-assessment-final');
        if (startButton) {
            startButton.disabled = true;
            startButton.textContent = 'Starting Assessment...';
        }

        try {
            // Update test count before starting
            const response = await fetch('/api/auth/me');
            if (response.ok) {
                const userData = await response.json();

                // Update the main assessment controller's test count
                if (window.assessmentController) {
                    window.assessmentController.displayTestCount(userData.number_of_tests);
                }
            }

            // Hide setup section
            document.getElementById('setup-section').style.display = 'none';

            // Start the actual assessment
            if (window.assessmentController) {
                await window.assessmentController.startAssessment();
            }
        } catch (error) {
            console.error('Error starting final assessment:', error);

            // Re-enable button on error
            if (startButton) {
                startButton.disabled = false;
                startButton.textContent = 'Start Assessment';
            }

            // Show setup section again on error
            document.getElementById('setup-section').style.display = 'block';

            // Reset flag on error
            this.isStartingAssessment = false;
        }
    }

    // Method to show setup section and update test count
    async showSetup() {
        document.getElementById('welcome-section').style.display = 'none';
        document.getElementById('setup-section').style.display = 'block';

        // Hide submit button during setup
        if (window.hideSubmitButton) {
            window.hideSubmitButton();
        }

        // Update test count in setup section
        try {
            const response = await fetch('/api/auth/me');
            if (response.ok) {
                const userData = await response.json();
                const testCountElement = document.getElementById('test-count-setup');
                if (testCountElement) {
                    testCountElement.textContent = userData.number_of_tests;
                }
            }
        } catch (error) {
            console.error('Error loading test count for setup:', error);
        }

        // Initialize setup checks
        this.initialize();
    }
}

// Create global instance
window.SetupAssessment = new SetupAssessment();