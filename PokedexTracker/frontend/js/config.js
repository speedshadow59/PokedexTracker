// API Configuration
// In production (Azure Static Web Apps), the API is automatically available at /api
// For local development, you can override this with local.settings
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:7071/api'  // Local Azure Functions
    : '/api';  // Production - served by Azure Static Web Apps

// Export configuration
window.APP_CONFIG = {
    API_BASE_URL: API_BASE_URL
};
