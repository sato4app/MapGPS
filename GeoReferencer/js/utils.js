// アプリケーション全体で使用するユーティリティ関数と共通機能
import { CONFIG, CSS_CLASSES, LOG_LEVELS } from './constants.js';

// ===============================================
// バリデーション機能
// ===============================================
export class Validators {
    static isValidPointIdFormat(value) {
        if (!value || value.trim() === '') {
            return true;
        }
        
        const validPattern = /^[A-Z]-\d{2}$/;
        return validPattern.test(value);
    }

    static formatPointId(value) {
        if (!value || typeof value !== 'string') {
            return value;
        }
        
        const original = value.trim();
        if (original === '') {
            return value;
        }
        
        let converted = this.convertFullWidthToHalfWidth(original);
        converted = converted.replace(/[\s　]/g, '');
        
        if (converted === '') {
            return original;
        }
        
        const lastTwoDigitsPattern = /\d{2}$/;
        const singleDigitEndPattern = /^(.*)(\d)$/;
        const singleDigitEndMatch = converted.match(singleDigitEndPattern);
        
        if (singleDigitEndMatch && !singleDigitEndMatch[1].endsWith('-') && !lastTwoDigitsPattern.test(converted)) {
            const prefix = singleDigitEndMatch[1];
            const digit = singleDigitEndMatch[2];
            converted = `${prefix}${digit.padStart(2, '0')}`;
        }
        
        if (converted.length <= 3 && !converted.includes('-')) {
            const shortPattern = /^([A-Z]+)(\d{1,2})$/;
            const shortMatch = converted.match(shortPattern);
            
            if (shortMatch) {
                const letters = shortMatch[1];
                const numbers = shortMatch[2];
                return `${letters}-${numbers}`;
            }
        }
        
        return converted;
    }
    
    static convertFullWidthToHalfWidth(str) {
        return str.replace(/[Ａ-Ｚａ-ｚ０-９－−‐―]/g, function(char) {
            if (char >= 'Ａ' && char <= 'Ｚ') {
                return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
            }
            if (char >= 'ａ' && char <= 'ｚ') {
                const halfWidthChar = String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
                return halfWidthChar.toUpperCase();
            }
            if (char >= '０' && char <= '９') {
                return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
            }
            if (char === '－' || char === '−' || char === '‐' || char === '―') {
                return '-';
            }
            return char;
        }).replace(/[a-z]/g, function(char) {
            return char.toUpperCase();
        });
    }

    static isPngFile(file) {
        return file && file.type.includes('png');
    }

    static isJsonFile(file) {
        return file && file.type.includes('json');
    }

    static isValidPointData(data) {
        return data && data.points && Array.isArray(data.points);
    }

    static isValidRouteData(data) {
        return data && data.points && Array.isArray(data.points) && data.routeInfo;
    }
}

// ===============================================
// ログ機能
// ===============================================
export class Logger {
    constructor(context = 'GeoReferencer') {
        this.context = context;
        this.isDebugMode = this.checkDebugMode();
    }
    
