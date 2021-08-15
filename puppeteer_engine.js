const puppeteer = require('puppeteer');

const webSocketDebuggerUrl = 'c7716353-b647-455e-a8c5-0db592669f81';

let browser = null;
(async () => {
    if (typeof webSocketDebuggerUrl == 'string' && webSocketDebuggerUrl) {
        browser = await puppeteer.connect({
            browserWSEndpoint: 'ws://localhost:9222/devtools/browser/' + webSocketDebuggerUrl
        });
    } else {
        browser = await puppeteer.launch();
    }
})();

process.stdin.resume(); //so the program will not close instantly

async function exitHandler(options, exitCode) {
    if (browser) {
        if (typeof webSocketDebuggerUrl == 'string' && webSocketDebuggerUrl) {
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
        let url = params.url || 'http://localhost:6891/'
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