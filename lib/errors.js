// lib/errors.js - Standardized error codes and responses

export const ErrorCodes = {
    // Authentication
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    INVALID_SESSION: 'INVALID_SESSION',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    SESSION_REVOKED: 'SESSION_REVOKED',
    INVALID_KEY: 'INVALID_KEY',
    KEY_EXPIRED: 'KEY_EXPIRED',
    KEY_REVOKED: 'KEY_REVOKED',
    MAX_DEVICES: 'MAX_DEVICES',
    HWID_MISMATCH: 'HWID_MISMATCH',
    
    // Rate limiting
    RATE_LIMIT_IP: 'RATE_LIMIT_IP',
    RATE_LIMIT_KEY: 'RATE_LIMIT_KEY',
    RATE_LIMIT_SESSION: 'RATE_LIMIT_SESSION',
    
    // Challenge
    CHALLENGE_REQUIRED: 'CHALLENGE_REQUIRED',
    CHALLENGE_FAILED: 'CHALLENGE_FAILED',
    CHALLENGE_EXPIRED: 'CHALLENGE_EXPIRED',
    
    // Anti-abuse
    REPLAY_DETECTED: 'REPLAY_DETECTED',
    REQUEST_DENIED: 'REQUEST_DENIED',
    ACCESS_BLOCKED: 'ACCESS_BLOCKED',
    
    // Resources
    NOT_FOUND: 'NOT_FOUND',
    SCRIPT_NOT_FOUND: 'SCRIPT_NOT_FOUND',
    
    // Validation
    INVALID_REQUEST: 'INVALID_REQUEST',
    MISSING_FIELDS: 'MISSING_FIELDS',
    
    // Server
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    ADMIN_REQUIRED: 'ADMIN_REQUIRED'
};

export class APIError extends Error {
    constructor(code, statusCode = 400, details = null) {
        super(code);
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = true;
    }
}

export function createResponse(success, data = {}, requestId = null) {
    const response = {
        success,
        requestId: requestId || generateRequestId(),
        timestamp: Date.now()
    };
    
    if (success) {
        return { ...response, ...data };
    } else {
        return {
            ...response,
            error: data.error || ErrorCodes.REQUEST_DENIED,
            ...(data.message && { message: data.message })
        };
    }
}

export function createErrorResponse(errorCode, statusCode = 400, message = null, requestId = null) {
    return {
        success: false,
        requestId: requestId || generateRequestId(),
        timestamp: Date.now(),
        error: errorCode,
        ...(message && { message })
    };
}

function generateRequestId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `req_${result}_${Date.now().toString(36)}`;
}
