// Mobile Detection for Index Page
class MobileHandler {
    static isMobile() {
        // Check user agent for mobile devices
        const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
        const userAgent = navigator.userAgent;
        
        // Check screen size (consider tablets as mobile for assessment purposes)
        const screenWidth = window.innerWidth || document.documentElement.clientWidth;
        const isMobileScreen = screenWidth <= 1024;
        
        // Check for touch capability
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        return mobileRegex.test(userAgent) || (isMobileScreen && isTouchDevice);
    }
    
    static showMobileWarningOnIndex() {
        // Only show on index page
        if (!window.location.pathname.includes('index.html') && window.location.pathname !== '/') {
            return;
        }
        
        // Create mobile warning container
        let warningContainer = document.getElementById('mobile-warning-container');
        if (!warningContainer) {
            warningContainer = document.createElement('div');
            warningContainer.id = 'mobile-warning-container';
            
            // Insert before the hero CTA
            const heroCta = document.querySelector('.hero-cta');
            if (heroCta) {
                heroCta.parentNode.insertBefore(warningContainer, heroCta);
            }
        }
        
        warningContainer.innerHTML = `
            <div class="mobile-warning">
                <div class="warning-icon">💻</div>
                <h3>Desktop or Laptop Required</h3>
                <p>Our Communication Assessment Suite is designed for desktop and laptop computers to ensure optimal performance and accurate results.</p>
                <p><strong>Please access this platform from a desktop or laptop computer.</strong></p>
                <div class="mobile-features">
                    <p><small>✓ Microphone access required<br>
                    ✓ Advanced speech recognition<br>
                    ✓ Complex assessment interface</small></p>
                </div>
            </div>
        `;
        warningContainer.style.display = 'block';
        
        // Hide the Get Started button on mobile
        const getStartedBtn = document.querySelector('.hero-cta .btn');
        if (getStartedBtn) {
            getStartedBtn.style.display = 'none';
        }
        
        // Hide/disable navigation buttons on mobile
        const navLinks = document.querySelector('.nav-links');
        if (navLinks) {
            navLinks.style.display = 'none';
        }
        
        // Alternative: Replace nav links with desktop message
        // You can uncomment this if you prefer showing a message instead of hiding
        /*
        if (navLinks) {
            navLinks.innerHTML = `
                <div class="mobile-nav-message">
                    <span style="color: rgba(255,255,255,0.8); font-size: 0.9rem;">
                        Please use desktop to access
                    </span>
                </div>
            `;
        }
        */
    }
    
    static init() {
        if (this.isMobile()) {
            this.showMobileWarningOnIndex();
            
            // Add mobile class to body for CSS targeting
            document.body.classList.add('mobile-device');
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    MobileHandler.init();
});

// Re-check on window resize (for device rotation)
window.addEventListener('resize', () => {
    clearTimeout(window.mobileCheckTimeout);
    window.mobileCheckTimeout = setTimeout(() => {
        MobileHandler.init();
    }, 250);
});

// Export for global use
window.MobileHandler = MobileHandler;