    checkDebugMode() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('debug') === 'true' || 
               localStorage.getItem('geoReferencer.debug') === 'true';
    }
    
    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${this.context}] [${level.toUpperCase()}]`;
        
        if (data) {
            return `${prefix} ${message}`;
        }
        return `${prefix} ${message}`;
    }
    
    error(message, error = null) {
        const formattedMessage = this.formatMessage(LOG_LEVELS.ERROR, message);
        console.error(formattedMessage, error || '');
        this.logToStorage(LOG_LEVELS.ERROR, message, error);
    }
    
    warn(message, data = null) {
        const formattedMessage = this.formatMessage(LOG_LEVELS.WARN, message);
        console.warn(formattedMessage, data || '');
        
        if (this.isDebugMode) {
            this.logToStorage(LOG_LEVELS.WARN, message, data);
        }
    }
    
    info(message, data = null) {
        const formattedMessage = this.formatMessage(LOG_LEVELS.INFO, message);
        console.info(formattedMessage, data || '');
        
        if (this.isDebugMode) {
            this.logToStorage(LOG_LEVELS.INFO, message, data);
        }
    }
    
    debug(message, data = null) {
        if (!this.isDebugMode) return;
        
        const formattedMessage = this.formatMessage(LOG_LEVELS.DEBUG, message);
        console.debug(formattedMessage, data || '');
        this.logToStorage(LOG_LEVELS.DEBUG, message, data);
    }
    
    logToStorage(level, message, data) {
        try {
            const logs = JSON.parse(localStorage.getItem('geoReferencer.logs') || '[]');
            const logEntry = {
                timestamp: new Date().toISOString(),
                context: this.context,
                level,
                message,
                data: data ? JSON.stringify(data) : null
            };
            
            logs.push(logEntry);
            
            if (logs.length > 1000) {
                logs.splice(0, logs.length - 1000);
            }
            
            localStorage.setItem('geoReferencer.logs', JSON.stringify(logs));
        } catch (e) {
        }
    }
    
    getLogs() {
        try {
            return JSON.parse(localStorage.getItem('geoReferencer.logs') || '[]');
        } catch (e) {
            return [];
        }
    }
    
    clearLogs() {
        try {
            localStorage.removeItem('geoReferencer.logs');
            this.info('ログがクリアされました');
        } catch (e) {
            this.error('ログのクリアに失敗しました', e);
        }
    }
}

// ===============================================
// エラーハンドリング機能
// ===============================================
export class ErrorHandler {
    constructor() {
        this.logger = new Logger('ErrorHandler');
        this.setupGlobalErrorHandlers();
    }
    
    setupGlobalErrorHandlers() {
        window.addEventListener('error', (event) => {
            this.logger.error('未処理のエラー', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error
            });
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this.logger.error('未処理のPromise rejection', event.reason);
        });
    }
    
    showError(title, message, error = null) {
        this.logger.error(`${title}: ${message}`, error);
        this.showMessageBox(title, message, CSS_CLASSES.ERROR);
    }
    
    showWarning(title, message) {
        this.logger.warn(`${title}: ${message}`);
        this.showMessageBox(title, message, CSS_CLASSES.WARNING);
    }
    
    showSuccess(title, message) {
        this.logger.info(`${title}: ${message}`);
        this.showMessageBox(title, message, CSS_CLASSES.SUCCESS);
    }
    
    showMessageBox(title, message, type) {
        this.clearExistingMessageBoxes();
        
        const messageBox = document.createElement('div');
        messageBox.className = `${CSS_CLASSES.MESSAGE_BOX} ${type}`;
        messageBox.setAttribute('role', 'alert');
        messageBox.setAttribute('aria-live', 'polite');
        
        messageBox.innerHTML = `
            <h3 class="${type}">${this.escapeHtml(title)}</h3>
            <p>${this.escapeHtml(message)}</p>
            <button class="${type}" type="button" aria-label="メッセージを閉じる">OK</button>
        `;
        
        const button = messageBox.querySelector('button');
        button.addEventListener('click', () => {
            this.removeMessageBox(messageBox);
        });
        
        const handleKeydown = (event) => {
            if (event.key === 'Escape') {
                this.removeMessageBox(messageBox);
                document.removeEventListener('keydown', handleKeydown);
            }
        };
        document.addEventListener('keydown', handleKeydown);
        
        if (type !== CSS_CLASSES.ERROR) {
            setTimeout(() => {
                if (document.body.contains(messageBox)) {
                    this.removeMessageBox(messageBox);
                    document.removeEventListener('keydown', handleKeydown);
                }
            }, 5000);
        }
        
        document.body.appendChild(messageBox);
        button.focus();
    }
    
    removeMessageBox(messageBox) {
        if (messageBox && document.body.contains(messageBox)) {
            messageBox.style.opacity = '0';
            messageBox.style.transform = 'translate(-50%, -50%) scale(0.9)';
            messageBox.style.transition = 'all 0.2s ease';
            
            setTimeout(() => {
                if (document.body.contains(messageBox)) {
                    document.body.removeChild(messageBox);
                }
            }, 200);
        }
    }
    
    clearExistingMessageBoxes() {
        const existingBoxes = document.querySelectorAll(`.${CSS_CLASSES.MESSAGE_BOX}`);
        existingBoxes.forEach(box => {
            this.removeMessageBox(box);
        });
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    handle(error, userMessage = null, context = 'Unknown') {
        this.logger.error(`${context}でエラーが発生`, error);
        const message = userMessage || error.message || '予期しないエラーが発生しました';
        this.showError('エラー', message);
    }

    wrapAsync(asyncFn, context = 'Async Operation') {
        return async (...args) => {
            try {
                return await asyncFn.apply(this, args);
            } catch (error) {
                this.handle(error, `${context}中にエラーが発生しました`, context);
                throw error;
            }
        };
    }
    
    requireModule(module, moduleName) {
        if (!module) {
            const error = new Error(`${moduleName}が初期化されていません`);
            this.logger.error(error.message);
            throw error;
        }
    }
}

// シングルトンインスタンス
export const errorHandler = new ErrorHandler();