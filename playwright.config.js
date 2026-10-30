const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './test',
    testMatch: '**/*.e2e.spec.js',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        browserName: 'chromium',
        headless: true,
        viewport: { width: 1280, height: 900 },
        permissions: ['clipboard-read', 'clipboard-write']
    },
    webServer: {
        command: 'python3 -m http.server 4173 --bind 127.0.0.1',
        port: 4173,
        reuseExistingServer: true
    }
});