const puppeteer = require('puppeteer');

const wsDebuggerHash = '6355a160-1f4b-4588-ad5b-d35944288459';

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
        console.log('use webSocketDebuggerUrl', webSocketDebuggerUrl)
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


async function mock_page(mock, url, html) {
    const page = await browser.newPage();
    if(!mock) {
        return page;
    }
    await page.setRequestInterception(true);
    page.on('request', async interceptedRequest => {
        const resType = interceptedRequest.resourceType();
        if (interceptedRequest.url() == url) {
            interceptedRequest.respond({
                status: 200,
                contentType: 'text/html; charset=gbk',
                body: html,
            });
        } else {
            interceptedRequest.continue();
        }
    });

    return page
}

function render_html(codes, slug) {
    var html = `<!DOCTYPE html>
    <html lang="en" xmlns="http://www.w3.org/1999/xhtml">
    <head>
    <meta charset="utf-8" />
    <title>New Document</title>
    <meta name="generator" content="EverEdit" />
    <meta name="author" content="" />
    <meta name="keywords" content="" />
    <meta name="description" content="" />
    </head>
    <body>`;
    
    if (codes.length > 0 && slug) {
        html += '<ul>'
        for (const code of codes) {
            let furl = `http://basic.10jqka.com.cn/${code}/${slug}.html`
            html += `<li><p><a href="${furl}" target="_blank">${code}</a>
            <iframe name="${code}" id="${code}" width="0" height="0" src="${furl}"></iframe>
            </p></li>`
        }
        html += '</ul>'
    } else {
        html += '<h2>Empty data page, need codes or slug.</h2>'
    }

    html += `</body></html>`;

    return html;
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
    browser_get_iframe: async (params, success, error) => {
        let codes = (params.codes || '').split(',').filter(i => i)
        let slug = params.slug || 'bonus'
        if (!(codes.length > 0 && slug)) {
            success({})
            return
        }

        let url = `http://basic.10jqka.com.cn/`
        const page = await mock_page(true, url, render_html(codes, slug));
        await page.goto(url, { waitUntil: 'networkidle0' });

        let ret = {}
        for (const code of codes) {
            const frame = page.frames().find(frame => frame.name() === code);

            ret[code] = await frame.content()
        }
        await page.close();

        success(ret)
    },
    

    html_tpl: async (params, success, error) => {
        let codes = (params.codes || '').split(',').filter(i => i)
        let slug = params.slug || 'bonus'

        success(render_html(codes, slug))
    },
}

exports.process_api = process_api