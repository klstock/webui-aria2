const puppeteer = require('puppeteer');

const wsDebuggerHash = '5e71a36e-24bd-4cc9-b1d8-799ee85b0d56';

let browser = null;
(async () => {
    let webSocketDebuggerUrl = '';

    let envWsUrl = process.env.WEBSOCKET_DEBUGGER_URL || '';
    if (!webSocketDebuggerUrl && typeof envWsUrl == 'string' && envWsUrl) {
        webSocketDebuggerUrl = envWsUrl;
    }

    if (!webSocketDebuggerUrl && typeof wsDebuggerHash == 'string' && wsDebuggerHash) {
        webSocketDebuggerUrl = 'ws://localhost:9222/devtools/browser/' + wsDebuggerHash
    }

    if (webSocketDebuggerUrl) {
        browser = await puppeteer.connect({
            browserWSEndpoint: webSocketDebuggerUrl,
            defaultViewport: null,
            ignoreHTTPSErrors: true
        });
    } else {
        browser = await puppeteer.launch();
    }
})();

process.stdin.resume(); //so the program will not close instantly

async function exitHandler(options, exitCode) {
    if (browser) {
        if (typeof wsDebuggerHash == 'string' && wsDebuggerHash) {
            // pass
        } else {
            await browser.close();
            browser = null;
        }
    }

    if (options.cleanup) {
        console.log('clean up');
    }
    if (exitCode || exitCode === 0) {
        console.log(exitCode);
    }
    if (options.exit) {
        process.exit();
    }
}

//do something when app is closing
process.on('exit', exitHandler.bind(null, { cleanup: true }));
//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, { cleanup: true, exit: true }));
// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));
//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, { cleanup: true, exit: true }));


const process_api = (api, params, success, error) => {
    api = api.toLowerCase()
    let api_func = api_map[api] || null;
    if (api_func) {
        let pre = 'browser_';
        if (api.substr(0, pre.length) == pre && !browser) {
            error(new Error(`api ${api} browser not ready`))
            return;
        }
        api_func(params, success, error)
    } else {
        error(new Error(`api ${api} not found`))
    }
}

const api_map = {
    hello: (params, success, error) => {
        success({
            ret: `hello  ${params.name || 'word'}!`
        })
    },
    test: (params, success, error) => {
        success({
            sum: parseInt(params.a || 1) + parseInt(params.b || 2)
        })
    },
    browser_get_html: async (params, success, error) => {
        let url = params.url || 'http://localhost:9222/json/version'
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle0' });

        let html = await page.content();
        await page.close();

        success({
            html
        })
    },
}

exports.process_api = process_api